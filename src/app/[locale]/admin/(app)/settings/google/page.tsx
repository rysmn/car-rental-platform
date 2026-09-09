import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { guardPage } from "@/lib/auth/guard";
import { getSetting } from "@/lib/admin/settings";
import { GoogleMapsForm } from "../SettingsForms";

export const metadata = { title: "Google" };

/**
 * GOOGLE — własny ekran ustawień.
 *
 * Nazwa bloku to jedno słowo, od 30.08.2026. Przedtem stało tu „Google / Maps",
 * co sugerowało dwie rzeczy — osobno Google, osobno mapy — a to jest jeden
 * moduł: wizytówka, opinie, mapa i współrzędne tej samej firmy w tym samym
 * serwisie. Ukośnik w nazwie kazał właścicielowi zgadywać, pod którą połową
 * szukać opinii.
 *
 * Formularz i akcja zapisu są te same, co dotąd (`GoogleMapsForm`,
 * `updateGoogleMaps`): sześć pól nadal jedzie do trzech istniejących wierszy
 * `site_settings` — `google`, `social.googleBusiness`, `company.mapsUrl`.
 * Ta strona jest wyłącznie nowym WEJŚCIEM do tego samego modułu, żeby kafel
 * w Ustawieniach prowadził do sekcji, a nie do kotwicy w środku długiej strony
 * „Strona publiczna".
 *
 * Sekcja została stamtąd PRZENIESIONA, nie skopiowana. Ten sam formularz
 * w dwóch miejscach to dwa ekrany, na których da się wpisać dwie różne
 * wartości tego samego pola i wyjść z przekonaniem, że obie zostały zapisane —
 * a dokładnie tego zakazuje zamówienie („nie twórz drugiego zestawu ustawień").
 */
export default async function GoogleSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  /*
    Kontrola uprawnień przy renderze — jak w rozdzielaczu Ustawień. Bez niej
    operator, który wpisze adres z ręki, przeczytałby dane firmy w polach
    formularza; zapisać i tak by ich nie zapisał, bo akcja sprawdza uprawnienie
    po swojej stronie, ale czytanie to też dostęp.
  */
  await guardPage("ustawienia.zmien");

  const { locale } = await params;
  setRequestLocale(locale);

  const [google, social, company] = await Promise.all([
    getSetting("google"),
    getSetting("social"),
    getSetting("company"),
  ]);

  return (
    <div className="max-w-4xl">
      <Link
        href="/admin/settings"
        className="label-tight text-ink-faint hover:text-ink -my-2 inline-flex min-h-11 items-center text-[10px]"
      >
        ← Ustawienia
      </Link>
      <header className="mt-4 mb-8">
        <h1 className="font-heading text-ink text-2xl font-bold">GOOGLE</h1>
        <p className="text-silver mt-1 text-sm">
          Wizytówka Google, mapa, opinie i lokalizacja. Każdy element ma osobny
          przełącznik — włączony bez danych nie pokaże się klientowi.
        </p>
      </header>

      {/*
        Zdanie o tym, czego tu NIE ma, stoi wyżej niż formularz — bo pierwsze
        pytanie właściciela przy pustych polach brzmi „czy to jest zepsute".
        Nie jest: wizytówki A&A w Google jeszcze nie ma, a bez niej nie ma skąd
        wziąć ani linku, ani Place ID.
      */}
      <p className="border-line text-ink-faint mb-10 border-l-2 py-1 pl-4 text-xs">
        Puste pola nie są błędem. Linki, Place ID i współrzędne bierze się z
        wizytówki Google firmy — dopóki nie zostanie ona założona i
        zweryfikowana, nie ma czego tu wpisać, a strona publiczna po prostu nie
        pokazuje tych elementów. Nic nie trzeba tu ustawiać „na zapas”.
      </p>

      <GoogleMapsForm
        initial={google}
        profileUrl={social.googleBusiness}
        mapsUrl={company.mapsUrl}
      />
    </div>
  );
}
