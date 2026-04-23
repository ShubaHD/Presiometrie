import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    process.env.SUPABASE_PROJECT_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
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
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
