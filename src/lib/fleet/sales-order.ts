import { SALES_TONE_RANK, salesStatusView, type FleetState } from "./status";
import type { FleetCar } from "./types";

/**
 * Kolejność aut na PUBLICZNEJ siatce: najpierw to, co klient może wynająć.
 *
 * ## Czego ta funkcja NIE robi
 *
 * Nie dotyka danych administratora. Kolejność w panelu, kolejność w bazie,
 * `car_models.sort_order` i cokolwiek jeszcze operator ustawił ręcznie —
 * wszystko zostaje na miejscu. To jest wyłącznie porządek WYŚWIETLANIA
 * na stronie publicznej i nic poza nią z niego nie korzysta.
 *
 * Nie zmienia też składu siatki. Filtr dat, filtr klasy i filtr budżetu
 * decydują, KTÓRE auta się pokazują; ta funkcja decyduje tylko, w jakiej
 * kolejności. Wpięta jest za filtrami właśnie dlatego — żeby nie mogła
 * przypadkiem czegokolwiek dodać ani usunąć.
 *
 * ## Dlaczego sortowanie jest stabilne
 *
 * Wewnątrz jednej grupy (np. wszystkie dostępne) kolejność zostaje dokładnie
 * ta, którą dał operator. Sortowanie po samym stanie przetasowałoby flotę przy
 * każdym wynajęciu jednego auta i klient wracający na stronę zastałby inny
 * układ bez powodu, który da się zobaczyć. `Array.prototype.sort` jest stabilne
 * w każdym silniku od ES2019, a indeks w kluczu jest tu drugim zabezpieczeniem,
 * nie ozdobą.
 *
 * ## Skąd bierze się grupa
 *
 * Z `salesStatusView`, czyli z tego samego zdania, które klient przeczyta na
 * pigułce. Gdyby kolejność liczyła się z osobnej reguły, siatka mówiłaby jedno,
 * a napis drugie — i nikt by tego nie zauważył, bo obie wersje wyglądają dobrze
 * osobno.
 */
export function sortForSales<T extends Pick<FleetCar, "id">>(
  cars: readonly T[],
  states: Map<string, FleetState>,
  nextFreeByModel: Map<string, string>,
  today: string,
  locale: string,
): T[] {
  /*
    Statusy wyłączone w panelu = jedna grupa dla wszystkich.

    Gdy operator schował statusy, klient nie widzi, DLACZEGO jedno auto stoi
    wyżej od drugiego, a kolejność i tak by się zmieniała. Wtedy lepszy jest
    porządek, który operator ustawił świadomie.
  */
  if (states.size === 0) return [...cars];

  return cars
    .map((car, i) => {
      const view = salesStatusView(
        states.get(car.id) ?? null,
        nextFreeByModel.get(car.id) ?? null,
        today,
        locale,
      );
      /*
        Auto bez stanu (model bez egzemplarzy) ląduje razem z „sprawdź
        dostępność", a nie na końcu: nie wiemy o nim nic złego, więc nie ma
        powodu, żeby chować je za serwisem.
      */
      return { car, i, rank: view ? SALES_TONE_RANK[view.tone] : 2 };
    })
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.car);
}
