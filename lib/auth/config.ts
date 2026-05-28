import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

import { findUserByUsername } from "@/lib/storage/usersRepo";
import { LoginSchema } from "@/lib/types";

export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },

  pages: {
    signIn: "/login",
  },

  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = LoginSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { username, password } = parsed.data;

        const user = await findUserByUsername(username);
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          role: user.role,
          memberId: user.memberId,
        };
      },
    }),
  ],

  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: string }).role;
        token.memberId = (user as { memberId: string | null }).memberId ?? null;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        // token.id is set for sessions minted after the JWT fix;
        // token.sub is NextAuth's built-in subject and always equals user.id
        session.user.id = (token.id ?? token.sub) as string;
        session.user.role = token.role as string;
        session.user.memberId = (token.memberId as string | null) ?? null;
      }
      return session;
    },
  },
};
