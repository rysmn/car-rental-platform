"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useCallback,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { computeQuote, rentalDays } from "@/lib/booking/pricing";
import {
  formatKm,
  limitKmDlaNajmu,
  limitKmNaDobe,
} from "@/lib/booking/mileage";
import type { CancellationPolicy } from "@/lib/booking/cancellation";
import { HANDOVER, handoverSlots } from "@/lib/booking/fees";
import { createReservation, type ReserveResult } from "@/lib/booking/actions";
import {
  rememberManageKey,
  rememberReservation,
} from "@/lib/booking/my-reservations";
import {
  HoneypotField,
  TurnstileInfo,
  TurnstileWidget,
  useFormShield,
} from "@/components/security/FormShield";
import {
  MIN_WYPRZEDZENIE_H,
  najwczesniejszyOdbior,
  sprawdzWyprzedzenie,
} from "@/lib/booking/lead-time";
import {
  getWybranyTermin,
  getWybranyTerminNaSerwerze,
  subscribeWybranyTermin,
  ustawWybranyTermin,
} from "@/lib/booking/wybrany-termin";
import { formatDay, todayIso } from "@/lib/dates";
import {
  formatPln,
  priceOnRequestAction,
  priceOnRequestLabel,
} from "@/lib/format";
import { BookingSummary } from "@/components/booking/BookingSummary";
import { Money } from "@/components/currency/Money";
import { cn } from "@/lib/utils";
import type { FleetCar } from "@/lib/fleet/types";
import type { DepositVariant, FeeCatalog } from "@/lib/booking/types";
import type { LocationOption } from "@/lib/booking/fees";

// `min-w-0` is load-bearing on phones: date inputs and selects report an
// intrinsic min-content width (the native date spinner, the longest option
// label), and `w-full` does not override `min-width:auto`. Without it the
// two-column date row and the location select push the panel wider than the
// screen, which drags the whole page into a horizontal scroll.
// `h-11` rather than vertical padding: a `<select>`, a text `<input>` and a
// native date picker each size themselves differently once the phone's own
// form widgets get involved (iOS in particular gives selects and date fields
// their own intrinsic height), so padding alone leaves the boxes a couple of
// pixels apart. A fixed height makes every field in the form the same block.
const inputCls =
  "field-box w-full min-w-0 rounded-none border border-line bg-surface-1 h-11 px-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-line-strong [color-scheme:dark]";

function Field({
  label,
  error,
  children,
  className,
}: {
  label: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block min-w-0", className)}>
      {/* `text-silver`, not `ink-faint`: these tell a customer what to type,
          so they have to be readable rather than decorative — faint grey on
          black was legible only in good light. */}
      <span className="label-tight text-silver text-[11px]">{label}</span>
      <span className="mt-2 block">{children}</span>
      {error && (
        <span className="text-red mt-1 block text-[11px]">{error}</span>
      )}
    </label>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  price,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  /**
   * A node, not a string, since the amount now carries both currencies —
   * `<Money>` renders the pair and CSS shows one. The layout is unchanged:
   * whatever is passed lands in the same right-hand slot.
   */
  price: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="border-line flex w-full items-center justify-between border-b py-3 text-left"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center border transition-colors",
            checked ? "border-red bg-red" : "border-line-strong",
          )}
        >
          {checked && (
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M5 12l5 5 9-11"
                stroke="#fff"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
        <span className="text-ink text-sm">{label}</span>
      </span>
      <span className="label-tight text-ink-muted shrink-0 pl-3 text-[11px]">
        {price}
      </span>
    </button>
  );
}

export function BookingPanel({
  car,
  locations,
  fees,
  freeByDay,
  prefill,
  turnstileSiteKey,
  cancellationPolicy,
  contactHours,
}: {
  car: FleetCar;
  locations: LocationOption[];
  fees: FeeCatalog;
  /**
   * Zasady anulowania, prosto z ustawień — propem, bo to komponent kliencki.
   *
   * Nie po to, żeby cokolwiek liczyć: kwotę anulowania liczy wyłącznie serwer,
   * gdy klient naprawdę anuluje. Tutaj jest po dwa: żeby wejść do migawki
   * podglądowej wyceny i żeby formularz mógł POWIEDZIEĆ, do kiedy anulowanie
   * jest bezpłatne — zanim klient naciśnie „rezerwuję".
   */
  cancellationPolicy: CancellationPolicy;
  /**
   * `YYYY-MM-DD` → free units, the same map the calendar paints. Checking the
   * range here means a customer learns the car is taken while looking at the
   * dates, instead of after filling in a licence number and an address.
   */
  freeByDay: Record<string, number>;
  /**
   * Dates and pickup point carried over from the assistant, read from the URL
   * by the page and validated there.
   *
   * Convenience only: these are seeds for two `useState` calls and nothing
   * more. The customer can change every one of them, the client still runs the
   * same availability and price checks over whatever ends up in the fields, and
   * the server recomputes both from the database at submit time — a crafted URL
   * therefore buys a prefilled form, never a price.
   */
  prefill?: {
    startDate?: string;
    endDate?: string;
    locationSlug?: string;
    /** Set by the assistant's "Zarezerwuj" button; recorded on the reservation. */
    source?: "chatbot";
    /** The assistant conversation this visit came from, for attribution only. */
    conversationId?: string;
  };
  /**
   * Klucz witryny Turnstile albo `null`, gdy ochrona nie jest skonfigurowana.
   *
   * Podawany przez SERWER, a nie czytany ze zmiennej `NEXT_PUBLIC_*`: dzięki
   * temu włączenie ochrony antybotowej to dopisanie zmiennej środowiskowej
   * i restart, a nie przebudowa obrazu. `null` znaczy „nie rysuj widgetu"
   * i formularz działa dokładnie tak jak dotąd — pilnują go wtedy pułapka,
   * pomiar czasu i limity, które nie zależą od nikogo z zewnątrz.
   */
  turnstileSiteKey?: string | null;
  /**
   * Godziny, w których naprawdę odbieramy telefon — „07:00–24:00", złożone na
   * serwerze przez `serviceHours()` z ustawienia `company.phoneHours`.
   *
   * Ekran po wysłaniu mówi dzięki temu, KIEDY klient nas zastanie, i nie mówi
   * ani słowa o tym, w ile godzin oddzwonimy: żadnego takiego zobowiązania
   * nie ma w ustawieniach, a wpisane tutaj byłoby obietnicą bez pokrycia —
   * tym samym błędem, przed którym broni się `TrustStrip` w sprawie polisy.
   *
   * To jest ta sama liczba, którą czyta strona kontaktu i karta kontaktowa
   * asystenta. `null` (albo brak) = zdanie nie powstaje.
   */
  contactHours?: string | null;
}) {
  const t = useTranslations("Booking");
  const tf = useTranslations("Fleet");
  const tn = useTranslations("Nav");
  const locale = useLocale();
  const today = todayIso();
  const slots = useMemo(() => handoverSlots(), []);

  // Seeded from the URL when the assistant sent the visitor here, empty
  // otherwise — the behaviour without a prefill is byte-for-byte what it was.
  // Focused when the customer asks for another term — the field is the answer
  // to that button, so the cursor should already be in it.
  const startRef = useRef<HTMLInputElement>(null);
  /*
    DATY SĄ TRZYMANE W JEDNYM MIEJSCU — wspólnym z kalendarzem dostępności.

    Kalendarz na stronie auta i ten formularz mówią o tych samych datach, a są
    rodzeństwem w drzewie: żaden nie zawiera drugiego, więc nie mają jak podać
    sobie stanu właściwościami. Łączy je magazyn `lib/booking/wybrany-termin`,
    ten sam wzorzec, którym projekt spina „moje rezerwacje".

    Daty NIE są tu kopiowane do `useState`. Pierwsza wersja tak robiła — dwa
    efekty przepisywały wartość tam i z powrotem — i ESLint słusznie to odrzucił
    (`react-hooks/set-state-in-effect`). Dwa źródła tej samej prawdy to dwa
    źródła, które kiedyś powiedzą co innego; dokładnie stan, przed którym
    zamówienie ostrzega: kalendarz pokazuje 10–15, formularz ma 12–18.

    Magazyn jest więc JEDYNYM źródłem, a pola formularza piszą wprost do niego.
    Synchronizacja w obie strony wychodzi z tego sama, bez ani jednego efektu.
  */
  const wybor = useSyncExternalStore(
    subscribeWybranyTermin,
    getWybranyTermin,
    getWybranyTerminNaSerwerze,
  );
  const startDate = wybor.from ?? "";
  const endDate = wybor.to ?? "";
  const setStartDate = useCallback(
    (v: string) => ustawWybranyTermin(v || null, getWybranyTermin().to),
    [],
  );
  const setEndDate = useCallback(
    (v: string) => ustawWybranyTermin(getWybranyTermin().from, v || null),
    [],
  );

  /*
    Termin przyniesiony z adresu (asystent podaje gotowy zakres) wsiewany jest
    RAZ, przy pierwszym renderze. `useState` z funkcją, a nie efekt: to jest
    wartość początkowa magazynu, a nie reakcja na zmianę.
  */
  useState(() => {
    if (prefill?.startDate || prefill?.endDate) {
      ustawWybranyTermin(prefill.startDate ?? null, prefill.endDate ?? null);
    }
    return null;
  });
  const [pickupTime, setPickupTime] = useState<string>(HANDOVER.defaultPickup);
  const [returnTime, setReturnTime] = useState<string>(HANDOVER.defaultReturn);
  const [locationSlug, setLocationSlug] = useState(
    // Only a slug that actually exists in the active list is honoured; an
    // unknown one falls back rather than putting the form in a state the
    // server would reject.
    (prefill?.locationSlug &&
      locations.some((l) => l.slug === prefill.locationSlug) &&
      prefill.locationSlug) ||
      locations[0]?.slug ||
      "office",
  );
  const [extraDriver, setExtraDriver] = useState(false);
  const [childSeat, setChildSeat] = useState(false);
  const [protectionPackage, setProtectionPackage] = useState(false);
  const [depositVariant, setDepositVariant] =
    useState<DepositVariant>("with_deposit");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [street, setStreet] = useState("");
  const [postcode, setPostcode] = useState("");
  const [city, setCity] = useState("");
  const [licence, setLicence] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ReserveResult | null>(null);
  /**
   * Zasuwka przeciwko drugiej rezerwacji z jednego kliknięcia.
   *
   * Wyłączony przycisk NIE wystarcza i to nie jest ostrożność na wyrost:
   * formularz wysyła się też klawiszem Enter z pola tekstowego, a między
   * kliknięciem a przerysowaniem z `pending` mieści się drugie zdarzenie.
   * Referencja zmienia się natychmiast, w tym samym przebiegu, więc drugie
   * wejście nie ma jak przejść.
   *
   * Po stronie serwera pilnuje tego samego JEDNORAZOWOŚĆ tokenu Turnstile:
   * `siteverify` przyjmuje token dokładnie raz, więc powtórzone żądanie z tym
   * samym tokenem jest odrzucane, nawet gdyby ominęło całą przeglądarkę.
   */
  const wysylkaTrwa = useRef(false);

  /*
    Osłona formularza — rozdział 13.1. Pułapka, zegar i (gdy skonfigurowany)
    Turnstile. Sprawdza je serwer; tutaj tylko powstają.
  */
  const oslona = useFormShield(turnstileSiteKey ?? null);

  const validRange = Boolean(
    startDate && endDate && endDate >= startDate && startDate >= today,
  );

  /*
    Minimum trzy godziny do odbioru — rozdział 13.5.

    Ta sama funkcja, którą sprawdza serwer, i to jest cały powód, dla którego
    `lead-time.ts` nie ma `server-only`. Uprzejmość, nie zabezpieczenie: klient
    dowiaduje się o regule przy wyborze godziny, a nie po wypełnieniu ośmiu pól.
    Rozstrzyga i tak serwer.
  */
  const wyprzedzenie = validRange
    ? sprawdzWyprzedzenie(startDate, pickupTime)
    : { ok: true, zostaloH: 0 };
  /*
    Pierwsza godzina, którą wolno wybrać — z tej samej funkcji, z której
    korzysta asystent. Liczona tylko wtedy, gdy jest po co: przy poprawnym
    terminie nie ma czego podpowiadać, a `Date.now()` w renderze bez potrzeby
    to kolejny powód do rozjazdu serwera z przeglądarką.
  */
  const najwczesniejszy =
    validRange && !wyprzedzenie.ok
      ? najwczesniejszyOdbior(slots)
      : { slot: null as string | null };
  const days = validRange
    ? rentalDays(new Date(startDate), new Date(endDate))
    : 0;
  /*
    Limit przebiegu dla WYBRANEGO okresu.

    Zanim klient wskaże daty, `days` wynosi 0 — a pytanie „ile kilometrów mam
    w cenie" nie ma wtedy odpowiedzi zależnej od długości. Pokazujemy więc
    próg dla najmu jednodniowego, czyli ten sam, który stoi na karcie auta;
    nie jest to domysł, tylko pierwszy przedział z Regulaminu §9.
  */
  const dni = Math.max(1, days);
  const limitNaDobe = limitKmNaDobe(dni, car.kmPerDayLimit);
  const limitLaczny = limitKmDlaNajmu(dni, car.kmPerDayLimit);
  const loc = locations.find((l) => l.slug === locationSlug);

  // Every day of the range has to have a unit free, ends included.
  //
  // Ta mapa jest liczona z zapytania, ktore pyta o CALE doby — na tym etapie
  // klient nie wybral jeszcze godzin. Silnik rezerwacji stosuje regule
  // wezsza: od 30.08.2026 bufor miedzy zwrotem a kolejnym wydaniem wynosi
  // trzy godziny liczone od godziny zwrotu, nie cala dobe (`aa_zajetosc`,
  // migracja 0045). Kierunek tej roznicy jest jedyny dopuszczalny: kalendarz
  // moze powiedziec „nie" tam, gdzie silnik powiedzialby „tak", ale nigdy
  // odwrotnie. A day the map never covered counts as free rather than
  // blocking a booking on missing data.
  const rangeAvailable = useMemo(() => {
    if (!validRange) return true;
    for (
      let d = new Date(startDate);
      d <= new Date(endDate);
      d.setDate(d.getDate() + 1)
    ) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if ((freeByDay[key] ?? 1) <= 0) return false;
    }
    return true;
  }, [validRange, startDate, endDate, freeByDay]);

  const quote = useMemo(
    () =>
      computeQuote({
        dailyPriceGrosze: car.dailyPriceGrosze,
        dailyPrice3to6Grosze: car.dailyPrice3to6Grosze,
        dailyPrice7to13Grosze: car.dailyPrice7to13Grosze,
        dailyPrice14to29Grosze: car.dailyPrice14to29Grosze,
        monthlyPriceGrosze: car.monthlyPriceGrosze,
        depositGrosze: car.depositGrosze,
        kmPerDayLimit: car.kmPerDayLimit,
        extraMileageFeeGrosze: car.extraMileageFeeGrosze,
        cancellationPolicy,
        days: Math.max(1, days),
        locationFeeGrosze: loc?.feeGrosze ?? 0,
        extras: { extraDriver, childSeat, protectionPackage },
        depositVariant,
        fees,
      }),
    [
      car,
      days,
      loc,
      extraDriver,
      childSeat,
      protectionPackage,
      depositVariant,
      cancellationPolicy,
      fees,
    ],
  );

  /*
    PODSUMOWANIE „CO REZERWUJESZ" — dwa fakty, które klient wybrał wcześniej
    i przestał widzieć, zanim doszedł do pola „Imię i nazwisko".

    Zmierzone 04.09.2026 na produkcji, telefon 390 px: pola dat stoją 2900 px
    nad danymi osobowymi. Blok cen widać (leży tuż nad nimi), więc kwot się tu
    NIE powtarza — powtórzenie sumy dwa razy na jednym ekranie nie jest
    podwójnym potwierdzeniem, tylko drugim miejscem do poprawiania.

    Nic tu nie jest liczone od nowa: daty składa `formatDay`, ten sam, którym
    projekt pisze każdą datę dla klienta, godziny są dokładnie tymi, które
    stoją w dwóch listach wyżej, a nazwa miejsca pochodzi z tej samej listy
    `locations`, z której klient wybierał. Bez dopłaty w nawiasie — ta jest
    osobnym wierszem w bloku cen i tam ma zostać.
  */
  const terminTekst = validRange
    ? `${formatDay(startDate, locale)}, ${pickupTime} → ${formatDay(endDate, locale)}, ${returnTime}`
    : "";
  const miejsceTekst = loc ? (locale === "en" ? loc.nameEn : loc.name) : "";
  const wierszeTerminu = [
    { label: t("summaryTerm"), value: terminTekst },
    { label: t("location"), value: miejsceTekst },
  ];

  const fieldErrors = result && !result.ok ? (result.fieldErrors ?? {}) : {};
  /**
   * Numbers that belong to a message travel with the error, not inside the
   * translation: "Wymagany minimalny wiek {years} lat" is filled from Admin →
   * Zasady wynajmu, so changing the rule never means editing pl.json and
   * en.json and hoping both were found.
   */
  const errorValues = result && !result.ok ? (result.errorValues ?? {}) : {};
  const fErr = (k: string) =>
    fieldErrors[k]
      ? t(`errors.${fieldErrors[k]}` as never, errorValues[k] as never)
      : undefined;

  const feePrice = (f: { amountGrosze: number; unit: string }) => (
    <>
      +<Money grosze={f.amountGrosze} />
      {/* `null`, nie `""` — pusty łańcuch jest dzieckiem, a nie brakiem
          dziecka, i potrafi rozjechać hydratację. */}
      {f.unit === "per_day" ? ` / ${tf("perDay")}` : null}
    </>
  );

  /**
   * Tell the assistant's analytics that the form was actually reached.
   *
   * The funnel had a hole between "kliknęli Rezerwuj" and "zakończyli
   * rezerwację" — the click was recorded by the chat endpoint, and then the
   * visitor arrived here and nothing knew about it. This is the missing event,
   * and it is a real one: a click that never loads the page does not produce
   * it.
   *
   * Deliberately fire-and-forget. It runs once per mount, guarded by a ref
   * against StrictMode's double invocation, and every failure is swallowed —
   * a booking form must never break, or even pause, because an analytics
   * beacon could not be sent. `keepalive` so it survives a fast navigation.
   */
  const beaconSent = useRef(false);
  const conversationId = prefill?.conversationId;
  useEffect(() => {
    if (!conversationId || beaconSent.current) return;
    beaconSent.current = true;
    void fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "booking_form_started",
        conversationId,
      }),
      keepalive: true,
    }).catch(() => {});
  }, [conversationId]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (wysylkaTrwa.current || pending) return;

    /*
      TOKEN STARSZY NIŻ PIĘĆ MINUT NIE JEDZIE NA SERWER.

      Sedno tego zlecenia. Token Turnstile jest ważny 300 s, a ten formularz
      ma osiemnaście pól i kalendarz — klient potrafi wypełniać go dłużej.
      Widget odnawia token sam co cztery minuty, więc normalnie nie ma tu nic
      do roboty; ten warunek jest siatką pod odnowieniem, które się nie udało.

      Nie wysyłamy i NIE WYSYŁAMY PONOWNIE SAMI: żadna rezerwacja nie może
      powstać z automatu. Klient widzi jedno zdanie, wszystkie pola zostają
      nietknięte, nowa weryfikacja jest już w drodze, a druga próba wymaga
      jego świadomego kliknięcia.
    */
    if (turnstileSiteKey && !oslona.awaria) {
      /*
        Widget dopiero pracuje. Przycisk jest wtedy wyłączony, ale formularz
        wysyła się też Enterem z pola tekstowego — a przerysowanie widgetu
        w trakcie rozwiązywania wyzwania wydłużyłoby czekanie zamiast je
        skrócić. Nie robimy nic; napis na przycisku i tak mówi „Sprawdzanie…".
      */
      if (oslona.stan === "ladowanie") return;
      /* Token wygasł i nowy jest w drodze — widget odnawia się sam. */
      if (oslona.stan === "wygasla") {
        setResult({ ok: false, error: "turnstile_expired" });
        return;
      }
      /* Token jest, ale z zegarka wiadomo, że Cloudflare go już nie uzna. */
      if (!oslona.tokenSwiezy()) {
        oslona.zuzyjToken();
        setResult({ ok: false, error: "turnstile_expired" });
        return;
      }
    }

    wysylkaTrwa.current = true;
    setResult(null);
    startTransition(async () => {
      try {
        const res = await createReservation({
          // Pola ochronne — pułapka, znacznik otwarcia formularza i token
          // Turnstile. Serwer je sprawdza, zanim dotknie bazy.
          ...oslona.pola(),
          /*
            Język, w którym klient PATRZY na stronę w tej chwili.
            Zapisywany przy rezerwacji, bo późniejsze wiadomości — potwierdzenie
            przez obsługę, zmiana terminu, anulowanie — wychodzą wtedy, gdy
            tego kontekstu już nie ma. Patrz `reservations.locale`.
          */
          locale,
          // Carried from the URL the assistant produced. The server validates it
          // against a closed enum and ignores it for every other purpose.
          source: prefill?.source ?? "website",
          // Passed straight through: the server validates its shape and uses it
          // to link the conversation to the booking, nothing else.
          conversationId: prefill?.conversationId,
          modelSlug: car.slug,
          startDate,
          endDate,
          pickupTime,
          returnTime,
          locationSlug,
          extraDriver,
          childSeat,
          protectionPackage,
          depositVariant,
          customerName: name,
          customerEmail: email,
          customerPhone: phone,
          dateOfBirth,
          addressStreet: street,
          addressPostcode: postcode,
          addressCity: city,
          licenceNumber: licence,
        });
        // Remember it on this device so /moje-rezerwacje can show the booking
        // and track its status without the customer typing anything.
        if (res.ok) {
          rememberReservation(res.reference);
          /* Klucz zarządzania istnieje jawnie tylko w tej jednej odpowiedzi —
             jeśli go tu nie schowamy, klient nie przesunie ani nie anuluje
             własnej rezerwacji z tego urządzenia już nigdy. */
          rememberManageKey(res.reference, res.manageKey);
        }
        setResult(res);
      } finally {
        /*
          Token właśnie poszedł na serwer, więc jest zużyty — niezależnie od
          tego, co serwer odpowiedział. Bez tej linii wystarczyła JEDNA
          nieudana wysyłka (zły numer telefonu, brak auta w terminie), żeby
          każda następna próba w tym samym formularzu wracała z odmową
          weryfikacji: `siteverify` przyjmuje token dokładnie raz, a druga
          wymiana dostaje `timeout-or-duplicate`. Klient poprawiał pole,
          klikał znowu i znowu dostawał komunikat, który nie miał nic
          wspólnego z tym, co poprawił.

          Przy udanej rezerwacji formularz i tak znika z ekranu; przy
          nieudanej — w sekundę pojawia się nowy token i można kliknąć
          jeszcze raz, bez ruszania czegokolwiek w polach.
        */
        oslona.zuzyjToken();
        wysylkaTrwa.current = false;
      }
    });
  }

  if (result?.ok) {
    return (
      <div className="border-line border p-7 text-center">
        <div className="rounded-pill bg-red mx-auto flex h-12 w-12 items-center justify-center">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M5 12l5 5 9-11"
              stroke="#fff"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 className="font-heading mt-5 text-xl font-bold">
          {result.needsVerification ? t("verifyTitle") : t("successTitle")}
        </h2>
        {/*
          Ekran po wysłaniu mówi PRAWDĘ o tym, co się właśnie stało.

          Do rozdziału 13.4 brzmiał „przyjęliśmy, potwierdzimy dostępność" —
          i tak zostaje, gdy weryfikacji nie ma. Odkąd zgłoszenie czeka na
          kliknięcie w link, klient musi to usłyszeć TUTAJ, razem z adresem, na
          który list poszedł: inaczej zamknie kartę, nie zajrzy do skrzynki
          i zgłoszenie wygaśnie po piętnastu minutach, a on będzie przekonany,
          że ma rezerwację.

          Gdy poczta zawiodła (`mailSent === false`), nie udajemy, że list
          poszedł — kierujemy do kontaktu, bo to jedyna droga, która wtedy
          działa.
        */}
        {result.needsVerification ? (
          result.mailSent ? (
            <p className="text-ink-muted mt-3 text-sm leading-relaxed">
              {t("verifyBody", {
                ref: result.reference,
                email: result.email,
                minutes: result.minutes,
              })}
            </p>
          ) : (
            <p className="text-red mt-3 text-sm leading-relaxed">
              {t("verifyMailFailed", { ref: result.reference })}
            </p>
          )
        ) : (
          <p className="text-ink-muted mt-3 text-sm">
            {t("successBody", { ref: result.reference })}
          </p>
        )}

        {/*
          CO WŁAŚCIWIE ZOSTAŁO ZAMÓWIONE.

          Do 04.09.2026 ten ekran mówił wyłącznie „numer {ref}, skontaktujemy
          się" — bez auta, bez terminu, bez kwoty. Klient dostawał
          potwierdzenie czegoś, czego treści nie widział już nigdzie na
          ekranie: formularz w tym miejscu jest zastąpiony, a nie przewinięty.

          Wszystkie cztery wiersze pochodzą ze stanu, który dopiero co
          pojechał na serwer, i z tej samej migawki wyceny, którą klient czytał
          nad przyciskiem. Suma jest tu podglądem, dokładnie tak samo jak była
          w formularzu — rozlicza wyłącznie serwer, a rezerwację potwierdza
          człowiek.
        */}
        <BookingSummary
          className="mt-6 text-left"
          rows={[
            { label: t("summaryCar"), value: `${car.brand} ${car.model}` },
            ...wierszeTerminu,
            {
              label: t("total"),
              value: quote.onRequest ? (
                ""
              ) : (
                <Money grosze={quote.totalGrosze} />
              ),
            },
          ]}
        />

        {/*
          KIEDY NAS ZASTANIE — godziny z ustawień, nie obietnica oddzwonienia
          w N godzin. Takiego zobowiązania firma nigdzie nie zapisała, więc nie
          ma go skąd wziąć; godziny telefonu ma i są publikowane na stronie
          kontaktu. Brak godzin = brak zdania.
        */}
        {contactHours && (
          <p className="text-ink-faint mt-4 text-xs leading-relaxed">
            {t("contactHoursNote", { hours: contactHours })}
          </p>
        )}

        <div className="mt-6 flex flex-col items-center gap-3">
          <Link
            href="/moje-rezerwacje"
            className="label text-red hover:text-red-hover text-[11px] transition-colors"
          >
            {t("viewMyReservations")} →
          </Link>
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setStartDate("");
              setEndDate("");
              setPickupTime(HANDOVER.defaultPickup);
              setReturnTime(HANDOVER.defaultReturn);
            }}
            className="label text-silver hover:text-ink text-[11px]"
          >
            {t("newBooking")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="border-line border p-6 md:p-7">
      <h2 className="font-heading text-xl font-bold">{t("title")}</h2>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <Field label={t("startDate")} error={fErr("startDate")}>
          <input
            ref={startRef}
            type="date"
            min={today}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={inputCls}
            required
          />
        </Field>
        <Field label={t("endDate")} error={fErr("endDate")}>
          <input
            type="date"
            min={startDate || today}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={inputCls}
            required
          />
        </Field>

        {/* Handover times sit directly under their own date, so the pair reads
            as one answer: when the car is collected, when it comes back. */}
        <Field label={t("pickupTime")} error={fErr("pickupTime")}>
          <select
            value={pickupTime}
            onChange={(e) => setPickupTime(e.target.value)}
            className={inputCls}
          >
            {slots.map((slot) => (
              <option key={slot} value={slot}>
                {slot}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("returnTime")} error={fErr("returnTime")}>
          <select
            value={returnTime}
            onChange={(e) => setReturnTime(e.target.value)}
            className={inputCls}
          >
            {slots.map((slot) => (
              <option key={slot} value={slot}>
                {slot}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/*
        Pełne zdanie o minimum — PRZY GODZINIE, nie tylko na przycisku.

        Na przycisku stoi skrót („Odbiór min. 3 h od teraz"), bo przycisk musi
        zmieścić się w jednej linii przy 360 px i jego zadaniem jest powiedzieć,
        DLACZEGO jest wyłączony. To za mało, żeby klient wiedział, co zrobić:
        skrót nie mówi, którą godzinę wybrać.

        Zdanie stoi więc tuż pod polami godzin — czyli tam, gdzie klient
        właśnie popełnił ten wybór, i tam, gdzie jest miejsce na pełną
        polszczyznę bez zmniejszania czcionki. Podaje też pierwszą godzinę,
        którą da się wybrać, żeby nie zostawiać klienta z samym „za wcześnie".

        Pokazuje się WYŁĄCZNIE wtedy, gdy termin jest za wczesny. Komunikat
        widoczny zawsze przestaje być komunikatem i staje się tłem.
      */}
      {validRange && !wyprzedzenie.ok && (
        <p
          role="status"
          data-lead-time-note
          className="border-line text-ink-muted mt-3 border-l-2 py-1 pl-3 text-xs leading-relaxed"
        >
          {najwczesniejszy.slot
            ? t("leadTimeNoteWithSlot", {
                hours: MIN_WYPRZEDZENIE_H,
                time: najwczesniejszy.slot,
              })
            : t("leadTimeNote", { hours: MIN_WYPRZEDZENIE_H })}
        </p>
      )}

      <Field label={t("location")} className="mt-4">
        <select
          value={locationSlug}
          onChange={(e) => setLocationSlug(e.target.value)}
          className={inputCls}
        >
          {/*
            Dopłata za lokalizację zostaje w złotówkach i to nie jest
            przeoczenie: `<option>` rysuje sam system operacyjny i przyjmuje
            wyłącznie tekst — para spanów `<Money>` albo by się tu nie
            wyrenderowała, albo pokazałaby OBIE waluty naraz, bo CSS strony nie
            sięga do natywnej listy telefonu. Ta sama kwota trafia do
            podsumowania niżej, już w wybranej walucie, i tam klient ją widzi
            przed zapłatą.
          */}
          {locations.map((l) => (
            <option key={l.slug} value={l.slug}>
              {(locale === "en" ? l.nameEn : l.name) +
                (l.feeGrosze > 0
                  ? ` (+${formatPln(l.feeGrosze, locale)})`
                  : "")}
            </option>
          ))}
        </select>
      </Field>

      <fieldset className="mt-6">
        <legend className="label-tight text-silver text-[11px]">
          {t("extras")}
        </legend>
        <div className="border-line mt-2 border-t">
          <Toggle
            checked={extraDriver}
            onChange={setExtraDriver}
            label={t("extraDriver")}
            price={feePrice(fees.extraDriver)}
          />
          <Toggle
            checked={childSeat}
            onChange={setChildSeat}
            label={t("childSeat")}
            price={feePrice(fees.childSeat)}
          />
          <Toggle
            checked={protectionPackage}
            onChange={setProtectionPackage}
            label={t("protectionPackage")}
            price={feePrice(fees.protectionPackage)}
          />
        </div>
      </fieldset>

      <div className="mt-6">
        <p className="label-tight text-silver text-[11px]">
          {t("depositTitle")}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(["with_deposit", "no_deposit"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setDepositVariant(v)}
              className={cn(
                "label-tight border px-3 py-2.5 text-[11px] transition-colors",
                depositVariant === v
                  ? "border-red text-ink"
                  : "border-line text-ink-muted hover:border-line-strong",
              )}
            >
              {v === "with_deposit" ? t("withDeposit") : t("noDeposit")}
            </button>
          ))}
        </div>
      </div>

      {/*
        WARUNKI PRZEBIEGU — nad sumą, nie pod przyciskiem.

        Klient ma zobaczyć limit i stawkę ZANIM naciśnie „rezerwuję", więc ten
        blok stoi tam, gdzie i tak patrzy przed decyzją: tuż nad kwotą. Limit
        jest liczony dla WYBRANEGO okresu, nie wpisany na sztywno — trzy dni
        pokazują 300 km/dobę, dziesięć pokazuje 250, a trzydzieści przechodzi
        na próg miesięczny. Reguła siedzi w `lib/booking/mileage` i jest ta
        sama, którą rozliczy zwrot.

        Nie jest pozycją rachunku i nie wchodzi do sumy: dopóki auto nie wróci,
        nikt nie wie, ile klient przejedzie. To warunek umowy pokazany przy
        cenie, a nie opłata doliczona z góry.
      */}
      <div className="border-line mt-6 space-y-1 border-t pt-5 text-sm">
        <p className="label-tight text-silver text-[11px]">
          {t("mileageTitle")}
        </p>
        <p className="text-ink">
          {limitNaDobe === null
            ? t("mileageUnlimited")
            : t("mileageIncluded", { km: formatKm(limitNaDobe, locale) })}
        </p>
        {limitLaczny !== null && dni > 1 && (
          <p className="text-ink-muted text-xs">
            {t("mileageIncludedTotal", {
              km: formatKm(limitLaczny, locale),
            })}
          </p>
        )}
        {limitNaDobe !== null && car.extraMileageFeeGrosze != null && (
          <p className="text-ink-muted text-xs">
            {t("extraMileageLine")}:{" "}
            <span className="text-ink whitespace-nowrap">
              <Money grosze={car.extraMileageFeeGrosze} dokladnie />
              /km
            </span>
          </p>
        )}
      </div>

      {/*
        ZASADY ANULOWANIA — przed przyciskiem, nie po nim.

        Zamówienie mówi wprost, że klient ma poznać pełne zasady PRZED
        potwierdzeniem rezerwacji. Jedno zdanie z progiem bezpłatnym plus
        odnośnik do §5 Regulaminu, gdzie stoi całość — bo wypisanie tu
        wszystkich trzech progów zamieniłoby formularz w cennik, a próg
        bezpłatny jest jedyną liczbą, którą klient naprawdę chce znać, zanim
        naciśnie „rezerwuję".

        Godzina pochodzi z konfiguracji, nie z tekstu: po zmianie progu w panelu
        to zdanie zmienia się razem z nim.
      */}
      <p className="text-ink-muted mt-4 text-xs leading-relaxed">
        {t("anulowanieBezplatneDo", { godziny: cancellationPolicy.freeHours })}{" "}
        {t("anulowaniePozniej")}{" "}
        <Link
          href="/regulamin"
          className="text-ink underline underline-offset-2"
          data-cancellation-terms
        >
          {t("zasadyAnulowania")}
        </Link>
      </p>

      {/* Live, but preview-only — the server recomputes the authoritative total. */}
      {quote.onRequest ? (
        /*
         * This length of stay has no rate in the price list, so there is no
         * total to show and nothing to submit.
         *
         * The breakdown below is hidden rather than zeroed: a customer reading
         * "Wynajem 0 zł · Dojazd 200 zł · Razem 200 zł" would conclude the car
         * is free and the fee is the whole cost. The extras and the location
         * fee are real numbers, which is exactly what makes that page
         * convincing and wrong.
         */
        <div className="border-line mt-6 border-t pt-5">
          <p className="font-heading text-ink text-base font-bold">
            {priceOnRequestLabel(locale)}
          </p>
          <p className="text-ink-muted mt-2 text-sm leading-relaxed">
            {t("onRequestBody")}
          </p>
          {/* WEZWANIE, nie stwierdzenie — patrz `priceOnRequestAction`. */}
          <Link
            href="/contact"
            className="label bg-red hover:bg-red-hover mt-4 inline-flex h-12 items-center px-5 text-xs text-white transition-colors"
          >
            {priceOnRequestAction(locale)}
          </Link>
        </div>
      ) : (
        <div className="border-line mt-6 space-y-2 border-t pt-5 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-ink-muted">
              {t("rental")} · {t("days", { days: Math.max(1, days) })}
            </span>
            <span className="text-ink shrink-0 whitespace-nowrap">
              <Money grosze={quote.rentalGrosze} />
            </span>
          </div>
          {quote.lines.map((l) => (
            <div key={l.code} className="flex justify-between gap-4">
              <span className="text-ink-muted">
                {t(`lineLabels.${l.code}` as never)}
              </span>
              <span className="text-ink shrink-0 whitespace-nowrap">
                <Money grosze={l.amountGrosze} />
              </span>
            </div>
          ))}
          <div className="border-line font-heading flex justify-between gap-4 border-t pt-3 text-base font-bold">
            <span>{t("total")}</span>
            <span className="shrink-0 whitespace-nowrap">
              <Money grosze={quote.totalGrosze} />
            </span>
          </div>
          {quote.depositGrosze > 0 && (
            <div className="text-ink-muted flex justify-between gap-4 text-xs">
              <span>{t("depositHeld")}</span>
              <span className="shrink-0 whitespace-nowrap">
                <Money grosze={quote.depositGrosze} />
              </span>
            </div>
          )}
          {/*
            Tu klient decyduje o wydaniu pieniędzy, więc zastrzeżenie stoi przy
            sumie, a nie gdzieś na dole strony. Renderuje się tylko wtedy, gdy
            czyta ceny w euro — w złotówkach nie ma czego zastrzegać.
          */}
        </div>
      )}

      {/*
        PODSUMOWANIE STOI TU, A NIE NAD BLOKIEM CEN.

        Pierwsza wersja postawiła je nad cenami — i test etapu 3 obalił ten
        układ pomiarem: przy kursorze w polu „Imię i nazwisko" wiersz terminu
        był 460 px NAD ekranem, na wszystkich siedmiu szerokościach i w obu
        językach. Blok cen ma własne ~440 px, więc wypychał podsumowanie
        dokładnie poza widok w tej jednej chwili, dla której powstało.

        Tu, bezpośrednio nad „Dane kontaktowe", jest jedyne miejsce, w którym
        termin naprawdę widać wtedy, gdy klient zaczyna wpisywać nazwisko,
        numer prawa jazdy i adres. Kwot się nie powtarza: blok cen leży
        bezpośrednio nad tym wierszem i widać go w tym samym widoku.
      */}
      <BookingSummary rows={wierszeTerminu} className="mt-6" />

      <fieldset className="mt-6 space-y-3">
        <legend className="label-tight text-silver text-[11px]">
          {t("contact")}
        </legend>
        <Field label={t("name")} error={fErr("customerName")}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
            required
            autoComplete="name"
          />
        </Field>
        <Field label={t("email")} error={fErr("customerEmail")}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
            required
            autoComplete="email"
          />
        </Field>
        <Field label={t("phone")} error={fErr("customerPhone")}>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputCls}
            required
            autoComplete="tel"
          />
        </Field>
      </fieldset>

      <fieldset className="mt-6 space-y-3">
        <legend className="label-tight text-silver text-[11px]">
          {t("driver")}
        </legend>
        <Field label={t("dateOfBirth")} error={fErr("dateOfBirth")}>
          <input
            type="date"
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
            className={inputCls}
            required
            autoComplete="bday"
          />
        </Field>
        <Field label={t("licence")} error={fErr("licenceNumber")}>
          <input
            value={licence}
            onChange={(e) => setLicence(e.target.value)}
            className={inputCls}
            required
          />
        </Field>
        <Field label={t("street")} error={fErr("addressStreet")}>
          <input
            value={street}
            onChange={(e) => setStreet(e.target.value)}
            className={inputCls}
            required
            autoComplete="street-address"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("postcode")} error={fErr("addressPostcode")}>
            <input
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              className={inputCls}
              required
              autoComplete="postal-code"
              placeholder="00-000"
            />
          </Field>
          <Field label={t("city")} error={fErr("addressCity")}>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className={inputCls}
              required
              autoComplete="address-level2"
            />
          </Field>
        </div>
      </fieldset>

      {result && !result.ok && (
        <p className="text-red mt-4 text-xs">
          {t(`errors.${result.error}` as never)}
        </p>
      )}

      {/*
        Not available for these dates — and two ways forward rather than a dead
        end. The customer keeps the car in front of them: one control changes
        the dates in place (the calendar above this form paints which days are
        free), the other opens the fleet filtered to the SAME dates and the same
        class, so every car it shows is genuinely free and genuinely comparable.
        Neither invents anything: the fleet page runs the existing availability
        filter.
      */}
      {!rangeAvailable && (
        <div className="border-red/40 bg-red/5 mt-4 border p-4">
          <p className="text-red text-xs">{t("unavailableForDates")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setStartDate("");
                setEndDate("");
                startRef.current?.focus();
                startRef.current?.scrollIntoView({
                  block: "center",
                  behavior: "smooth",
                });
              }}
              className="label-tight border-line-strong text-ink hover:border-ink hover:bg-ink/5 inline-flex min-h-11 items-center border px-4 text-[11px] transition-colors"
            >
              {t("unavailableOtherDates")}
            </button>
            <Link
              href={{
                pathname: "/fleet",
                query: {
                  from: startDate,
                  to: endDate,
                  ...(car.segments[0] ? { segment: car.segments[0] } : {}),
                },
              }}
              className="label-tight border-line-strong text-ink hover:border-ink hover:bg-ink/5 inline-flex min-h-11 items-center border px-4 text-[11px] transition-colors"
            >
              {t("unavailableSimilar")}
            </Link>
          </div>
        </div>
      )}

      {/* Pułapka na roboty i widget Turnstile — obie warstwy tuż nad
          przyciskiem, żeby klient widział, co rozwiązuje, i po co. */}
      <HoneypotField value={oslona.website} onChange={oslona.setWebsite} />
      {turnstileSiteKey && (
        <div className="mt-6">
          {/* `key` wymusza pełne przerysowanie widgetu przy „spróbuj ponownie" —
              Cloudflare nie ma publicznego sposobu na ponowienie w miejscu. */}
          <TurnstileWidget
            key={oslona.proba}
            siteKey={turnstileSiteKey}
            onToken={oslona.setToken}
            onAwaria={oslona.zglosAwarie}
            onWygasl={oslona.zglosWygasniecie}
          />
          {/*
            Dwa różne zdania dla dwóch różnych sytuacji. „Wygasła" pokazuje się
            wyłącznie wtedy, gdy nowego tokenu jeszcze nie ma — ciche odnowienie
            trwające sekundę nie ma prawa mignąć klientowi komunikatem.
          */}
          {oslona.awaria ? (
            <TurnstileInfo
              wariant="awariaBlokujaca"
              onPonow={oslona.sprobujPonownie}
            />
          ) : oslona.stan === "wygasla" ? (
            <TurnstileInfo wariant="wygasla" onPonow={oslona.sprobujPonownie} />
          ) : null}
        </div>
      )}

      <button
        type="submit"
        disabled={
          pending ||
          !validRange ||
          !rangeAvailable ||
          quote.onRequest ||
          !wyprzedzenie.ok ||
          !oslona.gotowa
        }
        className="label bg-red hover:bg-red-hover mt-6 inline-flex h-14 w-full items-center justify-center text-sm text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending
          ? t("submitting")
          : !rangeAvailable
            ? t("unavailableForDates")
            : quote.onRequest
              ? priceOnRequestAction(locale)
              : !wyprzedzenie.ok
                ? t("leadTimeShort", { hours: MIN_WYPRZEDZENIE_H })
                : !oslona.gotowa
                  ? t("verifying")
                  : t("submit")}
      </button>
      <p className="text-ink-muted mt-3 text-[11px] leading-relaxed">
        {t("note")}
      </p>
    </form>
  );
}
