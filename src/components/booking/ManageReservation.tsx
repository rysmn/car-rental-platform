"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { formatPln } from "@/lib/format";
import {
  anulujRezerwacje,
  podgladAnulowania,
  pobierzSzczegoly,
  potwierdzZmiane,
  zaproponujZmiane,
} from "@/lib/booking/manage";
import type {
  PodgladAnulowania,
  PropozycjaZmiany,
  SzczegolyRezerwacji,
} from "@/lib/booking/manage-types";
import {
  getManageKey,
  subscribeMyReservations,
} from "@/lib/booking/my-reservations";

/**
 * „Zarządzaj rezerwacją" — zmiana terminu i anulowanie po stronie klienta.
 *
 * ## Czego ten komponent NIE rozstrzyga
 *
 * Ani jednej reguły. Próg 24 godzin, minimum trzech godzin, dostępność auta,
 * kolizje i cena liczy serwer (`booking/manage.ts`), a tutaj wyświetlamy
 * odpowiedź. Gdyby przeglądarka liczyła to sama, wystarczyłoby przestawić
 * zegar w telefonie, żeby anulować rezerwację na godzinę przed odbiorem.
 * `moznaZarzadzac` przychodzi z serwera i jest jedynym źródłem prawdy o tym,
 * czy w ogóle pokazać przyciski.
 *
 * ## Dlaczego zmiana ma dwa kroki
 *
 * Najpierw `zaproponujZmiane`, które NIC nie zapisuje i zwraca zestawienie
 * „stare kontra nowe" razem z obiema cenami. Dopiero świadome kliknięcie woła
 * `potwierdzZmiane`. Klient, który zobaczy dopłatę dopiero na wyciągu, ma
 * rację, czując się oszukany — a rezerwacja zmieniona w połowie jest gorsza
 * niż zmiana, która się nie udała.
 */

const PRZYCISK =
  "label border-line-strong text-ink hover:border-ink hover:bg-ink/5 inline-flex h-10 items-center border px-5 text-xs transition-colors disabled:opacity-50";
const PRZYCISK_MOCNY =
  "label bg-ink text-void inline-flex h-10 items-center px-5 text-xs transition-opacity hover:opacity-90 disabled:opacity-50";
const PRZYCISK_CZERWONY =
  "label bg-red hover:bg-red-hover inline-flex h-10 items-center px-5 text-xs text-white transition-colors disabled:opacity-50";
const POLE =
  "border-line bg-surface-1 text-ink focus:border-line-strong w-full border px-3 py-2.5 text-sm outline-none transition-colors";

/**
 * Wartownik na czas, gdy jeszcze nie wiadomo, co ta przeglądarka ma.
 *
 * Serwer renderuje bez `localStorage`, więc pierwszy rzut jest zawsze
 * „nie wiem". Bez tego rozróżnienia strona pokazałaby najpierw „tej rezerwacji
 * nie da się stąd zmienić", a ułamek sekundy później przycisk — czyli
 * migotanie i zdanie, które przez moment kłamie.
 */
const NIEZNANY = "\u0000nieznany";

type Ekran =
  | "zwiniete"
  | "ladowanie"
  | "szczegoly"
  | "zmiana"
  | "propozycja"
  | "anulowanie"
  | "anulowane";

export function ManageReservation({
  reference,
  locale,
  kontaktTelefon,
  kontaktEmail,
  onZmiana,
}: {
  reference: string;
  locale: string;
  kontaktTelefon: string | null;
  kontaktEmail: string | null;
  /** Odświeżenie listy BEZ ręcznego przeładowania strony — wymóg zlecenia. */
  onZmiana: () => void;
}) {
  const t = useTranslations("ManageReservation");
  const [ekran, setEkran] = useState<Ekran>("zwiniete");
  /*
    Klucz czytamy przez `useSyncExternalStore` — tak samo jak lista numerów
    piętro wyżej. Odczyt `localStorage` w efekcie i wsadzenie go do stanu
    dawałby ten sam wynik, ale React słusznie na to zrzędzi: to jest czytanie
    ZEWNĘTRZNEGO ŹRÓDŁA, a nie skutek uboczny renderowania, i ma na to własne
    narzędzie.
  */
  const klucz = useSyncExternalStore(
    subscribeMyReservations,
    () => getManageKey(reference),
    () => NIEZNANY,
  );
  const [dane, setDane] = useState<SzczegolyRezerwacji | null>(null);
  const [propozycja, setPropozycja] = useState<PropozycjaZmiany | null>(null);
  /** Kwota anulowania policzona przez SERWER; `null` = jeszcze nie wiadomo. */
  const [podglad, setPodglad] = useState<PodgladAnulowania | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [zajety, setZajety] = useState(false);

  // Pola formularza zmiany.
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [returnTime, setReturnTime] = useState("");

  const komunikatBledu = useCallback(
    (powod: string) => {
      const znane: Record<string, string> = {
        brak_dostepu: t("bledy.brakDostepu"),
        zamknieta: t("bledy.zamknieta"),
        za_pozno: t("bledy.zaPozno"),
        zly_termin: t("bledy.zlyTermin"),
        lead_time: t("bledy.leadTime"),
        zajete: t("bledy.zajete"),
        cena_na_zapytanie: t("bledy.cenaNaZapytanie"),
        bez_zmian: t("bledy.bezZmian"),
      };
      return znane[powod] ?? t("bledy.ogolny");
    },
    [t],
  );

  async function otworz() {
    if (!klucz) return;
    setEkran("ladowanie");
    setBlad(null);
    const wynik = await pobierzSzczegoly(reference, klucz);
    if (!wynik.ok) {
      setBlad(komunikatBledu(wynik.powod));
      setEkran("szczegoly");
      return;
    }
    setDane(wynik.dane);
    setStartDate(wynik.dane.startDate);
    setEndDate(wynik.dane.endDate);
    setPickupTime(wynik.dane.pickupTime);
    setReturnTime(wynik.dane.returnTime);
    setEkran("szczegoly");
  }

  async function sprawdzZmiane() {
    if (!klucz) return;
    setZajety(true);
    setBlad(null);
    const wynik = await zaproponujZmiane(reference, klucz, {
      startDate,
      endDate,
      pickupTime,
      returnTime,
    });
    setZajety(false);
    if (!wynik.ok) {
      setBlad(komunikatBledu(wynik.powod));
      return;
    }
    setPropozycja(wynik.dane);
    setEkran("propozycja");
  }

  async function zatwierdz() {
    if (!klucz) return;
    setZajety(true);
    setBlad(null);
    const wynik = await potwierdzZmiane(reference, klucz, {
      startDate,
      endDate,
      pickupTime,
      returnTime,
    });
    setZajety(false);
    if (!wynik.ok) {
      /*
        Termin mógł zniknąć MIĘDZY pokazaniem propozycji a kliknięciem.
        Wracamy wtedy do formularza z wyjaśnieniem — stara rezerwacja jest
        nietknięta i to jest cała pointa dwóch kroków.
      */
      setBlad(komunikatBledu(wynik.powod));
      setEkran("zmiana");
      return;
    }
    setPropozycja(null);
    onZmiana();
    await otworz();
  }

  /**
   * Otwiera ekran anulowania, pytając SERWER o kwotę.
   *
   * Przeglądarka nie liczy tu niczego i liczyć nie może: gdyby kwota powstawała
   * po tej stronie, wystarczyłoby przestawić zegar w systemie, żeby zobaczyć
   * „bezpłatnie". Ta sama funkcja serwera, która teraz odpowiada, naliczy
   * należność po potwierdzeniu — więc kwota na ekranie i kwota na rachunku
   * pochodzą z jednego źródła.
   */
  async function otworzAnulowanie() {
    if (!klucz) return;
    setBlad(null);
    setPodglad(null);
    setEkran("anulowanie");
    setZajety(true);
    const wynik = await podgladAnulowania(reference, klucz);
    setZajety(false);
    if (!wynik.ok) {
      setBlad(komunikatBledu(wynik.powod));
      setEkran("szczegoly");
      return;
    }
    setPodglad(wynik.dane);
  }

  async function anuluj() {
    if (!klucz) return;
    setZajety(true);
    setBlad(null);
    const wynik = await anulujRezerwacje(reference, klucz);
    setZajety(false);
    if (!wynik.ok) {
      setBlad(komunikatBledu(wynik.powod));
      setEkran("szczegoly");
      return;
    }
    setEkran("anulowane");
    onZmiana();
  }

  /* Rezerwacja sprzed tej funkcji albo zrobiona na innym urządzeniu — ta
     przeglądarka nie ma klucza i żadne pokazywanie przycisków tego nie zmieni.
     Mówimy wprost, zamiast pokazywać przycisk, który odmówi. */
  // Przed hydratacją nie wiadomo jeszcze nic — nie zgadujemy.
  if (klucz === NIEZNANY) return null;

  if (klucz === null) {
    return (
      <p className="text-ink-faint mt-4 text-xs leading-relaxed">
        {t("brakKluczaNaTymUrzadzeniu")}{" "}
        {kanalKontaktu(kontaktTelefon, kontaktEmail, t)}
      </p>
    );
  }

  if (ekran === "zwiniete") {
    return (
      <button
        type="button"
        className={`${PRZYCISK} mt-4`}
        onClick={otworz}
        data-manage-open={reference}
      >
        {t("zarzadzaj")}
      </button>
    );
  }

  if (ekran === "ladowanie") {
    return <p className="text-ink-faint mt-4 text-sm">{t("ladowanie")}</p>;
  }

  if (ekran === "anulowane") {
    return (
      <p
        className="text-status-available mt-4 text-sm leading-relaxed"
        data-manage-cancelled={reference}
      >
        {t("anulowanaGotowe")}
      </p>
    );
  }

  return (
    <div
      className="border-line mt-4 border-t pt-4"
      data-manage-panel={reference}
    >
      {blad && (
        <p className="text-red mb-3 text-sm leading-relaxed" data-manage-error>
          {blad}
        </p>
      )}

      {/* ── Szczegóły ────────────────────────────────────────────────── */}
      {ekran === "szczegoly" && dane && (
        <div>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-ink-faint">{t("pole.numer")}</dt>
            <dd className="text-ink text-right font-mono">{dane.reference}</dd>
            <dt className="text-ink-faint">{t("pole.auto")}</dt>
            <dd className="text-ink text-right">{dane.carName}</dd>
            <dt className="text-ink-faint">{t("pole.odbior")}</dt>
            <dd className="text-ink text-right tabular-nums">
              {dane.startDate} {dane.pickupTime}
            </dd>
            <dt className="text-ink-faint">{t("pole.zwrot")}</dt>
            <dd className="text-ink text-right tabular-nums">
              {dane.endDate} {dane.returnTime}
            </dd>
            <dt className="text-ink-faint">{t("pole.miejsce")}</dt>
            <dd className="text-ink text-right">{dane.locationName}</dd>
            <dt className="text-ink-faint">{t("pole.cena")}</dt>
            <dd className="text-ink text-right tabular-nums">
              {formatPln(dane.totalGrosze, locale)}
            </dd>
          </dl>

          {/*
            Dokumenty do zapoznania się — punkt 16 zamówienia.

            Konkretne WERSJE udostępnione tej rezerwacji, nie „aktualny
            regulamin": klient ma widzieć to, co dostał przy potwierdzeniu,
            także wtedy, gdy dokument zmienił się nazajutrz.

            Ani jednego pola do zaznaczenia. Zamówienie mówi wprost, żeby nie
            udawać wiążącego e-podpisu checkboxem — więc tu jest wyłącznie
            dostęp do treści, a zgoda zostaje tam, gdzie naprawdę się dzieje:
            przy wydaniu auta, na papierze albo na podpisie palcem.

            Nic nie rysuje się, dopóki nie ma czego pokazać.
          */}
          {dane.dokumenty.length > 0 && (
            <section className="border-line mt-5 border-t pt-5">
              <h3 className="font-heading text-ink text-sm font-bold">
                {t("dokumenty.tytul")}
              </h3>
              <p className="text-ink-muted mt-1 text-xs leading-relaxed">
                {t("dokumenty.opis")}
              </p>
              <ul className="mt-3 space-y-2">
                {dane.dokumenty.map((d) => (
                  <li key={d.id}>
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-ink tap-area -my-1 inline-flex min-h-11 items-center py-1 text-sm underline underline-offset-4 hover:no-underline"
                    >
                      {d.title}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/*
            ANULOWANIE JEST ZAWSZE, ZMIANA TERMINU TYLKO W OKNIE SAMOOBSŁUGI —
            i te dwie sprawy rozjechały się celowo 01.09.2026.

            Do tej pory oba przyciski znikały razem poniżej 24 h, bo obie
            operacje miały jedną regułę. Nowa polityka mówi, że anulować wolno
            zawsze, tylko bliżej odbioru kosztuje — więc odbieranie klientowi
            przycisku i odsyłanie go do telefonu byłoby zmuszaniem do rozmowy
            o czymś, co system umie rozliczyć sam. Zamówienie mówi o tym wprost:
            „do zwykłego anulowania online klient NIE powinien być zmuszany do
            pisania osobnego pisma lub maila".

            Zmiana terminu została przy dawnym oknie: przesunięcie rezerwacji na
            kilka godzin przed odbiorem to zupełnie inna operacja niż jej
            odwołanie i nikt nie prosił o jej otwarcie.
          */}
          <div className="mt-5 flex flex-wrap gap-3">
            {dane.moznaZarzadzac && (
              <button
                type="button"
                className={PRZYCISK}
                onClick={() => {
                  setBlad(null);
                  setEkran("zmiana");
                }}
                data-manage-change
              >
                {t("zmienTermin")}
              </button>
            )}
            <button
              type="button"
              className={PRZYCISK}
              disabled={zajety}
              onClick={otworzAnulowanie}
              data-manage-cancel
            >
              {t("anuluj")}
            </button>
          </div>
          {!dane.moznaZarzadzac && (
            /*
              Poniżej 24 h — i to jest CAŁY komunikat, jaki klient dostaje.
              Bez wyszarzonych przycisków, które i tak odmówią: przycisk,
              który nie działa, jest gorszy niż jego brak, bo każe próbować.
            */
            <p
              className="text-ink-muted mt-4 text-sm leading-relaxed"
              data-manage-locked
            >
              {t("ponizej24hZmiana")}{" "}
              {kanalKontaktu(kontaktTelefon, kontaktEmail, t)}
            </p>
          )}
        </div>
      )}

      {/* ── Formularz zmiany ─────────────────────────────────────────── */}
      {ekran === "zmiana" && dane && (
        <div>
          <p className="text-ink-muted text-sm leading-relaxed">
            {t("zmianaWstep")}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label-tight text-ink-faint text-[10px]">
                {t("pole.dataOdbioru")}
              </span>
              <input
                type="date"
                className={`${POLE} mt-1.5`}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                data-manage-start
              />
            </label>
            <label className="block">
              <span className="label-tight text-ink-faint text-[10px]">
                {t("pole.godzinaOdbioru")}
              </span>
              <select
                className={`${POLE} mt-1.5`}
                value={pickupTime}
                onChange={(e) => setPickupTime(e.target.value)}
                data-manage-pickup
              >
                {dane.dostepneGodziny.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label-tight text-ink-faint text-[10px]">
                {t("pole.dataZwrotu")}
              </span>
              <input
                type="date"
                className={`${POLE} mt-1.5`}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                data-manage-end
              />
            </label>
            <label className="block">
              <span className="label-tight text-ink-faint text-[10px]">
                {t("pole.godzinaZwrotu")}
              </span>
              <select
                className={`${POLE} mt-1.5`}
                value={returnTime}
                onChange={(e) => setReturnTime(e.target.value)}
                data-manage-return
              >
                {dane.dostepneGodziny.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              className={PRZYCISK_MOCNY}
              disabled={zajety}
              onClick={sprawdzZmiane}
              data-manage-check
            >
              {t("sprawdzZmiane")}
            </button>
            <button
              type="button"
              className={PRZYCISK}
              onClick={() => {
                setBlad(null);
                setEkran("szczegoly");
              }}
            >
              {t("wroc")}
            </button>
          </div>
        </div>
      )}

      {/* ── Stare kontra nowe ────────────────────────────────────────── */}
      {ekran === "propozycja" && propozycja && (
        <div data-manage-proposal>
          <p className="text-ink-muted text-sm leading-relaxed">
            {t("propozycjaWstep")}
          </p>
          <div className="border-line mt-4 grid gap-px border sm:grid-cols-2">
            <div className="bg-void p-4">
              <p className="label-tight text-ink-faint text-[10px]">
                {t("stara")}
              </p>
              <p className="text-ink mt-2 text-sm tabular-nums">
                {propozycja.stare.startDate} {propozycja.stare.pickupTime} –{" "}
                {propozycja.stare.endDate} {propozycja.stare.returnTime}
              </p>
              <p className="text-ink-muted mt-1 text-sm tabular-nums">
                {propozycja.stare.days} {t("dni")} ·{" "}
                {formatPln(propozycja.stare.totalGrosze, locale)}
              </p>
            </div>
            <div className="bg-void p-4">
              <p className="label-tight text-status-available text-[10px]">
                {t("nowa")}
              </p>
              <p
                className="text-ink mt-2 text-sm tabular-nums"
                data-manage-new-range
              >
                {propozycja.nowe.startDate} {propozycja.nowe.pickupTime} –{" "}
                {propozycja.nowe.endDate} {propozycja.nowe.returnTime}
              </p>
              <p className="text-ink-muted mt-1 text-sm tabular-nums">
                {propozycja.nowe.days} {t("dni")} ·{" "}
                {formatPln(propozycja.nowe.totalGrosze, locale)}
              </p>
            </div>
          </div>

          {propozycja.cenaSieZmienia && (
            <p
              className="text-ink mt-4 text-sm leading-relaxed"
              data-manage-price-change
            >
              {propozycja.roznicaGrosze > 0
                ? t("doplata", {
                    kwota: formatPln(propozycja.roznicaGrosze, locale),
                  })
                : t("zwrot", {
                    kwota: formatPln(
                      Math.abs(propozycja.roznicaGrosze),
                      locale,
                    ),
                  })}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              className={PRZYCISK_MOCNY}
              disabled={zajety}
              onClick={zatwierdz}
              data-manage-confirm
            >
              {t("potwierdzamZmiane")}
            </button>
            <button
              type="button"
              className={PRZYCISK}
              onClick={() => setEkran("zmiana")}
            >
              {t("wroc")}
            </button>
          </div>
        </div>
      )}

      {/* ── Potwierdzenie anulowania ─────────────────────────────────── */}
      {ekran === "anulowanie" && dane && (
        <div data-manage-cancel-confirm>
          <p className="text-ink text-sm leading-relaxed">{t("naPewno")}</p>
          {/*
            KWOTA I POWÓD — zanim pojawi się przycisk „Potwierdzam".

            Dopóki serwer nie odpowie, przycisku potwierdzenia NIE MA. To nie
            jest ostrożność na wyrost: gdyby dało się potwierdzić przed
            poznaniem kwoty, klient anulowałby, nie wiedząc, ile zapłaci —
            czyli dokładnie to, czemu ten ekran ma zapobiegać.
          */}
          {podglad ? (
            <div className="border-line-strong mt-4 border-l-2 pl-4">
              <p
                className="font-heading text-ink text-base font-bold"
                data-manage-cancel-fee
              >
                {podglad.kwotaGrosze > 0
                  ? t("anulowanieOplata", {
                      kwota: formatPln(podglad.kwotaGrosze, locale),
                    })
                  : t("anulowanieBezplatne")}
              </p>
              <p className="text-ink-muted mt-1.5 text-xs leading-relaxed">
                {podglad.progi === null
                  ? t("anulowanieBezplatne")
                  : podglad.tier === "free"
                    ? t("anulowanieDlaczegoFree", {
                        godziny: podglad.progi.bezplatneH,
                      })
                    : podglad.tier === "tier1"
                      ? t("anulowanieDlaczegoTier1", {
                          godziny: podglad.progi.bezplatneH,
                          drugi: podglad.progi.drugiProgH,
                        })
                      : t("anulowanieDlaczegoTier2", {
                          drugi: podglad.progi.drugiProgH,
                        })}
              </p>
              {podglad.ograniczonaWartosciaRezerwacji && (
                <p className="text-ink-muted mt-1.5 text-xs leading-relaxed">
                  {t("anulowanieSufit", {
                    cennik: formatPln(podglad.cennikGrosze, locale),
                    wartosc: formatPln(
                      podglad.wartoscRezerwacjiGrosze,
                      locale,
                    ),
                  })}
                </p>
              )}
              {podglad.kwotaGrosze > 0 && (
                <p className="text-ink-muted mt-1.5 text-xs leading-relaxed">
                  {t("anulowanieDoZaplaty")}
                </p>
              )}
            </div>
          ) : (
            <p className="text-ink-faint mt-4 text-xs">
              {t("anulowanieLiczymy")}
            </p>
          )}
          <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-ink-faint">{t("pole.auto")}</dt>
            <dd className="text-ink text-right">{dane.carName}</dd>
            <dt className="text-ink-faint">{t("pole.termin")}</dt>
            <dd className="text-ink text-right tabular-nums">
              {dane.startDate} – {dane.endDate}
            </dd>
            <dt className="text-ink-faint">{t("pole.numer")}</dt>
            <dd className="text-ink text-right font-mono">{dane.reference}</dd>
          </dl>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              className={PRZYCISK_CZERWONY}
              disabled={zajety || !podglad}
              onClick={anuluj}
              data-manage-cancel-yes
            >
              {t("takAnuluj")}
            </button>
            <button
              type="button"
              className={PRZYCISK}
              onClick={() => setEkran("szczegoly")}
            >
              {t("nieWracam")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Kanał kontaktu z obsługą — ten sam, który stoi w stopce serwisu.
 *  Komunikat „skontaktuj się z obsługą" bez numeru telefonu jest ślepym
 *  zaułkiem, a nie informacją. */
function kanalKontaktu(
  telefon: string | null,
  email: string | null,
  t: ReturnType<typeof useTranslations>,
) {
  if (telefon) return t("kontaktTelefon", { telefon });
  if (email) return t("kontaktEmail", { email });
  return t("kontaktOgolny");
}
