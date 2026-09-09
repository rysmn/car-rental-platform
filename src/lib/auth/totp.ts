import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * TOTP (RFC 6238) — sześciocyfrowy kod z aplikacji uwierzytelniającej.
 *
 * ## Dlaczego bez biblioteki
 *
 * Cały algorytm to trzydzieści linijek nad `crypto.createHmac`, które jest
 * w Node od zawsze. Zasada projektu brzmi „zero nowych kosztów i zero nowych
 * zależności, jeżeli da się bez nich bezpiecznie" — a tu się da: nie ma tu
 * ani jednej decyzji kryptograficznej do podjęcia, wszystkie są w RFC.
 * Dodatkowa zależność w ścieżce logowania to za to nowa powierzchnia ataku
 * i nowy powód, dla którego `npm audit` może kiedyś zablokować wdrożenie.
 *
 * ## Zgodność
 *
 * SHA-1, 6 cyfr, krok 30 s — dokładnie to, co czytają Google Authenticator,
 * Aegis, 1Password i Authy. Zmiana któregokolwiek z tych trzech parametrów
 * znaczy „część aplikacji przestaje działać", więc są stałymi, nie ustawieniem.
 *
 * ## Okno tolerancji
 *
 * Sprawdzamy krok bieżący oraz jeden wstecz i jeden w przód (±30 s). To jest
 * standardowy kompromis: zegar telefonu potrafi się rozjechać o kilkanaście
 * sekund, a szersze okno mnoży liczbę kodów, które w danej chwili pasują.
 */

const KROK_S = 30;
const CYFRY = 6;
/** Ile kroków wstecz i w przód akceptujemy. */
const TOLERANCJA = 1;

const ALFABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bufor: Buffer): string {
  let bity = 0;
  let wartosc = 0;
  let wynik = "";
  for (const bajt of bufor) {
    wartosc = (wartosc << 8) | bajt;
    bity += 8;
    while (bits5(bity)) {
      wynik += ALFABET[(wartosc >>> (bity - 5)) & 31];
      bity -= 5;
    }
  }
  if (bity > 0) wynik += ALFABET[(wartosc << (5 - bity)) & 31];
  return wynik;
}

const bits5 = (bity: number) => bity >= 5;

export function base32Decode(tekst: string): Buffer {
  const czysty = tekst.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bity = 0;
  let wartosc = 0;
  const bajty: number[] = [];
  for (const znak of czysty) {
    const i = ALFABET.indexOf(znak);
    if (i < 0) continue;
    wartosc = (wartosc << 5) | i;
    bity += 5;
    if (bity >= 8) {
      bajty.push((wartosc >>> (bity - 8)) & 255);
      bity -= 8;
    }
  }
  return Buffer.from(bajty);
}

/** Nowy sekret: 20 bajtów losowych, czyli tyle, ile zaleca RFC 4226. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function kodDlaKroku(sekret: Buffer, krok: number): string {
  const licznik = Buffer.alloc(8);
  // Zapis 64-bitowy przez dwie połówki — `writeBigUInt64BE` też by działało,
  // ale numer kroku nigdy nie zbliży się do granicy 32 bitów, a tak nie ma
  // konwersji na BigInt w ścieżce logowania.
  licznik.writeUInt32BE(Math.floor(krok / 2 ** 32), 0);
  licznik.writeUInt32BE(krok >>> 0, 4);

  const hmac = createHmac("sha1", sekret).update(licznik).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const wycinek =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(wycinek % 10 ** CYFRY).padStart(CYFRY, "0");
}

/** Kod, który POWINIEN być teraz widoczny w aplikacji — do testów i podglądu. */
export function totpNow(sekretBase32: string, teraz = Date.now()): string {
  return kodDlaKroku(
    base32Decode(sekretBase32),
    Math.floor(teraz / 1000 / KROK_S),
  );
}

/**
 * Czy podany kod pasuje. Porównanie stałoczasowe — kod jest krótki i różnica
 * czasu przy porównaniu znak po znaku jest mierzalna.
 */
export function verifyTotp(
  sekretBase32: string,
  kod: string,
  teraz = Date.now(),
): boolean {
  const oczyszczony = kod.replace(/\D/g, "");
  if (oczyszczony.length !== CYFRY) return false;
  const sekret = base32Decode(sekretBase32);
  if (sekret.length === 0) return false;

  const krok = Math.floor(teraz / 1000 / KROK_S);
  const podany = Buffer.from(oczyszczony);
  for (let d = -TOLERANCJA; d <= TOLERANCJA; d++) {
    const oczekiwany = Buffer.from(kodDlaKroku(sekret, krok + d));
    if (
      oczekiwany.length === podany.length &&
      timingSafeEqual(oczekiwany, podany)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Adres `otpauth://`, z którego aplikacja robi kod QR.
 *
 * Sekret jest częścią tego adresu, więc NIE WOLNO go zalogować ani wysłać
 * mailem — pokazuje się wyłącznie na ekranie rejestracji 2FA, w odpowiedzi na
 * żądanie zalogowanego właściciela konta.
 */
export function totpUri(sekretBase32: string, email: string): string {
  const konto = encodeURIComponent(`A&A Corporation:${email}`);
  const wydawca = encodeURIComponent("A&A Corporation");
  return `otpauth://totp/${konto}?secret=${sekretBase32}&issuer=${wydawca}&algorithm=SHA1&digits=${CYFRY}&period=${KROK_S}`;
}

/**
 * Kody zapasowe: dziesięć sztuk po dziesięć znaków, w formacie `XXXXX-XXXXX`.
 *
 * Bez znaków, które mylą się przy przepisywaniu z kartki (`0`/`O`, `1`/`I`/`l`),
 * bo te kody przepisuje człowiek w najgorszym możliwym momencie — kiedy nie ma
 * telefonu i nie może się dostać do własnej firmy.
 */
const ZNAKI_KODU = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateRecoveryCodes(ile = 10): string[] {
  const kody: string[] = [];
  for (let i = 0; i < ile; i++) {
    const bajty = randomBytes(10);
    let kod = "";
    for (const b of bajty) kod += ZNAKI_KODU[b % ZNAKI_KODU.length];
    kody.push(`${kod.slice(0, 5)}-${kod.slice(5)}`);
  }
  return kody;
}

/** Do porównania ze skrótem: bez myślnika i wielkimi literami. */
export function normalizeRecoveryCode(kod: string): string {
  return kod.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
