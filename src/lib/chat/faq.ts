/**
 * Matching a typed question against the FAQ entries the site already has.
 *
 * No embeddings, no external service — those were ruled out with the paid-API
 * decision, and for 23 short entries in two languages they would be a lot of
 * machinery for very little. What works instead: normalise both sides, weight
 * rare words above common ones, and add a small alias table for the handful of
 * phrases customers use that the FAQ text itself does not contain ("za granicę"
 * vs "poza Polską").
 *
 * The important part is the threshold. Below `MIN_SCORE` this returns null and
 * the assistant says it does not know — which is the whole point. A fuzzy
 * matcher with no floor answers every question with its least-bad guess, and a
 * confidently wrong answer about insurance is worse than "zapytam kolegi".
 */

import { normalize, stem } from "./nlu";

export type FaqEntry = { q: string; a: string };

export type FaqMatch = {
  entry: FaqEntry;
  score: number;
  /**
   * How much of what was ASKED this entry actually contains, 0–1.
   *
   * Separate from `score` on purpose. `score` rewards an entry for covering the
   * question well; `coverage` punishes it for the words it does not contain at
   * all. A question can score respectably on two shared words while a third —
   * the one that carries the meaning — appears nowhere in the entry, and that
   * third word is the whole difference between "gotówką" and "przelewem".
   */
  coverage: number;
  /**
   * The answer was given, but close enough to the floor that a person should
   * look at it. Drives the admin list — see `logUnanswered`.
   */
  needsReview: boolean;
  /** Runner-up, when it is close enough to be worth offering as a choice. */
  alternative: FaqEntry | null;
};

/**
 * Words too common to carry meaning. Scoring them would make every question
 * match the longest FAQ entry, which is a classic way to look broken.
 */
const STOPWORDS = new Set([
  "czy",
  "jak",
  "co",
  "to",
  "jest",
  "sa",
  "na",
  "do",
  "od",
  "za",
  "w",
  "i",
  "z",
  "the",
  "a",
  "an",
  "is",
  "are",
  "do",
  "does",
  "can",
  "i",
  "you",
  "we",
  "it",
  "of",
  "to",
  "for",
  "on",
  "in",
  "and",
  "my",
  "me",
  "your",
  "ile",
  "jaki",
  "jaka",
  "jakie",
  "ktory",
  "ktora",
  "ktore",
  "sie",
  "nie",
  "tak",
  "by",
  "be",
  "with",
  "what",
  "how",
]);

/**
 * Phrases a customer uses that do not appear verbatim in the FAQ, mapped onto
 * words that do. Kept deliberately short — every entry here is a claim that two
 * things mean the same, and a wrong claim produces a wrong answer.
 */
const ALIASES: Record<string, string[]> = {
  /**
   * The three words Polish uses for "car", which the FAQ mixes freely.
   *
   * "Czy samochód ma ubezpieczenie?" missed the entry titled "Czy auto jest
   * ubezpieczone?" — same question, different noun — and once the matcher was
   * tightened that miss turned into a refusal. Synonyms this exact are worth an
   * alias; near-synonyms are not, which is why the table stays short.
   */
  samochod: ["auto", "pojazd"],
  auto: ["samochod", "pojazd"],
  pojazd: ["auto", "samochod"],
  granic: ["zagranic", "poza", "polsk", "kraj"],
  niemiec: ["zagranic", "granic", "poza"],
  czech: ["zagranic", "granic", "poza"],
  abroad: ["border", "outside", "poland", "country"],
  germany: ["abroad", "border", "outside"],
  kaucj: ["kaucj", "zwrotn", "zabezpiecz"],
  deposit: ["deposit", "refundable", "security"],
  dowod: ["dokument", "prawo", "jazdy"],
  /**
   * „Kiedy OTRZYMAM dokumenty?" przeciwko wpisowi „Kiedy DOSTANĘ dokumenty do
   * wynajmu?" — to samo pytanie, dwa czasowniki. „Dostać" i „otrzymać" znaczą
   * tu dokładnie to samo, więc alias jest uczciwy.
   *
   * Kierunek nie jest dowolny. Rozwinięcia przechodzą przez `stem()`, więc
   * muszą dawać rdzeń, który NAPRAWDĘ stoi we wpisie: `stem("dostane")` to
   * „dostan" i tak brzmi rdzeń pytania w FAQ, natomiast `stem("otrzym")` to
   * „otrzym", a `stem("otrzymam")` zostaje „otrzymam" — alias celujący
   * w „otrzym" nie trafiłby w nic. Stąd pytanie w FAQ używa słowa klienta,
   * a alias obsługuje wariant.
   */
  otrzym: ["dostane"],
  /**
   * „DODATKOWY kierowca" przeciwko wpisowi „DRUGI kierowca". Kierunek `drugi →
   * dodatkow` był tu od dawna; brakowało powrotnego, więc pytanie zadane
   * słowem z cennika („dodatkowy kierowca" — tak nazywa tę pozycję
   * `lib/booking/fees`) nie trafiało we wpis, który o niej mówi.
   */
  /*
     „dodatkowy" JEST tu celowo, mimo że klucz to `dodatkow`.

     Aliasy rozwijane są po OBU stronach — także dla pytania wpisu. Wpis
     „Czy mogę dodać DRUGIEGO kierowcę?" dostaje przez alias `drugi` rdzeń
     „dodatkow", a pytający, który napisał „dodatkowego", ma w swoim zbiorze
     „dodatkoweg". Te dwa rdzenie to dla dopasowywacza różne słowa, więc
     „dodatkow" wyglądał jak temat wpisu, o który nikt nie pytał
     (`intrusion`) — i odpowiedź była odrzucana mimo pełnego pokrycia.
     Dopisanie tej formy do rozwinięć domyka obie strony.
  */
  dodatkow: ["drugiego", "kierowce", "dodatkowy"],
  /**
   * „Czy OBSŁUGUJECIE Modlin / Chopina / Gdańsk?" przeciwko odpowiedzi, która
   * kończy się „innych miejsc odbioru nie OBSŁUGUJEMY". Ta sama czynność,
   * dwie osoby gramatyczne, a stemmer zostawia „obslugujec" i „obslugujem"
   * jako dwa różne słowa — więc pytanie o konkretne lotnisko trafiało tylko
   * w jego nazwę i spadało poniżej progu pokrycia.
   */
  obslug: ["obslugujemy"],
  /**
   * Angielskiego stemmer nie rusza, więc „returning" i „return" to dla niego
   * dwa różne słowa — a „How does RETURNING the car work?" jest tym samym
   * pytaniem co wpis „How does the RETURN work?".
   */
  returning: ["return"],
  /**
   * „Incident" przeciwko wpisowi „What if the car BREAKS DOWN?" — klient
   * opisujący zdarzenie rzadko używa słowa „breakdown". Sam `breakdown` ma
   * już swój alias niżej, przy grupie awarii, i tam został rozszerzony.
   */
  incident: ["breaks", "down", "accident"],
  paszport: ["dokument"],
  passport: ["document", "licence", "license"],
  wiek: ["lat", "kierowc", "minimalny"],
  age: ["years", "driver", "minimum"],
  kart: ["platnosc", "zaplac", "przelew"],
  card: ["payment", "pay"],
  drugi: ["dodatkow", "kierowc"],
  // "Can I add ANOTHER driver?" against an entry titled "…a SECOND driver?" —
  // the same question, and the tightened matcher rejected it while the Polish
  // side answered. Aliases are only worth adding where two words genuinely mean
  // the same thing; these two do.
  second: ["additional", "driver", "another"],
  another: ["second", "additional", "driver"],
  /*
    „Zepsuje się" a „awaria" — to samo pytanie, dwa słowa.

    Pytanie hipotetyczne („co zrobić, JEŚLI samochód się zepsuje") celowo nie
    trafia do obsługi zdarzeń pilnych: tam idą zdania o tym, co już się stało
    („auto się zepsuło"), i odpowiedź zaczyna się od „to sprawa pilna". Na
    pytanie ogólne taka odpowiedź jest nie na temat.

    Trafiało więc do FAQ — i tam przepadało, bo wpis nazywa się „Co zrobić
    w razie AWARII" i słowa „zepsuje" nie zawiera. Klient dostawał „nie mam
    pewnej informacji" na pytanie, na które firma ma spisaną odpowiedź.
  */
  zepsu: ["awari", "usterk", "unieruchomien"],
  awari: ["zepsu", "usterk", "unieruchomien"],
  usterk: ["awari", "zepsu"],
  break: ["breakdown", "broken", "fault"],
  // `breaks` i `down` doszły 31.08.2026: wpis nazywa się „What if the car
  // BREAKS DOWN?", więc bez nich pytanie zadane słowem „breakdown" nie
  // pokrywało ani jednego słowa z jego tytułu.
  breakdown: ["break", "broken", "fault", "breaks", "down"],
  broken: ["breakdown", "break", "fault"],
  // „Pomoc drogowa" i „assistance" to w tym serwisie ta sama sprawa.
  drogow: ["assistance", "wsparcie", "awari"],
  assistance: ["drogow", "wsparcie", "breakdown"],
  stluczk: ["szkod", "ubezpiecz", "wypadek"],
  wypadek: ["szkod", "ubezpiecz"],
  accident: ["damage", "insurance"],
  paliw: ["tankow", "benzyn", "paliw"],
  fuel: ["tank", "petrol", "refuel"],
  zwierz: ["zwierz", "pies"],
  pet: ["pets", "dog"],
};

/**
 * Sentence punctuation, trimmed off the ends of a token.
 *
 * `normalize` keeps `.`, `-` and `/` on purpose — the date parser needs
 * "20.08" and "20-25" to survive it — but that also means the last word of
 * every sentence arrives as "month." and never matches the "month" two lines
 * above it. Trimming only the ends leaves dates intact and costs nothing else.
 *
 * This was silently costing the matcher the final word of all twenty answers.
 */
const trimPunct = (token: string) => token.replace(/^[./-]+|[./-]+$/g, "");

/**
 * Does this text state the same idea as `term`, allowing for the stemmer's
 * blind spots?
 *
 * The crude stemmer chops Polish inflections and leaves English mostly alone,
 * so "month" in a question and "monthly" in its own answer come out as two
 * different terms — and the intrusion test above, which needs a word to appear
 * on both sides to count it as the entry's subject, quietly saw nothing.
 *
 * That cost a real answer: "How can I rent a car?" is a strict subset of "Can I
 * rent a car for a month?", the word that distinguishes them is "month", and
 * with the two spellings not matching the customer was told about monthly rates.
 *
 * A shared prefix of five characters or more is enough to treat two stems as
 * the same idea, and short stems still have to match exactly — five characters
 * is where prefixes stop being coincidences in both languages here.
 */
function restates(text: Set<string>, term: string): boolean {
  if (text.has(term)) return true;
  if (term.length < 5) return false;
  for (const other of text) {
    if (other.length < 5) continue;
    if (other.startsWith(term) || term.startsWith(other)) return true;
  }
  return false;
}

/** Term frequency for one text, with stems and stopwords handled. */
function termSet(text: string): Set<string> {
  const out = new Set<string>();
  for (const token of normalize(text).split(" ")) {
    const raw = trimPunct(token);
    if (!raw || STOPWORDS.has(raw)) continue;
    const s = stem(raw);
    if (s.length < 3) continue;
    out.add(s);
    for (const [key, expansions] of Object.entries(ALIASES)) {
      if (raw.startsWith(key)) expansions.forEach((e) => out.add(stem(e)));
    }
  }
  return out;
}

/**
 * Inverse document frequency over the FAQ itself.
 *
 * A word appearing in twenty of twenty-three answers ("samochód") tells you
 * nothing about WHICH entry is meant; a word appearing in one ("granicę") tells
 * you everything. Computed from the entries in hand, so it adapts by itself
 * when the admin adds questions later.
 */
function buildIdf(entries: FaqEntry[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const e of entries) {
    for (const term of termSet(`${e.q} ${e.a}`)) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }
  const idf = new Map<string, number>();
  const n = Math.max(1, entries.length);
  for (const [term, count] of df) {
    idf.set(term, Math.log(1 + n / count));
  }
  return idf;
}

/**
 * What a word the FAQ has never seen is worth.
 *
 * This used to be `Math.log(2)` — the smallest weight in the system — which had
 * the logic exactly backwards. A word appearing in none of the entries is not
 * unimportant; it is the single strongest signal that the question is about
 * something we have not written down. Weighing "gotówką" at 0.69 while
 * "zapłacić" counted 3.0 is how "Czy mogę zapłacić gotówką?" came back as
 * "Tak, akceptujemy płatność przelewem".
 *
 * Now an unseen word weighs like the rarest known one, so it cannot be
 * outvoted by the filler around it.
 */
function unknownTermWeight(entries: number): number {
  return Math.log(1 + Math.max(1, entries));
}

/**
 * How similar the question is to one entry, 0–1.
 *
 * The question's own words are what get scored — an entry is a good match when
 * it covers what was ASKED, not when it happens to be long. Words in the FAQ
 * question count double: "ile wynosi kaucja" should reach the entry titled
 * "Jaka jest kaucja?" rather than the one that merely mentions deposits in its
 * answer.
 */
function score(
  asked: Set<string>,
  entry: FaqEntry,
  idf: Map<string, number>,
  unknownWeight: number,
): { score: number; coverage: number; anchor: number; intrusion: number } {
  if (asked.size === 0)
    return { score: 0, coverage: 0, anchor: 0, intrusion: 0 };
  const inQuestion = termSet(entry.q);
  const inAnswer = termSet(entry.a);

  let hit = 0;
  let total = 0;
  let covered = 0;
  let anchor = 0;
  for (const term of asked) {
    const weight = idf.get(term) ?? unknownWeight;
    total += weight;
    if (inQuestion.has(term)) {
      hit += weight * 2;
      covered += weight;
      anchor = Math.max(anchor, weight);
    } else if (inAnswer.has(term)) {
      hit += weight;
      covered += weight;
      anchor = Math.max(anchor, weight);
    }
  }

  /**
   * What this entry is about that the customer never mentioned.
   *
   * Only words the entry states TWICE — once in its question, once in its
   * answer — count here. That distinction is what makes the test safe: a word
   * carried by the question alone is almost always grammar ("Ile **wynosi**
   * kaucja?"), while a word the answer repeats is the entry's actual subject
   * ("Can I rent a car **for a month**?" → "favourable **monthly** rates").
   *
   * Ignoring this is how "How can I rent a car?" scored a flawless 1.00 against
   * the monthly-hire entry: the question is a strict subset of it, so nothing
   * measured from the question's side could ever object.
   */
  let intrusion = 0;
  for (const term of inQuestion) {
    if (asked.has(term) || !restates(inAnswer, term)) continue;
    intrusion = Math.max(intrusion, idf.get(term) ?? unknownWeight);
  }

  if (total === 0) return { score: 0, coverage: 0, anchor: 0, intrusion };
  // Divided by twice the total so a perfect question-only match scores 1.
  return {
    score: Math.min(1, hit / (total * 2)),
    coverage: covered / total,
    anchor,
    intrusion,
  };
}

/**
 * The floor below which the assistant says it does not know.
 *
 * Raised from 0.28 on 2026-08-20 after the audit. At 0.28 the matcher answered
 * essentially every question with its least-bad guess: 26 of 182 test answers
 * were confidently wrong, and because fourteen of the twenty entries open with
 * the word "Tak", a wrong guess read to the customer as a confirmation.
 *
 * The owner accepted the trade this raise makes: the assistant now says "I do
 * not have that confirmed" more often, including on some questions it used to
 * get right. An honest referral costs a phone call. "Tak" to a question about
 * insurance costs an argument.
 */
export const MIN_SCORE = 0.45;

/**
 * The second condition, and the one that does the real work.
 *
 * Score alone can be carried by the filler two questions share — "czy mogę
 * zapłacić…" against "czy można zapłacić…" — while the word that decides what
 * was actually asked appears nowhere in the entry. Coverage asks the opposite
 * question: of everything the customer said, how much does this entry contain?
 * Both must clear their floor.
 */
export const MIN_COVERAGE = 0.55;

/**
 * Answered, but not confidently. Everything between here and `MIN_SCORE` is
 * shown to the customer AND written to the admin's list marked for review —
 * see W-2 in `docs/RAPORT-CHATBOT-AUDYT.md`. Before this existed the admin list
 * held only the questions the assistant admitted to; the confident mistakes,
 * which are the dangerous ones, were invisible.
 *
 * Set at 0.8 rather than just above the floor because the scores turn out to be
 * bimodal: a match is usually either near-exact (0.85–1.00) or rejected
 * outright, and a band of 0.45–0.62 caught nothing at all in 175 test messages.
 * A feature that never fires is not a safety net. At 0.8 the band holds the
 * matches that are plausible but not obvious — which is exactly the set a
 * person should be reading.
 */
export const REVIEW_SCORE = 0.8;

/**
 * The third condition: a match has to rest on a word that means something.
 *
 * Score and coverage both compare the question against the entry, so both are
 * satisfied when a short question is a SUBSET of a longer entry. "How can I
 * rent a car?" reduces to {rent, car} once the stopwords go, and both words sit
 * inside "Can I rent a car for a month?" — a perfect 1.00 on both measures, and
 * the customer is told about monthly rates.
 *
 * The word that would have distinguished them ("month") is in the entry, not in
 * the question, so no amount of question-side arithmetic can see it. What CAN
 * be seen is that every word carrying the match — "rent", "car" — appears in
 * most of the entries and therefore selects none of them.
 *
 * So: at least one matched word must be rare enough to point at this entry
 * rather than the corpus. Expressed as a fraction of the rarest weight there
 * is, so it keeps meaning the same thing as the admin adds entries.
 */
const MIN_ANCHOR_RATIO = 0.5;

/** How close a runner-up must be to be worth offering as "czy chodziło o…". */
const ALTERNATIVE_RATIO = 0.75;

export function matchFaq(
  question: string,
  entries: FaqEntry[],
): FaqMatch | null {
  if (entries.length === 0) return null;
  const idf = buildIdf(entries);
  const asked = termSet(question);

  const unknownWeight = unknownTermWeight(entries.length);
  const ranked = entries
    .map((entry) => ({ entry, ...score(asked, entry, idf, unknownWeight) }))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  const minAnchor = unknownWeight * MIN_ANCHOR_RATIO;
  if (
    !top ||
    top.score < MIN_SCORE ||
    top.coverage < MIN_COVERAGE ||
    top.anchor < minAnchor ||
    top.intrusion >= minAnchor
  ) {
    return null;
  }

  const second = ranked[1];
  return {
    entry: top.entry,
    score: top.score,
    coverage: top.coverage,
    needsReview: top.score < REVIEW_SCORE,
    alternative:
      second &&
      second.score >= top.score * ALTERNATIVE_RATIO &&
      second.coverage >= MIN_COVERAGE &&
      second.anchor >= minAnchor &&
      second.intrusion < minAnchor
        ? second.entry
        : null,
  };
}
