"use client";

import {
  CUSTOMER_FLAG_HINT,
  CUSTOMER_FLAG_LABEL,
  CUSTOMER_FLAG_TONE,
  type CustomerFlag,
} from "@/lib/admin/customer-flags";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { createPhoneBooking, type PhoneBookingResult } from "../actions";
import { formatPln } from "@/lib/format";
import { pickFrom } from "@/lib/i18n-pick";

const inputCls =
  "h-11 w-full border border-line-strong bg-surface-1 px-3 text-sm text-ink placeholder:text-ink-faint";
const labelCls = "label-tight text-[10px] text-ink-faint";

type ModelOption = { id: string; brand: string; model: string };
type LocationOption = { id: string; name: string; feeGrosze: number };

type Availability = { id: string; name: string; free: number };
type FoundCustomer = {
  id: string;
  name: string;
  email: string | null;
  rentals: number;
  lastRentalOn: string | null;
  /** Wewnętrzna flaga biura — patrz `lib/admin/customer-flags`. */
  flag?: CustomerFlag;
  damagesOpen?: number;
};
type Quote = {
  days: number;
  quote: {
    totalGrosze: number;
    depositGrosze: number;
    lines: { code: string; amountGrosze: number }[];
  };
};

function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Kopia poprzedniego najmu — to, co się nie zmienia między jednym a drugim.
 *
 * Daty świadomie NIE są kopiowane: stały klient dzwoni po to samo auto na inny
 * termin, a przepisany termin sprzed miesiąca to termin, który ktoś musiałby
 * najpierw zauważyć, a potem poprawić. Kopiuje się to, co zostaje: człowiek,
 * auto, miejsce odbioru i dodatki.
 */
export type Prefill = {
  customerPhone: string;
  customerName: string;
  customerEmail: string;
  modelId: string;
  locationId: string;
  extraDriver: boolean;
  childSeat: boolean;
  protectionPackage: boolean;
  depositVariant: string;
};

/**
 * The phone-call form, in the order the call actually goes: who is this, when
 * do they want it, what is free, what does it cost, how are they paying, is it
 * firm.
 *
 * Three things happen while the operator types, all of them answered by the
 * server: the number is looked up in the directory, the car list is narrowed
 * to what is genuinely free for those dates, and the price is quoted by the
 * same function that will charge it. None of that is reimplemented in the
 * browser — a figure read out down the phone and the amount actually saved
 * must not be allowed to differ.
 */
export function NewReservationForm({
  models,
  locations,
  prefill,
}: {
  models: ModelOption[];
  locations: LocationOption[];
  prefill?: Prefill;
}) {
  const t = useTranslations("Admin.reservations.newBooking");
  const tm = useTranslations("Admin.reservations.methods");
  const locale = useLocale();
  const router = useRouter();
  const [state, action, pending] = useActionState<
    PhoneBookingResult | null,
    FormData
  >(createPhoneBooking, null);
  const kept = state && !state.ok ? state.values : undefined;

  const [phone, setPhone] = useState(kept?.customerPhone ?? prefill?.customerPhone ?? "");
  const [found, setFound] = useState<FoundCustomer | null>(null);
  const [name, setName] = useState(kept?.customerName ?? prefill?.customerName ?? "");
  const [email, setEmail] = useState(kept?.customerEmail ?? prefill?.customerEmail ?? "");

  const [start, setStart] = useState(kept?.startDate ?? isoOffset(0));
  const [end, setEnd] = useState(kept?.endDate ?? isoOffset(1));

  const [modelId, setModelId] = useState(
    kept?.modelId ?? prefill?.modelId ?? models[0]?.id ?? "",
  );
  const [locationId, setLocationId] = useState(
    kept?.locationId ?? prefill?.locationId ?? locations[0]?.id ?? "",
  );
  const [availability, setAvailability] = useState<Availability[] | null>(null);

  const [extraDriver, setExtraDriver] = useState(
    kept ? kept.extraDriver === "on" : (prefill?.extraDriver ?? false),
  );
  const [childSeat, setChildSeat] = useState(
    kept ? kept.childSeat === "on" : (prefill?.childSeat ?? false),
  );
  const [protection, setProtection] = useState(
    kept ? kept.protectionPackage === "on" : (prefill?.protectionPackage ?? false),
  );
  const [depositVariant, setDepositVariant] = useState(
    kept?.depositVariant ?? prefill?.depositVariant ?? "with_deposit",
  );
  const [quote, setQuote] = useState<Quote | null>(null);

  /* Directory lookup, shortly after the operator stops typing the number. */
  useEffect(() => {
    const digits = phone.replace(/\D/g, "");
    // Everything, including the "too short to look up" case, happens inside
    // the timer: a setState in the synchronous body of an effect re-renders
    // on every keystroke before the browser has even painted the character.
    const t = setTimeout(async () => {
      if (digits.length < 7) {
        setFound(null);
        return;
      }
      try {
        const res = await fetch(
          `/api/admin/lookup?phone=${encodeURIComponent(phone)}`,
        );
        const data = await res.json();
        if (data.customer) {
          setFound(data.customer);
          // Only fills what is still empty: an operator correcting a name for
          // THIS rental must not have it overwritten by last year's spelling.
          setName((n) => n || data.customer.name);
          setEmail((e) => e || (data.customer.email ?? ""));
        } else {
          setFound(null);
        }
      } catch {
        /* the form works without the directory */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [phone]);

  /* Which models actually have a free unit for these dates. */
  useEffect(() => {
    if (!start || !end || end < start) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/lookup?from=${start}&to=${end}`);
        const data = await res.json();
        if (!cancelled && Array.isArray(data.models))
          setAvailability(data.models);
      } catch {
        /* the dropdown just stops annotating itself */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [start, end]);

  /* The live price, computed on the server. */
  useEffect(() => {
    if (!modelId || !locationId || !start || !end || end < start) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          quote: modelId,
          from: start,
          to: end,
          locationId,
          extraDriver: extraDriver ? "1" : "0",
          childSeat: childSeat ? "1" : "0",
          protectionPackage: protection ? "1" : "0",
          depositVariant,
        });
        const res = await fetch(`/api/admin/lookup?${params}`);
        if (!res.ok) return;
        const data = await res.json();
        // A response without a quote is not a quote — showing the previous
        // price beside new selections would be worse than showing none.
        if (!cancelled) setQuote(data?.quote?.lines ? data : null);
      } catch {
        /* the price is still computed authoritatively on save */
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [
    modelId,
    locationId,
    start,
    end,
    extraDriver,
    childSeat,
    protection,
    depositVariant,
  ]);

  /** The quote's own line codes, in the words the operator uses on the phone. */
  const LINE_LABEL: Record<string, string> = {
    location: t("location"),
    extra_driver: t("extraDriver"),
    child_seat: t("childSeat"),
    protection_package: t("protectionPackage"),
    no_deposit: t("noDepositLine"),
  };

  const ERROR_TEXT: Record<string, string> = {
    validation: t("errValidation"),
    not_found: t("errNotFound"),
    full: t("errFull"),
    overlap: t("errOverlap"),
    server: t("errServer"),
  };

  const freeOf = (id: string) =>
    availability?.find((a) => a.id === id)?.free ?? null;
  const selectedFree = freeOf(modelId);
  const fieldError = (n: string) =>
    state && !state.ok ? state.fieldErrors?.[n] : undefined;

  if (state?.ok) {
    return (
      <div className="border-line bg-void border p-8">
        <p className="label-tight text-[10px] text-emerald-400">
          {t("saved")}
        </p>
        <p className="font-heading mt-3 text-3xl font-bold text-ink">
          {state.reference}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => router.push(`/admin/reservations/${state.id}`)}
            className="label bg-red hover:bg-red-hover inline-flex h-11 items-center px-6 text-xs text-white transition-colors"
          >
            {t("openBooking")}
          </button>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="label border-line-strong inline-flex h-11 items-center border px-6 text-xs text-ink transition-colors hover:border-ink hover:bg-ink/5"
          >
            {t("nextBooking")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      {state && !state.ok && (
        <p className="border-red/50 bg-red/10 text-red border px-4 py-3 text-sm">
          {ERROR_TEXT[state.error] ?? ERROR_TEXT.server}
        </p>
      )}

      {/* 1. KLIENT — the number first: it is what identifies a returning
             customer, and what the operator already has in hand. */}
      <section className="border-line bg-void border p-5">
        <p className="label text-[10px] text-ink">{t("sectionClient")}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className={labelCls}>{t("phone")}</span>
            <input
              name="customerPhone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              autoFocus
              autoComplete="off"
              placeholder="+48 …"
              className={inputCls}
            />
            {fieldError("customerPhone") && (
              <span className="text-red text-[11px]">
                {fieldError("customerPhone")}
              </span>
            )}
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>{t("name")}</span>
            <input
              name="customerName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              className={inputCls}
            />
            {fieldError("customerName") && (
              <span className="text-red text-[11px]">
                {fieldError("customerName")}
              </span>
            )}
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>{t("email")}</span>
            <input
              name="customerEmail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              className={inputCls}
            />
          </label>
        </div>
        {found ? (
          <>
            <p className="mt-3 text-[11px] text-emerald-400">
              {t("knownCustomer", {
                name: found.name,
                rentals: found.rentals,
              })}
              {found.lastRentalOn
                ? t("lastRental", { date: found.lastRentalOn })
                : ""}
              {found.damagesOpen
                ? t("openDamages", { count: found.damagesOpen })
                : ""}
            </p>
            {/* Flaga OSTRZEGA, nie blokuje. Decyzja „wynajmujemy czy nie"
                należy do człowieka przy telefonie, który zna kontekst; panel
                ma mu tylko powiedzieć to, o czym biuro już wie. */}
            {found.flag && found.flag !== "none" && (
              <p
                className={`mt-2 border px-3 py-2 text-[11px] ${CUSTOMER_FLAG_TONE[found.flag]}`}
              >
                {pickFrom(CUSTOMER_FLAG_LABEL, found.flag, locale)} —{" "}
                {pickFrom(CUSTOMER_FLAG_HINT, found.flag, locale)}
              </p>
            )}
          </>
        ) : (
          <p className="text-ink-faint mt-3 text-[11px]">{t("newNumber")}</p>
        )}
      </section>

      {/* 2. TERMIN */}
      <section className="border-line bg-void border p-5">
        <p className="label text-[10px] text-ink">{t("sectionDates")}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className={labelCls}>{t("from")}</span>
            <input
              name="startDate"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>{t("to")}</span>
            <input
              name="endDate"
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className={inputCls}
            />
            {fieldError("endDate") && (
              <span className="text-red text-[11px]">
                {fieldError("endDate")}
              </span>
            )}
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>{t("pickupTime")}</span>
            <input
              name="pickupTime"
              type="time"
              defaultValue={kept?.pickupTime ?? "10:00"}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>{t("returnTime")}</span>
            <input
              name="returnTime"
              type="time"
              defaultValue={kept?.returnTime ?? "10:00"}
              className={inputCls}
            />
          </label>
        </div>
      </section>

      {/* 3. SAMOCHÓD — annotated with what is genuinely free for those dates. */}
      <section className="border-line bg-void border p-5">
        <p className="label text-[10px] text-ink">{t("sectionCar")}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={labelCls}>{t("availableForDates")}</span>
            <select
              key={modelId}
              name="modelId"
              defaultValue={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className={inputCls}
            >
              {models.map((m) => {
                const free = freeOf(m.id);
                return (
                  <option key={m.id} value={m.id}>
                    {m.brand} {m.model}
                    {free === null
                      ? ""
                      : free > 0
                        ? t("freeCount", { count: free })
                        : t("noneForDates")}
                  </option>
                );
              })}
            </select>
            {selectedFree === 0 && (
              <span className="text-red text-[11px]">{t("noFreeUnit")}</span>
            )}
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>{t("pickupLocation")}</span>
            <select
              name="locationId"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className={inputCls}
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                  {l.feeGrosze > 0
                    ? t("locationFee", {
                        fee: formatPln(l.feeGrosze, locale),
                      })
                    : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* 4. CENA */}
      <section className="border-line bg-void border p-5">
        <p className="label text-[10px] text-ink">{t("sectionPrice")}</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3">
          <label className="tap-block flex items-center gap-3 text-sm text-ink">
            <input
              type="checkbox"
              name="extraDriver"
              checked={extraDriver}
              onChange={(e) => setExtraDriver(e.target.checked)}
              className="h-4 w-4"
            />
            {t("extraDriver")}
          </label>
          <label className="tap-block flex items-center gap-3 text-sm text-ink">
            <input
              type="checkbox"
              name="childSeat"
              checked={childSeat}
              onChange={(e) => setChildSeat(e.target.checked)}
              className="h-4 w-4"
            />
            {t("childSeat")}
          </label>
          <label className="tap-block flex items-center gap-3 text-sm text-ink">
            <input
              type="checkbox"
              name="protectionPackage"
              checked={protection}
              onChange={(e) => setProtection(e.target.checked)}
              className="h-4 w-4"
            />
            {t("protectionPackage")}
          </label>
          <label className="flex items-center gap-3">
            <span className={labelCls}>{t("deposit")}</span>
            <select
              name="depositVariant"
              value={depositVariant}
              onChange={(e) => setDepositVariant(e.target.value)}
              className="border-line-strong h-9 border bg-surface-1 px-2 text-sm text-ink"
            >
              <option value="with_deposit">{t("withDeposit")}</option>
              <option value="no_deposit">{t("noDeposit")}</option>
            </select>
          </label>
        </div>

        {quote ? (
          <div className="border-line mt-5 border-t pt-4">
            <ul className="flex flex-col gap-1">
              <li className="text-silver flex justify-between gap-6 text-xs">
                <span>{t("rentalLine", { days: quote.days })}</span>
                <span className="tabular-nums">
                  {formatPln(
                    quote.quote.totalGrosze -
                      quote.quote.lines.reduce(
                        (sum, l) => sum + l.amountGrosze,
                        0,
                      ),
                    locale,
                  )}
                </span>
              </li>
              {quote.quote.lines.map((l) => (
                <li
                  key={l.code}
                  className="text-silver flex justify-between gap-6 text-xs"
                >
                  <span>{LINE_LABEL[l.code] ?? l.code}</span>
                  <span className="tabular-nums">
                    {formatPln(l.amountGrosze, locale)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-end justify-between gap-6">
              <span className="label-tight text-ink-faint text-[10px]">
                {t("totalFor", { days: quote.days })}
              </span>
              <span className="font-heading text-2xl font-bold text-ink tabular-nums">
                {formatPln(quote.quote.totalGrosze, locale)}
              </span>
            </div>
            <p className="text-ink-faint mt-1 text-right text-[11px]">
              {t("depositLine", {
                amount: formatPln(quote.quote.depositGrosze, locale),
              })}
            </p>
          </div>
        ) : (
          <p className="text-ink-faint mt-4 text-[11px]">{t("pickCar")}</p>
        )}
      </section>

      {/* 5 i 6. PŁATNOŚĆ I STATUS */}
      <section className="border-line bg-void border p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="label text-[10px] text-ink">{t("sectionPayment")}</span>
            <select
              name="paymentMethod"
              defaultValue={kept?.paymentMethod ?? ""}
              className={`${inputCls} mt-3`}
            >
              <option value="">{t("paymentNotSet")}</option>
              <option value="cash">{tm("cash")}</option>
              <option value="card">{tm("card")}</option>
              <option value="transfer">{tm("transfer")}</option>
              <option value="online">{tm("online")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="label text-[10px] text-ink">{t("sectionStatus")}</span>
            <select
              name="stage"
              defaultValue={kept?.stage ?? "confirmed"}
              className={`${inputCls} mt-3`}
            >
              <option value="pending">{t("stagePending")}</option>
              <option value="confirmed">{t("stageConfirmed")}</option>
              <option value="paid">{t("stagePaid")}</option>
            </select>
          </label>
        </div>
        <p className="text-ink-faint mt-3 text-[11px]">{t("stageHint")}</p>
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="label bg-red hover:bg-red-hover inline-flex h-12 items-center px-8 text-sm text-white transition-colors disabled:opacity-60"
        >
          {pending ? t("saving") : t("save")}
        </button>
        {quote && (
          <span className="text-silver text-sm tabular-nums">
            {formatPln(quote.quote.totalGrosze, locale)}
          </span>
        )}
      </div>
    </form>
  );
}
