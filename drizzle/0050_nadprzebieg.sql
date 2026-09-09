-- Opłata za dodatkowy kilometr — JEDNO pole, jedno źródło prawdy.
--
-- ══ DLACZEGO KOLUMNA, A NIE TABELA ══
--
-- Stawka za nadprzebieg jest własnością MODELU, dokładnie tak samo jak cena
-- dobowa, kaucja i limit kilometrów, które stoją w tym samym wierszu obok.
-- Osobna tabela `vehicle_mileage_fees` dołożyłaby złączenie do każdego
-- zapytania o auto i — co gorsza — drugie miejsce, w którym można ustawić
-- cenę pojazdu. Zamówienie mówi o tym wprost: nie pięć cenników, jeden.
--
-- ══ DLACZEGO NULL, A NIE ZERO ══
--
-- To jest ta sama zasada, którą projekt ma już zapisaną w `isPriceOnRequest`:
-- „zero to nie cena, tylko zdanie «zapytaj mnie»". Przy nadprzebiegu jest
-- jeszcze ostrzej — `0` znaczyłoby, że każdy kilometr ponad limit jest DARMOWY,
-- i strona pokazywałaby klientowi „0,00 zł/km" jako obietnicę. Dlatego kolumna
-- jest NULL-owalna, a `NULL` czyta się jednoznacznie: stawki nie ustawiono,
-- więc nic się nie wyświetla i nic się nie nalicza. Wymyślanie liczby dla auta,
-- którego właściciel nie wycenił, jest zakazane wprost w zamówieniu.
--
-- ══ DLACZEGO GROSZE ══
--
-- Cała reszta pieniędzy w tej bazie jest w groszach (`daily_price_grosze`,
-- `deposit_grosze`, `amount_grosze`). Stawka 4,50 zł/km to 450 groszy.
-- Liczba całkowita nie ma błędu zaokrąglenia, którego `numeric(10,2)` uniknąłby
-- kosztem osobnej konwencji na jedną kolumnę — a 100 km × 450 gr = 45 000 gr
-- jest dokładne, nie „450.00000000001".

ALTER TABLE car_models
  ADD COLUMN IF NOT EXISTS extra_mileage_fee_grosze integer;

COMMENT ON COLUMN car_models.extra_mileage_fee_grosze IS
  'Oplata za kazdy kilometr ponad limit, w groszach za km. NULL = stawki nie ustawiono (nic nie pokazujemy i nic nie naliczamy); 0 jest niedozwolone przez CHECK, bo znaczyloby darmowy nadprzebieg.';

-- Zero jest odcięte na poziomie bazy, nie tylko w formularzu. Panel waliduje
-- to samo, ale panel to jedna z dróg do tej kolumny — skrypt, import i ręczny
-- UPDATE to trzy pozostałe.
ALTER TABLE car_models
  DROP CONSTRAINT IF EXISTS car_models_extra_mileage_fee_dodatnia;
ALTER TABLE car_models
  ADD CONSTRAINT car_models_extra_mileage_fee_dodatnia
  CHECK (extra_mileage_fee_grosze IS NULL OR extra_mileage_fee_grosze > 0);

-- ══ STAWKI WŁAŚCICIELA, 01.09.2026 ══
--
-- Po SLUGU, nie po nazwie marki i modelu. Nazwa jest polem edytowalnym
-- w panelu — zmiana „GLE 350" na „GLE 350 de 4MATIC" nie może rozłączyć auta
-- od jego stawki. Slug jest kluczem publicznego adresu i się nie zmienia bez
-- przekierowania.
--
-- Każda z tych dziesięciu liczb pochodzi WPROST od właściciela. Żadna nie jest
-- wyprowadzona z ceny dobowej, z segmentu ani z kaucji — auto spoza tej listy
-- zostaje z NULL i czeka na decyzję, zamiast dostać wartość „pasującą do klasy".
UPDATE car_models SET extra_mileage_fee_grosze = 500 WHERE slug = 'porsche-panamera-turbo-4s';
UPDATE car_models SET extra_mileage_fee_grosze = 450 WHERE slug = 'bmw-740d';
UPDATE car_models SET extra_mileage_fee_grosze = 450 WHERE slug = 'tesla-model-s';
UPDATE car_models SET extra_mileage_fee_grosze = 400 WHERE slug = 'mercedes-gle-350-de-4matic';
UPDATE car_models SET extra_mileage_fee_grosze = 400 WHERE slug = 'tesla-model-x';
UPDATE car_models SET extra_mileage_fee_grosze = 400 WHERE slug = 'jaguar-i-pace';
UPDATE car_models SET extra_mileage_fee_grosze = 300 WHERE slug = 'volvo-xc60';
UPDATE car_models SET extra_mileage_fee_grosze = 200 WHERE slug = 'toyota-rav4';
UPDATE car_models SET extra_mileage_fee_grosze = 200 WHERE slug = 'volkswagen-tiguan-highline';
UPDATE car_models SET extra_mileage_fee_grosze = 200 WHERE slug = 'renault-trafic';
