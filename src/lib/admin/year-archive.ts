import type { SupabaseClient } from "@supabase/supabase-js";

export function assertValidYear(year: number): { start: string; end: string } {
  if (!Number.isInteger(year) || year < 1970 || year > 2100) {
    throw new Error("An invalid (1970–2100).");
  }
  return {
    start: `${year}-01-01T00:00:00.000Z`,
    end: `${year + 1}-01-01T00:00:00.000Z`,
  };
}

export async function loadProjectsTreeForYearRange(
  supabase: SupabaseClient,
  start: string,
  end: string,
) {
  const { data: projects, error } = await supabase
    .from("projects")
    .select(
      `
      *,
      boreholes (
        *,
        samples (
          *,
          tests (
            *,
            test_measurements (*),
            test_results (*),
            test_files (*),
            reports (*)
          )
        )
      )
    `,
    )
    .gte("created_at", start)
    .lt("created_at", end);
  if (error) throw error;
  return projects ?? [];
}

export async function collectStoragePathsForProjects(
  supabase: SupabaseClient,
  projectIds: string[],
): Promise<{ labFiles: string[]; reports: string[]; labImports: string[] }> {
  if (projectIds.length === 0) {
    return { labFiles: [], reports: [], labImports: [] };
  }

  const { data: boreholes, error: bErr } = await supabase
    .from("boreholes")
    .select("id")
    .in("project_id", projectIds);
  if (bErr) throw bErr;
  const holeIds = (boreholes ?? []).map((r) => r.id);
  if (holeIds.length === 0) {
    return { labFiles: [], reports: [], labImports: [] };
  }

  const { data: samples, error: sErr } = await supabase.from("samples").select("id").in("borehole_id", holeIds);
  if (sErr) throw sErr;
  const sampleIds = (samples ?? []).map((r) => r.id);
  if (sampleIds.length === 0) {
    return { labFiles: [], reports: [], labImports: [] };
  }

  const { data: tests, error: tErr } = await supabase.from("tests").select("id").in("sample_id", sampleIds);
  if (tErr) throw tErr;
  const testIds = (tests ?? []).map((r) => r.id);
  if (testIds.length === 0) {
    return { labFiles: [], reports: [], labImports: [] };
  }

  const { data: files, error: fErr } = await supabase.from("test_files").select("file_path").in("test_id", testIds);
  if (fErr) throw fErr;

  const { data: reps, error: rErr } = await supabase.from("reports").select("pdf_path").in("test_id", testIds);
  if (rErr) throw rErr;

  const labImports: string[] = [];
  for (const tid of testIds) {
    const { data: objs, error: oErr } = await supabase.storage.from("lab-imports").list(tid, { limit: 1000 });
    if (oErr) continue;
    for (const o of objs ?? []) {
      if (o.name) labImports.push(`${tid}/${o.name}`);
    }
  }

  const labFiles = [...new Set((files ?? []).map((f) => f.file_path).filter(Boolean))] as string[];
  const reports = [...new Set((reps ?? []).map((r) => r.pdf_path).filter(Boolean))] as string[];

  return { labFiles, reports, labImports };
}

export function purgeConfirmationPhrase(year: number): string {
  return `DELETE-${year}`;
}
