import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { verifyPassword } from "./password";
import { odciskUrzadzenia, sprawdzDrugiSkladnik } from "./two-factor";
import { recordSecurityEvent } from "@/lib/security/events";
import {
  alertBezpieczenstwa,
  alertGdyGesto,
  PROGI_ALERTOW,
} from "@/lib/security/alerts";

const LOCK_THRESHOLD = 5; // failed attempts before lockout
const LOCK_MINUTES = 15;

const credsSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
  /**
   * Drugi składnik: sześć cyfr z aplikacji ALBO kod zapasowy.
   *
   * Jedno pole na oba, bo w chwili, w której ktoś szuka kartki z kodami
   * zapasowymi, pytanie „którego pola użyć" jest ostatnią rzeczą, jakiej
   * potrzebuje. Rozróżnia je kształt — patrz `sprawdzDrugiSkladnik`.
   */
  code: z.string().max(64).optional(),
});

/**
 * Sygnały zwracane logowaniu przez rzucenie wyjątku o znanym komunikacie.
 *
 * Auth.js nie ma innego kanału: `authorize` zwraca albo użytkownika, albo
 * `null`, a `null` znaczy dla warstwy wyżej „złe dane" i nic więcej. Formularz
 * musi jednak odróżnić „złe hasło" od „hasło dobre, podaj kod" — inaczej
 * właściciel z włączonym 2FA widziałby wyłącznie „nieprawidłowy e-mail lub
 * hasło" i nie miałby jak się zalogować.
 *
 * Komunikat NIE zdradza niczego o istnieniu konta: pojawia się dopiero PO
 * poprawnym haśle, więc kto go widzi, i tak zna hasło.
 */
export const POTRZEBNY_KOD = "2fa_required";
export const ZLY_KOD = "2fa_invalid";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 }, // 8h
  pages: { signIn: "/admin/login" },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
        ip: {},
        code: {},
        ua: {},
        lang: {},
      },
      async authorize(raw) {
        const parsed = credsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const email = parsed.data.email.toLowerCase();
        const password = parsed.data.password;
        const ip = typeof raw?.ip === "string" ? raw.ip.slice(0, 64) : null;

        const db = getDb();
        const [admin] = await db
          .select()
          .from(schema.admins)
          .where(eq(schema.admins.email, email))
          .limit(1);

        const now = new Date();
        const fail = async () => {
          await db
            .insert(schema.auditLog)
            .values({ adminId: admin?.id ?? null, action: "login.fail", ip });
          /*
            Do dziennika bezpieczeństwa — obok audytu, nie zamiast niego.
            Audyt odpowiada „co się działo na koncie", dziennik „ile razy z tego
            samego miejsca", i dopiero ta druga liczba pozwala odróżnić pomyłkę
            od ataku. Próg i alert są w `security/alerts`.
          */
          void recordSecurityEvent({
            kind: "login_failed",
            endpoint: "admin.login",
            adminId: admin?.id ?? null,
            subject: ip,
          });
          // Alarm dopiero przy zagęszczeniu — jedna literówka to nie incydent.
          void alertGdyGesto({
            zdarzenie: "login_failed",
            kind: "login_burst",
            subject: ip,
            oknoMs: PROGI_ALERTOW.logowanie.oknoMs,
            prog: PROGI_ALERTOW.logowanie.prog,
            tytul: "Seria nieudanych logowań do panelu",
            szczegoly:
              "Z jednego miejsca poszła seria nieudanych prób logowania. " +
              "Konto blokuje się po pięciu próbach na 15 minut, a adres po dwudziestu na 5 minut — " +
              "ale jeżeli to trwa, warto sprawdzić, czy hasło nie wyciekło.",
          });
          return null;
        };

        // Generic failure everywhere below (no user enumeration).
        if (!admin || !admin.active) return fail();
        if (admin.lockedUntil && admin.lockedUntil > now) return fail();

        const ok = await verifyPassword(admin.passwordHash, password);
        if (!ok) {
          const attempts = admin.failedAttempts + 1;
          const lock = attempts >= LOCK_THRESHOLD;
          await db
            .update(schema.admins)
            .set({
              failedAttempts: attempts,
              lockedUntil: lock
                ? new Date(now.getTime() + LOCK_MINUTES * 60_000)
                : admin.lockedUntil,
            })
            .where(eq(schema.admins.id, admin.id));
          return fail();
        }

        /*
         * Hasło poprawne. DRUGI SKŁADNIK — rozdział 13.6 punkt 1.
         *
         * Sprawdzany dopiero tutaj i to jest istotne: gdyby brak kodu
         * odrzucał logowanie przed sprawdzeniem hasła, komunikat „podaj kod"
         * zdradzałby, które konta mają 2FA. Po poprawnym haśle nie zdradza
         * niczego, bo kto je zna, i tak wie, że konto istnieje.
         *
         * Konto BEZ włączonego 2FA loguje się jak dotąd. Obowiązkowość jest
         * egzekwowana o jeden krok dalej — panel prowadzi takie konto prosto
         * na ekran włączenia i nie wypuszcza go dalej (`admin/(app)/layout`).
         * Odrzucanie logowania byłoby tu jedyną decyzją, której NIE DA SIĘ
         * cofnąć bez konsoli: właściciel bez skonfigurowanego 2FA zostałby
         * zamknięty przed panelem w chwili wdrożenia.
         */
        if (admin.totpConfirmedAt) {
          const drugi = await sprawdzDrugiSkladnik(admin, parsed.data.code);
          if (!drugi.ok) {
            await db.insert(schema.auditLog).values({
              adminId: admin.id,
              action:
                drugi.powod === "brak_kodu" ? "login.2fa_prompt" : "login.2fa_fail",
              ip,
            });
            throw new Error(
              drugi.powod === "brak_kodu" ? POTRZEBNY_KOD : ZLY_KOD,
            );
          }
          if (drugi.sposob === "kod_zapasowy") {
            void alertBezpieczenstwa({
              kind: "recovery_used",
              adminId: admin.id,
              tytul: "Logowanie kodem zapasowym",
              szczegoly:
                `Konto ${admin.email} zalogowało się kodem zapasowym zamiast kodem z aplikacji. ` +
                "Jeżeli to nie było zamierzone, ktoś ma kartkę z kodami.",
            });
          }
        }

        /*
         * Rozpoznanie urządzenia — rozdział 13.6 punkt 10b.
         *
         * Porównujemy odcisk z ostatnim znanym. Różnica to POWIADOMIENIE,
         * nigdy blokada: właściciel kupujący nowy telefon nie może z tego
         * powodu stracić dostępu, a alert i tak mówi mu, że coś się zmieniło.
         * Pierwsze logowanie konta nie alarmuje — nie ma z czym porównać.
         */
        const ua = typeof raw?.ua === "string" ? raw.ua.slice(0, 400) : null;
        const lang = typeof raw?.lang === "string" ? raw.lang.slice(0, 40) : null;
        const odcisk = odciskUrzadzenia(ua, lang, ip);
        const noweUrzadzenie =
          Boolean(admin.lastDeviceHash) && admin.lastDeviceHash !== odcisk;

        // Success — reset counters, stamp login, audit.
        await db
          .update(schema.admins)
          .set({
            failedAttempts: 0,
            lockedUntil: null,
            lastLoginAt: now,
            lastDeviceHash: odcisk,
          })
          .where(eq(schema.admins.id, admin.id));
        await db
          .insert(schema.auditLog)
          .values({ adminId: admin.id, action: "login.success", ip });

        if (noweUrzadzenie) {
          void recordSecurityEvent({
            kind: "new_device",
            endpoint: "admin.login",
            adminId: admin.id,
            subject: ip,
          });
          void alertBezpieczenstwa({
            kind: "new_device",
            adminId: admin.id,
            tytul: "Logowanie z nowego urządzenia",
            szczegoly:
              `Konto ${admin.email} zalogowało się z przeglądarki lub sieci, ` +
              "której wcześniej nie widzieliśmy. Jeżeli to nie Ty — zmień hasło " +
              "i wyloguj wszystkie sesje w Ustawieniach → Bezpieczeństwo.",
          });
        }

        return {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        /*
          Chwila wydania tokenu. Bez niej „wyloguj ze wszystkich urządzeń"
          nie ma czego porównać z `admins.sessions_valid_from` — patrz
          `auth/guard.ts`. Zapisujemy własny znacznik, a nie polegamy na
          `iat`, bo `iat` jest w sekundach i przy dwóch zdarzeniach w tej
          samej sekundzie („wyloguj wszędzie", zaraz potem logowanie)
          porównanie wychodziłoby remisem.
        */
        token.loginAt = Date.now();
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.id === "string" ? token.id : "";
        session.user.role =
          token.role === "superadmin"
            ? "superadmin"
            : token.role === "operator"
              ? "operator"
              : "admin";
        session.user.loginAt =
          typeof token.loginAt === "number" ? token.loginAt : undefined;
      }
      return session;
    },
    authorized({ auth }) {
      return Boolean(auth?.user);
    },
  },
});
