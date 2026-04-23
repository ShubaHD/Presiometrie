import { LoginForm } from "@/components/auth/login-form";
import { FlaskConical } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Autentificare — Presiometrie Lab",
};

export default function LoginPage() {
  return (
    <div className="bg-background flex min-h-[100dvh] flex-col items-center justify-center gap-8 p-6">
      <Link href="/" className="text-foreground flex items-center gap-2 text-lg font-semibold">
        <FlaskConical className="size-6 opacity-80" />
        Presiometrie Lab
      </Link>
      <div className="bg-card w-full max-w-md rounded-lg border p-6 shadow-sm">
        <h1 className="mb-1 text-center text-lg font-semibold">Conectare</h1>
        <p className="text-muted-foreground mb-6 text-center text-sm">
          Folosiți contul din Supabase Auth (email și parolă).
        </p>
        <Suspense fallback={<p className="text-muted-foreground text-center text-sm">Se încarcă…</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
