import { auth } from "@/lib/auth/session";
import { NextResponse } from "next/server";

export const proxy = auth((req) => {
  const { nextUrl, auth: session } = req;
  const isLoggedIn = !!session?.user;
  const role = session?.user?.role;

  const isPublic =
    nextUrl.pathname.startsWith("/login") ||
    nextUrl.pathname.startsWith("/api/auth") ||
    nextUrl.pathname.startsWith("/_next") ||
    nextUrl.pathname.startsWith("/favicon");

  if (!isLoggedIn && !isPublic) {
    const loginUrl = new URL("/login", nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // OPS-only routes
  const isOpsRoute =
    nextUrl.pathname.startsWith("/eval") ||
    nextUrl.pathname.startsWith("/api/eval");

  if (isLoggedIn && isOpsRoute && role !== "OPS") {
    return NextResponse.redirect(new URL("/", nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
