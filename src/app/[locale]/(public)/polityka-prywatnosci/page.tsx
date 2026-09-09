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
  const doc = getLegalDoc("privacy", locale);
  return {
    ...pageMetadata({
      locale,
      path: "/polityka-prywatnosci",
      title: doc.title,
      // Opis własny, gdy wstęp prawny się do tego nie nadaje — patrz
      // `metaDescription` w `lib/legal/content`.
      description: doc.metaDescription ?? doc.intro,
    }),
  };
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const doc = getLegalDoc("privacy", locale);
  // Admin-saved version wins; the built-in document is the fallback.
  const legal = await getSetting("legal");
  const override = legal.privacy[locale === "en" ? "en" : "pl"];

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
