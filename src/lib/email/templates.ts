import "server-only";
import { siteConfig } from "@/lib/config/site";
import { formatPln, formatPlnDokladnie } from "@/lib/format";
import type { CompanySettings } from "@/lib/admin/settings";

/**
 * Jeden układ wiadomości i jeden słownik — punkt 4 zamówienia.
 *
 * ## Po co osobny plik
 *
 * `notify.ts` miał do 30.08.2026 pięć wiadomości i każda niosła własny HTML,
 * własne `<body style=…>` i własną polszczyznę wpisaną na stałe w zdania.
 * Dołożenie do tego czterech kolejnych powiadomień i drugiego języka dałoby
 * osiemnaście wariantów tego samego listu — i osiemnaście miejsc, w których
 * marka A&A może wyglądać inaczej.
 *
 * Tutaj są dwie rzeczy i nic więcej: `list()` rysuje kopertę, `T` trzyma słowa.
 * Treść konkretnego powiadomienia to wyłącznie dobór pól i jedno zdanie
 * „co dalej".
 *
 * ## Język bierze się z REZERWACJI, nie z żądania
 *
 * Wiadomości wychodzą także wtedy, gdy klienta dawno nie ma na stronie: obsługa
 * potwierdza rezerwację nazajutrz, klient przesuwa termin za tydzień. `useLocale()`
 * nie ma wtedy czego odczytać. Dlatego język jest zapisany w kolumnie
 * `reservations.locale` (migracja 0046) i stąd go bierzemy.
 *
 * ## Czego tu nie ma
 *
 * Nazw technicznych. Klient nigdy nie zobaczy `pending_verification` ani
 * `confirmed` — widzi zdanie o tym, co się właśnie stało i co ma zrobić.
 * Mapowanie statusu na to zdanie stoi w `statusKlienta()` i jest jedynym
 * miejscem, w którym te dwa światy się stykają.
 */

export type Jezyk = "pl" | "en";

/** Rezerwacja w takim zakresie, w jakim opisuje ją list do klienta. */
export type DaneRezerwacji = {
  reference: string;
  carName: string;
  startDate: string;
  endDate: string;
  pickupTime: string | null;
  returnTime: string | null;
  totalGrosze: number;
  /**
   * Warunki przebiegu Z REZERWACJI, nie z dzisiejszego cennika auta.
   *
   * Opcjonalne, bo nie każdy list je niesie: odrzucenie i prośba o
   * potwierdzenie adresu nie są podsumowaniem warunków i nie mają czego
   * podsumowywać. `null`/brak = wiersz nie powstaje — mail nigdy nie wypisze
   * „limit: — km".
   */
  includedMileageKm?: number | null;
  extraMileageFeeGrosze?: number | null;
  /**
   * Rozliczenie anulowania — obecne WYŁĄCZNIE w liście o anulowaniu.
   *
   * Osobne pole, a nie kolejna kwota w `totalGrosze`: to nie jest cena najmu,
   * tylko należność, która z tego najmu została. List potwierdzający ma jej nie
   * mieć, a list o anulowaniu ma ją mieć zawsze — także wtedy, gdy wynosi zero,
   * bo „anulowanie bezpłatne" jest informacją, na którą klient czeka.
   */
  anulowanie?: {
    kwotaGrosze: number;
    /** Kwota z cennika przed sufitem — różna tylko wtedy, gdy sufit zadziałał. */
    cennikGrosze: number;
    ograniczonaWartoscia: boolean;
    /** Ustawiane po umorzeniu: list ma wtedy powiedzieć „do zapłaty 0 zł". */
    umorzona?: boolean;
  } | null;
  customerName: string;
  customerEmail: string;
  locale: Jezyk;
  /** Adres „Zarządzaj rezerwacją" z kluczem. Nigdy nie trafia do logów. */
  manageUrl?: string | null;
  /** Adres strony z dokumentami do zapoznania się. Punkt 16. */
  documentsUrl?: string | null;
};

/** Słowa. Jeden obiekt na język, żeby brak tłumaczenia był błędem typu. */
const T = {
  pl: {
    naglowekRezerwacja: "Rezerwacja",
    numer: "Numer rezerwacji",
    samochod: "Samochód",
    termin: "Termin",
    odbior: "Odbiór",
    zwrot: "Zwrot",
    razem: "Razem",
    limitKm: "Limit kilometrów",
    nadprzebieg: "Opłata za dodatkowy kilometr",
    oplataAnulowania: "Opłata za anulowanie",
    oplataUmorzona: "umorzona",
    oplataSufit: "Ograniczona wartością rezerwacji",
    doZaplaty: "Do zapłaty",
    bezOplaty: "bezpłatne",
    coDalej: "Co dalej",
    kontakt: "Kontakt",
    zarzadzaj: "Zarządzaj rezerwacją",
    dokumenty: "Dokumenty do zapoznania się",
    pozdrawiamy: "Pozdrawiamy",
    dzienDobry: "Dzień dobry",
    stopkaAutomat:
      "Wiadomość wysłana automatycznie w związku z Twoją rezerwacją.",
  },
  en: {
    naglowekRezerwacja: "Reservation",
    numer: "Reservation number",
    samochod: "Car",
    termin: "Dates",
    odbior: "Pick-up",
    zwrot: "Return",
    razem: "Total",
    limitKm: "Mileage limit",
    nadprzebieg: "Extra mileage fee",
    oplataAnulowania: "Cancellation fee",
    oplataUmorzona: "waived",
    oplataSufit: "Capped at the reservation value",
    doZaplaty: "Amount due",
    bezOplaty: "free of charge",
    coDalej: "What happens next",
    kontakt: "Contact",
    zarzadzaj: "Manage your reservation",
    dokumenty: "Documents to review",
    pozdrawiamy: "Kind regards",
    dzienDobry: "Hello",
    stopkaAutomat:
      "This message was sent automatically about your reservation.",
  },
} as const;

export function slowa(jezyk: Jezyk) {
  return T[jezyk];
}

/** Ucieczka do HTML. Dane klienta trafiają do listu, więc idą przez to zawsze. */
export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Data w formacie czytelnym w danym języku — bez nazw miesięcy z kodu. */
export function formatData(iso: string, jezyk: Jezyk): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(jezyk === "en" ? "en-GB" : "pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/** `09:00:00` → `09:00`. Pusta godzina znika z listu zamiast świecić myślnikiem. */
export function formatGodzina(t: string | null): string | null {
  if (!t) return null;
  return t.slice(0, 5);
}

/**
 * Status opisany językiem klienta.
 *
 * Zamówienie mówi wprost: „Nie pokazuj technicznych nazw backendowych".
 * To jest jedyne miejsce, w którym `pending_verification` zamienia się w zdanie,
 * które ktoś chce przeczytać.
 */
export function statusKlienta(status: string, jezyk: Jezyk): string {
  const pl: Record<string, string> = {
    pending_verification: "Czeka na potwierdzenie adresu e-mail",
    pending: "Czeka na potwierdzenie przez nasz zespół",
    confirmed: "Potwierdzona",
    completed: "Zakończona",
    cancelled: "Anulowana",
    rejected: "Niezrealizowana",
  };
  const en: Record<string, string> = {
    pending_verification: "Waiting for e-mail confirmation",
    pending: "Waiting for confirmation by our team",
    confirmed: "Confirmed",
    completed: "Completed",
    cancelled: "Cancelled",
    rejected: "Not fulfilled",
  };
  const mapa = jezyk === "en" ? en : pl;
  // Nieznany status nie może wypuścić nazwy z bazy do klienta.
  return mapa[status] ?? (jezyk === "en" ? "In progress" : "W toku");
}

/** Wiersze tabeli — te same w HTML i w wersji tekstowej. */
export function wierszeRezerwacji(r: DaneRezerwacji): [string, string][] {
  const s = slowa(r.locale);
  const odbior = formatGodzina(r.pickupTime);
  const zwrot = formatGodzina(r.returnTime);
  const wiersze: [string, string][] = [
    [s.numer, r.reference],
    [s.samochod, r.carName],
    [
      s.termin,
      `${formatData(r.startDate, r.locale)} – ${formatData(r.endDate, r.locale)}`,
    ],
  ];
  if (odbior) wiersze.push([s.odbior, odbior]);
  if (zwrot) wiersze.push([s.zwrot, zwrot]);
  if (r.totalGrosze > 0) {
    wiersze.push([s.razem, formatPln(r.totalGrosze, r.locale)]);
  }
  /*
    Limit i stawka nadprzebiegu — dwa ostatnie wiersze, pod kwotą.

    Pod nią, bo to warunek najmu, a nie pozycja rachunku: kwota jest tym, co
    klient zapłaci teraz, a te dwa wiersze mówią, co się stanie, jeżeli
    przejedzie więcej, niż obejmuje najem. Mail jest jedyną rzeczą, którą
    klient ma na piśmie zanim dostanie umowę.
  */
  if (r.includedMileageKm != null) {
    wiersze.push([
      s.limitKm,
      `${r.includedMileageKm.toLocaleString(r.locale === "en" ? "en-GB" : "pl-PL")} km`,
    ]);
  }
  if (r.extraMileageFeeGrosze != null) {
    wiersze.push([
      s.nadprzebieg,
      `${formatPlnDokladnie(r.extraMileageFeeGrosze, r.locale)}/km`,
    ]);
  }
  /*
    Rozliczenie anulowania — ostatni wiersz i zawsze, gdy list o nim jest.

    Także wtedy, gdy wynosi zero: „anulowanie bezpłatne" jest tym, na co klient
    czeka, otwierając tę wiadomość, i milczenie w tym miejscu czyta się jak
    rachunek, który dopiero przyjdzie. Po umorzeniu wiersz mówi wprost, ile
    zostało do zapłaty, a nie ile było naliczone — tamto stoi obok.
  */
  if (r.anulowanie) {
    const a = r.anulowanie;
    if (a.umorzona) {
      wiersze.push([s.oplataAnulowania, s.oplataUmorzona]);
      wiersze.push([s.doZaplaty, formatPln(0, r.locale)]);
    } else if (a.kwotaGrosze > 0) {
      wiersze.push([s.oplataAnulowania, formatPln(a.kwotaGrosze, r.locale)]);
      if (a.ograniczonaWartoscia) {
        wiersze.push([
          s.oplataSufit,
          `${formatPln(a.cennikGrosze, r.locale)} → ${formatPln(a.kwotaGrosze, r.locale)}`,
        ]);
      }
      wiersze.push([s.doZaplaty, formatPln(a.kwotaGrosze, r.locale)]);
    } else {
      wiersze.push([s.oplataAnulowania, s.bezOplaty]);
    }
  }
  return wiersze;
}

export type Koperta = {
  jezyk: Jezyk;
  /** Mała etykieta nad tytułem — czym jest ta wiadomość. */
  etykieta: string;
  tytul: string;
  /** Zdanie otwierające, już z imieniem. */
  wstep: string;
  wiersze: [string, string][];
  /** „Co dalej" — jedno zdanie, nie instrukcja obsługi. */
  coDalej?: string | null;
  manageUrl?: string | null;
  documentsUrl?: string | null;
  /**
   * Przycisk główny inny niż „Zarządzaj rezerwacją".
   *
   * List potwierdzający adres ma jedno zadanie i jeden przycisk — „Potwierdź".
   * Gdyby dostał ten sam przycisk co reszta, klient miałby do wyboru dwie
   * drogi w wiadomości, która istnieje po to, żeby była jedna.
   */
  akcja?: { url: string; etykieta: string } | null;
  company: CompanySettings;
};

/** Wersja tekstowa. Nie „na wszelki wypadek" — część klientów czyta tylko ją. */
export function listTekst(k: Koperta): string {
  const s = slowa(k.jezyk);
  const linie = [
    k.wstep,
    "",
    ...k.wiersze.map(([etykieta, wartosc]) => `${etykieta}: ${wartosc}`),
  ];
  if (k.coDalej) linie.push("", `${s.coDalej}: ${k.coDalej}`);
  if (k.akcja) linie.push("", `${k.akcja.etykieta}: ${k.akcja.url}`);
  if (k.manageUrl) linie.push("", `${s.zarzadzaj}: ${k.manageUrl}`);
  if (k.documentsUrl) linie.push("", `${s.dokumenty}: ${k.documentsUrl}`);
  const telefon = k.company.phones[0]?.number ?? "";
  linie.push(
    "",
    `${s.kontakt}: ${[telefon, k.company.email].filter(Boolean).join(" · ")}`,
    "",
    `${s.pozdrawiamy},`,
    siteConfig.name,
  );
  return linie.join("\n");
}

/**
 * Wersja HTML.
 *
 * Style inline i tabela zamiast siatki — nie z niechlujstwa, tylko dlatego, że
 * klienty pocztowe wycinają `<style>` i nie znają flexboksa. Ten sam powód, dla
 * którego szerokość jest w pikselach.
 */
export function listHtml(k: Koperta): string {
  const s = slowa(k.jezyk);
  const telefon = k.company.phones[0]?.number ?? "";
  const wiersze = k.wiersze
    .map(
      ([etykieta, wartosc]) => `
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#8a8a8a;white-space:nowrap">${esc(etykieta)}</td>
          <td style="padding:6px 0 6px 16px;font-size:14px;color:#111;font-weight:600">${esc(wartosc)}</td>
        </tr>`,
    )
    .join("");

  const przycisk = (url: string, etykieta: string) => `
      <p style="margin:0 0 12px">
        <a href="${esc(url)}"
           style="display:inline-block;padding:12px 22px;background:#c8102e;color:#fff;
                  font-size:14px;font-weight:600;text-decoration:none">${esc(etykieta)}</a>
      </p>`;

  return `<!doctype html>
<html lang="${k.jezyk}"><body style="margin:0;background:#f5f5f5;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <div style="background:#fff;border:1px solid #e5e5e5;padding:28px">
      <p style="margin:0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#c8102e">${esc(k.etykieta)}</p>
      <h1 style="margin:8px 0 20px;font-size:22px;color:#111">${esc(k.tytul)}</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#111;line-height:1.6">${esc(k.wstep)}</p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 20px">${wiersze}</table>
      ${
        k.coDalej
          ? `<p style="margin:0 0 20px;font-size:14px;color:#111;line-height:1.6">
               <strong>${esc(s.coDalej)}:</strong> ${esc(k.coDalej)}</p>`
          : ""
      }
      ${k.akcja ? przycisk(k.akcja.url, k.akcja.etykieta) : ""}
      ${k.manageUrl ? przycisk(k.manageUrl, s.zarzadzaj) : ""}
      ${
        k.documentsUrl
          ? `<p style="margin:0 0 12px;font-size:14px">
               <a href="${esc(k.documentsUrl)}" style="color:#c8102e">${esc(s.dokumenty)}</a></p>`
          : ""
      }
      <p style="margin:24px 0 0;font-size:13px;color:#8a8a8a;line-height:1.6">
        ${esc(s.kontakt)}: ${esc([telefon, k.company.email].filter(Boolean).join(" · "))}<br>
        ${esc(s.stopkaAutomat)}
      </p>
    </div>
  </div>
</body></html>`;
}
