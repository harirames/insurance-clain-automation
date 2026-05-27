import type { DefaultSession, DefaultJWT } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      role: string;
      memberId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role: string;
    memberId: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    role: string;
    memberId: string | null;
  }
}
