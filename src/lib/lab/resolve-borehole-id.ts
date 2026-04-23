import type { SupabaseClient } from "@supabase/supabase-js";

export function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim());
}

/**
 * Resolves a borehole route param to a UUID.
 *
 * Supports:
 * - UUID (id)
 * - borehole code/name (when unique enough)
 * - borehole code/name scoped by `projectId` (recommended)
 */
export async function resolveBoreholeUuid(
  supabase: SupabaseClient,
  boreholeId: string,
  projectId?: string | null,
): Promise<string> {
  const raw = boreholeId.trim();
  if (isUuid(raw)) return raw;

  const pid = projectId?.trim() || null;

  const base = () =>
    supabase.from("boreholes").select("id").is("deleted_at", null);

  if (pid && isUuid(pid)) {
    const { data: byCodeInProject } = await base()
      .eq("project_id", pid)
      .eq("code", raw)
      .maybeSingle();
    if (byCodeInProject?.id) return String(byCodeInProject.id);

    const { data: byNameInProject } = await base()
      .eq("project_id", pid)
      .eq("name", raw)
      .maybeSingle();
    if (byNameInProject?.id) return String(byNameInProject.id);
  }

  const { data: byCode } = await base().eq("code", raw).maybeSingle();
  if (byCode?.id) return String(byCode.id);

  const { data: byName } = await base().eq("name", raw).maybeSingle();
  if (byName?.id) return String(byName.id);

  throw new Error(
    `Foraj invalid: "${boreholeId}". Așteptam UUID (id) sau un cod/nume existent${pid ? ` în proiectul selectat` : ""}.`,
  );
}
