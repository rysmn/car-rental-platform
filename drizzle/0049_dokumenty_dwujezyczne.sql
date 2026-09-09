-- Wszystkie dokumenty dla klienta faktycznie wychodzą — i wychodzą też po angielsku.
--
-- ══ DLACZEGO PIĘĆ DOKUMENTÓW NIE WYCHODZIŁO ══
--
-- Nie z powodu awarii i nie z powodu `auto_send`. Miały `auto_send = true`
-- i mimo to nie docierały do nikogo, bo o wysyłce nie decydował `auto_send`,
-- tylko KATEGORIA — jedno słowo zapisane na sztywno w `przypnijDokumenty`:
--
--     const komplet = await obowiazujace(locale, "booking");
--
-- Dokument spoza kategorii `booking` nigdy nie trafiał do `reservation_documents`,
-- a wysyłka bierze wyłącznie to, co jest przypięte. Przełącznik w panelu był
-- więc włączony nad mechanizmem, który go nie czytał.
--
-- To był błąd w wyborze kryterium, nie w kodzie wysyłki. Kategoria mówi, O CZYM
-- jest dokument (RODO to `privacy`, OWN to `terms`) — nie, czy ma iść do klienta.
-- Od tej migracji decyduje `auto_send`, czyli pole, które dokładnie to znaczy
-- i którym właściciel steruje z panelu. Kategoria wraca do opisywania treści.
--
-- ══ DLACZEGO KLIENT EN NIE DOSTAWAŁ NICZEGO ══
--
-- Drugi filtr w tym samym zapytaniu: `locale = 'en'`. Wszystkie dziewięć
-- dokumentów ma `locale = 'pl'`, więc angielski klient dostawał pustą listę —
-- po cichu, bez błędu i bez śladu.
--
-- Sprawdzone w TREŚCI plików, nie po nazwach: każdy z dziewięciu PDF-ów jest
-- DWUJĘZYCZNY. Nie jest to domysł z tytułu — w strukturze dokumentów siedzą
-- jawne przełączenia języka (`pl-PL` / `en-US`, od 48 do 179 na plik), a każda
-- sekcja ma nagłówek w obu językach: „1. Zakres / 1. Scope", „ZASADY KAUCJI
-- I ROZLICZENIA SZKÓD / DEPOSIT AND DAMAGE SETTLEMENT RULES". Umowa najmu ma
-- to wprost w nagłówku strony: „UMOWA NAJMU POJAZDU | PL / EN | 30.08.2026".
--
-- Stąd `bilingual` — JAWNA deklaracja w danych, nie zgadywanie z pliku przy
-- każdej wysyłce. Dokument dwujęzyczny obsługuje oba języki; dokument bez tej
-- flagi obsługuje wyłącznie swój własny. Angielski klient nie dostanie więc
-- przypadkowego polskiego pliku dlatego, że „lepszy taki niż żaden" — dostanie
-- ten sam dokument, w którym jego wersja językowa naprawdę jest.
--
-- ══ PROTOKÓŁ ZWROTU — JEDYNY WYJĄTEK ══
--
-- `pro-zwrotu` dostaje `auto_send = false`. To NIE jest zmiana zachowania:
-- ten dokument nie był wysyłany wczoraj i nie jest wysyłany dziś. Zmienia się
-- tylko to, że przełącznik przestaje pokazywać ON nad czymś, co nie działa —
-- czyli znika dokładnie ta niespójność, którą ta migracja naprawia u pozostałych.
--
-- Powód jest w treści pliku: to pusty formularz operacyjny, 63 linie
-- „________" wypełniane przy fizycznym zwrocie auta — faktyczna data zwrotu,
-- przebieg przy wydaniu i przy zwrocie, podpisy. Zamówienie mówi wprost, żeby
-- w takim wypadku nie decydować samodzielnie.
--
-- Do świadomej decyzji właściciela należy jedno: PROTOKÓŁ WYDANIA (`prot-wyd`)
-- jest formularzem dokładnie tego samego rodzaju — 37 pustych linii — i JEST
-- wysyłany klientowi. Jeśli klient ma z góry znać wzór protokołu wydania, to
-- ten sam argument dotyczy protokołu zwrotu. Włączenie to jedno kliknięcie
-- w panelu; ta migracja niczego nie przesądza.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS bilingual boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN documents.bilingual IS
  'Plik zawiera obie wersje jezykowe PL i EN, wiec obsluguje klienta w obu jezykach. Ustawiane recznie po sprawdzeniu tresci.';

-- Dziewięć dokumentów sprawdzonych w treści 30.08.2026. Po slugach, nie po
-- „wszystkie" — przyszły dokument jednojęzyczny nie ma prawa odziedziczyć tej
-- flagi tylko dlatego, że został wgrany później.
UPDATE documents
   SET bilingual = true
 WHERE locale = 'pl'
   AND slug IN (
     'umowa-najmu', 'warunki-own', 'rodo-gps', 'zasady-kam', 'tabela-oplat',
     'drugi-kierowca', 'procedura-wypadki', 'prot-wyd', 'pro-zwrotu'
   );

UPDATE documents SET auto_send = false WHERE slug = 'pro-zwrotu';

-- Wysyłka pyta teraz o `auto_send` wśród dokumentów obowiązujących, bez względu
-- na kategorię — indeks ma odpowiadać temu pytaniu.
CREATE INDEX IF NOT EXISTS documents_wysylka_idx
  ON documents (active, auto_send, effective_from)
  WHERE active AND auto_send;
