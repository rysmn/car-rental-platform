import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { Link } from "@/i18n/navigation";
import { confirmVerification } from "@/lib/booking/verification";
import { RememberReference } from "@/components/booking/RememberReference";
import { formatDatePl } from "@/lib/format";
import { limit, REGULY } from "@/lib/security/rate-limit";
import { clientIpFromHeaders } from "@/lib/security/form-guard";

/**
 * „Potwierdź rezerwację" — strona, na którą prowadzi link z maila.
 *
 * ## Dlaczego potwierdzenie dzieje się przy WEJŚCIU, a nie po kliknięciu
 *
 * Rozważaliśmy ekran z przyciskiem („kliknij, aby potwierdzić"), który broni
 * przed programami pocztowymi odwiedzającymi linki z podglądu. Odpadł, bo
 * kosztuje realnych klientów: część ludzi otwiera link na telefonie w biegu,
 * widzi stronę i zamyka ją, uznając rzecz za załatwioną. Zamiast tego link
 * działa od razu, a ochroną przed przypadkowym zużyciem jest to, że powtórne
 * wejście na ten sam adres pokazuje SUKCES, a nie błąd — bo dla człowieka
 * „już potwierdzone" to jest sukces.
 *
 * ## Czego ta strona nie robi
 *
 * Nie pokazuje ani jednej danej osobowej. Token jest hasłem na okaziciela
 * i mógł trafić w cudze ręce (przekazany mail, wspólna skrzynka); dlatego widać
 * numer rezerwacji, auto i termin — czyli dokładnie tyle, co na liście „Moje
 * rezerwacje", która stoi na tej samej zasadzie.
 *
 * ## Indeksowanie
 *
 * `noindex, nofollow` bezwarunkowo. Adres z tokenem w wynikach wyszukiwania
 * byłby zużytym potwierdzeniem cudzej rezerwacji.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Potwierdzenie rezerwacji",
  robots: { index: false, follow: false },
};

export default async function ConfirmPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  /*
    Limit na zgadywanie tokenów. Token ma 256 bitów, więc trafienie losowe jest
    nierealne — ale limit kosztuje jedną mapę w pamięci i zamienia „nierealne"
    na „również widoczne w dzienniku". Przy przekroczeniu odpowiadamy tak samo
    jak na zły token: strona zgadująca nie ma się z czego dowiedzieć, czy
    trafiła w limit, czy w nieistniejący token.
  */
  const ip = await clientIpFromHeaders();
  const zablokowany = limit(REGULY.potwierdzenie, [ip]).przekroczony;

  const wynik = zablokowany
    ? ({ ok: false, powod: "nieznany" } as const)
    : await confirmVerification(token);

  if (wynik.ok) {
    return (
      <Container className="py-20 md:py-28">
        {/* Numer wraca do tej przeglądarki także wtedy, gdy klient otworzył
            link na innym urządzeniu niż to, na którym rezerwował — inaczej
            pasek „✓ Moja rezerwacja" nigdy by się na tym telefonie nie
            zapalił. */}
        <RememberReference reference={wynik.reference} />
        <div className="border-line mx-auto max-w-xl border p-8 text-center md:p-12">
          <div className="rounded-pill bg-status-available/15 mx-auto flex h-14 w-14 items-center justify-center">
            <span className="text-status-available text-2xl" aria-hidden>
              ✓
            </span>
          </div>
          <h1 className="font-heading mt-6 text-2xl font-bold">
            Rezerwacja potwierdzona
          </h1>
          <p className="text-ink-muted mt-4 text-sm leading-relaxed">
            Numer <strong className="text-ink">{wynik.reference}</strong> —{" "}
            {wynik.carName}, {formatDatePl(wynik.startDate)} —{" "}
            {formatDatePl(wynik.endDate)}.
          </p>
          <p className="text-ink-muted mt-3 text-sm leading-relaxed">
            Zgłoszenie trafiło do obsługi. Potwierdzimy dostępność i skontaktujemy
            się z Tobą.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3">
            <ButtonLink href="/moje-rezerwacje">Moje rezerwacje</ButtonLink>
          </div>
        </div>
      </Container>
    );
  }

  if (wynik.powod === "niedostepny") {
    return (
      <Container className="py-20 md:py-28">
        <div className="border-line mx-auto max-w-xl border p-8 md:p-12">
          <h1 className="font-heading text-2xl font-bold">
            Ten termin właśnie się zajął
          </h1>
          <p className="text-ink-muted mt-4 text-sm leading-relaxed">
            Zgłoszenie <strong className="text-ink">{wynik.reference}</strong>{" "}
            dotyczyło terminu {formatDatePl(wynik.startDate)} —{" "}
            {formatDatePl(wynik.endDate)}. Zanim potwierdziłeś, ten samochód
            został zarezerwowany na te dni.
          </p>
          {wynik.alternatywy.length > 0 && (
            <>
              <p className="label-tight text-silver mt-8 text-[11px]">
                Wolne w tym samym terminie
              </p>
              <ul className="divide-line border-line mt-3 divide-y border-t">
                {wynik.alternatywy.map((a) => (
                  <li key={a.slug}>
                    <Link
                      href={{
                        pathname: "/fleet/[slug]",
                        params: { slug: a.slug },
                      }}
                      className="text-ink hover:text-red flex items-center justify-between py-4 text-sm transition-colors"
                    >
                      <span>
                        {a.brand} {a.model}
                      </span>
                      <span aria-hidden>→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="mt-8">
            <ButtonLink href="/fleet">Wybierz inny termin</ButtonLink>
          </div>
        </div>
      </Container>
    );
  }

  const tresc = {
    nieznany: {
      naglowek: "Ten link nie działa",
      tekst:
        "Adres jest niepełny albo dotyczy zgłoszenia, którego już nie ma. Najprościej wypełnić formularz jeszcze raz — zajmie to chwilę.",
    },
    wygasl: {
      naglowek: "Link stracił ważność",
      tekst:
        "Potwierdzenie jest ważne 15 minut od wysłania formularza. Samochód nie był z tego powodu zajęty ani przez moment — wystarczy złożyć zgłoszenie ponownie.",
    },
    uzyty: {
      naglowek: "To potwierdzenie zostało już użyte",
      tekst:
        "Zgłoszenie jest u nas i czeka na kontakt z obsługą. Nic więcej nie trzeba robić.",
    },
  }[wynik.powod];

  return (
    <Container className="py-20 md:py-28">
      <div className="border-line mx-auto max-w-xl border p-8 text-center md:p-12">
        <h1 className="font-heading text-2xl font-bold">{tresc.naglowek}</h1>
        <p className="text-ink-muted mt-4 text-sm leading-relaxed">
          {tresc.tekst}
        </p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <ButtonLink href="/fleet">Wybierz samochód</ButtonLink>
          <Link
            href="/contact"
            className="label text-silver hover:text-ink text-[11px] transition-colors"
          >
            Kontakt →
          </Link>
        </div>
      </div>
    </Container>
  );
}
