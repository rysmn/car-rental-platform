import { Link } from "@/i18n/navigation";
import type { DocumentAlert } from "@/lib/admin/stats";

// Spelled out here rather than reusing the email's shorter "OC/AC": the panel
// has the width, and this list is read by whoever has to act on it.
const KIND_LABEL: Record<DocumentAlert["kind"], string> = {
  insurance: "Ubezpieczenie OC/AC",
  inspection: "Przegląd",
  service: "Serwis",
};

function formatPl(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/**
 * Expiring paperwork, worst first.
 *
 * Overdue is stated in plain words rather than a negative number — "po
 * terminie 4 dni" is a sentence somebody acts on; "-4" is a puzzle. An empty
 * list says so explicitly, because a blank space reads as "not loaded yet"
 * rather than "nothing to do".
 */
export function DocumentAlerts({
  alerts,
  limit,
}: {
  alerts: DocumentAlert[];
  limit?: number;
}) {
  if (alerts.length === 0) {
    return (
      <p className="border-line text-silver border px-5 py-6 text-center text-sm">
        Brak terminów w ciągu najbliższych 30 dni — dokumenty ważne, serwisy
        zaplanowane dalej.
      </p>
    );
  }

  const shown = limit ? alerts.slice(0, limit) : alerts;

  return (
    <>
      <ul className="border-line divide-line divide-y border">
        {shown.map((a) => (
          <li
            key={`${a.carId}-${a.kind}`}
            className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
          >
            <span className="text-sm text-ink">
              {KIND_LABEL[a.kind]}
              <span className="text-ink-faint ml-3 text-xs">
                {a.carName} · {a.plate} · {formatPl(a.date)}
              </span>
            </span>
            <span
              className={
                a.level === "overdue"
                  ? "label-tight bg-red px-2 py-1 text-[10px] whitespace-nowrap text-white"
                  : "label-tight border-red/50 text-red border px-2 py-1 text-[10px] whitespace-nowrap"
              }
            >
              {a.level === "overdue"
                ? `Po terminie ${Math.abs(a.daysLeft)} dni`
                : a.daysLeft === 0
                  ? "Wygasa dziś"
                  : `Zostało ${a.daysLeft} dni`}
            </span>
          </li>
        ))}
      </ul>
      {limit && alerts.length > limit && (
        <Link
          href="/admin/analytics"
          className="label-tight text-silver mt-3 inline-block text-[10px] transition-colors hover:text-ink"
        >
          Wszystkie przypomnienia ({alerts.length}) →
        </Link>
      )}
    </>
  );
}
