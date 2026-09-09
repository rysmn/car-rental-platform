import { Link } from "@/i18n/navigation";

/**
 * Section navigation for the chatbot area.
 *
 * In its own file rather than exported from `page.tsx`: Next validates the
 * exports of a page module, and a stray component export there is the kind of
 * thing that builds locally and fails in CI.
 */
const TABS = [
  { href: "/admin/chatbot", label: "Pulpit" },
  { href: "/admin/chatbot/rozmowy", label: "Rozmowy" },
  { href: "/admin/chatbot/leady", label: "Leady" },
  { href: "/admin/chatbot/analityka", label: "Analityka" },
  { href: "/admin/chatbot/pytania", label: "Pytania bez odpowiedzi" },
  { href: "/admin/settings/chatbot", label: "Ustawienia" },
] as const;

export function ChatbotTabs({ active }: { active: string }) {
  return (
    // `.tap` zamiast `min-h-11 sm:min-h-0`: etykieta ma 10 px, więc sam wiersz
    // tekstu ma 16 px wysokości — za mało dla palca. O wysokości decyduje
    // teraz rodzaj wskaźnika, nie szerokość okna, bo tablet w poziomie jest
    // szeroki i dotykowy zarazem. Pod myszą pasek wygląda jak wcześniej.
    <nav className="border-line mb-8 flex flex-wrap gap-x-5 gap-y-1 border-b pb-3 sm:gap-y-2">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`label-tight tap inline-flex items-center text-[10px] transition-colors ${
            tab.href === active ? "text-ink" : "text-ink-faint hover:text-ink"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
