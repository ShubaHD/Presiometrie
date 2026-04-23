import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export type AuthOk = { ok: true; supabase: SupabaseClient; user: User };
export type AuthFail = { ok: false; res: NextResponse };

export async function requireAuth(): Promise<AuthOk | AuthFail> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return {
      ok: false,
      res: NextResponse.json({ error: "Neautorizat. Autentificați-vă." }, { status: 401 }),
    };
  }
  return { ok: true, supabase, user };
}

export async function requireAdmin(): Promise<AuthOk | AuthFail> {
  const a = await requireAuth();
  if (!a.ok) return a;

  // Prefer service-role read: API routes sometimes see flaky JWT/RLS for `profiles`,
  // while `/admin` (RSC) can still work. Admin checks must match DB truth.
  let role: string | null | undefined;
  try {
    const admin = createAdminClient();
    const { data: profile, error } = await admin
      .from("profiles")
      .select("role")
      .eq("id", a.user.id)
      .maybeSingle();
    if (!error) {
      role = profile?.role as string | undefined;
    }
  } catch {
    /* missing/invalid SUPABASE_SERVICE_ROLE_KEY — fall back below */
  }

  if (role === undefined) {
    const { data: profile, error } = await a.supabase
      .from("profiles")
      .select("role")
      .eq("id", a.user.id)
      .maybeSingle();
    if (error) {
      return {
        ok: false,
        res: NextResponse.json(
          { error: `Nu s-a putut verifica rolul: ${error.message}` },
          { status: 500 },
        ),
      };
    }
    role = profile?.role as string | undefined;
  }

  if (role !== "admin") {
    return {
      ok: false,
      res: NextResponse.json(
        {
          error: "Acces permis doar administratorilor.",
          hint:
            "Rolul e în public.profiles (coloana role), nu în ecranul Auth din Supabase. Dacă nu e deja admin: UPDATE public.profiles SET role = 'admin' WHERE id = (SELECT id FROM auth.users WHERE email = '...'); — vezi docs/BACKUP.md.",
        },
        { status: 403 },
      ),
    };
  }
  return { ok: true, supabase: a.supabase, user: a.user };
}
