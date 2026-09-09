import "server-only";
import { Resend } from "resend";

/**
 * Transactional email transport.
 *
 * Sending and receiving share the apex domain but not their DNS records:
 *   - RECEIVING  kontakt@aacorporation.pl is a Microsoft 365 mailbox; the apex
 *     MX points at Microsoft and the apex SPF is GoDaddy's.
 *   - SENDING    the app sends through Resend as `@aacorporation.pl`, signed by
 *     the DKIM key at `resend._domainkey.aacorporation.pl`.
 *
 * Resend routes bounces via `send.aacorporation.pl` (its own MX + SPF), so it
 * never writes to the apex MX or SPF that the human mailbox depends on. The
 * `send.` subdomain is that bounce host — it is NOT a separate sending domain,
 * so the From address below must stay on the apex or Resend rejects the send.
 */

/** Missing config is not an error — it just disables sending (see `notify.ts`). */
export function getMailer(): Resend | undefined {
  const key = process.env.RESEND_API_KEY;
  if (!key) return undefined;
  return new Resend(key);
}

/**
 * Zmienna środowiskowa albo wartość domyślna — z PUSTYM ciągiem liczonym jako brak.
 *
 * Poprzednio stało tu `??`, które łapie wyłącznie `undefined` i `null`.
 * Tymczasem zmienna ustawiona na pusty ciąg to w pliku `.env` jedna z
 * najczęstszych postaci „jeszcze tego nie wypełniłem" — i tak właśnie było na
 * produkcji z `REMINDER_NOTIFY_TO=` (sprawdzone 30.08.2026 w środowisku
 * kontenera). Skutek: przypomnienia o kończącym się ubezpieczeniu i przeglądzie
 * szły na adres `""`, czyli nie szły nigdzie, a wartość zapasowa — od miesięcy
 * wpisana obok — nigdy się nie włączyła.
 *
 * Awaria tego rodzaju nie zostawia po sobie błędu w panelu. Zostawia ciszę,
 * która wygląda jak spokój.
 */
function zEnv(wartosc: string | undefined, domyslna: string): string {
  const w = wartosc?.trim();
  return w ? w : domyslna;
}

/**
 * Envelope sender. Must be on a domain verified in Resend, otherwise every
 * send is rejected at the API. Overridable so staging can send from elsewhere.
 */
export const MAIL_FROM = zEnv(
  process.env.EMAIL_FROM,
  "A&A Corporation <rezerwacje@aacorporation.pl>",
);

/** Where staff booking alerts land. The public contact mailbox by default. */
export const BOOKING_NOTIFY_TO = zEnv(
  process.env.BOOKING_NOTIFY_TO,
  "kontakt@aacorporation.pl",
);

/**
 * Where fleet expiry reminders land — insurance, roadworthiness, service.
 *
 * Falls back to the booking mailbox, which is the contact address, so the
 * reminders work with no extra configuration. Separate variable because the
 * two audiences legitimately differ: a booking alert is for whoever answers
 * customers, an expiry reminder is for whoever books the garage.
 */
export const REMINDER_NOTIFY_TO = zEnv(
  process.env.REMINDER_NOTIFY_TO,
  BOOKING_NOTIFY_TO,
);
