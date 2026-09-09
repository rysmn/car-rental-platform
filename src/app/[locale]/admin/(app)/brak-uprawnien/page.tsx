import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/guard";
import { ROLE_LABEL } from "@/lib/auth/permissions";

export const metadata = { title: "Brak uprawnień" };

/**
 * Ekran, na który trafia ktoś, kto wszedł tam, gdzie mu nie wolno.
 *
 * Istnieje, bo alternatywą było HTTP 500 z komunikatem „A server error
 * occurred" — czyli coś, co wygląda jak awaria serwisu i tak zostałoby
 * zgłoszone. Odmowa dostępu nie jest awarią i ma o tym mówić.
 *
 * Nie zdradza, CO jest po drugiej stronie. Zdanie „nie masz dostępu do
 * cennika" mówiłoby pracownikowi, że cennik jest w panelu i pod jakim adresem;
 * to nie jest tajemnica, ale nie ma też powodu jej rozgłaszać.
 */
export default async function BrakUprawnienPage() {
  const admin = await requireAdmin();

  return (
    <div className="max-w-xl py-10">
      <h1 className="font-heading text-ink text-2xl font-bold">
        Ta sekcja nie jest dla Twojego konta
      </h1>
      <p className="text-ink-muted mt-4 text-sm leading-relaxed">
        Jesteś zalogowany jako <strong className="text-ink">{admin.name}</strong>{" "}
        z rolą <strong className="text-ink">{ROLE_LABEL[admin.role]}</strong>.
        Ta rola nie obejmuje tego, co jest pod tym adresem.
      </p>
      <p className="text-ink-muted mt-3 text-sm leading-relaxed">
        Jeżeli potrzebujesz tu wejść do pracy, poproś właściciela o zmianę roli
        — panel nie rozszerza uprawnień sam z siebie i nie ma jak tego obejść
        z przeglądarki.
      </p>
      <Link
        href="/admin"
        className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 mt-8 inline-flex h-10 items-center border px-5 text-xs transition-colors"
      >
        Wróć na pulpit
      </Link>
    </div>
  );
}
