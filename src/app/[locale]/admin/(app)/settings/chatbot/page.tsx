import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getSetting, CHATBOT_HARD_LIMITS } from "@/lib/admin/settings";
import { getChatbotAiPanel } from "@/lib/admin/chatbot-ai";
import { ChatbotForm } from "./ChatbotForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.settings.chatbot" });
  return { title: t("metaTitle") };
}

export default async function ChatbotSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Admin.settings.chatbot");
  const tc = await getTranslations("Admin.settings.common");

  const [settings, ai] = await Promise.all([
    getSetting("chatbot"),
    getChatbotAiPanel(),
  ]);

  return (
    <div className="max-w-3xl">
      <Link
        href="/admin/settings"
        className="-my-2 inline-flex min-h-11 items-center label-tight text-ink-faint hover:text-ink text-[10px]"
      >
        {tc("back")}
      </Link>
      <header className="mt-4 mb-8">
        <h1 className="font-heading text-ink text-2xl font-bold">
          {t("title")}
        </h1>
        <p className="text-silver mt-1 text-sm">{t("subtitle")}</p>
      </header>

      {/* The banner that used to stand here said the bot did not exist yet. It
          does now — wired to the public layout and to /api/chat, both gated on
          the same switch below — so the banner is gone rather than reworded.
          A panel that keeps a stale warning around teaches operators to ignore
          warnings. */}

      <ChatbotForm
        settings={settings}
        hardLimits={CHATBOT_HARD_LIMITS}
        ai={ai}
      />
    </div>
  );
}
