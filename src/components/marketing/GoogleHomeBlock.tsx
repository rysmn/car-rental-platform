import type { GoogleView } from "@/lib/company/google";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/motion/Reveal";
import { GoogleReviewBar } from "@/components/marketing/GoogleReviewBar";
import { buttonBase, buttonVariants } from "@/components/ui/Button";
import {
  ExternalIcon,
  PhoneIcon,
  PinIcon,
  StarIcon,
} from "@/components/ui/Icons";
import { cn } from "@/lib/utils";

/**
 * GOOGLE na stronie głównej — blok kompaktowy, nie druga sekcja kontaktu.
 *
 * CZEGO TU CELOWO NIE MA: mapy. Ramka Google jest najcięższym elementem całego
 * serwisu i ma sens tam, gdzie klient przyszedł po drogę — czyli na
 * `/contact`, i tam zostaje. Strona główna dostaje adres, opinie i cztery
 * skróty; kto potrzebuje mapy, ma do niej stąd jedno kliknięcie i otwiera ją
 * w aplikacji, która i tak poprowadzi go lepiej niż ramka na stronie.
 *
 * JEDNO ŹRÓDŁO DANYCH. Ten blok nie czyta ustawień. Dostaje gotowy
 * `GoogleView` — ten sam, który dostaje strona kontaktowa — więc zmiana
 * jednego pola w Admin → GOOGLE przestawia oba miejsca naraz i nie ma jak
 * doprowadzić do stanu, w którym Home mówi co innego niż Kontakt.
 *
 * KAŻDY SKRÓT MOŻE ZNIKNĄĆ Z OSOBNA. Decyzję „czy wolno to pokazać" podjęto
 * wcześniej, w `googleView`; tutaj `null` znaczy po prostu „nie renderuj".
 * Blok, z którego nic nie zostało, nie renderuje się w całości — łącznie
 * z nagłówkiem, bo „ZNAJDŹ NAS" nad pustym miejscem jest gorsze niż brak
 * sekcji.
 */
export function GoogleHomeBlock({
  view,
  company,
  telHref,
  labels,
}: {
  view: GoogleView;
  /** Nazwa i adres — z wiersza `company`, nie z tego pliku. */
  company: { name: string; address: string };
  /** `tel:` pierwszej linii obsługi. Null, gdy numeru nie ma w ustawieniach. */
  telHref: string | null;
  labels: {
    /** Nadtytuł sekcji: „Znajdź nas". */
    eyebrow: string;
    map: string;
    profile: string;
    review: string;
    call: string;
    /** Napisy paska opinii — te same, co na stronie kontaktowej. */
    reviews: {
      rating: string | null;
      count: string | null;
      title: string;
      readAll: string;
      aria: string;
    };
  };
}) {
  /*
    Skróty budowane jako DANE, nie jako cztery gałęzie JSX.

    Powód jest praktyczny: liczba widocznych przycisków zmienia się z
    ustawieniami (od zera do czterech), a układ 2 × 2 na telefonie musi wiedzieć,
    ile ich naprawdę jest — inaczej trzy przyciski zostawiają w siatce dziurę
    wielkości czwartego.
  */
  const actions: {
    key: string;
    href: string;
    label: string;
    icon: React.ReactNode;
    /** Odnośnik wychodzący poza serwis otwiera się w nowej karcie; `tel:` nie. */
    external: boolean;
  }[] = [];

  if (view.mapsHref) {
    actions.push({
      key: "map",
      href: view.mapsHref,
      label: labels.map,
      icon: <PinIcon className="text-red" />,
      external: true,
    });
  }
  if (view.profileHref) {
    actions.push({
      key: "profile",
      href: view.profileHref,
      label: labels.profile,
      icon: <ExternalIcon className="text-ink-faint" />,
      external: true,
    });
  }
  if (view.reviewHref) {
    actions.push({
      key: "review",
      href: view.reviewHref,
      label: labels.review,
      /*
        Złota gwiazdka, jedyny kolorowy akcent w tym rzędzie poza czerwoną
        pinezką — bo to jedyny z czterech skrótów, który o coś PROSI. Trzy
        pozostałe coś dają: drogę, wizytówkę, połączenie.
      */
      icon: <StarIcon className="text-gold" />,
      external: true,
    });
  }
  /*
    TELEFON DOKŁADANY NA KOŃCU, I DOPIERO GDY JEST DO CZEGO.

    Numer nie pochodzi z modułu GOOGLE i nie ma tam przełącznika — jest
    w ustawieniach firmy i będzie zawsze. Gdyby liczył się do „czy jest co
    pokazać", wyłączenie w Adminie wszystkich funkcji GOOGLE zostawiłoby na
    dole strony sekcję zatytułowaną „ZNAJDŹ NAS" z jednym przyciskiem
    „Zadzwoń" i bez ani jednego elementu, o którym ta sekcja jest.

    Sekcja istnieje więc wtedy i tylko wtedy, gdy został z niej co najmniej
    jeden element GOOGLE; telefon dosiada się do niego jako czwarty skrót.
  */
  if (!view.reviews && actions.length === 0) return null;

  if (telHref) {
    actions.push({
      key: "call",
      href: telHref,
      label: labels.call,
      icon: <PhoneIcon className="text-ink-faint" />,
      external: false,
    });
  }

  return (
    /*
      `id` jak w sekcji partnerstwa niżej: daje bezpośredni odnośnik
      (`/#google`) do miejsca, o które klient pyta najczęściej po cenie —
      „gdzie wy właściwie jesteście". Przy okazji jest to jedyny pewny uchwyt
      dla testu: napis „Zobacz na mapie” występuje na tej stronie DWA razy,
      bo ten sam odnośnik ma od miesięcy stopka, i test liczący po treści
      zgłaszał dwa przyciski tam, gdzie w bloku jest jeden.
    */
    <section id="google" className="border-line border-t">
      <Container className="py-16 md:py-20">
        <Reveal>
          <p className="label text-ink-faint text-xs">{labels.eyebrow}</p>
          <h2 className="font-heading text-ink mt-4 text-2xl font-bold md:text-3xl">
            {company.name}
          </h2>
          {company.address && (
            <p className="text-ink-muted mt-2 text-sm">{company.address}</p>
          )}
        </Reveal>

        {view.reviews && (
          <Reveal>
            <GoogleReviewBar reviews={view.reviews} labels={labels.reviews} />
          </Reveal>
        )}

        {actions.length > 0 && (
          /*
            2 × 2 na telefonie, jeden rząd od `sm` w górę — dokładnie tak, jak
            w zamówieniu. Siatka, nie zawijany rząd: przy `flex-wrap` dwa
            przyciski o różnej długości napisu dostają różne szerokości i
            rozjeżdżają dolny wiersz względem górnego.
          */
          <Reveal className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            {actions.map((a, i) => (
              <a
                key={a.key}
                href={a.href}
                {...(a.external
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                className={cn(
                  buttonBase,
                  buttonVariants.outline,
                  "min-h-14 justify-start gap-2.5 px-3 text-left text-[10px] leading-tight sm:px-4 sm:text-[11px]",
                  /*
                    Nieparzysty ostatni przycisk zajmuje na telefonie oba pola.
                    Przy trzech skrótach — a tak wygląda konfiguracja bez numeru
                    telefonu — inaczej zostaje w siatce puste pole wielkości
                    przycisku i wygląda to na brakujący element, a nie na
                    świadomy układ.
                  */
                  i === actions.length - 1 && actions.length % 2 === 1
                    ? "max-sm:col-span-2"
                    : "",
                )}
              >
                {a.icon}
                {/*
                  `break-words`: „ZOBACZ NAS W GOOGLE" przy 360 px ma do
                  dyspozycji 126 px w kolumnie i musi się zawinąć. Bez tego
                  najdłuższe słowo rozpycha kolumnę i wypycha stronę w bok.
                */}
                <span className="break-words">{a.label}</span>
              </a>
            ))}
          </Reveal>
        )}
      </Container>
    </section>
  );
}
