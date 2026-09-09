import type { Instrumentation } from "next";

/**
 * Every server-side error, in one place.
 *
 * Next calls this whenever the server catches an error — a page that threw
 * while rendering, a route handler that 500'd, a Server Action that blew up
 * before its own try/catch could run. It is the backstop under the deliberate
 * instrumentation: `createReservation`, the chat route and the media route each
 * report the failures they can name, and this catches everything nobody thought
 * to catch, which is the category that produces the outage.
 *
 * Three things it must not do:
 *
 *   · **Throw.** An error hook that fails while reporting an error turns one
 *     failure into two, and the second one has no hook.
 *   · **Run in the Edge runtime.** The alert writer needs the Postgres driver
 *     and `node:crypto`; both are absent there. The import is dynamic and
 *     guarded so the Edge bundle never pulls them in.
 *   · **Carry the request.** `request.headers` holds the admin session cookie
 *     on every panel error. Only the path and the method go in, and the path
 *     is stripped of its query string, which is where ids and tokens live.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { recordAlert } = await import("@/lib/alerts/record");

    // The route file path ("/app/fleet/[slug]"), not the visited URL: it is
    // the stable identity of the fault, so one broken page is one alert
    // however many slugs get crawled through it.
    const route = context.routePath || request.path.split("?")[0] || "?";
    const digest =
      typeof err === "object" && err !== null && "digest" in err
        ? String((err as { digest?: unknown }).digest)
        : undefined;

    // Which part of the system owns this route decides which module it lands
    // under, so an operator filtering "Rezerwacje" sees a booking page that
    // stopped rendering rather than hunting through "Strona publiczna".
    // `owner`, not `module`: `module` is a reserved identifier in a Next
    // server bundle and assigning to it is an error, not a style preference.
    /*
      Segment języka trzeba zdjąć PRZED rozpoznaniem właściciela trasy.

      Każda strona tego serwisu żyje pod `/[locale]/…`, więc trasa panelu ma
      postać `/[locale]/admin/reservations/[id]`, a nie `/admin/…`. Warunek
      `startsWith("/admin")` nie trafiał więc NIGDY i wszystkie awarie panelu
      lądowały w module „Strona publiczna". Operator filtrujący awarie panelu
      nie widział ich w ogóle — a to jest gorsze niż brak filtra, bo wygląda
      jak cisza. Zobaczył to właściciel 27.08.2026: błąd karty rezerwacji
      w Adminie opisany jako usterka strony publicznej.

      Ścinamy pierwszy segment tylko wtedy, gdy jest wzorcem `[locale]` albo
      dwuliterowym kodem języka — żeby trasa `/administracja-czegos` nigdy nie
      została uznana za panel przez przypadek.

      Dopasowujemy CAŁY segment, nie przedrostek: `startsWith("/admin")`
      łapało także `/administracja-…`, czyli trasę, która z panelem nie ma nic
      wspólnego. Jeden znak różnicy, a wynik to awaria opisana pod złym
      modułem — czyli dokładnie ten sam rodzaj pomyłki, który tu naprawiamy.
    */
    const bezJezyka = route.replace(/^\/(\[locale\]|[a-z]{2})(?=\/)/, "");
    const zaczyna = (przedrostek: string) =>
      new RegExp(`^${przedrostek}(/|$)`).test(bezJezyka);
    const owner = zaczyna("/admin")
      ? "admin"
      : zaczyna("/api/chat")
        ? "chat"
        : zaczyna("/api/media")
          ? "media"
          : "public";

    /*
      NIEZNANA AKCJA SERWEROWA TO NIE JEST AWARIA STRONY (07.09.2026).

      Next rzuca „Failed to find Server Action", gdy dostanie POST z
      identyfikatorem akcji, którego ten build nie zna — ALBO gdy nie dostanie
      identyfikatora wcale. Do 07.09 obie sytuacje lądowały tutaj jako
      `severity: error` i tytuł „Błąd renderowania strony", czyli w monitoringu
      wyglądały jak wysypana strona główna. Rachunek z produkcji: na dziesięć
      wystąpień alertu osiem pochodziło z czterech żądań skanera podatności
      w ciągu trzech sekund, a dwa — z jednej prawdziwej starej karty.

      Żadne z nich nie jest awarią kodu:

        · **stara karta** — klient trzyma id z poprzedniego obrazu. Od 07.09
          jest to rzadkie, bo id akcji są stałe między buildami (sól w `.env`),
          ale zostaje przy zmianie samej treści akcji;
        · **skaner** — POST bez żadnego id; od 07.09 odcinany w `proxy.ts`
          zanim dojdzie do renderu.

      Zostaje więc zapisane, ale UCZCIWIE: ostrzeżenie zamiast błędu, tytuł
      mówiący co się stało, i kontekst pozwalający operatorowi odróżnić jedno
      od drugiego — czy w żądaniu był identyfikator i jaki był agent. To NIE
      jest wyciszenie: alert nadal powstaje, nadal się liczy i nadal widać go
      w panelu. Zmienia się to, że nie udaje awarii, której nie ma.

      Agent user-agent jest jedynym nagłówkiem, który tu wchodzi, i wchodzi
      przycięty. Reszta nagłówków zostaje poza tym plikiem z powodu opisanego
      na górze: siedzi w nich ciasteczko sesji panelu.
    */
    const komunikat =
      err instanceof Error ? err.message : typeof err === "string" ? err : "";
    const nieznanaAkcja = komunikat.includes("Failed to find Server Action");
    const idAkcji = komunikat.match(/Server Action "([0-9a-f]+)"/)?.[1] ?? null;
    const agent = (request.headers?.["user-agent"] ?? "")
      .toString()
      .slice(0, 120);

    await recordAlert({
      module: nieznanaAkcja ? "security" : owner,
      // A page or an action that threw is a customer who did not get what they
      // came for. Admin routes are the same failure with a smaller audience.
      severity: nieznanaAkcja ? "warning" : "error",
      /*
        DWA OSOBNE WPISY, NIE JEDEN. Żądanie Z identyfikatorem to klient, który
        miał stronę otwartą przed wdrożeniem — warto wiedzieć, że zmiana
        akcji kogoś dotknęła. Żądanie BEZ identyfikatora nigdy nie było
        wywołaniem akcji i jest po prostu ruchem skanera. Zlanie ich w jeden
        wiersz zamieniłoby pierwszy sygnał w szum drugiego.
      */
      key: nieznanaAkcja
        ? `request:nieznana-akcja-serwerowa:${idAkcji ? "stara-karta" : "bot"}`
        : `request:${context.routeType}:${route}${digest ? `:${digest}` : ""}`,
      title: nieznanaAkcja
        ? idAkcji
          ? "Klient wywołał akcję z poprzedniej wersji strony (stara karta)"
          : "POST bez identyfikatora akcji — ruch bota, nie awaria"
        : context.routeType === "action"
          ? `Server Action zakończona błędem (${route})`
          : context.routeType === "route"
            ? `Trasa API zwróciła błąd (${route})`
            : `Błąd renderowania strony (${route})`,
      error: err,
      context: {
        route,
        metoda: request.method,
        rodzaj: context.routeType,
        router: context.routerKind,
        zrodlo: context.renderSource ?? null,
        ...(nieznanaAkcja
          ? {
              // Bez identyfikatora = żądanie w ogóle nie było wywołaniem akcji,
              // czyli prawie na pewno skaner. Z identyfikatorem = ktoś miał
              // otwartą stronę z poprzedniego obrazu.
              idAkcji,
              zrodloPrawdopodobne: idAkcji ? "stara karta" : "bot / skaner",
              agent: agent || null,
            }
          : {}),
      },
    });
  } catch {
    // Reporting failed. There is nowhere left to report that to, and the
    // original error is already on its way to its own handler.
  }
};
