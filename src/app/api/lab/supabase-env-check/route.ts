import { requireAuth } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeSupabaseKey, sanitizeSupabaseUrl } from "@/lib/supabase/env-sanitize";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function keyKind(k: string): string {
  if (k.startsWith("sb_publishable_")) return "publishable";
  if (k.startsWith("sb_secret_")) return "secret";
  if (k.startsWith("eyJ")) return "jwt";
  return "unknown";
}

/** Diagnostic: anon (server client) vs service_role (admin) față de același URL. */
export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;

  const url =
    sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) ||
    sanitizeSupabaseUrl(process.env.SUPABASE_URL);
  const anon = sanitizeSupabaseKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const service = sanitizeSupabaseKey(process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { error: anonQErr } = await auth.supabase.from("tests").select("id").limit(1);
  const anonError = anonQErr?.message ?? "";

  let serviceError = "";
  if (!service) {
    serviceError = "Lipsește SUPABASE_SERVICE_ROLE_KEY în environment.";
  } else {
    try {
      const admin = createAdminClient();
      const { error } = await admin.from("tests").select("id").limit(1);
      if (error) serviceError = error.message;
    } catch (e) {
      serviceError = e instanceof Error ? e.message : String(e);
    }
  }

  let host = "";
  if (url) {
    try {
      host = new URL(url).hostname;
    } catch {
      host = "(url invalid)";
    }
  }

  return NextResponse.json({
    ok: !anonError && !serviceError,
    supabaseHost: host,
    anonKeyKind: anon ? keyKind(anon) : "missing",
    serviceKeyKind: service ? keyKind(service) : "missing",
    anonDbError: anonError || null,
    serviceRoleDbError: serviceError || null,
    hint:
      "Dacă apare „Invalid API key”: (1) toate cheile trebuie să fie din același proiect Supabase ca URL-ul; (2) ANON = Publishable, SERVICE_ROLE = Secret; (3) după schimbare pe Vercel la NEXT_PUBLIC_* faceți Redeploy (rebuild).",
  });
}
