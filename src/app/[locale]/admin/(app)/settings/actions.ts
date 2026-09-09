"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/auth/audit";
import {
  getSetting,
  setSetting,
  withHeroMirrors,
  HERO_SLOTS,
  type HeroSet,
  type HeroSettings,
  type HeroVariant,
  type PagesSettings,
  type CompanySettings,
  type HeroTextFields,
} from "@/lib/admin/settings";
import { OPENING_DAYS } from "@/lib/company/hours";
import { sanitizeLegalHtml } from "@/lib/legal/sanitize";
import { deleteImage, saveImage } from "@/lib/storage/media";
import { configFromEnv } from "@/lib/chat/ai/cloudflare";
import { adminActionFailed } from "@/lib/alerts/admin";

export type SaveResult =
  { ok: true; message?: string } | { ok: false; error: string };

const GENERIC_ERROR: SaveResult = {
  ok: false,
  error: "Wystąpił błąd. Spróbuj ponownie.",
};

/**
 * Every public page renders from these settings, so each action revalidates the
 * whole public tree rather than a single path — a page-visibility change alters
 * the navigation on every page at once.
 */
function revalidatePublic() {
  revalidatePath("/", "layout");
}

/**
 * Refresh the settings screens themselves.
 *
 * `revalidatePath("/admin/settings")` invalidates that exact path and nothing
 * under it, and every settings screen actually lives one segment deeper
 * (`/admin/settings/strona`). The forms that only ever showed text got away
 * with it, because what the operator typed is what they keep looking at. The
 * hero cards do not: after deleting a photo the page kept rendering the card
 * that had just been removed, because its props came from a server component
 * nothing had told to run again. The `"layout"` form covers the nested routes.
 */
function revalidateSettings() {
  revalidatePath("/admin/settings", "layout");
}

/* ── Social links ────────────────────────────────────────────────────────── */

export async function updateSocialLinks(
  _prev: SaveResult | null,
  formData: FormData,
): Promise<SaveResult> {
  const admin = await requirePermission("ustawienia.zmien");

  const before = await getSetting("social");

  const next = {
    instagram: String(formData.get("instagram") ?? "").trim(),
    facebook: String(formData.get("facebook") ?? "").trim(),
    tiktok: String(formData.get("tiktok") ?? "").trim(),
    /*
      The Business Profile URL moved to the Google/Maps screen and is no longer
      an input on this form. `formData.get` would therefore return null, and
      `?? ""` would quietly WIPE a configured profile link every time somebody
      saved their Instagram — a stored value deleted by a form that no longer
      shows it. A field this form does not carry is left exactly as it was.
    */
    googleBusiness: formData.has("googleBusiness")
      ? String(formData.get("googleBusiness") ?? "").trim()
      : before.googleBusiness,
  };

  try {
    // setSetting validates the URLs; a bad one throws and is reported below.
    const after = await setSetting("social", next, admin.id);

    await recordAudit({
      adminId: admin.id,
      action: "settings.social.update",
      entity: "site_setting",
      entityId: "social",
      before,
      after,
    });
    revalidatePublic();
    revalidateSettings();
    return { ok: true, message: "Linki zapisane." };
  } catch (err) {
    // A zod failure here means a malformed URL — worth telling the admin exactly.
    if (err instanceof Error && err.name === "ZodError") {
      return {
        ok: false,
        error: "Każdy link musi zaczynać się od http:// lub https://",
      };
    }
    adminActionFailed("updateSocialLinks", err);
    return GENERIC_ERROR;
  }
}

/* ── Page visibility ─────────────────────────────────────────────────────── */

export async function updatePageVisibility(
  _prev: SaveResult | null,
  formData: FormData,
): Promise<SaveResult> {
  const admin = await requirePermission("ustawienia.zmien");

  const next: PagesSettings = {
    faq: formData.get("faq") === "on",
    about: formData.get("about") === "on",
    howItWorks: formData.get("howItWorks") === "on",
    contact: formData.get("contact") === "on",
  };

  try {
    const before = await getSetting("pages");
    const after = await setSetting("pages", next, admin.id);

    await recordAudit({
      adminId: admin.id,
      action: "settings.pages.update",
      entity: "site_setting",
      entityId: "pages",
      before,
      after,
    });
    revalidatePublic();
    revalidateSettings();
    return { ok: true, message: "Widoczność stron zapisana." };
  } catch (err) {
    adminActionFailed("updatePageVisibility", err);
    return GENERIC_ERROR;
  }
}

/* ── Hero background image ───────────────────────────────────────────────── */

const UPLOAD_ERRORS: Record<string, string> = {
  empty: "Nie wybrano pliku.",
  too_large: "Plik jest za duży — maksymalnie 8 MB.",
  unsupported_type: "Nieobsługiwany format. Dozwolone: JPG, PNG, WEBP.",
  write_failed: "Nie udało się zapisać pliku.",
};

/**
 * Hero photos — a library of three slots per theme, one of them on the page.
 *
 * Three actions, and the split between them is the point of the whole change:
 * uploading a file, choosing which file is shown, and removing one are now
 * separate operations. Before this, "show the other photo" meant uploading it
 * again over the top of the one you had.
 *
 * All three rewrite only the theme they were given and only the slot they were
 * given. The other theme, and the other two slots, are carried through
 * untouched — deleting one photo must never cost the operator the other two.
 */
const SLOT_ERROR = "Nieprawidłowy numer zdjęcia.";

function heroVariant(value: unknown): HeroVariant | null {
  return value === "dark" || value === "light" ? value : null;
}

/** 0-based slot index, or null when the value is not one of the three. */
function heroSlot(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n < HERO_SLOTS ? n : null;
}

/**
 * Write one theme's library back, with the mirrors rebuilt.
 *
 * Kept in one function so no action can save a set without also refreshing the
 * legacy `image`/`imageLight` keys that a rollback would read.
 */
async function saveHeroSet(
  variant: HeroVariant,
  set: HeroSet,
  before: HeroSettings,
  adminId: string,
) {
  return setSetting(
    "hero",
    withHeroMirrors({
      dark: variant === "dark" ? set : before.dark,
      light: variant === "light" ? set : before.light,
    }),
    adminId,
  );
}

/**
 * Upload into one slot.
 *
 * A photo landing in an otherwise empty library becomes the active one — the
 * alternative is an upload that visibly does nothing, which reads as a broken
 * form. A photo landing beside others does NOT steal the selection: the
 * operator chose what is on the page, and an upload is not that choice.
 */
export async function updateHeroImage(
  _prev: SaveResult | null,
  formData: FormData,
): Promise<SaveResult> {
  const admin = await requirePermission("ustawienia.zmien");

  const variant = heroVariant(formData.get("variant"));
  if (!variant) return { ok: false, error: "Nieprawidłowe dane." };
  const slot = heroSlot(formData.get("slot"));
  if (slot === null) return { ok: false, error: SLOT_ERROR };

  const file = formData.get("image");
  if (!(file instanceof File)) return { ok: false, error: UPLOAD_ERRORS.empty };

  try {
    const saved = await saveImage(file);
    if (!saved.ok) {
      return { ok: false, error: UPLOAD_ERRORS[saved.error] ?? "Błąd zapisu." };
    }

    const before = await getSetting("hero");
    const images = [...before[variant].images];
    const replaced = images[slot];
    images[slot] = saved.url;

    // Nothing was on the page for this theme, so the first photo goes on it.
    const hadAny = before[variant].images.some((i) => i != null);
    const active = hadAny ? before[variant].active : slot;

    const after = await saveHeroSet(
      variant,
      { images, active },
      before,
      admin.id,
    );

    // Remove the file this slot used to hold, now that the new one is
    // committed — after the write, so a failure cannot orphan the setting.
    if (replaced && replaced !== saved.url) {
      await deleteImage(replaced).catch(() => {
        /* best effort — a stray file is harmless, a crash here is not */
      });
    }

    await recordAudit({
      adminId: admin.id,
      action: "settings.hero.update",
      entity: "site_setting",
      entityId: `hero.${variant}.${slot + 1}`,
      before,
      after,
    });
    revalidatePublic();
    revalidateSettings();
    return { ok: true, message: `Zdjęcie ${slot + 1} zapisane.` };
  } catch (err) {
    adminActionFailed("updateHeroImage", err);
    return GENERIC_ERROR;
  }
}

/**
 * Put one of the stored photos on the page. No upload, no file touched.
 *
 * Refuses an empty slot rather than pointing the homepage at nothing: an
 * "active" marker on a slot with no photo would show the fallback while the
 * panel claimed a photo was live.
 */
export async function setActiveHeroImage(
  variantRaw: HeroVariant,
  slotRaw: number,
): Promise<SaveResult> {
  const admin = await requirePermission("ustawienia.zmien");

  const variant = heroVariant(variantRaw);
  if (!variant) return { ok: false, error: "Nieprawidłowe dane." };
  const slot = heroSlot(slotRaw);
  if (slot === null) return { ok: false, error: SLOT_ERROR };

  try {
    const before = await getSetting("hero");
    if (before[variant].images[slot] == null) {
      return { ok: false, error: "W tym miejscu nie ma zdjęcia." };
    }
    if (before[variant].active === slot) {
      return { ok: true, message: `Zdjęcie ${slot + 1} jest już aktywne.` };
    }

    const after = await saveHeroSet(
      variant,
      { images: [...before[variant].images], active: slot },
      before,
      admin.id,
    );

    await recordAudit({
      adminId: admin.id,
      action: "settings.hero.activate",
      entity: "site_setting",
      entityId: `hero.${variant}.${slot + 1}`,
      before,
      after,
    });
    revalidatePublic();
    revalidateSettings();
    return { ok: true, message: `Zdjęcie ${slot + 1} jest teraz na stronie.` };
  } catch (err) {
    adminActionFailed("setActiveHeroImage", err);
    return GENERIC_ERROR;
  }
}

/**
 * Remove one photo.
 *
 * The rule the operator asked for, and the one worth stating plainly: removing
 * a photo that is NOT on the page changes nothing else. Removing the one that
 * IS on the page hands the page to the first photo still standing — and only
 * when none is left does the theme fall back to what it fell back to before
 * (the bundled photograph for dark, no photo at all for light).
 *
 * The emptied slot stays empty. Photo 3 does not become photo 2.
 */
export async function deleteHeroImage(
  variantRaw: HeroVariant,
  slotRaw: number,
): Promise<SaveResult> {
  const admin = await requirePermission("ustawienia.zmien");

  const variant = heroVariant(variantRaw);
  if (!variant) return { ok: false, error: "Nieprawidłowe dane." };
  const slot = heroSlot(slotRaw);
  if (slot === null) return { ok: false, error: SLOT_ERROR };

  try {
    const before = await getSetting("hero");
    const removed = before[variant].images[slot];
    if (removed == null) {
      return { ok: false, error: "W tym miejscu nie ma zdjęcia." };
    }

    const images = [...before[variant].images];
    images[slot] = null;

    // Only the active photo's departure moves the selection, and it moves to
    // the first survivor. `findIndex` returns -1 for an empty library, which
    // becomes slot 1 — an index the theme's own fallback then covers.
    const active =
      before[variant].active === slot
        ? Math.max(
            0,
            images.findIndex((i) => i != null),
          )
        : before[variant].active;

    const after = await saveHeroSet(
      variant,
      { images, active },
      before,
      admin.id,
    );

    await deleteImage(removed).catch(() => {});

    await recordAudit({
      adminId: admin.id,
      action: "settings.hero.delete",
      entity: "site_setting",
      entityId: `hero.${variant}.${slot + 1}`,
      before,
      after,
    });
    revalidatePublic();
    revalidateSettings();

    const left = images.some((i) => i != null);
    return {
      ok: true,
      message: left
        ? `Zdjęcie ${slot + 1} usunięte.`
        : variant === "dark"
          ? "Zdjęcie usunięte — motyw ciemny wraca do domyślnego."
          : "Zdjęcie usunięte — jasny motyw bez zdjęcia.",
    };
  } catch (err) {
    adminActionFailed("deleteHeroImage", err);
    return GENERIC_ERROR;
  }
}

/* ── Legal documents ─────────────────────────────────────────────────────── */

export async function updateLegalDocument(
  _prev: SaveResult | null,
  formData: FormData,
): Promise<SaveResult> {
  const admin = await requirePermission("ustawienia.zmien");

  const docRaw = String(formData.get("doc") ?? "");
  const localeRaw = String(formData.get("locale") ?? "");
  const doc = docRaw === "terms" || docRaw === "privacy" ? docRaw : null;
  const locale = localeRaw === "pl" || localeRaw === "en" ? localeRaw : null;
  if (!doc || !locale) return { ok: false, error: "Nieprawidłowe dane." };

  // Sanitised before storage as well as before render — see lib/legal/sanitize.
  const html = sanitizeLegalHtml(String(formData.get("html") ?? ""));

  try {
    const before = await getSetting("legal");
    const after = await setSetting(
      "legal",
      { ...before, [doc]: { ...before[doc], [locale]: html } },
      admin.id,
    );

    await recordAudit({
      adminId: admin.id,
      action: "settings.legal.update",
      entity: "site_setting",
      entityId: `legal.${doc}.${locale}`,
      before: before[doc],
      after: after[doc],
    });
    revalidatePublic();
    revalidatePath("/admin/settings/legal");
    return { ok: true, message: "Dokument zapisany." };
  } catch (err) {
    adminActionFailed("updateLegalDocument", err);
    return GENERIC_ERROR;
  }
}

/* ── Company / contact info ──────────────────────────────────────────────── */

export async function updateCompanyInfo(
  _prev: SaveResult | null,
  formData: FormData,
): Promise<SaveResult> {
  const admin = await requirePermission("ustawienia.zmien");

  const field = (name: string) => String(formData.get(name) ?? "").trim();
  const before = await getSetting("company");

  const next: CompanySettings = {
    phones: [
      {
        lang: "PL",
        number: field("phonePlNumber"),
        whatsapp: field("phonePlWhatsapp").replace(/\D/g, ""),
      },
      {
        lang: "EN",
        number: field("phoneEnNumber"),
        whatsapp: field("phoneEnWhatsapp").replace(/\D/g, ""),
      },
    ],
    email: field("email"),
    nip: field("nip"),
    regon: field("regon"),
    krs: field("krs"),
    city: field("city"),
    address: field("address"),
    /*
      Moved to the Google/Maps screen — same reasoning as `googleBusiness` in
      `updateSocialLinks`: a form that no longer shows a field must not be able
      to erase it. Saving the phone number would otherwise delete the
      directions link from the footer and `hasMap` from the structured data.
    */
    mapsUrl: formData.has("mapsUrl") ? field("mapsUrl") : before.mapsUrl,
    hours: field("hours"),
    // One checkbox and two time inputs per day. An unchecked "closed" box with
    // blank times is not an error — `openingHoursSpecification` simply omits
    // that day rather than publishing an open-ended one.
    openingHours: Object.fromEntries(
      OPENING_DAYS.map((day) => [
        day.key,
        {
          closed: formData.get(`${day.key}Closed`) === "on",
          opens: field(`${day.key}Opens`),
          closes: field(`${day.key}Closes`),
        },
      ]),
    ) as CompanySettings["openingHours"],
    // The phone window is one range for the whole week — the office schedule
    // above is per-day because Google reads it, this one is read by people.
    phoneHours: {
      opens: field("phoneOpens"),
      closes: field("phoneCloses"),
    },
  };

  try {
    // setSetting validates email format and the maps URL scheme; either
    // failing throws and is reported below.
    const after = await setSetting("company", next, admin.id);

    await recordAudit({
      adminId: admin.id,
      action: "settings.company.update",
      entity: "site_setting",
      entityId: "company",
      before,
      after,
    });
    revalidatePublic();
    revalidateSettings();
    return { ok: true, message: "Dane firmy zapisane." };
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return {
        ok: false,
        error:
          "Sprawdź dane — adres e-mail musi być poprawny, link do mapy zaczynać się od http:// lub https://, a godziny mieć format GG:MM.",
      };
    }
    adminActionFailed("updateCompanyInfo", err);
    return GENERIC_ERROR;
  }
}

/* ── Homepage hero text ──────────────────────────────────────────────────── */

const HERO_TEXT_FIELD_NAMES = [
  "eyebrow",
  "title",
  "subtitle",
  "cta",
  "ctaSecondary",
  "featureLuxury",
  "featureSuv",
  "featureAirport",
  "featureSupport",
] as const satisfies readonly (keyof HeroTextFields)[];

export async function updateHeroText(
  _prev: SaveResult | null,
  formData: FormData,
): Promise<SaveResult> {
  const admin = await requirePermission("ustawienia.zmien");

  const localeRaw = String(formData.get("locale") ?? "");
  const locale = localeRaw === "pl" || localeRaw === "en" ? localeRaw : null;
  if (!locale) return { ok: false, error: "Nieprawidłowe dane." };

  const fields = Object.fromEntries(
    HERO_TEXT_FIELD_NAMES.map((name) => [
      name,
      String(formData.get(name) ?? "").trim(),
    ]),
  ) as HeroTextFields;

  try {
    const before = await getSetting("heroText");
    const after = await setSetting(
      "heroText",
      { ...before, [locale]: fields },
      admin.id,
    );

    await recordAudit({
      adminId: admin.id,
      action: "settings.heroText.update",
      entity: "site_setting",
      entityId: `heroText.${locale}`,
      before: before[locale],
      after: after[locale],
    });
    revalidatePublic();
    revalidateSettings();
    return { ok: true, message: "Treść hero zapisana." };
  } catch (err) {
    adminActionFailed("updateHeroText", err);
    return GENERIC_ERROR;
  }
}

/* ── Chatbot ─────────────────────────────────────────────────────────────── */

/**
 * Save the assistant's configuration.
 *
 * Note what is NOT read from the form: there is no field for changing prices,
 * cancelling paid reservations or issuing refunds, because those limits are not
 * settings. See `CHATBOT_HARD_LIMITS` — the admin page prints them so the
 * operator can read what the bot cannot do, and no request can alter them.
 */
export async function updateChatbot(
  _prev: SaveResult | null,
  formData: FormData,
): Promise<SaveResult> {
  const admin = await requirePermission("ustawienia.zmien");

  const pick = <T extends string>(
    key: string,
    allowed: readonly T[],
    dflt: T,
  ): T => {
    const v = String(formData.get(key) ?? "");
    return (allowed as readonly string[]).includes(v) ? (v as T) : dflt;
  };

  /**
   * `mode` is validated against the enum here, not merely in the form.
   *
   * A disabled `<option>` is a hint to a browser, never a guarantee about what
   * a POST body contains. `hybrid` is additionally refused when there are no
   * credentials — picking it then would not break anything (the reader falls
   * back on every message) but the panel would claim an engine that cannot run,
   * and a setting that lies is worse than one that is unavailable.
   */
  const requestedMode = pick(
    "mode",
    ["deterministic", "hybrid"] as const,
    "deterministic",
  );
  const aiConfigured = configFromEnv() !== null;

  const next = {
    enabled: formData.get("enabled") === "on",
    mode:
      requestedMode === "hybrid" && !aiConfigured
        ? "deterministic"
        : requestedMode,
    aiPaused: formData.get("aiPaused") === "on",
    autoOpenSeconds: [0, 15, 30, 60].includes(
      Number(formData.get("autoOpenSeconds")),
    )
      ? (Number(formData.get("autoOpenSeconds")) as 0 | 15 | 30 | 60)
      : 0,
    name: String(formData.get("name") ?? "").trim(),
    language: pick("language", ["pl", "en", "auto"] as const, "auto"),
    position: pick("position", ["right", "left"] as const, "right"),
    availability: pick(
      "availability",
      ["always", "offHours"] as const,
      "always",
    ),
    can: {
      faq: formData.get("can_faq") === "on",
      offer: formData.get("can_offer") === "on",
      availability: formData.get("can_availability") === "on",
      prices: formData.get("can_prices") === "on",
      startBooking: formData.get("can_startBooking") === "on",
      handoff: formData.get("can_handoff") === "on",
    },
    handoffEmail: String(formData.get("handoffEmail") ?? "").trim(),
    greeting: String(formData.get("greeting") ?? "").trim(),
    fallback: String(formData.get("fallback") ?? "").trim(),
  };

  try {
    const before = await getSetting("chatbot");
    const after = await setSetting("chatbot", next, admin.id);

    await recordAudit({
      adminId: admin.id,
      action: "settings.chatbot.update",
      entity: "site_setting",
      entityId: "chatbot",
      before,
      after,
    });
    revalidatePublic();
    revalidatePath("/admin/settings/chatbot");
    return { ok: true, message: "Ustawienia asystenta zapisane." };
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return {
        ok: false,
        error: "Sprawdź adres e-mail do przekazywania rozmów.",
      };
    }
    adminActionFailed("updateChatbot", err);
    return GENERIC_ERROR;
  }
}

/* ── Google / Maps ───────────────────────────────────────────────────────── */

/**
 * One screen, three settings rows.
 *
 * Two of the six fields on the Google/Maps form already had a home before this
 * screen existed: the Business Profile URL lives in `social.googleBusiness`
 * (it is a `sameAs` identity claim) and the directions link lives in
 * `company.mapsUrl` (the footer and the contact page read it). They are
 * written back to those rows rather than copied into `google`, so there is
 * still exactly one row that owns each fact — the alternative is two copies
 * that agree until the day somebody edits the wrong screen.
 *
 * Each row is written only when its value actually changed. An operator who
 * saves this form after editing nothing but a switch should not produce three
 * audit entries and three "company data changed" records.
 */
export async function updateGoogleMaps(
  _prev: SaveResult | null,
  formData: FormData,
): Promise<SaveResult> {
  const admin = await requirePermission("ustawienia.zmien");

  const field = (name: string) => String(formData.get(name) ?? "").trim();

  const nextGoogle = {
    reviewUrl: field("reviewUrl"),
    placeId: field("placeId"),
    // Empty string is meaningful here — the schema reads it as "cleared" and
    // stores null, rather than coercing it to the equator.
    lat: field("lat"),
    lng: field("lng"),
    // Ocena i liczba opinii — przepisane z wizytówki, bo nie ma darmowego
    // źródła, z którego dałoby się je pobrać (patrz `googleSchema`). Puste
    // pole znaczy „nie wiem" i schemat zapisuje je jako `null`, nie jako zero.
    rating: field("rating"),
    reviewCount: field("reviewCount"),
    showMap: formData.get("showMap") === "on",
    showReviewButton: formData.get("showReviewButton") === "on",
    showGoogleButton: formData.get("showGoogleButton") === "on",
    showReviewBar: formData.get("showReviewBar") === "on",
  };
  const nextProfileUrl = field("googleBusiness");
  const nextMapsUrl = field("mapsUrl");

  try {
    const [beforeGoogle, beforeSocial, beforeCompany] = await Promise.all([
      getSetting("google"),
      getSetting("social"),
      getSetting("company"),
    ]);

    // setSetting validates: bad URL, malformed Place ID or an out-of-range
    // coordinate all throw here and are reported below.
    const afterGoogle = await setSetting("google", nextGoogle, admin.id);
    await recordAudit({
      adminId: admin.id,
      action: "settings.google.update",
      entity: "site_setting",
      entityId: "google",
      before: beforeGoogle,
      after: afterGoogle,
    });

    if (nextProfileUrl !== beforeSocial.googleBusiness) {
      const afterSocial = await setSetting(
        "social",
        { ...beforeSocial, googleBusiness: nextProfileUrl },
        admin.id,
      );
      await recordAudit({
        adminId: admin.id,
        action: "settings.social.update",
        entity: "site_setting",
        entityId: "social",
        before: beforeSocial,
        after: afterSocial,
      });
    }

    if (nextMapsUrl !== beforeCompany.mapsUrl) {
      const afterCompany = await setSetting(
        "company",
        { ...beforeCompany, mapsUrl: nextMapsUrl },
        admin.id,
      );
      await recordAudit({
        adminId: admin.id,
        action: "settings.company.update",
        entity: "site_setting",
        entityId: "company",
        before: beforeCompany,
        after: afterCompany,
      });
    }

    revalidatePublic();
    revalidateSettings();
    return { ok: true, message: "Ustawienia Google zapisane." };
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return {
        ok: false,
        error:
          "Sprawdź pola: linki muszą zaczynać się od https://, współrzędne muszą być liczbami, ocena mieści się między 1,0 a 5,0, liczba opinii jest liczbą całkowitą, Place ID zawiera tylko litery, cyfry, - i _",
      };
    }
    adminActionFailed("updateGoogleMaps", err);
    return GENERIC_ERROR;
  }
}
