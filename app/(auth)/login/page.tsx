import { Suspense } from "react";

import { LoginForm } from "@/components/auth/LoginForm";

export const metadata = { title: "Sign in — Plum Claims" };

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Plum Claims</h1>
          <p className="text-muted-foreground mt-1 text-sm">Sign in to continue</p>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
