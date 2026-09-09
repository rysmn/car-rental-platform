"use server";

import { after } from "next/server";
import { z } from "zod";
import { createLead, type SavedLead } from "@/lib/chat/repo";
import { EMPTY_SLOTS } from "@/lib/chat/types";
import { notifyInboxLead } from "./notify";
import { reportAlert } from "@/lib/alerts/record";
import { getCarModelBySlug } from "@/lib/fleet/repo";
import { poleOchronne, sprawdzFormularz } from "@/lib/security/form-guard";
import { REGULY } from "@/lib/security/rate-limit";
import { shortSubject } from "@/lib/security/events";

/**
 * Zapytanie od klienta ze strony publicznej.
 *
 * DLACZEGO TO W OGÓLE POWSTAŁO. Do etapu 44D strona kontaktu miała wyłącznie
 * telefon, WhatsApp i `mailto:` — trzy kanały, z których ŻADEN nie zostawia
 * w systemie śladu. Klient, który pisał o 23:00, nie istniał dla panelu:
 * nie było czego odznaczyć, policzyć ani przypomnieć. Skrzynka bez kanału
 * przechwytywania byłaby pustą półką, więc kanał jest pierwszy.
 *
 * KOLEJNOŚĆ JEST CZĘŚCIĄ UMOWY: najpierw ZAPIS, potem poczta. Odwrotnie
 * znaczyłoby, że awaria Resend gubi zapytanie klienta — a to jest dokładnie
 * ten rodzaj cichej straty, której nikt nigdy nie zauważy, bo nie ma czego
 * zauważyć. Poczta idzie w `after()`, czyli po odesłaniu odpowiedzi:
 * klient widzi potwierdzenie od razu, nie po timeoutcie dostawcy.
 */

const MAX = {
  name: 120,
  phone: 40,
  email: 200,
  subject: 160,
  message: 2000,
  company: 160,
  range: 60,
};

const requestSchema = z
  .object({
    name: z.string().trim().max(MAX.name).optional(),
    phone: z.string().trim().max(MAX.phone).optional(),
    email: z
      .string()
      .trim()
      .max(MAX.email)
      .email()
      .optional()
      .or(z.literal("")),
    subject: z.string().trim().min(1).max(MAX.subject),
    message: z.string().trim().min(1).max(MAX.message),
    locale: z.enum(["pl", "en"]).default("pl"),
    /** Slug auta, gdy pytanie wychodzi ze strony konkretnego modelu. */
    carSlug: z.string().trim().max(120).optional(),
    /**
     * O co w tym zgłoszeniu chodzi — ustawia je FORMULARZ, który to wie.
     *
     * Nie zgadujemy z treści: „chcę wnieść auto do floty" i „chcę wynająć
     * auto" różnią się jednym czasownikiem, a klasyfikator na treści wpisanej
     * przez klienta byłby drugim, nietestowanym systemem obok tego, który już
     * mamy w czacie. Formularz partnerski stoi pod własnym adresem, więc wie
     * o sobie wszystko, co trzeba.
     */
    kind: z.enum(["general", "partnership"]).default("general"),
    /** Firma zainteresowanego — pole opcjonalne w obu formularzach. */
    company: z.string().trim().max(MAX.company).optional(),
    /**
     * Model współpracy. Zamknięty zbiór PILNOWANY TUTAJ, nie w bazie —
     * patrz komentarz przy `chat_leads.partner_model`.
     */
    partnerModel: z
      .enum(["vehicle", "fleet", "strategic", "unsure"])
      .optional(),
    /**
     * Orientacyjny zakres zaangażowania. Tekst, bo klient wybiera przedział
     * z listy, a nie wpisuje kwoty — i bo to deklaracja, nie zobowiązanie.
     */
    investRange: z.string().trim().max(MAX.range).optional(),
    dateFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .or(z.literal("")),
    dateTo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .or(z.literal("")),
    /**
     * Zgoda na kontakt. Musi być `true` — bez niej nie ma czego zapisać,
     * bo `chat_leads.consent_at` jest `NOT NULL` z tego samego powodu,
     * z którego formularz czatu wymaga naciśnięcia przycisku.
     */
    consent: z.literal(true),
    /**
     * Pola ochronne — pułapka na roboty, czas wypełniania i token Turnstile.
     *
     * Pułapka była tu od etapu 44D i zostaje bez zmian: nie kosztuje klienta
     * nic i łapie automaty, które czytają HTML zamiast patrzeć na stronę.
     * Komentarz obok niej mówił, że captcha „jest decyzją właściciela, jeśli
     * spam okaże się realny" — ta decyzja zapadła w rozdziale 13.1 i padło na
     * Turnstile, który jest darmowy i w trybie zarządzanym najczęściej nie
     * pokazuje człowiekowi żadnej zagadki. Dopóki klucze nie są ustawione,
     * zachowanie tego formularza jest DOKŁADNIE takie jak wcześniej.
     */
    ...poleOchronne,
  })
  .refine((d) => Boolean(d.phone?.trim() || d.email?.trim()), {
    path: ["phone"],
    message: "contact_required",
  });

export type RequestResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "validation"
        | "rate"
        | "server"
        /**
         * Weryfikacja Turnstile wygasła, została zużyta albo nie dojechała.
         *
         * Osobno od `server`, bo to nie jest awaria: to jest token starszy niż
         * pięć minut. Klient ma zobaczyć „spróbuj ponownie", a nie „wystąpił
         * błąd" — i ma NIE tracić tego, co napisał.
         *
         * Awaria samego `siteverify` tu nie dociera: formularz kontaktowy
         * zostaje fail-open (`PolitykaAwarii: "przepusc"`), bo zapytanie,
         * które przepadnie, przepada bezpowrotnie. Fail-closed ma wyłącznie
         * rezerwacja.
         */
        | "turnstile";
      fieldErrors?: Record<string, string>;
    };

/*
 * Limit i pułapka przeniesione do `lib/security/form-guard`.
 *
 * Do 27.08.2026 stał tutaj własny licznik — trzecia kopia tego samego kodu
 * w projekcie, obok `api/chat` i… nigdzie indziej, bo formularz REZERWACJI nie
 * miał żadnego. Rozdział 13.1 zamawia limit na obu formularzach naraz, więc
 * licznik jest teraz jeden, wspólny, i pilnuje obu — a przy okazji liczy nie
 * tylko po adresie sieciowym, ale i po skrócie adresu e-mail.
 *
 * Progi zostały te same co dotąd: dziesięć zgłoszeń na godzinę z jednego
 * adresu, plus nowy próg minutowy przeciwko seriom.
 */

export async function submitRequest(raw: unknown): Promise<RequestResult> {
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: "validation", fieldErrors };
  }
  const d = parsed.data;

  /*
   * Brama antybotowa. „Cicho" znaczy: robot wpadł w pułapkę albo wysłał
   * formularz w dwie sekundy — odpowiadamy SUKCESEM i nie zapisujemy nic.
   * Odpowiedź „wykryto spam" uczy autora robota, jak pułapkę ominąć.
   */
  const brama = await sprawdzFormularz({
    nazwa: d.kind === "partnership" ? "inbox.partnership" : "inbox.request",
    pola: d,
    reguly: [REGULY.zapytanieSzybkie, REGULY.zapytanie],
    dodatkoweKlucze: [shortSubject(d.email?.trim().toLowerCase() || d.phone)],
  });
  if (!brama.ok) {
    if (brama.cicho) return { ok: true };
    if (brama.powod === "rate") return { ok: false, error: "rate" };
    return { ok: false, error: "turnstile" };
  }

  /*
   * Auto rozwiązywane po SLUGU w bazie, nie po id z formularza. Dzięki temu
   * pole nie jest kanałem, którym da się wstawić dowolny uuid do kolumny
   * z kluczem obcym — nieznany slug po prostu znika, a zapytanie zostaje.
   */
  let carModelId: string | null = null;
  if (d.carSlug) {
    const car = await getCarModelBySlug(d.carSlug).catch(() => null);
    carModelId = car?.id ?? null;
  }

  let saved: SavedLead;
  try {
    saved = await createLead({
      conversationId: null,
      name: d.name?.trim() || null,
      phone: d.phone?.trim() || null,
      email: d.email?.trim() || null,
      slots: {
        ...EMPTY_SLOTS,
        carModelIds: carModelId ? [carModelId] : [],
        dateFrom: d.dateFrom || null,
        dateTo: d.dateTo || null,
      },
      topic: "form",
      locale: d.locale,
      /*
       * `source` zostaje KANAŁEM. Zgłoszenie partnerskie przychodzi tym samym
       * formularzem publicznym co pytanie o wynajem, więc kanał jest ten sam
       * (`contact`) — różni je TEMAT, czyli `reason`. Dorabianie do tego
       * osobnego źródła powtórzyłoby błąd, który `source` ma już odnotowany
       * przy wartości `b2b`: temat wciśnięty do kolumny o kanale.
       */
      source: carModelId ? "car" : "contact",
      /*
       * Formularz nie ma rozmowy, z której dałoby się wyprowadzić temat, więc
       * podaje go wprost: pytanie ze strony auta dotyczy tego auta, pytanie ze
       * strony kontaktu jest zapytaniem ogólnym. Zgadywanie tematu z treści
       * wpisanej przez klienta byłoby drugim klasyfikatorem obok tego, który
       * już mamy w czacie — i pierwszym, który nikt by nie testował.
       */
      reason:
        d.kind === "partnership"
          ? "partnership"
          : carModelId
            ? "car_enquiry"
            : "general",
      subject: d.subject,
      message: d.message,
      company: d.company?.trim() || null,
      partnerModel: d.kind === "partnership" ? (d.partnerModel ?? null) : null,
      investRange:
        d.kind === "partnership" ? d.investRange?.trim() || null : null,
    });
  } catch (err) {
    /*
     * Zapytanie klienta, którego nie udało się zapisać. To JEST awaria
     * techniczna i tylko taka trafia do alertów — zwykła walidacja wyżej
     * nie podnosi niczego, bo źle wpisany e-mail nie jest usterką systemu.
     *
     * Bez nazwiska, telefonu i treści: rejestr alertów jest dziennikiem
     * incydentów, nie drugą kopią skrzynki.
     */
    reportAlert({
      module: "inbox",
      severity: "error",
      key: "submitRequest:write-failed",
      title: "Zapytanie klienta nie zostało zapisane",
      detail:
        "Formularz kontaktowy przyjął zgłoszenie, ale zapis do bazy się nie powiódł. Klient zobaczył błąd i prawdopodobnie nie spróbuje drugi raz.",
      context: { zrodlo: carModelId ? "car" : "contact" },
    });
    console.error("submitRequest: zapis nieudany", err);
    return { ok: false, error: "server" };
  }

  /*
   * Po odesłaniu odpowiedzi. Zgłoszenie jest już w skrzynce, więc poczta
   * jest DODATKOWYM powiadomieniem, nie źródłem prawdy.
   *
   * Zasuwka `notified_at` siedzi w `notifyInboxLead`, nie tutaj: broni
   * WSZYSTKICH ścieżek naraz, także tej z czatu, i działa też wtedy, gdy
   * dwa żądania biegną równolegle w dwóch procesach.
   */
  after(() => notifyInboxLead(saved.id));

  return { ok: true };
}
