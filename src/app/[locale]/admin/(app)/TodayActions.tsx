"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { updateReservationStatus } from "./reservations/actions";

/**
 * The two things somebody does to a booking on the day itself.
 *
 * "Przyjmij" is a real state change — confirmed → completed, the transition the
 * status machine already allows — so it is a button that does the thing.
 *
 * "Wydaj" is a link, not a button, and deliberately so: handing a car over
 * means recording the odometer and walking the checklist, neither of which
 * fits in a dashboard row. Od etapu 37 prowadzi wprost do protokołu wydania —
 * czyli do tej roboty, a nie do strony rezerwacji, na której trzeba jej
 * dopiero poszukać.
 *
 * Przy zwrocie stoją obok siebie DWIE rzeczy i celowo nie są jedną: „Zwrot"
 * otwiera protokół (spisanie licznika, paliwa i wyposażenia), a „Przyjmij"
 * zamyka najem w maszynie stanów. Zlanie ich w jeden przycisk znaczyłoby, że
 * najem można zamknąć wyłącznie przez protokół — a najem sprzed tego modułu
 * albo zwrot dogadany telefonicznie trzeba dać się domknąć bez niego.
 */
export function TodayActions({
  reservationId,
  kind,
}: {
  reservationId: string;
  kind: "pickup" | "return";
}) {
  const router = useRouter();
  const t = useTranslations("Admin.dashboard");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (kind === "pickup") {
    return (
      <button
        type="button"
        onClick={() =>
          router.push(`/admin/reservations/${reservationId}/wydanie`)
        }
        className="label-tight border-line-strong hover:border-ink hover:bg-ink/5 tap inline-flex h-8 items-center border px-3 text-[10px] whitespace-nowrap transition-colors"
      >
        {t("today.handOver")}
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={() =>
          router.push(`/admin/reservations/${reservationId}/zwrot`)
        }
        className="label-tight border-line-strong hover:border-ink hover:bg-ink/5 tap inline-flex h-8 items-center border px-3 text-[10px] whitespace-nowrap transition-colors"
      >
        {t("today.returnAction")}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await updateReservationStatus({
              id: reservationId,
              to: "completed",
            });
            if (res.ok) router.refresh();
            else setError(t("today.failed"));
          })
        }
        className="label-tight bg-red hover:bg-red-hover inline-flex h-8 items-center px-3 text-[10px] whitespace-nowrap text-white transition-colors disabled:opacity-60"
      >
        {pending ? "…" : t("today.accept")}
      </button>
      {error && <span className="text-red text-[10px]">{error}</span>}
    </span>
  );
}
