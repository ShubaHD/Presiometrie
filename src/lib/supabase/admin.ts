import { createClient } from "@supabase/supabase-js";
import { sanitizeSupabaseKey, sanitizeSupabaseUrl } from "@/lib/supabase/env-sanitize";

function looksLikeUuidOnly(k: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k);
}

export function createAdminClient() {
  const url =
    sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) ||
    sanitizeSupabaseUrl(process.env.SUPABASE_URL) ||
    sanitizeSupabaseUrl(process.env.SUPABASE_PROJECT_URL);
  const key = sanitizeSupabaseKey(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) {
    throw new Error(
      "Lipsește SUPABASE URL sau SUPABASE_SERVICE_ROLE_KEY. Setează `NEXT_PUBLIC_SUPABASE_URL` (sau `SUPABASE_URL`) și `SUPABASE_SERVICE_ROLE_KEY` în environment.",
    );
  }
  if (key.startsWith("sb_publishable_")) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY este cheia Publishable. Folosiți Secret key (service role) din Supabase → Settings → API Keys.",
    );
  }
  if (looksLikeUuidOnly(key)) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY nu poate fi un UUID scurt — trebuie cheia Secret (service_role) din Supabase → Settings → API Keys: șirul lung sb_secret_… sau eyJ… (Reveal).",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
