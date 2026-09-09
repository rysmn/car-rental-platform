import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ModelForm } from "../ModelForm";
import { createModel } from "../actions";

export default async function NewModelPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="max-w-4xl">
      <Link
        href="/admin/fleet"
        className="-my-2 inline-flex min-h-11 items-center label-tight text-ink-faint text-[10px] transition-colors hover:text-ink"
      >
        ← Flota
      </Link>
      <h1 className="font-heading mt-4 mb-8 text-2xl text-ink">Nowy model</h1>
      <ModelForm action={createModel} />
    </div>
  );
}
