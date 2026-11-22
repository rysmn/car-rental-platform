/**
 * Two-language display text for values that live in lib/ (labels, hints,
 * messages). Components and actions pick the variant for the request locale
 * instead of hard-coding Polish.
 */
export type Bilingual = { readonly pl: string; readonly en: string };

/** Pick the text for a locale. Anything other than "en" gets Polish. */
export function pick(text: Bilingual, locale: string): string {
  return locale === "en" ? text.en : text.pl;
}

/** Pick a label from a keyed map of bilingual texts. */
export function pickFrom<K extends string>(
  map: Record<K, Bilingual>,
  key: K,
  locale: string,
): string {
  return pick(map[key], locale);
}
