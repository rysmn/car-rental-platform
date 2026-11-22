"use client";

import { useActionState, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  updateSocialLinks,
  updatePageVisibility,
  updateHeroImage,
  setActiveHeroImage,
  deleteHeroImage,
  updateCompanyInfo,
  updateHeroText,
  updateGoogleMaps,
  type SaveResult,
} from "./actions";
import type {
  HeroSet,
  HeroVariant,
  PagesSettings,
  SocialSettings,
  CompanySettings,
  GoogleSettings,
  HeroTextFields,
  HeroTextSettings,
} from "@/lib/admin/settings";
import { OPENING_DAYS, type OpeningDayHours } from "@/lib/company/hours";

function SaveBar({
  state,
  pending,
  label,
}: {
  state: SaveResult | null;
  pending: boolean;
  label?: string;
}) {
  const t = useTranslations("Admin.settings.common");
  return (
    <div className="flex items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 inline-flex h-10 items-center border px-5 text-xs transition-colors disabled:opacity-50"
      >
        {pending ? t("saving") : (label ?? t("save"))}
      </button>
      {state?.ok && (
        <span className="text-xs text-emerald-400">
          {state.message ?? t("saved")}
        </span>
      )}
      {state && !state.ok && (
        <span className="text-red text-xs">{state.error}</span>
      )}
    </div>
  );
}

/* ── Social links ────────────────────────────────────────────────────────── */

const SOCIAL_FIELDS: {
  name: keyof SocialSettings;
  label: string;
  placeholder: string;
}[] = [
  {
    name: "instagram",
    label: "Instagram",
    placeholder: "https://instagram.com/…",
  },
  {
    name: "facebook",
    label: "Facebook",
    placeholder: "https://facebook.com/…",
  },
  { name: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@…" },
  // The Business Profile URL used to sit here. It moved to the Google/Maps
  // section, which is where somebody looking for it actually looks — it is not
  // a social icon in the header and never was. The VALUE still lives in this
  // same `social` row; only the input moved, and `updateSocialLinks` now
  // preserves it rather than blanking it on save.
];

export function SocialLinksForm({ initial }: { initial: SocialSettings }) {
  const [state, action, pending] = useActionState(updateSocialLinks, null);
  const t = useTranslations("Admin.settings.social");

  return (
    <form action={action} className="flex flex-col gap-5">
      {SOCIAL_FIELDS.map((field) => (
        <label key={field.name} className="flex flex-col gap-1">
          <span className="label-tight text-ink-faint text-[10px]">
            {field.label}
          </span>
          <input
            type="url"
            name={field.name}
            defaultValue={initial[field.name]}
            placeholder={field.placeholder}
            className="border-line-strong bg-surface-1 text-ink h-10 w-full max-w-lg border px-3 text-sm"
          />
        </label>
      ))}
      <p className="text-ink-faint text-xs">
        {t.rich("note", {
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </p>
      <SaveBar state={state} pending={pending} />
    </form>
  );
}

/* ── Page visibility ─────────────────────────────────────────────────────── */

const PAGE_FIELDS: {
  name: keyof PagesSettings;
  labelKey: "faq" | "about" | "howItWorks" | "contact";
  path: string;
}[] = [
  { name: "faq", labelKey: "faq", path: "/faq" },
  { name: "about", labelKey: "about", path: "/about" },
  { name: "howItWorks", labelKey: "howItWorks", path: "/how-it-works" },
  { name: "contact", labelKey: "contact", path: "/contact" },
];

export function PageVisibilityForm({ initial }: { initial: PagesSettings }) {
  const [state, action, pending] = useActionState(updatePageVisibility, null);
  const t = useTranslations("Admin.settings.pageVisibility");

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="divide-line border-line divide-y border-y">
        {PAGE_FIELDS.map((field) => (
          <label
            key={field.name}
            className="flex cursor-pointer items-center justify-between gap-4 py-4"
          >
            <span>
              <span className="text-ink text-sm">{t(field.labelKey)}</span>
              <span className="text-ink-faint ml-2 text-xs">{field.path}</span>
            </span>
            <input
              type="checkbox"
              name={field.name}
              defaultChecked={initial[field.name]}
              className="accent-red h-4 w-4"
            />
          </label>
        ))}
      </div>
      <p className="text-ink-faint text-xs">{t("note")}</p>
      <SaveBar state={state} pending={pending} />
    </form>
  );
}

/**
 * The upload ceiling, repeated on the client so the operator learns about it
 * from a sentence rather than from a 500. `lib/storage/media` holds the real
 * one; these two must not drift.
 */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/* ── Hero images ─────────────────────────────────────────────────────────── */

/**
 * Three photo slots per theme, with one of them on the page.
 *
 * Laid out as a row of small cards rather than three full-width upload forms
 * stacked on top of each other — the panel has to stay compact, and three of
 * the old form would have run past a laptop screen before the second theme
 * even began.
 *
 * The card IS the control. Its thumbnail shows what is stored, its badge shows
 * whether that is the photo on the page, and its buttons do the three things
 * there are to do. A separate "which one is active" radio row underneath would
 * only repeat what the cards already say.
 *
 * `fallbackImage` is the bundled photograph the dark theme falls back to; the
 * light theme passes null, because with no light photo the hero simply renders
 * without one.
 */
export function HeroImageForm({
  variant,
  set,
  fallbackImage,
}: {
  variant: HeroVariant;
  set: HeroSet;
  fallbackImage: string | null;
}) {
  /*
   * One upload form for all three slots, with the target slot written into a
   * hidden field before submit.
   *
   * Three `useActionState` forms would each carry their own pending flag and
   * their own message, and the operator would have to work out which of three
   * identical bars belonged to the card they had just used. One form, one
   * message, and the card that is busy is the one that says so.
   */
  const t = useTranslations("Admin.settings.heroImages");
  const tc = useTranslations("Admin.settings.common");
  const [state, action, pending] = useActionState(updateHeroImage, null);
  const [slot, setSlot] = useState(0);
  const [busy, setBusy] = useState<number | null>(null);
  const [note, setNote] = useState<SaveResult | null>(null);
  /** Object URLs for files chosen but not yet saved, so a card updates at once. */
  const [previews, setPreviews] = useState<Record<number, string>>({});

  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const slotRef = useRef<HTMLInputElement>(null);
  /**
   * Which slot the open file dialog belongs to.
   *
   * A ref rather than the `slot` state, and written into the hidden field only
   * at submit time. Every server action here revalidates the settings route, so
   * the tree re-renders from the server between one upload and the next — and
   * an uncontrolled hidden input that has been through that cannot be trusted
   * to still hold what was written into it several renders ago. It cost an
   * upload: the second photo was saved over the first, because the form still
   * said "slot 1".
   */
  const pendingSlot = useRef(0);

  const filled = set.images.filter((i) => i != null).length;
  const result = note ?? state;

  /** Open the file picker for one slot; the submit happens on change. */
  const pick = (index: number) => {
    pendingSlot.current = index;
    setSlot(index);
    setNote(null);
    fileRef.current?.click();
  };

  const run = async (index: number, fn: () => Promise<SaveResult>) => {
    setBusy(index);
    setNote(await fn());
    setBusy(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {set.images.map((image, index) => {
          const isActive = set.active === index && image != null;
          const shown = previews[index] ?? image;
          const working = busy === index || (pending && slot === index);

          return (
            <div
              key={index}
              className={`flex flex-col border ${
                isActive ? "border-red" : "border-line"
              }`}
            >
              <div className="bg-surface-2 relative aspect-[16/10] w-full overflow-hidden">
                {shown ? (
                  /* A blob: preview and an /api/media path both bypass the
                     image optimiser, so a plain <img> is the honest element. */
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={shown}
                    alt={t("photoAlt", { n: index + 1 })}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="text-ink-faint flex h-full w-full items-center justify-center text-[11px]">
                    {t("empty")}
                  </div>
                )}

                <span className="label-tight bg-void/70 text-ink absolute top-0 left-0 px-2 py-1 text-[10px]">
                  {index + 1}
                </span>

                {isActive && (
                  <span className="label-tight bg-red absolute right-0 bottom-0 px-2 py-1 text-[10px] text-white">
                    {t("activeBadge")}
                  </span>
                )}
              </div>

              {/*
                Two fixed rows rather than one wrapping row: the upload button
                always sits on its own line and the two actions below share the
                next, so every card is the same height whatever it holds and
                nothing reflows when a photo is added. On a phone this is also
                what keeps each target a full half-width to tap at.
              */}
              <div className="flex flex-col gap-2 p-2">
                <button
                  type="button"
                  disabled={working}
                  onClick={() => pick(index)}
                  className="label-tight border-line-strong text-ink hover:border-ink hover:bg-ink/5 tap inline-flex h-10 w-full items-center justify-center border px-3 text-[10px] transition-colors disabled:opacity-50"
                >
                  {working
                    ? t("working")
                    : image
                      ? t("change")
                      : t("add")}
                </button>

                {image && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={working || isActive}
                      onClick={() =>
                        run(index, () => setActiveHeroImage(variant, index))
                      }
                      className="label-tight border-line-strong text-ink hover:border-red hover:text-red tap inline-flex h-10 flex-1 items-center justify-center border px-2 text-[10px] transition-colors disabled:opacity-40"
                    >
                      {isActive ? t("onSite") : t("setActive")}
                    </button>
                    <button
                      type="button"
                      disabled={working}
                      onClick={() =>
                        run(index, async () => {
                          const r = await deleteHeroImage(variant, index);
                          if (r.ok) {
                            setPreviews((p) => {
                              const next = { ...p };
                              delete next[index];
                              return next;
                            });
                          }
                          return r;
                        })
                      }
                      className="label-tight border-line-strong text-ink-faint hover:border-red hover:text-red tap inline-flex h-10 items-center justify-center border px-4 text-[10px] transition-colors disabled:opacity-50"
                    >
                      {t("remove")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/*
        The upload itself. Visually hidden, because the cards above are the
        interface — but a real form with a real file input, so the server action
        receives an ordinary multipart submit and nothing about the upload path,
        its formats or its 8 MB limit changes.
      */}
      <form ref={formRef} action={action} className="hidden">
        <input type="hidden" name="variant" value={variant} />
        <input ref={slotRef} type="hidden" name="slot" defaultValue="0" />
        <input
          ref={fileRef}
          type="file"
          name="image"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            /*
             * Refuse an oversized file here, before it is sent.
             *
             * `saveImage` enforces the same 8 MB on the server and always will
             * — this is not the security check. It is the difference between a
             * sentence the operator can act on and a framework-level 413 that
             * renders as "A server error occurred", which is what production
             * showed on 21.08.2026 for every photo over the Server Action body
             * limit. That limit is raised in `next.config.ts`; this makes the
             * 8 MB rule itself readable.
             */
            if (file.size > MAX_UPLOAD_BYTES) {
              e.target.value = "";
              setNote({
                ok: false,
                error: t("tooLarge", {
                  size: (file.size / 1024 / 1024).toFixed(1),
                }),
              });
              return;
            }
            const index = pendingSlot.current;
            // Written here, one statement before the submit that reads it.
            if (slotRef.current) slotRef.current.value = String(index);
            setPreviews((p) => ({ ...p, [index]: URL.createObjectURL(file) }));
            formRef.current?.requestSubmit();
          }}
        />
      </form>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-ink-faint text-xs">
          {filled === 0
            ? fallbackImage
              ? t("noneFallback")
              : t("noneLight")
            : t("savedCount", { filled, active: set.active + 1 })}
        </p>
        {pending && (
          <span className="text-ink-faint text-xs">{tc("saving")}</span>
        )}
        {result?.ok && (
          <span className="text-xs text-emerald-400">
            {result.message ?? tc("saved")}
          </span>
        )}
        {result && !result.ok && (
          <span className="text-red text-xs">{result.error}</span>
        )}
      </div>

      <p className="text-ink-faint text-xs">
        {t("hint")}{" "}
        {variant === "dark" ? t("darkHint") : t("lightHint")}
      </p>
    </div>
  );
}

/* ── Company / contact info ──────────────────────────────────────────────── */

const inputClass =
  "border-line-strong h-10 w-full max-w-lg border bg-surface-1 px-3 text-sm text-ink";

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label-tight text-ink-faint text-[10px]">{label}</span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className={inputClass}
      />
    </label>
  );
}

/**
 * Opening hours, one row per day.
 *
 * Deliberately a grid of real time inputs rather than a free-text box: this is
 * the value Google reads out of `openingHoursSpecification` and prints beside
 * the business, and it can only do that if the schedule parses. The row is
 * controlled so that ticking "zamknięte" visibly clears and disables the two
 * time fields — a closed day with leftover hours in it is the one state that
 * would publish a lie.
 */
function OpeningHoursRow({
  day,
  initial,
}: {
  day: (typeof OPENING_DAYS)[number];
  initial: OpeningDayHours;
}) {
  const t = useTranslations("Admin.settings.company");
  const [closed, setClosed] = useState(initial.closed);
  const dayName = t(`days.${day.key}`);

  // Cztery sztywne kolumny nie mieszczą się na telefonie: dwa natywne pola
  // czasu mają własną szerokość minimalną i razem z checkboxem rozpychały
  // stronę do 490 px. `flex-wrap` przenosi je do drugiej linii poniżej `sm`;
  // od `sm` w górę wiersz wygląda tak jak wyglądał.
  return (
    <div className="border-line flex flex-wrap items-center gap-3 border-b py-2 last:border-b-0">
      <span className="text-ink w-16 shrink-0 text-sm sm:w-24">
        {t(`dayShort.${day.key}`)}
      </span>
      <input
        type="time"
        name={`${day.key}Opens`}
        defaultValue={initial.opens}
        disabled={closed}
        aria-label={t("dayOpen", { day: dayName })}
        className={`${inputClass} w-[7.5rem] min-w-0 flex-1 disabled:opacity-30 sm:max-w-[9rem]`}
      />
      <input
        type="time"
        name={`${day.key}Closes`}
        defaultValue={initial.closes}
        disabled={closed}
        aria-label={t("dayClose", { day: dayName })}
        className={`${inputClass} w-[7.5rem] min-w-0 flex-1 disabled:opacity-30 sm:max-w-[9rem]`}
      />
      <label className="text-ink-faint tap-block flex cursor-pointer items-center gap-2 text-xs">
        <input
          type="checkbox"
          name={`${day.key}Closed`}
          checked={closed}
          onChange={(e) => setClosed(e.target.checked)}
          className="accent-red h-4 w-4"
        />
        {t("closed")}
      </label>
    </div>
  );
}

export function CompanyInfoForm({ initial }: { initial: CompanySettings }) {
  const [state, action, pending] = useActionState(updateCompanyInfo, null);
  const t = useTranslations("Admin.settings.company");
  const pl = initial.phones.find((p) => p.lang === "PL");
  const en = initial.phones.find((p) => p.lang === "EN");

  return (
    <form action={action} className="flex flex-col gap-8">
      <div>
        <p className="label-tight text-ink-faint mb-3 text-[10px]">
          {t("phoneHeading", { lang: "PL" })}
        </p>
        <div className="flex flex-wrap gap-4">
          <Field
            label={t("number")}
            name="phonePlNumber"
            defaultValue={pl?.number ?? ""}
            placeholder="+48 884 762 950"
          />
          <Field
            label={t("whatsapp")}
            name="phonePlWhatsapp"
            defaultValue={pl?.whatsapp ?? ""}
            placeholder="48884762950"
          />
        </div>
      </div>

      <div>
        <p className="label-tight text-ink-faint mb-3 text-[10px]">
          {t("phoneHeading", { lang: "EN" })}
        </p>
        <div className="flex flex-wrap gap-4">
          <Field
            label={t("number")}
            name="phoneEnNumber"
            defaultValue={en?.number ?? ""}
            placeholder="+47 462 67 097"
          />
          <Field
            label={t("whatsapp")}
            name="phoneEnWhatsapp"
            defaultValue={en?.whatsapp ?? ""}
            placeholder="4746267097"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <Field
          label={t("email")}
          name="email"
          type="email"
          defaultValue={initial.email}
          placeholder="kontakt@aacorporation.pl"
        />
      </div>

      <div>
        <p className="label-tight text-ink-faint mb-1 text-[10px]">
          {t("hoursHeading")}
        </p>
        <p className="text-ink-faint mb-3 text-xs">{t("hoursIntro")}</p>
        <div className="border-line max-w-xl border-y">
          {OPENING_DAYS.map((day) => (
            <OpeningHoursRow
              key={day.key}
              day={day}
              initial={initial.openingHours[day.key]}
            />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-4">
          <label className="block">
            <span className="label-tight text-ink-faint mb-1 block text-[10px]">
              {t("phoneFrom")}
            </span>
            <input
              name="phoneOpens"
              defaultValue={initial.phoneHours.opens}
              placeholder="07:00"
              className={`${inputClass} max-w-[9rem]`}
            />
          </label>
          <label className="block">
            <span className="label-tight text-ink-faint mb-1 block text-[10px]">
              {t("phoneTo")}
            </span>
            <input
              name="phoneCloses"
              defaultValue={initial.phoneHours.closes}
              placeholder="24:00"
              className={`${inputClass} max-w-[9rem]`}
            />
          </label>
        </div>
        <p className="text-ink-faint mt-1 text-xs">{t("phoneHint")}</p>
        <p className="text-ink-faint mt-3 text-xs">{t("handover")}</p>

        <div className="mt-4">
          <Field
            label={t("notesLabel")}
            name="hours"
            defaultValue={initial.hours}
            placeholder={t("notesPlaceholder")}
          />
          <p className="text-ink-faint mt-1 text-xs">{t("notesHint")}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <Field
          label={t("city")}
          name="city"
          defaultValue={initial.city}
          placeholder="Warszawa"
        />
        <Field
          label={t("address")}
          name="address"
          defaultValue={initial.address}
          placeholder="ul. Przykładowa 1, 00-001 Warszawa"
        />
      </div>
      {/* Link do Map przeniesiony do sekcji „GOOGLE" — jedno pole, jedno
          miejsce. Wartość zostaje w tym samym wierszu ustawień; zapis tego
          formularza jej nie kasuje (patrz `updateCompanyInfo`). */}

      <div>
        <p className="label-tight text-ink-faint mb-3 text-[10px]">
          {t("registry")}
        </p>
        <div className="flex flex-wrap gap-4">
          <Field label="NIP" name="nip" defaultValue={initial.nip} />
          <Field label="REGON" name="regon" defaultValue={initial.regon} />
          <Field label="KRS" name="krs" defaultValue={initial.krs} />
        </div>
      </div>

      <SaveBar state={state} pending={pending} />
    </form>
  );
}

/* ── Homepage hero text ──────────────────────────────────────────────────── */

const HERO_TEXT_FIELD_META: {
  name: keyof HeroTextFields;
  labelKey:
    | "eyebrow"
    | "title"
    | "subtitle"
    | "cta"
    | "ctaSecondary"
    | "featureLuxury"
    | "featureSuv"
    | "featureAirport"
    | "featureSupport";
}[] = [
  { name: "eyebrow", labelKey: "eyebrow" },
  { name: "title", labelKey: "title" },
  { name: "subtitle", labelKey: "subtitle" },
  { name: "cta", labelKey: "cta" },
  { name: "ctaSecondary", labelKey: "ctaSecondary" },
  { name: "featureLuxury", labelKey: "featureLuxury" },
  { name: "featureSuv", labelKey: "featureSuv" },
  { name: "featureAirport", labelKey: "featureAirport" },
  { name: "featureSupport", labelKey: "featureSupport" },
];

function HeroTextLocaleForm({
  locale,
  initial,
}: {
  locale: "pl" | "en";
  initial: HeroTextFields;
}) {
  const [state, action, pending] = useActionState(updateHeroText, null);
  const hasOverride = Object.values(initial).some((v) => v);
  const t = useTranslations("Admin.settings.heroText");

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />
      <div className="grid gap-4 sm:grid-cols-2">
        {HERO_TEXT_FIELD_META.map((field) => (
          <Field
            key={field.name}
            label={t(`fields.${field.labelKey}`)}
            name={field.name}
            defaultValue={initial[field.name]}
          />
        ))}
      </div>
      <p className="text-ink-faint text-xs">
        {hasOverride ? t("customVersion") : t("builtIn")}
      </p>
      <SaveBar state={state} pending={pending} />
    </form>
  );
}

export function HeroTextForm({ initial }: { initial: HeroTextSettings }) {
  const [locale, setLocale] = useState<"pl" | "en">("pl");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2">
        {(["pl", "en"] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLocale(l)}
            className={`label-tight tap border px-4 py-2 text-[11px] transition-colors ${
              locale === l
                ? "border-red bg-red/10 text-white"
                : "border-line-strong text-silver hover:border-ink hover:text-ink"
            }`}
          >
            {l === "pl" ? "Polski" : "English"}
          </button>
        ))}
      </div>
      {/* Remount on locale switch so defaultValue re-seeds from the right copy. */}
      <HeroTextLocaleForm
        key={locale}
        locale={locale}
        initial={initial[locale]}
      />
    </div>
  );
}

/* ── Google / Maps ───────────────────────────────────────────────────────── */

/**
 * One switch, and an honest sentence about whether it can do anything.
 *
 * A checkbox that is ON while the field it depends on is empty is the single
 * most confusing state this screen can be in: the public site correctly renders
 * nothing, and the administrator is looking at a ticked box wondering why. So
 * the box says so, right here, while they are looking at it — rather than
 * leaving them to discover it by loading the public page.
 */
function GoogleToggle({
  name,
  label,
  hint,
  checked,
  onChange,
  ready,
  missing,
}: {
  name: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  /** Whether the data this switch needs is present. */
  ready: boolean;
  /** What is missing, in the operator's words. */
  missing: string;
}) {
  const t = useTranslations("Admin.settings.googleMaps");
  return (
    <div className="border-line border-b py-3 last:border-b-0">
      <label className="tap-block flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name={name}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="accent-red mt-0.5 h-4 w-4 shrink-0"
        />
        <span>
          <span className="text-ink block text-sm">{label}</span>
          <span className="text-ink-faint mt-0.5 block text-xs">{hint}</span>
        </span>
      </label>
      {checked && !ready && (
        <p className="mt-2 ml-7 text-xs text-amber-500">
          {t("enabledButMissing", { missing })}
        </p>
      )}
    </div>
  );
}

/**
 * Google / Maps.
 *
 * Six fields on one screen, written back to three settings rows — see
 * `updateGoogleMaps`. Two of them (the profile link and the directions link)
 * existed before this screen and keep living in their own rows; they are shown
 * here because this is where an administrator looks for them, and they were
 * removed from the two forms that used to carry them so that no field is
 * editable in two places.
 */
export function GoogleMapsForm({
  initial,
  profileUrl,
  mapsUrl,
}: {
  initial: GoogleSettings;
  /** From `social.googleBusiness`. */
  profileUrl: string;
  /** From `company.mapsUrl`. */
  mapsUrl: string;
}) {
  const [state, action, pending] = useActionState(updateGoogleMaps, null);
  const t = useTranslations("Admin.settings.googleMaps");

  // Controlled only for the fields a switch depends on, so the warning under a
  // checkbox reacts as the operator types rather than after a save.
  const [profile, setProfile] = useState(profileUrl);
  const [review, setReview] = useState(initial.reviewUrl);
  const [placeId, setPlaceId] = useState(initial.placeId);
  const [lat, setLat] = useState(
    initial.lat === null ? "" : String(initial.lat),
  );
  const [lng, setLng] = useState(
    initial.lng === null ? "" : String(initial.lng),
  );
  const [showMap, setShowMap] = useState(initial.showMap);
  const [showReviewButton, setShowReviewButton] = useState(
    initial.showReviewButton,
  );
  const [showGoogleButton, setShowGoogleButton] = useState(
    initial.showGoogleButton,
  );
  const [rating, setRating] = useState(
    initial.rating === null ? "" : String(initial.rating),
  );
  const [reviewCount, setReviewCount] = useState(
    initial.reviewCount === null ? "" : String(initial.reviewCount),
  );
  const [showReviewBar, setShowReviewBar] = useState(initial.showReviewBar);

  const isCoordinate = (v: string) =>
    v.trim() !== "" && Number.isFinite(Number(v.trim().replace(",", ".")));
  const hasGeo = isCoordinate(lat) && isCoordinate(lng);
  /*
    Pasek opinii potrzebuje CZEGOKOLWIEK z wizytówki: Place ID (wtedy odnośnik
    prowadzi wprost do listy opinii) albo chociaż linku do wizytówki. Ocena
    i liczba opinii są w nim dobrowolne — pasek bez nich pokazuje sam odnośnik,
    co jest dokładnie tym, co ma pokazywać firma bez ani jednej opinii.
  */
  const hasProfileSource = placeId.trim() !== "" || profile.trim() !== "";

  // The documented shape of a review link. Offered as text to copy, never
  // filled in automatically: a link built from the wrong Place ID sends
  // customers to review somebody else's business, and nothing on this page
  // would show it.
  const suggestedReview = placeId.trim()
    ? `https://search.google.com/local/writereview?placeid=${placeId.trim()}`
    : null;

  return (
    <form action={action} className="flex flex-col gap-8">
      <div className="flex flex-col gap-5">
        <label className="flex flex-col gap-1">
          <span className="label-tight text-ink-faint text-[10px]">
            {t("profileLabel")}
          </span>
          <input
            type="url"
            name="googleBusiness"
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            placeholder="https://maps.app.goo.gl/… lub https://g.co/kgs/…"
            className={inputClass}
          />
          <span className="text-ink-faint text-xs">
            {t.rich("profileHint", {
              code: (chunks) => <code>{chunks}</code>,
            })}
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="label-tight text-ink-faint text-[10px]">
            {t("reviewLabel")}
          </span>
          <input
            type="url"
            name="reviewUrl"
            value={review}
            onChange={(e) => setReview(e.target.value)}
            placeholder="https://search.google.com/local/writereview?placeid=…"
            className={inputClass}
          />
          <span className="text-ink-faint text-xs">{t("reviewHint")}</span>
          {suggestedReview && review.trim() !== suggestedReview && (
            <span className="text-xs text-amber-500">
              {t("suggestedReview")}
              <br />
              <code className="text-ink-faint break-all">
                {suggestedReview}
              </code>
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1">
          <span className="label-tight text-ink-faint text-[10px]">
            {t("mapsLabel")}
          </span>
          <input
            type="url"
            name="mapsUrl"
            defaultValue={mapsUrl}
            placeholder="https://maps.app.goo.gl/…"
            className={inputClass}
          />
          <span className="text-ink-faint text-xs">{t("mapsHint")}</span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="label-tight text-ink-faint text-[10px]">
            {t("placeIdLabel")}
          </span>
          <input
            type="text"
            name="placeId"
            value={placeId}
            onChange={(e) => setPlaceId(e.target.value)}
            placeholder="ChIJ…"
            className={inputClass}
          />
          <span className="text-ink-faint text-xs">
            {t.rich("placeIdHint", {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </span>
        </label>

        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1">
            <span className="label-tight text-ink-faint text-[10px]">
              {t("latLabel")}
            </span>
            <input
              type="text"
              inputMode="decimal"
              name="lat"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="52.155208"
              className={`${inputClass} max-w-[12rem]`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-tight text-ink-faint text-[10px]">
              {t("lngLabel")}
            </span>
            <input
              type="text"
              inputMode="decimal"
              name="lng"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder="21.129825"
              className={`${inputClass} max-w-[12rem]`}
            />
          </label>
        </div>
        <p className="text-ink-faint -mt-3 text-xs">{t("coordsHint")}</p>

        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1">
            <span className="label-tight text-ink-faint text-[10px]">
              {t("ratingLabel")}
            </span>
            <input
              type="text"
              inputMode="decimal"
              name="rating"
              value={rating}
              onChange={(e) => setRating(e.target.value)}
              placeholder="4,9"
              className={`${inputClass} max-w-[12rem]`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-tight text-ink-faint text-[10px]">
              {t("reviewCountLabel")}
            </span>
            <input
              type="text"
              inputMode="numeric"
              name="reviewCount"
              value={reviewCount}
              onChange={(e) => setReviewCount(e.target.value)}
              placeholder="12"
              className={`${inputClass} max-w-[12rem]`}
            />
          </label>
        </div>
        <div className="text-ink-faint -mt-3 text-xs">
          <p>
            {t.rich("reviewsHint", {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
          <p className="mt-2">
            {t.rich("reviewsEmpty", {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
        </div>
      </div>

      <div>
        <p className="label-tight text-ink-faint mb-2 text-[10px]">
          {t("showHeading")}
        </p>
        <div className="border-line max-w-xl border-y">
          {/*
            Kolejność i nazwy przełączników są dokładnie te, którymi posługuje
            się właściciel — „Pokaż mapę", „Zobacz nas w Google", „Dodaj
            opinię". Dwie ostatnie nazywały się wcześniej „Przycisk «…»";
            słowo „przycisk" opisywało, CZYM element jest na stronie, a nie co
            robi, i nie zgadzało się z napisem, który klient widzi. Etykieta
            przełącznika i napis na przycisku to teraz ten sam ciąg znaków,
            więc nie da się ich rozjechać.
          */}
          <GoogleToggle
            name="showMap"
            label={t("toggles.map.label")}
            hint={t("toggles.map.hint")}
            checked={showMap}
            onChange={setShowMap}
            ready={hasGeo}
            missing={t("toggles.map.missing")}
          />
          <GoogleToggle
            name="showGoogleButton"
            label={t("toggles.googleButton.label")}
            hint={t("toggles.googleButton.hint")}
            checked={showGoogleButton}
            onChange={setShowGoogleButton}
            ready={profile.trim() !== ""}
            missing={t("toggles.googleButton.missing")}
          />
          <GoogleToggle
            name="showReviewButton"
            label={t("toggles.reviewButton.label")}
            hint={t("toggles.reviewButton.hint")}
            checked={showReviewButton}
            onChange={setShowReviewButton}
            ready={review.trim() !== ""}
            missing={t("toggles.reviewButton.missing")}
          />
          <GoogleToggle
            name="showReviewBar"
            label={t("toggles.reviewBar.label")}
            hint={t("toggles.reviewBar.hint")}
            checked={showReviewBar}
            onChange={setShowReviewBar}
            ready={hasProfileSource}
            missing={t("toggles.reviewBar.missing")}
          />
        </div>
      </div>

      <SaveBar state={state} pending={pending} />
    </form>
  );
}
