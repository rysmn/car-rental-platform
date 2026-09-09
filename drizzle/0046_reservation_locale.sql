-- Język klienta zapamiętany przy rezerwacji — punkt 4 zamówienia.
--
-- CO BYŁO
--
-- `reservations` nie miało kolumny języka. Formularz go zna (`useLocale()`
-- w `BookingPanel`), ale nigdzie nie zapisywał — więc każda wiadomość wysyłana
-- PÓŹNIEJ niż samo zgłoszenie nie miała skąd wiedzieć, w jakim języku pisać.
-- Admin potwierdza rezerwację nazajutrz; do tego czasu kontekst żądania dawno
-- nie istnieje.
--
-- Skutek dotychczasowy: wszystkie wiadomości do klienta były wyłącznie
-- polskie — także dla klienta, który wypełnił formularz po angielsku.
--
-- CO ROBI TA MIGRACJA
--
-- Dokłada jedną kolumnę tekstową z wartością domyślną. Ani jednego UPDATE na
-- istniejących danych, żadnego DROP, żadnej zmiany typu. Rezerwacje sprzed tej
-- zmiany dostają `'pl'` — to jest prawda historyczna, bo do tej pory każda
-- wiadomość i tak szła po polsku.
--
-- Stary obraz aplikacji nie zna tej kolumny i nie zapisuje jej przy INSERT;
-- wartość domyślna sprawia, że działa bez zmian. Migracja może więc pójść
-- przed obrazem, a wycofanie obrazu nie wymaga cofania schematu.

ALTER TABLE "reservations"
  ADD COLUMN IF NOT EXISTS "locale" text DEFAULT 'pl' NOT NULL;
