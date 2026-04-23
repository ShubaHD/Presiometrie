import { createServerSupabaseClient } from "@/lib/supabase/server";
import { FlaskConical, Shield } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Administrare — Presiometrie Lab",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") redirect("/projects");

  return (
    <div className="bg-background flex min-h-[100dvh] flex-col">
      <header className="bg-card flex h-12 shrink-0 items-center justify-between gap-3 border-b px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/admin" className="text-foreground flex items-center gap-2 font-semibold tracking-tight">
            <Shield className="size-5 shrink-0 opacity-80" />
            Presiometrie Admin
          </Link>
          <nav className="text-muted-foreground ml-2 hidden items-center gap-4 text-sm sm:flex">
            <Link href="/admin" className="hover:text-foreground">
              Panou
            </Link>
            <Link href="/admin/users" className="hover:text-foreground">
              Utilizatori
            </Link>
            <Link href="/admin/archive" className="hover:text-foreground">
              Arhivă
            </Link>
            <Link href="/admin/trash" className="hover:text-foreground">
              Recycle Bin
            </Link>
            <Link href="/admin/triaxial" className="hover:text-foreground">
              Triaxial
            </Link>
          </nav>
        </div>
        <Link
          href="/projects"
          className="text-muted-foreground hover:text-foreground flex shrink-0 items-center gap-1.5 text-sm"
        >
          <FlaskConical className="size-4" />
          <span className="hidden sm:inline">Laborator</span>
        </Link>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
