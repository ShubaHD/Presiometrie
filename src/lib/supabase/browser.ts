import { createBrowserClient } from "@supabase/ssr";

export function createBrowserSupabaseClient() {
  // Browser code needs NEXT_PUBLIC_* at build time, but we still accept non-public
  // names for environments that map them through during builds.
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    process.env.SUPABASE_PROJECT_URL?.trim();
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_PUBLIC_ANON_KEY?.trim();
  if (!url || !anon) {
    throw new Error(
      "Lipsește URL/ANON pentru Supabase. Setează `NEXT_PUBLIC_SUPABASE_URL` și `NEXT_PUBLIC_SUPABASE_ANON_KEY` la deploy.",
    );
  }
  return createBrowserClient(url, anon);
}
