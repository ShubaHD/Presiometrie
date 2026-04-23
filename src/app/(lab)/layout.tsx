import { LabAuthBar } from "@/components/lab/lab-auth-bar";
import { LabLanguageSwitcher } from "@/components/lab/lab-language-switcher";
import { LabLocaleProvider } from "@/components/lab/lab-locale-provider";
import { LabShell } from "@/components/lab/lab-shell";
import { BarChart3, FlaskConical, Settings } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Presiometrie Lab — Încercări presiometrice",
  description: "Laborator geotehnic: proiecte, foraje, probe, teste — presiometrie SR EN ISO 22476-5",
};

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return (
    <LabLocaleProvider>
      <div className="bg-background flex h-[100dvh] flex-col overflow-hidden">
        <header className="bg-card flex h-12 shrink-0 items-center justify-between gap-2 border-b px-4 sm:gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/projects" className="text-foreground flex items-center gap-2 font-semibold tracking-tight">
              <FlaskConical className="size-5 shrink-0 opacity-80" />
              Presiometrie Lab
            </Link>
            <span className="text-muted-foreground hidden text-sm sm:inline">SR EN ISO 22476-5</span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
            <LabAuthBar />
            <Link
              href="/centralizare"
              className="text-muted-foreground hover:text-foreground hidden shrink-0 items-center gap-1.5 text-sm sm:flex"
            >
              <BarChart3 className="size-4" />
              <span>Centralizare</span>
            </Link>
            <LabLanguageSwitcher />
            <Link
              href="/settings"
              className="text-muted-foreground hover:text-foreground flex shrink-0 items-center gap-1.5 text-sm"
            >
              <Settings className="size-4" />
              <span className="hidden sm:inline">Laborator & rapoarte</span>
            </Link>
          </div>
        </header>
        <LabShell>{children}</LabShell>
      </div>
    </LabLocaleProvider>
  );
}
