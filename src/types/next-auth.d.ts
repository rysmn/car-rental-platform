import type { DefaultSession } from "next-auth";
import type { AdminRole } from "@/lib/auth/permissions";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: AdminRole;
      /**
       * Chwila zalogowania, w milisekundach.
       *
       * Potrzebna do „wyloguj ze wszystkich urządzeń": sesje są w JWT, więc
       * nie ma czego skasować po stronie serwera — jest za to znacznik
       * `admins.sessions_valid_from`. Token wydany PRZED tym znacznikiem jest
       * odrzucany przy najbliższym wejściu.
       */
      loginAt?: number;
    } & DefaultSession["user"];
  }
  interface User {
    role?: AdminRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: AdminRole;
    loginAt?: number;
  }
}
