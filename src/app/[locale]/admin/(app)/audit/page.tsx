import { getTranslations, setRequestLocale } from "next-intl/server";
import { useTranslations } from "next-intl";
import { guardPage } from "@/lib/auth/guard";
import { Link } from "@/i18n/navigation";
import {
  listAudit,
  isAuditCategory,
  AUDIT_CATEGORIES,
  type AuditEntry,
} from "@/lib/admin/audit";
import { formatDateTimePl } from "@/lib/format";

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  /*
    Kontrola uprawnień przy renderze strony — obok kontroli w każdej akcji,
    nie zamiast niej. Bez tego pracownik wpisujący adres z ręki zobaczyłby
    treść sekcji, której nie wolno mu oglądać, i dopiero pierwszy przycisk
    powiedziałby mu „nie wolno".
  */
  await guardPage("audyt.podglad");

  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations("Admin.audit");

  const category = isAuditCategory(sp.category) ? sp.category : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const { items, total, pageSize } = await listAudit({ category, page });
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const pageHref = (n: number) => ({
    pathname: "/admin/audit" as const,
    query: {
      ...(category ? { category } : {}),
      ...(n > 1 ? { page: String(n) } : {}),
    },
  });

  return (
    <div>
      <header className="mb-8">
        <h1 className="font-heading text-ink text-2xl">{t("title")}</h1>
        <p className="text-silver mt-1 text-sm">
          {t("subtitle", { count: total })}
        </p>
      </header>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="label-tight text-ink-faint text-[10px]">
            {t("filter.category")}
          </span>
          <select
            name="category"
            defaultValue={category ?? ""}
            className="border-line-strong bg-surface-1 text-ink h-11 border px-3 text-sm"
          >
            <option value="">{t("filter.all")}</option>
            {AUDIT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`categories.${c}`)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 inline-flex h-11 items-center border px-6 text-xs transition-colors"
        >
          {t("filter.apply")}
        </button>
        {category && (
          <Link
            href="/admin/audit"
            className="label text-ink-faint hover:text-ink inline-flex h-11 items-center px-3 text-xs transition-colors"
          >
            {t("filter.clear")}
          </Link>
        )}
      </form>

      {items.length === 0 ? (
        <p className="border-line bg-graphite/40 text-silver border p-10 text-center text-sm">
          {t("empty")}
        </p>
      ) : (
        <ul className="divide-line border-line divide-y border">
          {items.map((e) => (
            <AuditRow key={e.id} entry={e} />
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className="mt-6 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link
              href={pageHref(page - 1)}
              className="text-silver hover:text-ink tap"
            >
              {t("newer")}
            </Link>
          ) : (
            <span className="text-ink-faint opacity-40">{t("newer")}</span>
          )}
          <span className="text-ink-faint">
            {t("pageOf", { page, pages })}
          </span>
          {page < pages ? (
            <Link
              href={pageHref(page + 1)}
              className="text-silver hover:text-ink tap"
            >
              {t("older")}
            </Link>
          ) : (
            <span className="text-ink-faint opacity-40">{t("older")}</span>
          )}
        </nav>
      )}
    </div>
  );
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const t = useTranslations("Admin.audit");
  const category = entry.action.split(".")[0];
  const actionKey = entry.action
    .split(".")
    .map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join("");
  const actionLabel = t.has(`actions.${actionKey}`)
    ? t(`actions.${actionKey}`)
    : entry.action;
  const hasDetail = entry.before != null || entry.after != null;

  return (
    <li className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="label-tight text-ink-faint w-24 shrink-0 text-[10px]">
            {isAuditCategory(category) ? t(`categories.${category}`) : category}
          </span>
          <span className="text-ink text-sm">{actionLabel}</span>
          {entry.entity && (
            <span className="text-ink-faint font-mono text-xs">
              {entry.entity}
              {entry.entityId ? `:${entry.entityId.slice(0, 8)}` : ""}
            </span>
          )}
        </div>
        <div className="text-ink-faint flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
          <span>{entry.adminEmail ?? t("system")}</span>
          {entry.ip && <span className="font-mono">{entry.ip}</span>}
          <time className="text-silver">
            {formatDateTimePl(entry.createdAt)}
          </time>
        </div>
      </div>
      {hasDetail && (
        <details className="mt-2">
          <summary className="text-ink-faint hover:text-ink tap-area cursor-pointer text-xs">
            {t("details")}
          </summary>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
            <JsonBlock title={t("before")} value={entry.before} />
            <JsonBlock title={t("after")} value={entry.after} />
          </div>
        </details>
      )}
    </li>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  if (value == null) return null;
  return (
    // `min-w-0`: bez tego rodzic rośnie do szerokości najdłuższej linii JSON-a
    // (ponad 1000 px), a `overflow-x-auto` na `pre` nie ma czego przewijać.
    <div className="min-w-0">
      <p className="label-tight text-ink-faint mb-1 text-[10px]">{title}</p>
      <pre className="border-line text-silver bg-surface-1 overflow-x-auto border p-3 font-mono text-[11px]">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
