"use server";

import { AuthError } from "next-auth";
import { clientIp } from "@/lib/security/client-ip";
import { limit, REGULY } from "@/lib/security/rate-limit";
import { headers } from "next/headers";
import { POTRZEBNY_KOD, signIn, ZLY_KOD } from "@/lib/auth/config";

/**
 * Logowanie do panelu — jedna akcja, dwa możliwe kroki.
 *
 * Formularz wysyła e-mail i hasło. Jeżeli konto ma włączone 2FA, akcja wraca
 * ze stanem `krok: "kod"` i ten sam formularz dorysowuje pole na sześć cyfr
 * (albo kod zapasowy), zachowując e-mail i hasło w polach ukrytych.
 *
 * Dlaczego dwa kroki, a nie jedno pole widoczne od początku: pole „kod 2FA"
 * pokazane każdemu mówiłoby, że panel ma 2FA, i zmuszałoby konta bez niego do
 * patrzenia na pole, którego nie mają czym wypełnić. A dlaczego hasło wraca
 * w polu ukrytym, zamiast trzymać stan po stronie serwera: sesja „w połowie
 * zalogowany" to trzeci stan uwierzytelnienia do utrzymania i do pomylenia.
 * Hasło i tak przed chwilą przeszło tym samym kanałem (HTTPS), a nie zostaje
 * nigdzie zapisane.
 */
export type LoginState = {
  /** Ogólny błąd poświadczeń — bez wskazywania, co było nie tak. */
  error?: boolean;
  /** Który krok pokazać. */
  krok?: "haslo" | "kod";
  /** Kod odrzucony — komunikat inny niż przy złym haśle. */
  zlyKod?: boolean;
};

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const h = await headers();
  // Adres z zaufanego proxy, nie z nagłówka podanego przez klienta — patrz
  // `lib/security/client-ip`. Trafia do zdarzeń bezpieczeństwa i do blokady
  // logowania, więc podrobiony kasował jedno i drugie.
  const adres = clientIp(h);
  const ip = adres === "unknown" ? null : adres;
  // Limit częstotliwości PRZED sprawdzeniem hasła: zlicza każdą próbę, także
  // tę z dobrym hasłem. Odpowiedź taka sama jak przy złych danych, żeby nie
  // zdradzać, czy konto istnieje lub czy limit już zadziałał.
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const prog = limit(REGULY.logowanie, [ip, email || null]);
  if (prog.przekroczony) return { error: true };
  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      code: String(formData.get("code") ?? ""),
      ip,
      /*
        Nagłówek przeglądarki i język — wyłącznie do rozpoznania „logowanie
        z nowego urządzenia". Czytane po stronie SERWERA, a nie przysyłane
        przez formularz: wartość, którą podaje klient, nie nadaje się na
        odcisk urządzenia, bo klient może ją ustawić dowolnie.
      */
      ua: h.get("user-agent") ?? "",
      lang: h.get("accept-language") ?? "",
      redirectTo: "/admin",
    });
    return {};
  } catch (error) {
    /*
      Auth.js opakowuje wyjątek z `authorize` w `CredentialsSignin`, a oryginalny
      komunikat kładzie w `cause.err.message`. Sprawdzamy oba miejsca oraz sam
      tekst — zależność od jednej ścieżki wewnątrz biblioteki byłaby dokładnie
      tym rodzajem kruchości, która ujawnia się dopiero po aktualizacji.
    */
    if (error instanceof AuthError) {
      const przyczyna =
        (error.cause as { err?: { message?: string } } | undefined)?.err
          ?.message ?? "";
      const tekst = `${przyczyna} ${error.message}`;
      if (tekst.includes(POTRZEBNY_KOD)) return { krok: "kod" };
      if (tekst.includes(ZLY_KOD)) return { krok: "kod", zlyKod: true };
      return { error: true };
    }
    // NEXT_REDIRECT rzucany przy powodzeniu musi lecieć dalej.
    throw error;
  }
}
