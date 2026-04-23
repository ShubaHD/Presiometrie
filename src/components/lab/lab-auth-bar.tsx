"use client";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { LogOut, Shield } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Me = { email: string | null; role: string; displayName: string };

export function LabAuthBar() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me", { credentials: "include" })
      .then((res) => {
        if (!res.ok) return null;
        return res.json() as Promise<Me>;
      })
      .then((j) => {
        if (!cancelled) setMe(j);
      })
      .catch(() => {
        if (!cancelled) setMe(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function logout() {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (!me) {
    return (
      <span className="text-muted-foreground hidden text-xs sm:inline" aria-hidden>
        …
      </span>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      {me.role === "admin" ? (
        <Link
          href="/admin"
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs sm:text-sm"
        >
          <Shield className="size-3.5 sm:size-4" />
          <span className="hidden sm:inline">Admin</span>
        </Link>
      ) : null}
      <span className="text-muted-foreground hidden max-w-[10rem] truncate text-xs lg:inline" title={me.email ?? ""}>
        {me.displayName || me.email}
      </span>
      <button
        type="button"
        onClick={() => void logout()}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs sm:text-sm"
      >
        <LogOut className="size-3.5 sm:size-4" />
        <span className="hidden sm:inline">Ieșire</span>
      </button>
    </div>
  );
}
