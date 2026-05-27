import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/config";

export const { auth, handlers, signIn, signOut } = NextAuth(authConfig);

export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

export async function requireRole(role: "OPS" | "MEMBER") {
  const user = await requireAuth();
  if (user.role !== role) throw new Error("Forbidden");
  return user;
}
