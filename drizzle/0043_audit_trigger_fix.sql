-- Poprawka wyzwalacza z migracji 0042 — znaleziona testem 27.08.2026.
--
-- CO BYŁO ŹLE
--
-- Funkcja `aa_tylko_dopisywanie()` sprawdzała `NEW.action`, żeby upewnić się,
-- że przy odpinaniu usuniętego konta nie zmienia się treść wpisu. Kolumna
-- `action` istnieje w `audit_log` — i NIE ISTNIEJE w `security_events`,
-- do której ten sam wyzwalacz jest podpięty. PL/pgSQL rozstrzyga typy dopiero
-- przy wykonaniu, więc błąd nie ujawnił się przy tworzeniu wyzwalacza, tylko
-- przy pierwszym usunięciu konta panelu:
--
--     record "new" has no field "action"
--
-- Skutek: usunięcie konta administracyjnego, które zostawiło choć jedno
-- zdarzenie bezpieczeństwa, kończyło się błędem bazy. Złapał to test
-- `e2e-bezpieczenstwo-13.mjs` przy sprzątaniu kont testowych.
--
-- POPRAWKA
--
-- Sprawdzamy wyłącznie kolumny, które mają OBIE tabele: `id` i `created_at`.
-- To wystarcza: kaskada `ON DELETE SET NULL` zmienia dokładnie `admin_id`,
-- a wiersz o tym samym `id` i `created_at` jest tym samym wierszem. Reszta
-- kolumn i tak nie ma jak się zmienić w tej operacji, a wypisywanie ich
-- z nazwy okazało się właśnie tym, co zepsuło działanie.

CREATE OR REPLACE FUNCTION aa_tylko_dopisywanie() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Jedyna dozwolona zmiana: odpięcie usuniętego konta.
    IF OLD.admin_id IS NOT NULL
       AND NEW.admin_id IS NULL
       AND NEW.id         IS NOT DISTINCT FROM OLD.id
       AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
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
