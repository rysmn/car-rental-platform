import { NextResponse } from "next/server";
import { can } from "@/lib/auth/permissions";
import { currentAdmin } from "@/lib/auth/guard";
import {
  getFleetEconomics,
  getCarEconomics,
  getMonthlySeries,
  totalsOf,
} from "@/lib/admin/economics";
import { listCarExpenses } from "@/lib/admin/expenses";
import {
  EXPENSE_LABEL,
  EXPENSE_GROUP_LABEL,
  EXPENSE_GROUP_OF,
} from "@/lib/admin/expense-options";
import { buildXlsx, zl, type Sheet } from "@/lib/reports/xlsx";

/**
 * Excel export for the fleet economics.
 *
 * A route handler rather than a server action: the browser has to receive this
 * as a file download with a filename, and an action returns a value to React.
 *
 * Guarded by `currentAdmin()` like every other admin surface. `/api/` is
 * disallowed in robots.txt, but that is a crawling hint and not the protection
 * — the auth check is.
 */

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MONTHS = 24;

/** "2026-08" → "sierpień 2026", for a human reading the sheet. */
function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("pl-PL", {
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** Today, for the filename. Not a locale format — filenames want sortable. */
function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const admin = await currentAdmin();
  if (!admin) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  /*
    Eksport ekonomiki floty to WYNIESIENIE DANYCH z systemu — plik zostaje na
    dysku, w poczcie, na pendrivie i już nigdy nie podlega uprawnieniom.
    Pracownik obsługujący wydania nie ma powodu go pobierać, więc od rozdziału
    13.6 trasa pyta o uprawnienie, a nie tylko o zalogowanie.

    Osobisto: ten raport NIE zawiera danych klientów (patrz nagłówki arkusza) —
    gdyby kiedyś zaczął, uprawnieniem musi się stać `klienci.eksport`.
  */
  if (!can(admin.role, "finanse.podglad")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const carId = url.searchParams.get("auto");

  if (carId) {
    if (!UUID_RE.test(carId)) {
      return new NextResponse("Not found", { status: 404 });
    }
    const [economics, months, expenses] = await Promise.all([
      getCarEconomics(carId),
      getMonthlySeries(MONTHS, carId),
      listCarExpenses(carId),
    ]);
    if (!economics) return new NextResponse("Not found", { status: 404 });
    const e = economics;

    const summary: Sheet = {
      name: "Podsumowanie",
      columns: [
        { header: "Wskaźnik", width: 34 },
        { header: "Wartość", width: 22, format: "money" },
      ],
      rows: [
        ["Egzemplarz", `${e.plate} — ${e.carName}`],
        ["Liczone od", e.since],
        ["Dni w firmie", e.daysOwned],
        [
          "Cena zakupu",
          e.purchasePriceGrosze == null
            ? "nie podano"
            : zl(e.purchasePriceGrosze),
        ],
        ["Data zakupu", e.purchasedOn ?? "nie podano"],
        ["Przychód", zl(e.revenueGrosze)],
        ["Wydatki", zl(e.expensesGrosze)],
        ["Marża", zl(e.marginGrosze)],
        [
          "Marża %",
          e.marginPct == null
            ? "brak przychodu"
            : `${Math.round(e.marginPct * 100)}%`,
        ],
        ["Wynajmy", e.rentals],
        ["Dni wynajęte", e.daysRented],
        ["Dni wolne (nikt nie zarezerwował)", e.daysFree],
        ["Dni zablokowane (serwis, blokady)", e.daysBlocked],
        ["Wykorzystanie %", `${Math.round(e.utilisation * 100)}%`],
        ["Przychód na dobę", zl(e.revenuePerDayGrosze)],
        ["Koszt na dobę", zl(e.costPerDayGrosze)],
        ["Wynik na dobę", zl(e.netPerDayGrosze)],
        ["Koszty stałe na dobę", zl(e.standingPerDayGrosze)],
        ["Koszt postoju", zl(e.idleCostGrosze)],
        [
          "Amortyzacja do dziś",
          e.depreciationToDateGrosze == null
            ? "brak ustawień"
            : zl(e.depreciationToDateGrosze),
        ],
        [
          "Wartość księgowa",
          e.bookValueGrosze == null ? "brak ustawień" : zl(e.bookValueGrosze),
        ],
        [
          "Marża po amortyzacji",
          e.tcoMarginGrosze == null ? "brak ustawień" : zl(e.tcoMarginGrosze),
        ],
        ["Przejechane km", e.kmDriven],
        ["Wynajmy ze stanem licznika", `${e.rentalsWithKm} z ${e.rentals}`],
        [
          "Koszt na km",
          e.costPerKmGrosze == null ? "brak licznika" : zl(e.costPerKmGrosze),
        ],
        [
          "Przychód na km",
          e.revenuePerKmGrosze == null
            ? "brak licznika"
            : zl(e.revenuePerKmGrosze),
        ],
        [
          "Zwrócone z zakupu",
          e.recoveredGrosze == null ? "brak ceny" : zl(e.recoveredGrosze),
        ],
        [
          "Zwrot %",
          e.recoveredPct == null
            ? "brak ceny"
            : `${Math.round(e.recoveredPct * 100)}%`,
        ],
        [
          "Zostało do zwrotu",
          e.remainingGrosze == null ? "brak ceny" : zl(e.remainingGrosze),
        ],
        [
          "Przewidywany zwrot",
          e.purchasePriceGrosze == null
            ? "brak ceny"
            : e.marginGrosze >= e.purchasePriceGrosze
              ? "zwrócone"
              : (e.paybackOn ?? "nie przy tym tempie"),
        ],
      ],
    };

    return xlsxResponse(
      [
        summary,
        monthsSheet(months),
        {
          name: "Wydatki",
          columns: [
            { header: "Data", width: 12 },
            { header: "Grupa", width: 18 },
            { header: "Rodzaj", width: 24 },
            { header: "Kwota", format: "money" },
            { header: "Okres od", width: 12 },
            { header: "Okres do", width: 12 },
            { header: "Cykliczny", width: 11 },
            { header: "Faktura", width: 10 },
            { header: "Przebieg", format: "number" },
            { header: "Opis", width: 40 },
          ],
          rows: expenses.map((x) => [
            x.incurredOn,
            EXPENSE_GROUP_LABEL[EXPENSE_GROUP_OF[x.category]],
            EXPENSE_LABEL[x.category],
            zl(x.amountGrosze),
            x.periodStart,
            x.periodEnd,
            x.recurringId ? "tak" : "",
            x.invoicePath ? "tak" : "",
            x.odometerKm,
            x.note,
          ]),
        },
      ],
      `raport-${e.plate.replace(/\s+/g, "")}-${stamp()}.xlsx`,
    );
  }

  const [cars, months] = await Promise.all([
    getFleetEconomics(),
    getMonthlySeries(MONTHS),
  ]);
  const totals = totalsOf(cars);

  const fleet: Sheet = {
    name: "Flota",
    columns: [
      { header: "Rejestracja", width: 14 },
      { header: "Auto", width: 26 },
      { header: "Od", width: 12 },
      { header: "Dni w firmie", format: "number" },
      { header: "Wynajmy", format: "number" },
      { header: "Dni wynajęte", format: "number" },
      { header: "Dni wolne", format: "number" },
      { header: "Dni zablokowane", format: "number" },
      { header: "Wykorzystanie", format: "percent" },
      { header: "Przychód", format: "money" },
      { header: "Wydatki", format: "money" },
      { header: "Marża", format: "money" },
      { header: "Marża %", format: "percent" },
      { header: "Wynik / doba", format: "money" },
      { header: "Koszt postoju", format: "money" },
      { header: "Cena zakupu", format: "money" },
      { header: "Amortyzacja", format: "money" },
      { header: "Marża po amort.", format: "money" },
      { header: "Km", format: "number" },
      { header: "Koszt / km", format: "money" },
      { header: "Zwrot", format: "percent" },
      { header: "Przewidywany zwrot", width: 20 },
    ],
    rows: cars.map((c) => [
      c.plate,
      c.carName,
      c.since,
      c.daysOwned,
      c.rentals,
      c.daysRented,
      c.daysFree,
      c.daysBlocked,
      c.utilisation,
      zl(c.revenueGrosze),
      zl(c.expensesGrosze),
      zl(c.marginGrosze),
      c.marginPct,
      zl(c.netPerDayGrosze),
      zl(c.idleCostGrosze),
      c.purchasePriceGrosze == null ? null : zl(c.purchasePriceGrosze),
      c.depreciationToDateGrosze == null
        ? null
        : zl(c.depreciationToDateGrosze),
      c.tcoMarginGrosze == null ? null : zl(c.tcoMarginGrosze),
      c.kmDriven || null,
      c.costPerKmGrosze == null ? null : zl(c.costPerKmGrosze),
      c.recoveredPct,
      c.purchasePriceGrosze == null
        ? "brak ceny"
        : c.marginGrosze >= c.purchasePriceGrosze
          ? "zwrócone"
          : (c.paybackOn ?? "nie przy tym tempie"),
    ]),
  };

  const summary: Sheet = {
    name: "Podsumowanie",
    columns: [
      { header: "Wskaźnik", width: 34 },
      { header: "Wartość", width: 22, format: "money" },
    ],
    rows: [
      ["Raport wygenerowany", stamp()],
      ["Egzemplarzy", totals.cars],
      ["Przychód", zl(totals.revenueGrosze)],
      ["Wydatki", zl(totals.expensesGrosze)],
      ["Marża", zl(totals.marginGrosze)],
      [
        "Marża %",
        totals.marginPct == null
          ? "brak przychodu"
          : `${Math.round(totals.marginPct * 100)}%`,
      ],
      ["Kapitał w autach", zl(totals.investedGrosze)],
      ["Auta bez ceny zakupu", totals.carsWithoutPrice],
      ["Zwrócone z kapitału", zl(totals.recoveredGrosze)],
      [
        "Zwrot %",
        totals.recoveredPct == null
          ? "brak cen zakupu"
          : `${Math.round(totals.recoveredPct * 100)}%`,
      ],
      ["Wykorzystanie floty %", `${Math.round(totals.utilisation * 100)}%`],
      ["Dni wolne", totals.daysFree],
      ["Dni zablokowane", totals.daysBlocked],
      ["Koszt postoju", zl(totals.idleCostGrosze)],
      ["Amortyzacja floty", zl(totals.depreciationToDateGrosze)],
      ["Auta bez amortyzacji", totals.carsWithoutDepreciation],
      [
        "Marża po amortyzacji",
        totals.tcoMarginGrosze == null
          ? "brak ustawień"
          : zl(totals.tcoMarginGrosze),
      ],
      ["Przejechane km", totals.kmDriven],
      [
        "Koszt na km",
        totals.costPerKmGrosze == null
          ? "brak licznika"
          : zl(totals.costPerKmGrosze),
      ],
    ],
  };

  return xlsxResponse(
    [summary, fleet, monthsSheet(months)],
    `raport-flota-${stamp()}.xlsx`,
  );
}

function monthsSheet(
  months: Awaited<ReturnType<typeof getMonthlySeries>>,
): Sheet {
  return {
    name: "Miesiące",
    columns: [
      { header: "Miesiąc", width: 18 },
      { header: "Przychód", format: "money" },
      { header: "Wydatki", format: "money" },
      { header: "Marża", format: "money" },
      { header: "Dni wynajęte", format: "number" },
    ],
    rows: months.map((m) => [
      monthLabel(m.month),
      zl(m.revenueGrosze),
      zl(m.expenseGrosze),
      zl(m.marginGrosze),
      m.daysRented,
    ]),
  };
}

function xlsxResponse(sheets: Sheet[], filename: string): NextResponse {
  const buf = buildXlsx(sheets);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      // The ASCII fallback plus the RFC 5987 form: the filename carries no
      // Polish characters today, but a plate or a model name could, and a bare
      // `filename=` with a non-ASCII byte is dropped by some browsers.
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
