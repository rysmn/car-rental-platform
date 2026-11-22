/**
 * The currency this installation settles in.
 *
 * Chosen ONCE at installation via `SHOP_CURRENCY` in `.env` (`PLN` or `EUR`,
 * default `EUR`). It is deliberately not an admin setting: changing it would
 * re-interpret every stored amount. Prices are entered and stored in this
 * currency's minor units (grosze or cent), so no exchange rate is involved.
 */
export const SHOP_CURRENCY: "PLN" | "EUR" =
  process.env.SHOP_CURRENCY?.toUpperCase() === "PLN" ? "PLN" : "EUR";
