import { createBrowserClient } from "@supabase/ssr";
import { sanitizeSupabaseKey, sanitizeSupabaseUrl } from "@/lib/supabase/env-sanitize";

export function createBrowserSupabaseClient() {
  // Browser code needs NEXT_PUBLIC_* at build time, but we still accept non-public
  // names for environments that map them through during builds.
  const url =
    sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) ||
    sanitizeSupabaseUrl(process.env.SUPABASE_URL) ||
    sanitizeSupabaseUrl(process.env.SUPABASE_PROJECT_URL);
  const anon =
    sanitizeSupabaseKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
    sanitizeSupabaseKey(process.env.SUPABASE_ANON_KEY) ||
    sanitizeSupabaseKey(process.env.SUPABASE_PUBLIC_ANON_KEY);
  if (!url || !anon) {
    throw new Error(
      "Lipsește URL/ANON pentru Supabase. Setează `NEXT_PUBLIC_SUPABASE_URL` și `NEXT_PUBLIC_SUPABASE_ANON_KEY` la deploy.",
    );
  }
  if (anon.startsWith("sb_secret_")) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY folosește cheia Secret. În Vercel: ANON = Publishable (sb_publishable_…), nu service_role.",
    );
  }
  return createBrowserClient(url, anon);
}
