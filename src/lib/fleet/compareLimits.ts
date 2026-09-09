/**
 * How many cars a comparison holds.
 *
 * Its own module because both the server view (`lib/fleet/compare`, which pulls
 * in `server-only`) and the client picker on the saved page need these two
 * numbers. Importing the server module from a client component would drag the
 * database layer into the browser bundle — and fail the build for good reason.
 */
export const COMPARE_MIN = 2;
export const COMPARE_MAX = 3;
