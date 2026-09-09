-- Umowy i dokumenty — punkty 15 i 16 zamówienia.
--
-- MODEL: JEDEN WIERSZ = JEDNA WERSJA
--
-- `documents` nie trzyma „dokumentu, który się zmienia" — trzyma kolejne
-- WERSJE, każdą jako osobny, niezmienny wiersz. Klucz logiczny to
-- (`slug`, `locale`, `version`). Nowa wersja regulaminu to nowy wiersz, a nie
-- UPDATE starego.
--
-- Dlaczego tak, a nie kolumną „treść, którą się nadpisuje": zamówienie mówi
-- wprost „Nie niszcz historycznej wersji zaakceptowanej/udostępnionej
-- klientowi". Klient, który dostał regulamin 12 września, dostał KONKRETNY
-- tekst; jeżeli ten sam wiersz da się nadpisać, to za pół roku nikt nie
-- odtworzy, na co ten klient patrzył. Wersja nadpisywalna jest tym samym, co
-- jej brak.
--
-- `active` mówi, która wersja jest DZIŚ obowiązująca dla danego
-- (slug, locale). Częściowy indeks unikalny niżej pilnuje, żeby była najwyżej
-- jedna — to jest reguła, której nie da się złamać z panelu, bo nie żyje
-- w panelu.
--
-- `reservation_documents` to DOWÓD: która wersja została udostępniona której
-- rezerwacji i kiedy. Bez tej tabeli pytanie „którą wersję widział ten klient"
-- nie ma odpowiedzi, a jest to jedyne pytanie, które w sporze ma znaczenie.
--
-- CZEGO TU NIE MA, ŚWIADOMIE
--
-- Ani jednej kolumny udającej podpis. Zamówienie mówi: „Nie udawaj prawnie
-- wiążącego e-podpisu zwykłym checkboxem". Kolumna `accepted_at` przy
-- checkboxie wyglądałaby jak dowód zgody i nim nie jest. Zapisujemy wyłącznie
-- to, co naprawdę zaszło: udostępnienie konkretnej wersji.
--
-- WYŁĄCZNIE ADDYTYWNE: dwie nowe tabele, zero zmian w istniejących.

CREATE TABLE IF NOT EXISTS "documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  -- Tożsamość dokumentu ponad wersjami: "umowa-najmu", "regulamin", "rodo".
  "slug" text NOT NULL,
  "locale" text NOT NULL DEFAULT 'pl',
  "version" integer NOT NULL DEFAULT 1,
  -- Kategoria decyduje, gdzie dokument się pojawia. `booking` to komplet
  -- pokazywany klientowi po potwierdzeniu rezerwacji (punkt 16).
  "category" text NOT NULL DEFAULT 'other',
  "title" text NOT NULL,
  "description" text,
  -- Ścieżka pliku w magazynie, BEZ prefiksu adresu: czytnik jest jeden
  -- i to on decyduje, pod jakim adresem plik wisi.
  "file_name" text NOT NULL,
  "file_size" integer NOT NULL DEFAULT 0,
  "mime" text NOT NULL DEFAULT 'application/pdf',
  -- Od kiedy ta wersja obowiązuje. Data, nie znacznik czasu: to jest fakt
  -- prawny z kalendarza, nie zdarzenie z zegara.
  "effective_from" date,
  "active" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid REFERENCES "admins"("id") ON DELETE set null
);
--> statement-breakpoint

-- Ta sama wersja tego samego dokumentu w tym samym języku nie może istnieć dwa razy.
CREATE UNIQUE INDEX IF NOT EXISTS "documents_wersja_unique"
  ON "documents" ("slug", "locale", "version");
--> statement-breakpoint

-- Najwyżej JEDNA aktywna wersja na (slug, locale). Indeks częściowy, bo
-- nieaktywnych wersji ma być dowolnie wiele — to jest właśnie historia.
CREATE UNIQUE INDEX IF NOT EXISTS "documents_jedna_aktywna"
  ON "documents" ("slug", "locale") WHERE "active";
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "documents_kategoria_idx"
  ON "documents" ("category", "locale");
--> statement-breakpoint

-- Dowód udostępnienia: KTÓRA wersja trafiła do KTÓREJ rezerwacji.
CREATE TABLE IF NOT EXISTS "reservation_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "reservation_id" uuid NOT NULL
    REFERENCES "reservations"("id") ON DELETE cascade,
  -- `restrict`, nie `cascade`: dokument, który ktoś dostał, nie ma prawa
  -- zniknąć razem z porządkami w katalogu dokumentów.
  "document_id" uuid NOT NULL
    REFERENCES "documents"("id") ON DELETE restrict,
  "shared_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "reservation_documents_unique"
  ON "reservation_documents" ("reservation_id", "document_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "reservation_documents_rezerwacja_idx"
  ON "reservation_documents" ("reservation_id");
