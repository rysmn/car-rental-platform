"use client";

import { useId, useRef, useState } from "react";
import { submitRequest } from "@/lib/inbox/actions";
import {
  TurnstileInfo,
  TurnstileWidget,
  useFormShield,
} from "@/components/security/FormShield";

/**
 * Formularz zapytania — jedyny kanał na stronie publicznej, który zostawia
 * w systemie ŚLAD.
 *
 * Telefon, WhatsApp i `mailto:` prowadzą poza aplikację: nie da się ich
 * policzyć, odznaczyć ani przypomnieć. Ten formularz kończy się wierszem
 * w skrzynce i to jest cały powód jego istnienia.
 *
 * MINIMUM PÓL, ŚWIADOMIE. Imię, kontakt, temat, wiadomość i — gdy pytanie
 * wychodzi ze strony auta — samo auto oraz termin. Nie zbieramy wieku, adresu
 * ani numeru prawa jazdy: to są dane potrzebne do REZERWACJI, a nie do
 * odpowiedzi na pytanie, i formularz kontaktowy nie jest miejscem, żeby brać
 * je „na przyszłość".
 */
export function RequestForm({
  labels,
  locale,
  carSlug,
  carName,
  privacyHref,
  turnstileSiteKey,
}: {
  labels: Record<string, string>;
  locale: "pl" | "en";
  /** Ustawione na stronie auta — wtedy zapytanie niesie model. */
  carSlug?: string;
  carName?: string;
  privacyHref: string;
  /** Klucz witryny Turnstile albo `null` — patrz `lib/security/turnstile`. */
  turnstileSiteKey?: string | null;
}) {
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const id = useId();
  /*
    Osłona formularza — rozdział 13.1. Pułapka `website` była tu od początku;
    dochodzi pomiar czasu wypełniania i (gdy skonfigurowany) Turnstile.
    Sprawdza je serwer, w `sprawdzFormularz`.
  */
  const oslona = useFormShield(turnstileSiteKey ?? null);
  /** Zasuwka przeciwko dwóm zapytaniom z jednego kliknięcia — patrz rezerwacja. */
  const wysylkaTrwa = useRef(false);

  if (state === "done") {
    return (
      <p
        role="status"
        className="border-line bg-surface-1 text-ink border p-6 text-sm"
      >
        {labels.formDone}
      </p>
    );
  }

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (wysylkaTrwa.current || state === "sending") return;
    const fd = new FormData(e.currentTarget);

    /*
      Token starszy niż pięć minut nie jedzie na serwer — ta sama zasada, co
      w formularzu rezerwacji, bo Turnstile jest tu ten sam. Wpisana treść
      zostaje nietknięta, nowa weryfikacja jest w drodze, a druga próba
      wymaga kliknięcia klienta. Nic nie wysyła się samo.
    */
    if (turnstileSiteKey && !oslona.awaria) {
      if (oslona.stan === "ladowanie") return;
      if (oslona.stan === "wygasla") {
        setError(labels.formErrTurnstile ?? labels.formErrServer);
        return;
      }
      if (!oslona.tokenSwiezy()) {
        oslona.zuzyjToken();
        setError(labels.formErrTurnstile ?? labels.formErrServer);
        return;
      }
    }

    wysylkaTrwa.current = true;
    setState("sending");
    setError(null);
    setFieldErrors({});

    const res = await submitRequest({
      name: String(fd.get("name") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      email: String(fd.get("email") ?? ""),
      subject: String(fd.get("subject") ?? ""),
      message: String(fd.get("message") ?? ""),
      dateFrom: String(fd.get("dateFrom") ?? ""),
      dateTo: String(fd.get("dateTo") ?? ""),
      carSlug,
      locale,
      consent: fd.get("consent") === "on",
      // Pułapkę czytamy z formularza (jest w DOM od etapu 44D), resztę
      // z osłony: znacznik otwarcia i token Turnstile.
      ...oslona.pola(),
      website: String(fd.get("website") ?? ""),
    }).catch(() => ({ ok: false, error: "server" }) as const);

    /* Token jest jednorazowy — po wysyłce bierzemy nowy, żeby druga próba
       nie rozbijała się o `timeout-or-duplicate`. */
    oslona.zuzyjToken();
    wysylkaTrwa.current = false;

    if (res.ok) {
      setState("done");
      return;
    }
    setState("idle");
    if (res.error === "rate") setError(labels.formErrRate);
    else if (res.error === "turnstile")
      setError(labels.formErrTurnstile ?? labels.formErrServer);
    else if (res.error === "server") setError(labels.formErrServer);
    else {
      /*
       * Komunikaty po polsku/angielsku układamy TUTAJ, a serwer zwraca same
       * klucze pól. Inaczej teksty dla klienta mieszkałyby w akcji serwerowej,
       * poza plikami tłumaczeń, i jeden z dwóch języków zawsze by się rozjechał.
       */
      const fe = "fieldErrors" in res ? (res.fieldErrors ?? {}) : {};
      setFieldErrors({
        phone: fe.phone ? labels.formErrContact : "",
        subject: fe.subject ? labels.formErrSubject : "",
        message: fe.message ? labels.formErrMessage : "",
        consent: fe.consent ? labels.formErrConsent : "",
      });
    }
  };

  const field =
    "border-line-strong bg-surface-1 text-ink placeholder:text-ink-faint w-full border px-3 py-3 text-sm";
  /*
    KOMUNIKAT BŁĘDU MUSI BYĆ PRZYPISANY DO POLA, nie tylko postawiony obok.

    Do 01.09.2026 `err()` renderowało akapit bez identyfikatora, a pole nie
    miało ani `aria-describedby`, ani `aria-invalid`. Wzrokowo działało: pod
    polem pojawiał się czerwony napis. Dla czytnika ekranu nie istniało nic —
    klient wracał Tabem do pola i słyszał samą etykietę, bez informacji, że to
    właśnie ono zostało odrzucone i dlaczego. To WCAG 3.3.1 (identyfikacja
    błędu) i 1.3.1 (powiązania w strukturze).

    `bledPola(k)` zwraca gotowy komplet atrybutów, więc dopisanie go do pola
    to jedno `{...}` i nie da się powiązać komunikatu z niewłaściwym polem —
    obie strony biorą identyfikator z tego samego wyrażenia.
  */
  const idBledu = (k: string) => `${id}-${k}-blad`;
  const bledPola = (k: string) =>
    fieldErrors[k]
      ? { "aria-invalid": true as const, "aria-describedby": idBledu(k) }
      : {};
  const err = (k: string) =>
    fieldErrors[k] ? (
      <p id={idBledu(k)} className="text-red mt-1 text-[11px]">
        {fieldErrors[k]}
      </p>
    ) : null;

  return (
    <form
      onSubmit={onSubmit}
      className="border-line relative max-w-xl border p-6"
    >
      {carName && (
        <p className="label-tight text-ink-faint mb-4 text-[10px]">
          {labels.formCar}: <span className="text-ink">{carName}</span>
        </p>
      )}

      <div className="space-y-4">
        <div>
          <label
            htmlFor={`${id}-name`}
            className="label-tight text-ink-faint text-[10px]"
          >
            {labels.formName}
          </label>
          {/* `autoComplete="name"` — WCAG 1.3.5. Telefon i e-mail miały swoje
              od początku; imię było jedynym polem tożsamości, którego
              przeglądarka nie umiała podpowiedzieć. */}
          <input
            id={`${id}-name`}
            name="name"
            autoComplete="name"
            maxLength={120}
            className={`${field} mt-1`}
            {...bledPola("name")}
          />
          {/* Schemat po stronie serwera potrafi odrzucić `name` (długość)
              i `email` (format), a żadne z tych pól nie miało gdzie tego
              powiedzieć — komunikat wracał i nie był rysowany. Bez tego
              `aria-describedby` z `bledPola` wskazywałby na akapit, którego
              nie ma. */}
          {err("name")}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor={`${id}-phone`}
              className="label-tight text-ink-faint text-[10px]"
            >
              {labels.formPhone}
            </label>
            <input
              id={`${id}-phone`}
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={40}
              className={`${field} mt-1`}
              {...bledPola("phone")}
            />
          </div>
          <div>
            <label
              htmlFor={`${id}-email`}
              className="label-tight text-ink-faint text-[10px]"
            >
              {labels.formEmail}
            </label>
            <input
              id={`${id}-email`}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={200}
              className={`${field} mt-1`}
              {...bledPola("email")}
            />
            {err("email")}
          </div>
        </div>
        <p className="text-ink-faint text-[11px]">{labels.formContactHint}</p>
        {err("phone")}

        <div>
          <label
            htmlFor={`${id}-subject`}
            className="label-tight text-ink-faint text-[10px]"
          >
            {labels.formSubject}
          </label>
          <input
            id={`${id}-subject`}
            name="subject"
            maxLength={160}
            required
            defaultValue={carName ? `${labels.formCar}: ${carName}` : ""}
            className={`${field} mt-1`}
            {...bledPola("subject")}
          />
          {err("subject")}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor={`${id}-from`}
              className="label-tight text-ink-faint text-[10px]"
            >
              {labels.formDateFrom}
            </label>
            <input
              id={`${id}-from`}
              name="dateFrom"
              type="date"
              className={`${field} mt-1`}
            />
          </div>
          <div>
            {/*
              OSOBNA ETYKIETA DLA KAŻDEJ DATY.

              Oba pola nosiły ten sam napis „Termin (opcjonalnie)". Na telefonie,
              gdzie kolumny się rozwijają w pion, klient widział go dwa razy pod
              rząd i nie miał z czego wywnioskować, które pole jest początkiem,
              a które końcem. Czytnik ekranu miał ten sam problem na każdej
              szerokości: dwa różne pola przedstawiały się identycznie.

              `sm:sr-only` zostaje — od `sm` pola stoją obok siebie pod wspólnym
              nagłówkiem i drugi widoczny napis byłby zbędny. Ukryty nie znika
              dla czytnika, tylko dla oka.
            */}
            <label
              htmlFor={`${id}-to`}
              className="label-tight text-ink-faint text-[10px] sm:sr-only"
            >
              {labels.formDateTo}
            </label>
            <input
              id={`${id}-to`}
              name="dateTo"
              type="date"
              className={`${field} mt-1`}
            />
          </div>
        </div>

        <div>
          <label
            htmlFor={`${id}-message`}
            className="label-tight text-ink-faint text-[10px]"
          >
            {labels.formMessage}
          </label>
          <textarea
            id={`${id}-message`}
            name="message"
            rows={5}
            maxLength={2000}
            required
            className={`${field} mt-1`}
            {...bledPola("message")}
          />
          {err("message")}
        </div>

        {/*
          Pułapka na roboty. `aria-hidden` i `tabIndex={-1}`, żeby nie istniała
          dla czytnika ekranu ani dla klawiatury — inaczej byłaby pułapką na
          osoby niewidome, a nie na automaty. Ukryta klasą, nie `display:none`
          na polu: część robotów pomija pola jawnie ukryte.
        */}
        {/*
          Pole o rozmiarze 1×1 px WEWNĄTRZ formularza, nie odsunięte na
          -9999 px.

          Pierwsza wersja stała właśnie tam i przemiatanie publiczne zgłosiło
          ją jako „treść poza ekranem" na każdej szerokości — słusznie, bo
          narzędzie nie ma jak odróżnić celowej pułapki od zepsutego układu,
          a narzędzie, które trzeba uczyć wyjątków, przestaje po chwili
          zgłaszać rzeczy prawdziwe. Taniej zmienić pułapkę niż narzędzie.
        */}
        <div
          className="absolute top-0 left-0 h-px w-px overflow-hidden opacity-0"
          aria-hidden
        >
          <label htmlFor={`${id}-website`}>Website</label>
          <input
            id={`${id}-website`}
            name="website"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        <label className="tap-block flex items-start gap-3 text-[11px] leading-relaxed">
          <input
            type="checkbox"
            name="consent"
            className="mt-1 shrink-0"
            {...bledPola("consent")}
          />
          <span className="text-ink-muted">
            {labels.formConsent}{" "}
            <a
              href={privacyHref}
              className="underline underline-offset-2"
              target="_blank"
              rel="noopener noreferrer"
            >
              {locale === "en" ? "Privacy Policy" : "Polityka prywatności"}
            </a>
          </span>
        </label>
        {err("consent")}

        {error && (
          <p role="alert" className="text-red text-xs">
            {error}
          </p>
        )}

        {turnstileSiteKey && (
          <div className="turnstile-pole mb-4 w-full">
            <TurnstileWidget
              key={oslona.proba}
              siteKey={turnstileSiteKey}
              onToken={oslona.setToken}
              onAwaria={oslona.zglosAwarie}
              onWygasl={oslona.zglosWygasniecie}
              className="w-full"
            />
            {oslona.awaria ? (
              <TurnstileInfo
                wariant="awaria"
                onPonow={oslona.sprobujPonownie}
              />
            ) : oslona.stan === "wygasla" ? (
              <TurnstileInfo
                wariant="wygasla"
                onPonow={oslona.sprobujPonownie}
              />
            ) : null}
          </div>
        )}
        <button
          type="submit"
          disabled={state === "sending" || !oslona.gotowa}
          className="label bg-red hover:bg-red-hover inline-flex h-12 items-center px-8 text-xs text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state === "sending" ? labels.formSending : labels.formSend}
        </button>
      </div>
    </form>
  );
}
