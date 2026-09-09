import {
  STATUS_LABEL,
  type ReservationStatus,
} from "@/lib/admin/reservation-status";
import { cn } from "@/lib/utils";

const STYLES: Record<ReservationStatus, string> = {
  // Stan przejściowy, nie decyzja obsługi — najbledszy z możliwych, żeby nie
  // konkurował wzrokowo ze zgłoszeniem, które NAPRAWDĘ czeka na człowieka.
  pending_verification: "border-line text-ink-faint",
  pending: "border-line-strong text-silver",
  confirmed: "border-red text-ink",
  completed: "border-line text-silver",
  cancelled: "border-line text-ink-faint",
  // Mocniej niż anulowana i słabiej niż odrzucona: nieodebranie kosztuje
  // klienta pieniądze, więc nie może zniknąć wzrokowo wśród spraw zamkniętych
  // po dobremu — ale nie jest też odmową obsługi.
  no_show: "border-red text-red",
  rejected: "border-line text-red",
};

export function StatusBadge({ status }: { status: ReservationStatus }) {
  return (
    <span
      className={cn(
        "label-tight inline-block border px-2 py-1 text-[10px] whitespace-nowrap",
        STYLES[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
