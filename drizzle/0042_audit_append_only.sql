-- Dziennik zdarzeń tylko do DOPISYWANIA — rozdział 13.6 punkt 7.
--
-- CO BYŁO
--
-- Panel nie miał żadnej akcji zmieniającej ani kasującej wiersz `audit_log`;
-- sekcja „Dziennik zdarzeń" to same `select`. To jest jednak własność KODU,
-- nie bazy: konto bazodanowe aplikacji mogło zrobić z tą tabelą wszystko,
-- więc jeden błąd, jedna nowa funkcja albo jedno wstrzyknięcie SQL wystarczyło,
-- żeby zatrzeć ślad po własnych działaniach. Audyt, który da się poprawić,
-- nie jest audytem.
--
-- CO ROBI TA MIGRACJA
--
-- Wyzwalacz odrzuca DELETE zawsze, a UPDATE prawie zawsze. Dopisywanie działa
-- bez zmian. Odrzucenie jest twarde (`RAISE EXCEPTION`), a nie ciche: wyzwalacz,
-- który udaje, że skasował, byłby gorszy niż jego brak, bo dawałby fałszywe
-- poczucie, że dane zniknęły.
--
-- JEDEN DOZWOLONY WYJĄTEK, I DLACZEGO
--
-- Kolumna `admin_id` ma więz `ON DELETE SET NULL`. Usunięcie konta panelu
-- WYKONUJE więc UPDATE na wszystkich jego wpisach — i gdyby wyzwalacz blokował
-- także to, usunięcie konta stałoby się niemożliwe, a panel ma taką funkcję od
-- początku. Dlatego przechodzi dokładnie jedna zmiana: `admin_id` z wartości na
-- NULL, przy WSZYSTKICH POZOSTAŁYCH KOLUMNACH NIETKNIĘTYCH. Treść wpisu —
-- akcja, obiekt, wartość przed i po, czas — pozostaje nienaruszalna, a ubytkiem
-- jest wyłącznie klucz do konta, którego już nie ma.
--
-- CZEGO TO NIE OBEJMUJE
--
-- `TRUNCATE` i `DROP TABLE` — wyzwalacz wierszowy ich nie widzi. Kto ma prawa
-- właściciela tabeli, i tak zdejmie wyzwalacz jedną komendą. Przed
-- superużytkownikiem bazy nie broni tu nic i nie ma sensu udawać, że broni:
-- to jest zabezpieczenie przed BŁĘDEM I PRZED APLIKACJĄ, nie przed
-- administratorem serwera.
--
-- SPRZĄTANIE STARYCH WPISÓW
--
-- Jeżeli kiedyś trzeba usunąć wpisy starsze niż X (RODO, rozmiar bazy), robi
-- się to z konsoli, jedną transakcją, zdejmując wyzwalacz na jej czas:
--
--   BEGIN;
--   ALTER TABLE audit_log DISABLE TRIGGER audit_log_append_only;
--   DELETE FROM audit_log WHERE created_at < now() - interval '3 years';
--   ALTER TABLE audit_log ENABLE TRIGGER audit_log_append_only;
--   COMMIT;

CREATE OR REPLACE FUNCTION aa_tylko_dopisywanie() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Jedyna dozwolona zmiana: odpięcie usuniętego konta (patrz nagłówek).
    IF OLD.admin_id IS NOT NULL
       AND NEW.admin_id IS NULL
       AND NEW.id           IS NOT DISTINCT FROM OLD.id
       AND NEW.action       IS NOT DISTINCT FROM OLD.action
       AND NEW.created_at   IS NOT DISTINCT FROM OLD.created_at
    THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION
    'Tabela % jest dziennikiem tylko do dopisywania: % jest zabronione.',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_log_append_only ON audit_log;
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION aa_tylko_dopisywanie();
--> statement-breakpoint
DROP TRIGGER IF EXISTS security_events_append_only ON security_events;
--> statement-breakpoint
CREATE TRIGGER security_events_append_only
  BEFORE UPDATE OR DELETE ON security_events
  FOR EACH ROW EXECUTE FUNCTION aa_tylko_dopisywanie();
