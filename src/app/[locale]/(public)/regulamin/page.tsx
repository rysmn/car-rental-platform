import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { LegalArticle } from "@/components/legal/LegalArticle";
import { LegalHtmlArticle } from "@/components/legal/LegalHtmlArticle";
import { getLegalDoc } from "@/lib/legal/content";
import { hasContent } from "@/lib/legal/sanitize";
import { getSetting } from "@/lib/admin/settings";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const doc = getLegalDoc("terms", locale);
  return {
    ...pageMetadata({
      locale,
      path: "/regulamin",
      title: doc.title,
      // Ten sam mechanizm, co w polityce prywatności: wstęp regulaminu ma dziś
      // dwa zdania i mieści się bez cięcia, więc `metaDescription` nie jest
      // ustawione — ale jeżeli kiedyś urośnie, jest gdzie zapisać opis własny.
      description: doc.metaDescription ?? doc.intro,
    }),
  };
}

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const doc = getLegalDoc("terms", locale);
  // An admin-saved version wins; otherwise the built-in document is published,
  // so the site always has terms even if nobody has touched the editor.
  const legal = await getSetting("legal");
  const override = legal.terms[locale === "en" ? "en" : "pl"];

  if (hasContent(override)) {
    return (
      <LegalHtmlArticle
        title={doc.title}
        updatedLabel={doc.updatedLabel}
        html={override}
      />
    );
  }

  return <LegalArticle doc={doc} />;
}
