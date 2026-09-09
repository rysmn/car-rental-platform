-- AUTO-SEND per dokument i ślad wysyłki — Admin → Umowy i dokumenty.
--
-- ══ DLACZEGO KLIENT NIE DOSTAŁ UMOWY ══
--
-- Nie dlatego, że coś się zepsuło. Mechanizm działał dokładnie tak, jak został
-- napisany: przy potwierdzeniu rezerwacji dokumenty kategorii `booking` są
-- przypinane do niej (`reservation_documents`), a w mailu potwierdzającym idzie
-- ODNOŚNIK do strony „moje rezerwacje". Sprawdzone na produkcji: rezerwacja
-- AA-302450AF, potwierdzona 30.08 o 17:10:41, ma cztery przypięte dokumenty
-- z tą samą sekundą.
--
-- Problem jest w tym, dokąd ten odnośnik prowadzi. Strona „moje rezerwacje"
-- rozpoznaje klienta po numerze i KLUCZU zapisanym w `localStorage` TEJ SAMEJ
-- przeglądarki. Klient, który rezerwował na komputerze i otworzył maila na
-- telefonie, trafia na pustą stronę. Dokument istniał, był przypisany
-- i pozostawał nieosiągalny.
--
-- ══ CO DOKŁADA TA MIGRACJA ══
--
-- `documents.auto_send` — decyzja PER DOKUMENT, czy ma iść do klienta
-- automatycznie. Domyślnie FALSE, także dla dokumentów już wgranych: włączenie
-- wysyłki dziewięciu plików bez pytania właściciela byłoby zmianą, której nikt
-- nie zamawiał. Właściciel włącza to sam, dokument po dokumencie.
--
-- `reservation_documents.sent_at` / `send_error` / `send_attempts` — ślad
-- FAKTYCZNEJ wysyłki. Bez niego panel mógłby najwyżej powiedzieć „funkcja
-- została wywołana", a to nie jest to samo, co „list doszedł". `sent_at` jest
-- równocześnie strażnikiem przed podwójną wysyłką: powtórzone potwierdzenie
-- albo odświeżona strona nie wyślą umowy drugi raz.
--
-- WYŁĄCZNIE ADDYTYWNE: cztery nowe kolumny, wszystkie z wartością domyślną,
-- zero UPDATE na istniejących danych.

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "auto_send" boolean DEFAULT false NOT NULL;
--> statement-breakpoint

-- Kiedy dokument NAPRAWDĘ wyszedł. NULL = nie wyszedł.
ALTER TABLE "reservation_documents"
  ADD COLUMN IF NOT EXISTS "sent_at" timestamp with time zone;
--> statement-breakpoint

-- Treść ostatniego niepowodzenia — do pokazania obsłudze, nie klientowi.
ALTER TABLE "reservation_documents"
  ADD COLUMN IF NOT EXISTS "send_error" text;
--> statement-breakpoint

-- Ile razy próbowano. Odróżnia „nigdy nie próbowano" od „próbowano i nie wyszło".
ALTER TABLE "reservation_documents"
  ADD COLUMN IF NOT EXISTS "send_attempts" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint

-- Dokumenty do automatycznej wysyłki wybierane są przy każdym potwierdzeniu
-- rezerwacji, więc pytanie „które są aktywne i mają auto_send" pada często.
CREATE INDEX IF NOT EXISTS "documents_autosend_idx"
  ON "documents" ("auto_send", "active") WHERE "auto_send";
