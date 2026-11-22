import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { rentalRulesSchema, RENTAL_RULES_DEFAULT } from "./rental-rules";
import type { Bilingual } from "@/lib/i18n-pick";
import {
  cancellationSchema,
  CANCELLATION_DEFAULT,
} from "@/lib/booking/cancellation";
import { getDb, schema } from "@/lib/db";
import { siteConfig } from "@/lib/config/site";
import {
  openingHoursSchema,
  phoneHoursSchema,
  OFFICE_HOURS_DEFAULT,
} from "@/lib/company/hours";

/** Built-in coordinates, kept as the fallback behind the editable setting. */
const SITE_GEO = siteConfig.geo;

/**
 * Typed access to the `site_settings` key/value store.
 *
 * Every read is defensive: a missing key, an unreachable database, or a value
 * whose shape no longer matches the schema all fall back to the built-in
 * default rather than throwing. The public site renders on these values, so a
 * bad row must never be able to take a page down.
 */

const usingDb = () => Boolean(process.env.DATABASE_URL);

/* ── Schemas + defaults ──────────────────────────────────────────────────── */

/**
 * Social profile URLs. Empty string means "not configured yet" — the UI renders
 * a dimmed placeholder icon rather than a dead link. Only http(s) is accepted,
 * so a stored value can never become a `javascript:` URL.
 */
const httpUrl = z
  .string()
  .trim()
  .refine((v) => v === "" || /^https?:\/\//i.test(v), {
    message: "invalid_url",
  });

export const socialSchema = z.object({
  instagram: httpUrl.default(""),
  facebook: httpUrl.default(""),
  tiktok: httpUrl.default(""),
  /**
   * The Google Business Profile / Maps place URL.
   *
   * Not rendered as a header icon — it exists purely as a `sameAs` entry, and
   * it is the single most valuable one a local business has. It is what tells
   * Google that this domain and that map pin are the same company, which is
   * the link the map pack is built on. Kept separate from `company.mapsUrl`
   * (which is a "get directions" convenience link for visitors) because the
   * two are allowed to differ, and only this one is an identity claim.
   */
  googleBusiness: httpUrl.default(""),
});
export type SocialSettings = z.infer<typeof socialSchema>;
const SOCIAL_DEFAULT: SocialSettings = {
  instagram: "",
  facebook: "",
  tiktok: "",
  googleBusiness: "",
};

/**
 * Hero background — a library of up to three photos per theme, one of them
 * shown.
 *
 * A photograph shot for a black page rarely works on a white one, which is why
 * the two themes have always been separate. What is new (22.08.2026) is that
 * each theme keeps **three slots** and a pointer at the one on the page, so
 * swapping the homepage photo is a click rather than a re-upload — and the
 * other two stay where they are, ready to swap back.
 *
 * Deliberately NOT a rotation or a slider: the administrator picks, and the
 * site shows that pick until somebody picks again.
 *
 * ## Storage, and why there is no migration
 *
 * This lives in one JSONB row of `site_settings`, validated by Zod on the way
 * in and on the way out. Widening the shape is therefore a code change, not a
 * schema change — and rows written by the old code are upgraded on READ by
 * `upgradeHero` below, so nothing has to be rewritten for the site to keep
 * working.
 *
 * ## Why `image` / `imageLight` are still here
 *
 * They are written on every save as a mirror of whichever slot is active. No
 * new code reads them. They exist so a rollback to the previous release finds
 * the shape it expects and the homepage keeps its photograph — without them,
 * older code would fail to parse this row, fall back to its defaults, and the
 * light hero would silently vanish from the live site.
 */
export const HERO_SLOTS = 3;

/** One theme's library: three slots, and which of them is on the page. */
const heroSetSchema = z.object({
  /**
   * Fixed length. A slot is a position the administrator sees and returns to,
   * so an emptied slot stays empty rather than shuffling the others up —
   * deleting photo 2 must never turn photo 3 into photo 2.
   */
  images: z
    .array(z.string().trim().min(1).nullable().catch(null))
    .length(HERO_SLOTS)
    .catch([null, null, null]),
  active: z
    .number()
    .int()
    .min(0)
    .max(HERO_SLOTS - 1)
    .catch(0),
});

export type HeroSet = z.infer<typeof heroSetSchema>;

const EMPTY_SET: HeroSet = { images: [null, null, null], active: 0 };

/** Which theme a hero upload applies to. */
export type HeroVariant = "dark" | "light";

/** The legacy single-photo key each theme used before 22.08.2026. */
const LEGACY_KEY: Record<HeroVariant, "image" | "imageLight"> = {
  dark: "image",
  light: "imageLight",
};

/**
 * Read any historical shape of this setting as the current one.
 *
 * Runs before validation, so every reader — the public page, the admin, the
 * audit log — sees three slots whatever is actually in the row. The old shape
 * carried one photo per theme; it becomes **slot 1, active**, which is exactly
 * the promise made to the operator: existing photos survive and stay on the
 * page.
 *
 * Also normalises `active` to point at a slot that holds something. A pointer
 * at an empty slot is not a state any code path here produces, but a
 * hand-edited row or a half-finished write could leave one, and the homepage
 * must not go photo-less because of an index.
 */
function upgradeHero(raw: unknown): unknown {
  const v = (raw ?? {}) as Record<string, unknown>;

  const set = (variant: HeroVariant): HeroSet => {
    const stored = v[variant];
    const parsed = heroSetSchema.safeParse(stored);
    const base: HeroSet = parsed.success
      ? parsed.data
      : (() => {
          // No new-shape value: lift the legacy single photo into slot 1.
          const legacy = v[LEGACY_KEY[variant]];
          const first = typeof legacy === "string" && legacy ? legacy : null;
          return { images: [first, null, null], active: 0 };
        })();

    const images = [...base.images];
    const active =
      images[base.active] != null
        ? base.active
        : Math.max(
            0,
            images.findIndex((i) => i != null),
          );
    return { images, active };
  };

  const dark = set("dark");
  const light = set("light");

  return {
    dark,
    light,
    // Mirrors, for the rollback described above.
    image: dark.images[dark.active] ?? null,
    imageLight: light.images[light.active] ?? null,
  };
}

export const heroSchema = z.preprocess(
  upgradeHero,
  z.object({
    dark: heroSetSchema.catch(EMPTY_SET),
    light: heroSetSchema.catch(EMPTY_SET),
    image: z.string().trim().nullable().catch(null),
    imageLight: z.string().trim().nullable().catch(null),
  }),
);

export type HeroSettings = z.infer<typeof heroSchema>;

const HERO_DEFAULT: HeroSettings = {
  dark: EMPTY_SET,
  light: EMPTY_SET,
  image: null,
  imageLight: null,
};

/** Shipped with the repo; used for the dark theme whenever nothing is uploaded. */
export const HERO_FALLBACK_IMAGE = "/hero/bmw-740d.jpg";

/**
 * The photo one theme currently shows, or null when that theme has none.
 *
 * The single place that turns a library plus a pointer into "the photo on the
 * page". The public page and the admin badge both call it, so they cannot
 * disagree about which of the three is live.
 */
export function activeHeroImage(
  hero: HeroSettings,
  variant: HeroVariant,
): string | null {
  const set = hero[variant];
  return set.images[set.active] ?? null;
}

/**
 * Rebuild the mirrors after a change. Every write goes through this, so the
 * legacy keys can never drift from the slot they claim to reflect.
 */
export function withHeroMirrors(
  hero: Omit<HeroSettings, "image" | "imageLight">,
): HeroSettings {
  return {
    ...hero,
    image: activeHeroImage(hero as HeroSettings, "dark"),
    imageLight: activeHeroImage(hero as HeroSettings, "light"),
  };
}

/**
 * Per-page visibility. A disabled page 404s and disappears from the navigation.
 * The home page, fleet and the legal pages are deliberately NOT toggleable —
 * they are either the entry point or legally required.
 */
export const pagesSchema = z.object({
  faq: z.boolean().default(true),
  about: z.boolean().default(true),
  howItWorks: z.boolean().default(true),
  contact: z.boolean().default(true),
});
export type PagesSettings = z.infer<typeof pagesSchema>;
export type TogglablePage = keyof PagesSettings;
const PAGES_DEFAULT: PagesSettings = {
  faq: true,
  about: true,
  howItWorks: true,
  contact: true,
};

/**
 * Legal document overrides, as sanitised HTML per locale. An empty string means
 * "no override" — the page then renders the built-in document from
 * lib/legal/content.ts, so the site always has valid terms even before anyone
 * edits them in the admin panel.
 */
const localisedHtml = z.object({
  pl: z.string().default(""),
  en: z.string().default(""),
});
export const legalSchema = z.object({
  terms: localisedHtml.default({ pl: "", en: "" }),
  privacy: localisedHtml.default({ pl: "", en: "" }),
});
export type LegalSettings = z.infer<typeof legalSchema>;
const LEGAL_DEFAULT: LegalSettings = {
  terms: { pl: "", en: "" },
  privacy: { pl: "", en: "" },
};

/**
 * Company / contact data shown across the public site (footer, contact page,
 * structured data) and in outgoing email copy. Defaults mirror the values that
 * used to be hardcoded in `lib/config/site.ts`, so introducing this setting is
 * a no-op until an admin edits it.
 *
 * `nip` / `regon` / `krs` / `address` default to "" because — unlike the phone
 * numbers and email, which are real and in production use — no registration
 * data has ever been published on the site.
 *
 * `openingHours` is the machine-readable schedule (see `lib/company/hours`);
 * `hours` is the free-text line the contact page prefers when an admin has
 * written one. Two fields, two jobs: only the structured one is ever published
 * as `openingHoursSpecification`, because a sentence is not a schedule.
 */
const phoneLineSchema = z.object({
  lang: z.enum(["PL", "EN"]),
  /** Human-readable dialable number, e.g. "+48 884 762 950". */
  number: z.string().trim().default(""),
  /** Digits-only international form for wa.me, e.g. "48884762950". */
  whatsapp: z.string().trim().default(""),
});
export const companySchema = z.object({
  phones: z.array(phoneLineSchema).default([]),
  email: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: "invalid_email",
    })
    .default(""),
  nip: z.string().trim().default(""),
  regon: z.string().trim().default(""),
  krs: z.string().trim().default(""),
  city: z.string().trim().default(""),
  address: z.string().trim().default(""),
  mapsUrl: httpUrl.default(""),
  hours: z.string().trim().default(""),
  openingHours: openingHoursSchema.default(OFFICE_HOURS_DEFAULT),
  /**
   * When the phone is answered — a different fact from when the office takes
   * reservations, and a third one from when a car may change hands. See
   * `lib/company/service-hours`, which is the only place these are worded.
   */
  phoneHours: phoneHoursSchema.default({ opens: "07:00", closes: "24:00" }),
});
export type CompanySettings = z.infer<typeof companySchema>;
export type PhoneLine = z.infer<typeof phoneLineSchema>;
const COMPANY_DEFAULT: CompanySettings = {
  phones: [
    { lang: "PL", number: "+48 884 762 950", whatsapp: "48884762950" },
    { lang: "EN", number: "+47 462 67 097", whatsapp: "4746267097" },
  ],
  email: "kontakt@aacorporation.pl",
  nip: "",
  regon: "",
  krs: "",
  city: "Warszawa",
  address: "",
  mapsUrl: "https://maps.app.goo.gl/pyBSE1VbYUTpb12T8",
  hours: "",
  // The office, not the business as a whole: 08:00–23:00 is when reservations
  // are handled. Collection and return happen at any hour by arrangement and
  // the phone is answered from 07:00 to midnight — separate facts, separate
  // fields, because this is the one Google publishes as "open now" and it must
  // not over-claim. Change it here AND in the admin panel if it ever moves.
  openingHours: OFFICE_HOURS_DEFAULT,
  phoneHours: { opens: "07:00", closes: "24:00" },
};

/**
 * Homepage hero copy, overridable per locale. An empty field means "no
 * override" — the hero then renders the built-in `Hero.*` translation from
 * messages/{locale}.json, same fallback contract as `legal` above.
 */
const heroTextFields = z.object({
  eyebrow: z.string().trim().default(""),
  title: z.string().trim().default(""),
  subtitle: z.string().trim().default(""),
  cta: z.string().trim().default(""),
  ctaSecondary: z.string().trim().default(""),
  featureLuxury: z.string().trim().default(""),
  featureSuv: z.string().trim().default(""),
  featureAirport: z.string().trim().default(""),
  featureSupport: z.string().trim().default(""),
});
export type HeroTextFields = z.infer<typeof heroTextFields>;
const HERO_TEXT_FIELDS_DEFAULT: HeroTextFields = {
  eyebrow: "",
  title: "",
  subtitle: "",
  cta: "",
  ctaSecondary: "",
  featureLuxury: "",
  featureSuv: "",
  featureAirport: "",
  featureSupport: "",
};
export const heroTextSchema = z.object({
  pl: heroTextFields.default(HERO_TEXT_FIELDS_DEFAULT),
  en: heroTextFields.default(HERO_TEXT_FIELDS_DEFAULT),
});
export type HeroTextSettings = z.infer<typeof heroTextSchema>;
const HERO_TEXT_DEFAULT: HeroTextSettings = {
  pl: HERO_TEXT_FIELDS_DEFAULT,
  en: HERO_TEXT_FIELDS_DEFAULT,
};

/**
 * The assistant that answers customers when nobody is at the phone.
 *
 * Written before the bot itself exists, on purpose: this is the contract the
 * bot will be built against, not a control panel for something already
 * running. Two consequences are deliberate.
 *
 * **`enabled` is honest.** Nothing renders a widget yet, so the public site
 * reads this flag and shows nothing either way. The admin page says so in as
 * many words rather than offering a switch that silently does nothing — a
 * toggle that lies about being live is worse than no toggle.
 *
 * **What the bot may NOT do is not stored here.** Changing a price, cancelling
 * a paid reservation and refunding money are absent from `can` and there is no
 * field for them anywhere. They are not preferences an operator could tick by
 * accident at two in the morning; they are limits enforced in the bot's own
 * code. A checkbox for "bot may issue refunds" is a checkbox that will one day
 * be ticked.
 */
export const chatbotSchema = z.object({
  /** Master switch. Off = no widget and a 404 from the API, whatever else is set. */
  enabled: z.boolean().default(false),
  /**
   * Which engine answers.
   *
   * `deterministic` is rules over the existing data — no external service, no
   * API key, no monthly cost, and no possibility of an invented price.
   *
   * `hybrid` is the same rules PLUS a language model consulted only when the
   * rules are unsure. It is not "the AI mode": the parser still answers roughly
   * four messages in five, and every price the customer sees still comes from
   * the same backend either way. Measured at 100% on the 200-sentence suite
   * against 98% for the rules alone — see `docs/PROBA-CLOUDFLARE-AI.md`.
   *
   * The old value `ai` is accepted and read as `hybrid`, so a settings row
   * written before this rename does not fall back to `deterministic` silently
   * and leave an operator wondering why the switch did nothing.
   */
  mode: z
    .preprocess(
      (v) => (v === "ai" ? "hybrid" : v),
      z.enum(["deterministic", "hybrid"]),
    )
    .default("deterministic"),
  /**
   * The kill switch.
   *
   * Separate from `mode` on purpose. `mode` is a decision about how the
   * assistant should work; this is a lever to pull at three in the morning when
   * something looks wrong, without having to remember what the mode was before
   * so it can be put back. Set it, and 100% of traffic goes to the parser on
   * the very next message — no restart, no deploy.
   */
  aiPaused: z.boolean().default(false),
  /** Shown in the widget header — the name a customer is talking to. */
  name: z.string().trim().max(40).default("Asystent A&A"),
  /**
   * Seconds before the widget opens itself, or 0 for never.
   *
   * Default 0. A panel that jumps open on arrival is the single most disliked
   * thing on a car-rental site, and the visitor who wanted it will click.
   */
  autoOpenSeconds: z
    .union([z.literal(0), z.literal(15), z.literal(30), z.literal(60)])
    .default(0),
  /** `auto` follows the page's locale, which is what a bilingual site wants. */
  language: z.enum(["pl", "en", "auto"]).default("auto"),
  position: z.enum(["right", "left"]).default("right"),
  /**
   * When the widget appears.
   *
   * `always` = round the clock. `offHours` = only when the office is closed,
   * which is the point of the whole exercise: a bot that greets people while
   * somebody is sitting by the phone competes with a human who answers better.
   * The schedule comes from the company opening hours, so there is one source
   * of truth for "are we open".
   */
  availability: z.enum(["always", "offHours"]).default("always"),
  /**
   * What the assistant is allowed to do. Every entry is something whose worst
   * outcome is a wrong sentence, never a wrong transaction.
   */
  can: z
    .object({
      faq: z.boolean().default(true),
      offer: z.boolean().default(true),
      availability: z.boolean().default(true),
      prices: z.boolean().default(true),
      startBooking: z.boolean().default(true),
      handoff: z.boolean().default(true),
    })
    .default({
      faq: true,
      offer: true,
      availability: true,
      prices: true,
      startBooking: true,
      handoff: true,
    }),
  /** Where a handed-over conversation lands. Empty = the company email. */
  handoffEmail: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: "invalid_email",
    })
    .default(""),
  /** First line the visitor sees. Empty = the bot's built-in greeting. */
  greeting: z.string().trim().max(300).default(""),
  /** Shown when the assistant cannot help and no human is available. */
  fallback: z.string().trim().max(300).default(""),
});
export type ChatbotSettings = z.infer<typeof chatbotSchema>;
const CHATBOT_DEFAULT: ChatbotSettings = {
  enabled: false,
  mode: "deterministic",
  aiPaused: false,
  autoOpenSeconds: 0,
  name: "Asystent A&A",
  language: "auto",
  position: "right",
  availability: "always",
  can: {
    faq: true,
    offer: true,
    availability: true,
    prices: true,
    startBooking: true,
    handoff: true,
  },
  handoffEmail: "",
  greeting: "",
  fallback: "",
};

/**
 * What the assistant will never be permitted to do, whatever is configured.
 *
 * Exported so the admin page can SHOW these limits — an operator deciding
 * whether to switch a bot on deserves to read what it cannot do — while there
 * is no code path that can turn any of them off.
 */
export const CHATBOT_HARD_LIMITS: readonly Bilingual[] = [
  { pl: "zmieniać cen ani udzielać rabatów", en: "change prices or grant discounts" },
  { pl: "anulować opłaconej rezerwacji", en: "cancel a paid reservation" },
  {
    pl: "zwracać pieniędzy ani zwalniać kaucji",
    en: "refund money or release a deposit",
  },
  {
    pl: "zmieniać danych klienta ani rezerwacji",
    en: "change customer details or reservations",
  },
];

/**
 * Whether visitors see the coloured status line on a car.
 *
 * A switch over PRESENTATION, never over data. `car_status`, the reservations,
 * the availability blocks and everything the booking engine reads are untouched
 * by it in both positions — off hides a line on a card, and that is the whole
 * of what it does. A customer who then picks dates the car is not free for is
 * still told so, because that answer comes from the Availability Engine and not
 * from this flag. See `lib/fleet/status`.
 *
 * Default ON, per §44 of the brief: the first thing that happens after this
 * ships is that customers can see it.
 */
export const publicStatusSchema = z.object({
  enabled: z.boolean().default(true),
});
export type PublicStatusSettings = z.infer<typeof publicStatusSchema>;
const PUBLIC_STATUS_DEFAULT: PublicStatusSettings = { enabled: true };

/**
 * Google / Maps — the pieces of the Google presence that had no home.
 *
 * ## What is deliberately NOT here
 *
 * The Business Profile URL and the "get directions" link already existed and
 * still live where they always did: `social.googleBusiness` and
 * `company.mapsUrl`. Copying them into this key would have produced two rows
 * claiming to be the same fact, and one of them would eventually be the stale
 * one. The Google/Maps admin screen edits all six fields on one form and
 * writes each back to the row that owns it — one screen, three rows, no
 * duplicate source of truth.
 *
 * ## Coordinates
 *
 * `lat`/`lng` default to the values that were hardcoded in `lib/config/site.ts`
 * and have been published in the home page JSON-LD for months. Introducing this
 * setting is therefore a no-op for search engines until somebody edits it —
 * the same contract `company` was introduced under. `siteConfig.geo` stays as
 * the built-in fallback, so a malformed row cannot un-place the business.
 *
 * ## The three switches are OFF by default
 *
 * Not a preference — a rule. A deploy must never make something appear on the
 * public site that nobody chose to publish. The map in particular renders a
 * pin at coordinates that were typed by hand and have never been confirmed
 * against the real pick-up point; a confidently wrong pin is worse than no map.
 */
const optionalNumber = (min: number, max: number, integer = false) =>
  z.preprocess(
    (v) => {
      // A form posts strings. "" means "cleared", and must become null rather
      // than 0 — zero is a real coordinate off the coast of Africa, and a rating
      // of zero is a business nobody has ever rated, which is not a rating.
      if (v === "" || v === null || v === undefined) return null;
      if (typeof v === "string") {
        // Accept the comma decimal separator: a Polish keyboard produces
        // "52,155208" (and "4,9") and rejecting it teaches nobody anything.
        const parsed = Number(v.trim().replace(",", "."));
        return Number.isFinite(parsed) ? parsed : null;
      }
      return v;
    },
    (integer ? z.number().int() : z.number())
      .min(min)
      .max(max)
      .nullable()
      .catch(null),
  );

const optionalCoordinate = (min: number, max: number) =>
  optionalNumber(min, max);

export const googleSchema = z.object({
  /**
   * The direct "write a review" link. Google's documented shape is
   * `https://search.google.com/local/writereview?placeid=<id>`, but any
   * profile-specific review URL the owner is given is equally valid, so this
   * is a plain URL field rather than something derived — a derived link that
   * turns out to point at the wrong business is a link nobody can correct.
   */
  reviewUrl: httpUrl.default(""),
  /**
   * The technical identifier of the location in Google's index.
   *
   * Never guessed and never defaulted: a Place ID belonging to a similarly
   * named company would attach this site's structured data to somebody else's
   * shopfront. Empty until the real profile supplies one.
   */
  placeId: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[A-Za-z0-9_-]{10,}$/.test(v), {
      message: "Place ID zawiera tylko litery, cyfry, - i _",
    })
    .default(""),
  lat: optionalCoordinate(-90, 90),
  lng: optionalCoordinate(-180, 180),
  /**
   * Średnia ocena i liczba opinii z wizytówki — PRZEPISANE RĘCZNIE.
   *
   * Nie da się ich pobrać za darmo. Places API (New) zwraca `rating`
   * i `userRatingCount` w jednym zapytaniu, ale wymaga projektu Google Cloud
   * z włączonymi płatnościami, czyli karty — a zasada projektu brzmi „zero
   * nowych kosztów". Scrapowanie wyników Google jest wprost zabronione przez
   * jego regulamin. Business Profile API jest bezpłatne, lecz wymaga własnego
   * projektu Cloud, OAuth właściciela wizytówki i zgody Google na dostęp;
   * niczego z tego ten projekt nie ma.
   *
   * Zostaje więc jedno uczciwe rozwiązanie: dwa pola, które właściciel
   * przepisuje z wizytówki. `null` znaczy „nie wiem" i strona wtedy NIE
   * pokazuje oceny — nigdy nie zgaduje, nie zaokrągla w górę i nie wstawia
   * pięciu gwiazdek „na zachętę".
   *
   * Zakres oceny zaczyna się od 1, a nie od 0: Google nie wystawia oceny 0,
   * najniższa możliwa średnia to 1,0. Zero w tym polu zawsze znaczyłoby
   * pomyłkę przy przepisywaniu.
   */
  rating: optionalNumber(1, 5),
  reviewCount: optionalNumber(0, 1_000_000, true),
  showMap: z.boolean().default(false),
  showReviewButton: z.boolean().default(false),
  showGoogleButton: z.boolean().default(false),
  showReviewBar: z.boolean().default(false),
});
export type GoogleSettings = z.infer<typeof googleSchema>;
const GOOGLE_DEFAULT: GoogleSettings = {
  reviewUrl: "",
  placeId: "",
  lat: SITE_GEO.lat,
  lng: SITE_GEO.lng,
  // Bez wartości domyślnych, i to jest cała rzecz: ocena, której nikt nie
  // wpisał, nie istnieje. Współrzędne mają zapas w repozytorium, bo pinezka
  // musi gdzieś stać; ocena nie ma czego udawać.
  rating: null,
  reviewCount: null,
  showMap: false,
  showReviewButton: false,
  showGoogleButton: false,
  showReviewBar: false,
};

/**
 * The last EUR/PLN reference rate we were able to fetch — see
 * `lib/currency/rate`, which is the only thing that writes it.
 *
 * A settings key rather than a table for the same reason as `rentalRules`: it
 * is one small JSON blob that needs validation, a safe default and no migration.
 * `plnPerEur: 0` is the honest "we have never had a rate" value, and the site
 * reads it as "stay in złoty" rather than as a number.
 */
export const eurRateSchema = z.object({
  plnPerEur: z.number().default(0),
  date: z.string().default(""),
  source: z.enum(["ecb", "nbp", ""]).default(""),
  fetchedAt: z.string().default(""),
});
export type EurRateSettings = z.infer<typeof eurRateSchema>;
const EUR_RATE_DEFAULT: EurRateSettings = {
  plnPerEur: 0,
  date: "",
  source: "",
  fetchedAt: "",
};

/* ── Key registry ────────────────────────────────────────────────────────── */

const REGISTRY = {
  social: { schema: socialSchema, fallback: SOCIAL_DEFAULT },
  /**
   * The rental rules centre — see `lib/admin/rental-rules`.
   *
   * A settings key rather than a table of its own, deliberately. This row gives
   * it JSONB storage, Zod validation on write, `updated_by`, a safe fallback on
   * a malformed value and an audit trail, all of which already work; a new
   * table would have cost a migration to reimplement them.
   */
  rentalRules: { schema: rentalRulesSchema, fallback: RENTAL_RULES_DEFAULT },
  hero: { schema: heroSchema, fallback: HERO_DEFAULT },
  pages: { schema: pagesSchema, fallback: PAGES_DEFAULT },
  legal: { schema: legalSchema, fallback: LEGAL_DEFAULT },
  company: { schema: companySchema, fallback: COMPANY_DEFAULT },
  heroText: { schema: heroTextSchema, fallback: HERO_TEXT_DEFAULT },
  chatbot: { schema: chatbotSchema, fallback: CHATBOT_DEFAULT },
  publicStatus: {
    schema: publicStatusSchema,
    fallback: PUBLIC_STATUS_DEFAULT,
  },
  /**
   * Google / Maps — a settings key rather than a table, for the same reason as
   * `rentalRules`: JSONB storage, Zod validation, `updated_by`, an audit trail
   * and a safe fallback all already work here. A new table would have cost a
   * migration to reimplement them.
   */
  google: { schema: googleSchema, fallback: GOOGLE_DEFAULT },
  eurRate: { schema: eurRateSchema, fallback: EUR_RATE_DEFAULT },
  /**
   * Polityka anulowania — progi godzinowe i kwoty.
   *
   * Klucz ustawień, a nie tabela, z tego samego powodu co `rentalRules`
   * i `google`: składowanie JSONB, walidacja Zodem przy zapisie, `updated_by`,
   * ślad w dzienniku i bezpieczny fallback już tu działają. Osobna tabela
   * kosztowałaby migrację po to, żeby napisać je drugi raz.
   *
   * Schemat i wartości domyślne mieszkają w `lib/booking/cancellation`, czyli
   * tam, gdzie stoi cała reszta tej polityki — panel, strona, asystent
   * i rozliczenie czytają JEDEN plik.
   */
  cancellation: { schema: cancellationSchema, fallback: CANCELLATION_DEFAULT },
} as const;

export type SettingKey = keyof typeof REGISTRY;
type SettingValue<K extends SettingKey> = z.infer<
  (typeof REGISTRY)[K]["schema"]
>;

/* ── Read / write ────────────────────────────────────────────────────────── */

/** Reads one setting, falling back to its default on any failure. */
export async function getSetting<K extends SettingKey>(
  key: K,
): Promise<SettingValue<K>> {
  const { schema: valueSchema, fallback } = REGISTRY[key];
  if (!usingDb()) return fallback as SettingValue<K>;

  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.siteSettings)
      .where(eq(schema.siteSettings.key, key))
      .limit(1);
    if (!row) return fallback as SettingValue<K>;

    const parsed = valueSchema.safeParse(row.value);
    // A row that no longer matches the schema is ignored, not fatal — the site
    // keeps rendering on defaults until an admin saves a valid value.
    return parsed.success
      ? (parsed.data as SettingValue<K>)
      : (fallback as SettingValue<K>);
  } catch {
    return fallback as SettingValue<K>;
  }
}

/** Writes one setting. Validation happens here, so callers cannot store junk. */
export async function setSetting<K extends SettingKey>(
  key: K,
  value: unknown,
  adminId?: string,
): Promise<SettingValue<K>> {
  const parsed = REGISTRY[key].schema.parse(value) as SettingValue<K>;

  const db = getDb();
  await db
    .insert(schema.siteSettings)
    .values({ key, value: parsed, updatedBy: adminId ?? null })
    .onConflictDoUpdate({
      target: schema.siteSettings.key,
      set: { value: parsed, updatedAt: new Date(), updatedBy: adminId ?? null },
    });

  return parsed;
}

/** Convenience reader used by the public layout, which needs several at once. */
export async function getPublicSettings() {
  const [social, hero, pages, company] = await Promise.all([
    getSetting("social"),
    getSetting("hero"),
    getSetting("pages"),
    getSetting("company"),
  ]);
  return { social, hero, pages, company };
}
