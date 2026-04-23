import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { sanitizeSupabaseKey, sanitizeSupabaseUrl } from "@/lib/supabase/env-sanitize";

export async function createServerSupabaseClient() {
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
      "Lipsește URL/ANON pentru Supabase. Setează `NEXT_PUBLIC_SUPABASE_URL` și `NEXT_PUBLIC_SUPABASE_ANON_KEY` (sau echivalentele `SUPABASE_URL` + `SUPABASE_ANON_KEY`).",
    );
  }
  if (anon.startsWith("sb_secret_")) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY folosește cheia Secret (service_role). În Supabase → Settings → API Keys puneți Publishable la ANON și service_role la SUPABASE_SERVICE_ROLE_KEY (doar pe server).",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          /* setAll din Server Component fără mutație — ignorat */
        }
      },
    },
  });
}
