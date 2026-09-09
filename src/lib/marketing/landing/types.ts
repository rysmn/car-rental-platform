/**
 * Shape of one SEO landing page, and the locale resolver.
 *
 * Copy is data rather than JSX so both locales sit side by side in one file and
 * neither can silently drift out of sync with the other. The page components
 * only ever see a `LandingContent` — already resolved to a single locale.
 *
 * EVERY FIGURE IN A LANDING FILE IS ALSO PUBLISHED SOMEWHERE ELSE ON THE SITE —
 * delivery fees and add-ons in `EXTRAS`, mileage in `KM_LIMITS`, deposits on the
 * car pages, the minimum driver age in Admin → Zasady wynajmu. Copy that
 * contradicts the booking calculator is worse than no copy at all: it reads as a
 * quote and is not one. When a price changes, change it in both places — or
 * state it only once, by pointing at the price table. The driver age took the
 * second route: it is a `{minAge}` placeholder here and a number in exactly one
 * place, so the two cannot drift.
 */

export type Pair = { pl: string; en: string };

export const pick = (p: Pair, locale: string) =>
  locale === "en" ? p.en : p.pl;

/** A prose block: one heading, one or more paragraphs. */
export type Section = { heading: Pair; body: Pair[] };

/** A numbered step in a "how it works" sequence. */
export type Step = { title: Pair; desc: Pair };

export type Landing = {
  /**
   * <title>, WITHOUT the brand — the root layout appends " — A&A Corporation"
   * via a Next.js title template, so naming the company here prints it twice.
   * Kept short enough that title + suffix stays near 60 characters.
   */
  metaTitle: Pair;
  /** <meta name="description">. ~150–160 characters. */
  metaDescription: Pair;
  eyebrow: Pair;
  h1: Pair;
  lead: Pair;
  intro: Pair[];
  sections: Section[];
  steps?: { heading: Pair; items: Step[] };
  faq: { q: Pair; a: Pair }[];
  /** Closing call to action. */
  ctaTitle: Pair;
};

/** One landing page with every string already resolved to the given locale. */
export type LandingContent = {
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  h1: string;
  lead: string;
  intro: string[];
  sections: { heading: string; body: string[] }[];
  steps?: { heading: string; items: { title: string; desc: string }[] };
  faq: { q: string; a: string }[];
  ctaTitle: string;
};

/**
 * Facts a landing page may quote, filled in at render time.
 *
 * Landing copy states opening hours and the minimum driver age in the middle of
 * sentences, and every one of them used to be typed as digits — eighteen copies
 * of "21 lat" across eight files, in two languages. They are placeholders now,
 * resolved from the one place each fact lives:
 *
 *   `{phone}` `{office}`  — `lib/company/service-hours`, from the admin settings
 *   `{minAge}`            — Admin → Zasady wynajmu, through the same function
 *                           the booking form refuses on
 *   `{minAgeNote}`        — the extra sentence a general page needs when the
 *                           classes differ; empty string when they do not, so
 *                           it can sit at the end of a paragraph unconditionally
 *
 * `{minAge}` is resolved PER PAGE: a page that shows only Premium cars quotes
 * the Premium threshold, so the sentence is true of the cars beside it.
 *
 * Deliberately NOT applied to `metaTitle` / `metaDescription`: those are built
 * by `landingMetadata`, which is synchronous and never reads the database. A
 * placeholder there would be published verbatim, so no fact belongs in a title
 * or a description.
 */
export type LandingFacts = {
  office: string;
  phone: string;
  minAge: number;
  minAgeNote: string;
  /**
   * Ile aut liczy CAŁA flota i ile z nich jest elektrycznych.
   *
   * Liczby, nie słowa, i liczone z bazy — nie wpisane w zdanie. Audyt
   * z 05.09.2026 znalazł na czterech landingach „flotę dziesięciu aut"
   * i „trzy z dziesięciu aut w pełni elektryczne", podczas gdy w bazie stało
   * JEDENAŚCIE aut i CZTERY elektryczne. Zdanie było prawdziwe w dniu, w którym
   * je napisano, i przestało być prawdziwe przy pierwszym dostawionym aucie —
   * a nikt nie ma obowiązku pamiętać, że dodanie samochodu w panelu wymaga
   * poprawienia akapitu w czterech plikach.
   *
   * Cyfra omija przy okazji polską odmianę: „z 11 aut" i „11 aut" są poprawne
   * tak samo, a „jedenastu/jedenaście" wymagałoby dwóch wariantów.
   */
  fleetCount: number;
  electricCount: number;
};

const fill = (value: string, facts?: LandingFacts) =>
  facts
    ? value
        .replace(/\{phone\}/g, facts.phone)
        .replace(/\{office\}/g, facts.office)
        .replace(/\{minAge\}/g, String(facts.minAge))
        .replace(/\{minAgeNote\}/g, facts.minAgeNote)
        .replace(/\{fleetCount\}/g, String(facts.fleetCount))
        .replace(/\{electricCount\}/g, String(facts.electricCount))
    : value;

export function resolveLanding(
  page: Landing,
  locale: string,
  facts?: LandingFacts,
): LandingContent {
  const one = (p: Pair) => fill(pick(p, locale), facts);
  return {
    metaTitle: pick(page.metaTitle, locale),
    metaDescription: pick(page.metaDescription, locale),
    eyebrow: one(page.eyebrow),
    h1: one(page.h1),
    lead: one(page.lead),
    intro: page.intro.map(one),
    sections: page.sections.map((s) => ({
      heading: one(s.heading),
      body: s.body.map(one),
    })),
    steps: page.steps && {
      heading: one(page.steps.heading),
      items: page.steps.items.map((i) => ({
        title: one(i.title),
        desc: one(i.desc),
      })),
    },
    faq: page.faq.map((f) => ({ q: one(f.q), a: one(f.a) })),
    ctaTitle: one(page.ctaTitle),
  };
}
