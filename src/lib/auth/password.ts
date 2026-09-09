// Server-only entry point for password hashing. The implementation lives in
// `./password-core` so the `admin:create` CLI script can reuse the exact same
// argon2 parameters — `server-only` is a Next build-time alias and does not
// resolve under plain Node/tsx.
import "server-only";

export { hashPassword, verifyPassword } from "./password-core";
