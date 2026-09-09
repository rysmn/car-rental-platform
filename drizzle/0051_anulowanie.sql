-- Anulowanie rezerwacji: status nieodebrania i wiersz należności z historią.
--
-- ══ DLACZEGO `no_show` JEST STATUSEM, A NIE ODMIANĄ „cancelled" ══
--
-- Bo to inny fakt. „Anulowana" znaczy, że klient dał znać i zrezygnował;
-- „nieodebrana" znaczy, że auto stało i czekało. Skutek dla kalendarza jest
-- ten sam (obie wychodzą z `BLOCKING_STATUSES`, więc auto wraca do puli), ale
-- dla statystyk, dla obsługi i dla rozmowy z klientem to dwie różne sprawy.
--
-- Kosztem jest przegląd każdego miejsca, które rozróżnia statusy — i to jest
-- ZALETA tego wyboru, nie wada: `Record<ReservationStatus, …>` w panelu sprawi,
-- że typy wskażą palcem każdy taki punkt, zamiast pozwolić przeoczyć któryś
-- po cichu.
--
-- `ADD VALUE IF NOT EXISTS` jest w PostgreSQL 12+ dozwolone wewnątrz
-- transakcji, dopóki nowa wartość nie zostanie w tej samej transakcji UŻYTA.
-- Ta migracja jej nie używa — wstawia tylko nazwę do typu.

ALTER TYPE reservation_status ADD VALUE IF NOT EXISTS 'no_show';

-- ══ NALEŻNOŚĆ ZA ANULOWANIE — JEDEN WIERSZ, PEŁNA HISTORIA ══
--
-- Jeden wiersz na rezerwację (`UNIQUE`), bo anulować można raz. Kwota
-- pierwotna nigdy nie jest nadpisywana: umorzenie dopisuje `waived_*`, zapłata
-- dopisuje `paid_at`, a `amount_grosze` zostaje takie, jakie było w chwili
-- naliczenia. Zamówienie mówi o tym wprost — „nie usuwaj informacji
-- o pierwotnie naliczonej opłacie".
--
-- STATUS NIE JEST KOLUMNĄ i to jest świadome. Wyprowadzamy go z wiersza
-- (`lib/booking/cancellation`: waived → umorzone, paid → zapłacone, 0 →
-- nie dotyczy, reszta → do zapłaty), tak samo jak kaucja wyprowadza swój stan
-- z ostatniego zdarzenia, a `reservations.paid_at` z wpłat pod spodem. Czwarta
-- kolumna, którą trzeba PAMIĘTAĆ, żeby zmienić razem z trzema pozostałymi,
-- rozjeżdża się przy pierwszej ścieżce, która o niej zapomni.
--
-- `policy_grosze` obok `amount_grosze`, bo sufit („nie więcej niż wartość
-- rezerwacji") musi być widoczny, a nie tylko zastosowany: klient z rezerwacją
-- za 300 zł i nieodebraniem wycenionym na 500 ma prawo zobaczyć oba te liczby,
-- zamiast domyślać się, skąd wzięło się 300.

CREATE TABLE IF NOT EXISTS reservation_cancellation_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL UNIQUE
    REFERENCES reservations(id) ON DELETE CASCADE,
  -- 'cancellation' albo 'no_show' — czym była ta należność.
  kind text NOT NULL,
  -- 'free' | 'tier1' | 'tier2' | 'no_show' — który próg zadecydował.
  tier text NOT NULL,
  -- Kwota naliczona, po zastosowaniu sufitu. NIGDY nie nadpisywana.
  amount_grosze integer NOT NULL,
  -- Kwota z cennika, przed sufitem.
  policy_grosze integer NOT NULL,
  -- Wartość rezerwacji, czyli podstawa sufitu, zapisana na wszelki wypadek:
  -- rezerwacja może później zmienić cenę, a ta należność ma zostać wyjaśnialna.
  reservation_total_grosze integer NOT NULL,
  -- Ile godzin zostawało do odbioru w chwili naliczenia. Setne części godziny
  -- wystarczą, żeby wyjaśnić próg, i nie udają dokładności do sekundy.
  hours_to_pickup numeric(8, 2),
  -- Migawka polityki, według której to policzono — ta sama, którą niesie
  -- `reservations.quote`. Skopiowana tutaj, żeby wyjaśnienie należności nie
  -- zależało od tego, czy ktoś kiedyś ruszy JSON wyceny.
  policy jsonb NOT NULL,
  charged_at timestamptz NOT NULL DEFAULT now(),
  -- NULL = naliczyła się sama, przy anulowaniu przez klienta.
  charged_by uuid REFERENCES admins(id) ON DELETE SET NULL,
  paid_at timestamptz,
  waived_at timestamptz,
  waived_by uuid REFERENCES admins(id) ON DELETE SET NULL,
  waive_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE reservation_cancellation_fees IS
  'Naleznosc za anulowanie albo nieodebranie auta. Jeden wiersz na rezerwacje; kwota pierwotna nigdy nie jest nadpisywana, a status wyprowadza sie z paid_at/waived_at.';

CREATE INDEX IF NOT EXISTS reservation_cancellation_fees_reservation_idx
  ON reservation_cancellation_fees (reservation_id);

-- Do zestawień „ile jest do zapłaty": interesują wyłącznie wiersze niezerowe,
-- niezapłacone i nieumorzone.
CREATE INDEX IF NOT EXISTS reservation_cancellation_fees_due_idx
  ON reservation_cancellation_fees (charged_at)
  WHERE paid_at IS NULL AND waived_at IS NULL AND amount_grosze > 0;

-- Kwota nie bywa ujemna, a umorzenie bez powodu nie jest umorzeniem, tylko
-- skasowaniem należności bez śladu.
ALTER TABLE reservation_cancellation_fees
  DROP CONSTRAINT IF EXISTS reservation_cancellation_fees_kwoty;
ALTER TABLE reservation_cancellation_fees
  ADD CONSTRAINT reservation_cancellation_fees_kwoty
  CHECK (amount_grosze >= 0 AND policy_grosze >= 0 AND amount_grosze <= policy_grosze);

ALTER TABLE reservation_cancellation_fees
  DROP CONSTRAINT IF EXISTS reservation_cancellation_fees_umorzenie;
ALTER TABLE reservation_cancellation_fees
  ADD CONSTRAINT reservation_cancellation_fees_umorzenie
  CHECK (waived_at IS NULL OR waive_reason IS NOT NULL);
