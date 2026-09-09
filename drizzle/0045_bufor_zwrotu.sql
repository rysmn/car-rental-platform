-- Bufor 3 godzin między zwrotem a kolejnym wydaniem — punkt 18 zamówienia.
--
-- CO BYŁO
--
-- Jedyną rzeczą pilnującą, żeby jedno auto nie zostało wynajęte dwa razy, jest
-- ograniczenie z `drizzle/0001`:
--
--   EXCLUDE USING gist (car_id WITH =,
--                       daterange(start_date, end_date, '[]') WITH &&)
--
-- `'[]'` to przedział domknięty obustronnie: najem kończący się 12-go nadal
-- zajmuje CAŁY 12-ty, więc kolejne wydanie było możliwe najwcześniej 13-go.
-- Bufor już zatem istniał i wynosił pełną dobę, a nie trzy godziny. Godziny
-- przekazania (`pickup_time`, `return_time`) leżą w tabeli od dawna, ale były
-- z tej reguły CELOWO wyłączone — komentarz w `schema.ts` mówił wprost:
-- „a booked day is a whole booked day".
--
-- Skutek handlowy: auto zwrócone 12-go o 10:00 stało bezczynnie do 13-go rano,
-- mimo że o 13:00 było gotowe do wydania.
--
-- CO ROBI TA MIGRACJA
--
-- Zamienia dobę na chwilę. Zajętość auta liczy `aa_zajetosc()` i to jest teraz
-- JEDYNE miejsce, które o tym rozstrzyga — ta sama funkcja stoi w ograniczeniu
-- i w każdym zapytaniu o dostępność w kodzie aplikacji. Osiem miejsc
-- powtarzało dotąd ten sam predykat własnymi słowami; predykat powtórzony
-- osiem razy rozjeżdża się w dziewiątym.
--
-- DLACZEGO `tsrange`, A NIE `tstzrange`
--
-- Funkcja użyta w indeksie GiST musi być IMMUTABLE — Postgres przyjmie takie
-- oznaczenie na słowo, ale jeśli jest nieprawdziwe, indeks po cichu rozjedzie
-- się z bieżącym wyliczeniem. `AT TIME ZONE 'Europe/Warsaw'` zależy od bazy
-- stref czasowych, która zmienia się z aktualizacją obrazu — czyli byłoby to
-- oznaczenie nieprawdziwe, i to w jedynej rzeczy pilnującej podwójnej
-- rezerwacji. Dlatego przedział jest budowany na czasie LOKALNYM (biuro stoi
-- w Warszawie i godziny w bazie są warszawskie), bez strefy.
--
-- Cena tej decyzji jest znana i przyjęta: w nocy przestawienia zegara godzina
-- 02:00–03:00 występuje dwa razy albo wcale, więc bufor jest wtedy o godzinę
-- inny, niż mówi kalendarz. Alternatywą było nieprawdziwe IMMUTABLE.
--
-- BUFOR DOLICZA SIĘ TYLKO DO ZNANEJ GODZINY ZWROTU
--
-- Rezerwacje sprzed wprowadzenia godzin mają `return_time = NULL`. Dla nich
-- zostaje dokładnie dzisiejsze zachowanie — cała doba zwrotu zajęta, BEZ
-- bufora. Doliczenie go tam zacieśniłoby regułę wstecz dla każdego starego
-- wiersza: najem kończący się 12-go zaczynałby blokować 13-go do 03:00, choć
-- dziś nie blokuje 13-go wcale. Sprawdzone na prototypie — pierwsza wersja tej
-- funkcji robiła dokładnie ten błąd.
--
-- Wartość bufora jest wpisana w definicję ograniczenia, bo funkcja w indeksie
-- nie może czytać tabeli ustawień. Ta sama liczba stoi w `lib/booking/bufor.ts`
-- i `scripts/test-bufor-zwrotu.ts` pilnuje, żeby się nie rozjechały.

CREATE OR REPLACE FUNCTION aa_zajetosc(
  d_od date,
  d_do date,
  t_od time,
  t_do time,
  bufor interval
) RETURNS tsrange
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT tsrange(
    (d_od + COALESCE(t_od, '00:00'::time))::timestamp,
    CASE
      -- Godzina zwrotu ZNANA: najem kończy się o niej, a po niej idzie bufor.
      WHEN t_do IS NOT NULL THEN (d_do + t_do)::timestamp + bufor
      -- Godziny NIE MA: cała doba zwrotu zajęta, bez bufora — czyli dokładnie
      -- to, co robił `daterange(start_date, end_date, '[]')`.
      ELSE (d_do + 1)::timestamp
    END,
    '[)'
  )
$$;
--> statement-breakpoint

-- Blokady operatora (serwis, przeglądy) są i zostają DOBOWE: nikt nie wpisuje
-- godziny wyjazdu do warsztatu. Osobna funkcja, żeby porównanie zawsze szło
-- między dwoma przedziałami tego samego rodzaju.
CREATE OR REPLACE FUNCTION aa_zajetosc_bloku(d_od date, d_do date)
RETURNS tsrange
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT tsrange(d_od::timestamp, (d_do + 1)::timestamp, '[)')
$$;
--> statement-breakpoint

-- Podmiana ograniczenia. Kolejność ma znaczenie: gdyby nowe ograniczenie nie
-- dało się zbudować na istniejących danych, transakcja cofnie także usunięcie
-- starego — auto nigdy nie zostaje bez ochrony przed podwójnym najmem.
ALTER TABLE "reservations"
  DROP CONSTRAINT IF EXISTS "reservations_no_double_booking";
--> statement-breakpoint

ALTER TABLE "reservations" ADD CONSTRAINT "reservations_no_double_booking"
  EXCLUDE USING gist (
    "car_id" WITH =,
    aa_zajetosc("start_date", "end_date", "pickup_time", "return_time",
                interval '3 hours') WITH &&
  ) WHERE (status IN ('confirmed', 'completed'));
