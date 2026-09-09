/**
 * Prefiks adresu czytnika dokumentów.
 *
 * Osobny, malutki plik BEZ `server-only`, bo tę jedną stałą musi znać także
 * komponent kliencki. Import `lib/storage/documents` w przeglądarce byłby
 * błędem kompilacji — i słusznie, bo tamten plik czyta dysk.
 */
export const DOCUMENT_URL_PREFIX = "/api/dokumenty";
