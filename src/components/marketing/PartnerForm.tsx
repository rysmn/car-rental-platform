"use client";

import { useId, useRef, useState } from "react";
import { submitRequest } from "@/lib/inbox/actions";
import {
  TurnstileInfo,
  TurnstileWidget,
  useFormShield,
} from "@/components/security/FormShield";

/**
 * Formularz partnerski — INNE POLA, TA SAMA AKCJA SERWEROWA.
 *
 * DLACZEGO OSOBNY KOMPONENT, A NIE TRYB W `RequestForm`. Te dwa formularze
 * pytają o co innego: tamten o termin i samochód, ten o model współpracy
 * i skalę zaangażowania. Wspólny komponent z przełącznikiem miałby dwa
 * komplety pól, z których połowa jest zawsze ukryta, i jeden warunek w każdym
 * wierszu — czyli formularz, którego nie da się przeczytać ze zrozumieniem.
 *
 * ALE SYSTEM POD SPODEM JEST JEDEN i to jest ta część, która się liczy:
 * `submitRequest` — ta sama walidacja, ta sama pułapka na roboty, ten sam
 * limit 10/h, ta sama kolejność „najpierw zapis, potem poczta", ten sam alert
 * przy nieudanym zapisie i ta sama skrzynka. Drugiego kanału przechwytywania
 * NIE MA i nie powstał: zgłoszenie partnerskie ląduje w `chat_leads` obok
 * wszystkich innych, różniąc się wyłącznie polem `reason`.
 *
 * CZEGO TU NIE MA I BYĆ NIE MOŻE: pola „oczekiwana stopa zwrotu", widełek
 * procentowych i jakiejkolwiek liczby opisującej zysk. Formularz zbiera
 * ZAINTERESOWANIE, nie zapisy na ofertę inwestycyjną — patrz `partnership()`
 * w `lib/chat/deterministic.ts`, gdzie ta sama zasada rządzi asystentem.
 */
export function PartnerForm({
  labels,
  locale,
  privacyHref,
  turnstileSiteKey,
}: {
  labels: Record<string, string>;
  locale: "pl" | "en";
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
  /**
   * Zamek na czas wysyłki — REFERENCJA, nie stan, i to jest cała różnica.
   *
   * `state === "sending"` wyłącza przycisk, ale dopiero PO renderze. Dwa
   * kliknięcia w tej samej klatce trafiają w przycisk jeszcze aktywny
   * i wychodzą dwa żądania. Referencja jest zajęta w tej samej instrukcji,
   * w której zaczyna się wysyłka, więc drugie kliknięcie nie ma jak wejść.
   *
   * To jest pierwsza z DWÓCH warstw. Sama nie wystarcza: nie broni przed
   * powrotem wstecz z ponownym wysłaniem, przed odświeżeniem ani przed
   * dwoma kartami. Drugą warstwą jest zamek w bazie w `createLead` —
   * i to ona jest tą, na której polegamy.
   */
  const wysylka = useRef(false);

  if (state === "done") {
    return (
      <p
        role="status"
        className="border-line bg-surface-1 text-ink border p-6 text-sm"
      >
        {labels.done}
      </p>
    );
  }

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (wysylka.current) return;

    /*
      Token starszy niż pięć minut nie jedzie na serwer — ta sama zasada, co
      w pozostałych dwóch formularzach. Zamek zostaje otwarty, bo nic nie
      wysłaliśmy: klient ma kliknąć jeszcze raz, gdy nowa weryfikacja
      przyjdzie. Nic nie wysyła się samo.
    */
    if (turnstileSiteKey && !oslona.awaria) {
      if (oslona.stan === "ladowanie") return;
      if (oslona.stan === "wygasla") {
        setError(labels.errTurnstile ?? labels.errServer);
        return;
      }
      if (!oslona.tokenSwiezy()) {
        oslona.zuzyjToken();
        setError(labels.errTurnstile ?? labels.errServer);
        return;
      }
    }

    wysylka.current = true;
    const fd = new FormData(e.currentTarget);
    setState("sending");
    setError(null);
    setFieldErrors({});

    const model = String(fd.get("partnerModel") ?? "");
    const res = await submitRequest({
      kind: "partnership",
      name: String(fd.get("name") ?? ""),
      company: String(fd.get("company") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      email: String(fd.get("email") ?? ""),
      /*
       * Temat układa FORMULARZ, nie klient — inaczej w skrzynce stałaby lista
       * spraw nazwanych „zapytanie", a operator musiałby otwierać każdą, żeby
       * dowiedzieć się, o którym modelu współpracy mowa.
       */
      subject: model
        ? `${labels.subjectBase}: ${labels[`model_${model}`] ?? model}`
        : labels.subjectBase,
      message: String(fd.get("message") ?? ""),
      partnerModel: model || undefined,
      investRange: String(fd.get("investRange") ?? ""),
      locale,
      consent: fd.get("consent") === "on",
      // Pułapkę czytamy z formularza (jest w DOM od etapu 44D), resztę
      // z osłony: znacznik otwarcia i token Turnstile.
      ...oslona.pola(),
      website: String(fd.get("website") ?? ""),
    }).catch(() => ({ ok: false, error: "server" }) as const);

    /* Token jednorazowy — po wysyłce bierzemy nowy, żeby druga próba nie
       rozbijała się o `timeout-or-duplicate`. */
    oslona.zuzyjToken();

    if (res.ok) {
      /*
       * Zamek NIE jest zwalniany po sukcesie i to jest celowe: formularz
       * znika, zastąpiony potwierdzeniem, więc nie ma czego wysyłać drugi
       * raz. Zwolnienie go tutaj otwierałoby dokładnie tę furtkę, którą ta
       * poprawka zamyka.
       */
      setState("done");
      return;
    }
    /* Błąd = klient ma poprawić i spróbować ponownie. Zamek musi puścić. */
    wysylka.current = false;
    setState("idle");
    if (res.error === "rate") setError(labels.errRate);
    else if (res.error === "turnstile")
      setError(labels.errTurnstile ?? labels.errServer);
    else if (res.error === "server") setError(labels.errServer);
    else {
      const fe = "fieldErrors" in res ? (res.fieldErrors ?? {}) : {};
      setFieldErrors({
        phone: fe.phone ? labels.errContact : "",
        message: fe.message ? labels.errMessage : "",
        consent: fe.consent ? labels.errConsent : "",
      });
    }
  };

  const field =
    "border-line-strong bg-surface-1 text-ink placeholder:text-ink-faint w-full border px-3 py-3 text-sm";
  const lab = "label-tight text-ink-faint text-[10px]";
  /*
    Ten sam komplet co w `RequestForm` i z tego samego powodu: komunikat pod
    polem był widoczny wyłącznie dla oka, bo nic go z tym polem nie wiązało.
    Patrz komentarz przy `bledPola` w `components/marketing/RequestForm.tsx`.
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

  const MODELS = ["vehicle", "fleet", "strategic", "unsure"] as const;

  return (
    <form
      onSubmit={onSubmit}
      className="border-line relative max-w-xl border p-6"
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-name`} className={lab}>
              {labels.name}
            </label>
            <input
              id={`${id}-name`}
              name="name"
              maxLength={120}
              autoComplete="name"
              className={`${field} mt-1`}
            />
          </div>
          <div>
            <label htmlFor={`${id}-company`} className={lab}>
              {labels.company}
            </label>
            <input
              id={`${id}-company`}
              name="company"
              maxLength={160}
              autoComplete="organization"
              className={`${field} mt-1`}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-phone`} className={lab}>
              {labels.phone}
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
            <label htmlFor={`${id}-email`} className={lab}>
              {labels.email}
            </label>
            <input
              id={`${id}-email`}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={200}
              className={`${field} mt-1`}
            />
          </div>
        </div>
        <p className="text-ink-faint text-[11px]">{labels.contactHint}</p>
        {err("phone")}

        <div>
          <label htmlFor={`${id}-model`} className={lab}>
            {labels.model}
          </label>
          <select
            id={`${id}-model`}
            name="partnerModel"
            defaultValue="unsure"
            className={`${field} mt-1`}
          >
            {MODELS.map((m) => (
              <option key={m} value={m}>
                {labels[`model_${m}`]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${id}-range`} className={lab}>
            {labels.range}
          </label>
          <input
            id={`${id}-range`}
            name="investRange"
            maxLength={60}
            placeholder={labels.rangePlaceholder}
            className={`${field} mt-1`}
          />
          {/*
            Pole OPCJONALNE i opisane jako orientacyjne. Nie pytamy o kwotę
            deklarowaną co do złotówki, bo na tym etapie nikt jej nie zna,
            a formularz, który udaje umowę, odstrasza rozmowę, zanim się
            zacznie.
          */}
          <p className="text-ink-faint mt-1 text-[11px]">{labels.rangeHint}</p>
        </div>

        <div>
          <label htmlFor={`${id}-message`} className={lab}>
            {labels.message}
          </label>
          <textarea
            id={`${id}-message`}
            name="message"
            rows={5}
            maxLength={2000}
            required
            className={`${field} mt-1 resize-y`}
            {...bledPola("message")}
          />
          {err("message")}
        </div>

        {/*
          Pułapka na roboty — UKRYTA DOKŁADNIE TAK SAMO jak w formularzu
          zapytania: pole 1×1 z `overflow-hidden`, a nie wypchnięte na
          `-9999px`. Pierwsza wersja wypychała je za lewą krawędź i
          przemiatanie publiczne słusznie zgłosiło „treść poza ekranem" na
          320 i 360 px — bo z punktu widzenia pomiaru element o współrzędnej
          -9911 wygląda identycznie jak przycisk, który uciekł z układu.
          Robot czytający HTML znajdzie to pole tak samo, a miara zostaje
          czysta.
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

        <label className="tap-block flex items-start gap-3 text-[11px]">
          <input
            type="checkbox"
            name="consent"
            className="mt-0.5 h-4 w-4 shrink-0"
            {...bledPola("consent")}
          />
          <span className="text-ink-faint">
            {labels.consent}{" "}
            <a
              href={privacyHref}
              className="underline underline-offset-2"
              target="_blank"
              rel="noopener noreferrer"
            >
              {labels.privacy}
            </a>
          </span>
        </label>
        {err("consent")}

        {/* `role="alert"` — jak w formularzu zapytania. Bez niego odrzucenie
            po stronie serwera pojawia się na ekranie i nie mówi nic osobie,
            która ekranu nie widzi. */}
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
          className="label bg-red hover:bg-red-hover inline-flex h-12 items-center px-8 text-xs text-white transition-colors disabled:opacity-50"
        >
          {state === "sending" ? labels.sending : labels.send}
        </button>
      </div>
    </form>
  );
}
