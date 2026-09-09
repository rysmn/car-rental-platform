import { setRequestLocale } from "next-intl/server";
import { Link, type AppHref } from "@/i18n/navigation";
import { getSetting } from "@/lib/admin/settings";
import { getLegalDoc, legalDocToHtml } from "@/lib/legal/content";
import { hasContent } from "@/lib/legal/sanitize";
import { LegalEditor } from "./LegalEditor";

type Doc = "terms" | "privacy";
type Loc = "pl" | "en";

const DOCS: { key: Doc; label: string; path: string }[] = [
  { key: "terms", label: "Regulamin", path: "/regulamin" },
  {
    key: "privacy",
    label: "Polityka prywatności",
    path: "/polityka-prywatnosci",
  },
];
const LOCALES: { key: Loc; label: string }[] = [
  { key: "pl", label: "Polski" },
  { key: "en", label: "English" },
];

function Tab({
  active,
  href,
  children,
}: {
  active: boolean;
  href: AppHref;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`label-tight tap border px-4 py-2 text-[11px] transition-colors ${
        active
          ? "border-red bg-red/10 text-white"
          : "border-line-strong text-silver hover:border-ink hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}

export default async function LegalSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ doc?: string; lang?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;

  const doc: Doc = sp.doc === "privacy" ? "privacy" : "terms";
  const lang: Loc = sp.lang === "en" ? "en" : "pl";

  const legal = await getSetting("legal");
  const stored = legal[doc][lang];
  const isOverride = hasContent(stored);

  // Before anyone has saved an override, seed the editor with the built-in
  // wording so the admin edits the real document rather than a blank page.
  const initialHtml = isOverride
    ? stored
    : legalDocToHtml(getLegalDoc(doc, lang));

  const current = DOCS.find((d) => d.key === doc)!;

  return (
    <div className="max-w-4xl">
      <header className="mb-8">
        <Link
          href="/admin/settings"
          className="-my-2 inline-flex min-h-11 items-center label-tight text-silver text-[11px] transition-colors hover:text-ink"
        >
          ← Ustawienia
        </Link>
        <h1 className="font-heading mt-4 text-2xl font-bold text-ink">
          Dokumenty prawne
        </h1>
        <p className="text-silver mt-1 text-sm">
          Zapisana wersja zastępuje treść wbudowaną i jest publikowana pod{" "}
          <span className="text-ink">{current.path}</span>. Treść jest
          filtrowana pod kątem bezpieczeństwa przy zapisie.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {DOCS.map((d) => (
          <Tab
            key={d.key}
            active={d.key === doc}
            href={{
              pathname: "/admin/settings/legal",
              query: { doc: d.key, lang },
            }}
          >
            {d.label}
          </Tab>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {LOCALES.map((l) => (
          <Tab
            key={l.key}
            active={l.key === lang}
            href={{
              pathname: "/admin/settings/legal",
              query: { doc, lang: l.key },
            }}
          >
            {l.label}
          </Tab>
        ))}
      </div>

      <p className="text-ink-faint mb-4 text-xs">
        {isOverride
          ? "Publikowana jest wersja własna (edytowana w panelu)."
          : "Publikowana jest wersja wbudowana."}
      </p>

      {/* Remount the editor when the document or language changes — Tiptap keeps
          its own internal state and would otherwise show the previous text. */}
      <LegalEditor
        key={`${doc}-${lang}`}
        doc={doc}
        locale={lang}
        initialHtml={initialHtml}
        isOverride={isOverride}
      />
    </div>
  );
}
