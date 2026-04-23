"use client";

import { cn } from "@/lib/utils";
import { useLabLocale } from "./lab-locale-provider";

/** Comutator RO/EN lângă setări — folosit la generare raport PDF în engleză. */
export function LabLanguageSwitcher() {
  const { locale, setLocale } = useLabLocale();

  return (
    <div
      className="border-border/80 bg-background/80 flex shrink-0 items-center overflow-hidden rounded-md border p-0.5 text-sm"
      role="group"
      aria-label="Language / Limba"
    >
      <button
        type="button"
        onClick={() => setLocale("ro")}
        className={cn(
          "inline-flex min-h-8 min-w-9 items-center justify-center gap-1.5 rounded px-2.5 text-xs font-medium",
          locale === "ro" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
        )}
        title="Română"
      >
        <span aria-hidden>🇷🇴</span>
        <span className="hidden min-[400px]:inline">RO</span>
      </button>
      <button
        type="button"
        onClick={() => setLocale("en")}
        className={cn(
          "inline-flex min-h-8 min-w-9 items-center justify-center gap-1.5 rounded px-2.5 text-xs font-medium",
          locale === "en" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
        )}
        title="English"
      >
        <span aria-hidden>🇬🇧</span>
        <span className="hidden min-[400px]:inline">EN</span>
      </button>
    </div>
  );
}
