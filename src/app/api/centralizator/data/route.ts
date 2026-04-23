import { requireAuth } from "@/lib/auth/session";
import { buildCentralizerRows } from "@/lib/centralizator/aggregate";
import { toErrorMessage } from "@/lib/to-error-message";
import type { Borehole, Project, ReportRow, Sample, TestResult, TestRow } from "@/types/lab";
import { NextResponse } from "next/server";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function GET(req: Request) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;

    const { searchParams } = new URL(req.url);
    const projectId = (searchParams.get("projectId") ?? "").trim();
    const boreholeId = (searchParams.get("boreholeId") ?? "").trim();
    const maxPerTypeRaw = parseInt(searchParams.get("maxPerType") ?? "", 10);
    const maxPerType = Number.isFinite(maxPerTypeRaw) ? Math.min(10, Math.max(1, maxPerTypeRaw)) : 3;

    if (!projectId) {
      return NextResponse.json({ error: "Parametru obligatoriu: projectId" }, { status: 400 });
    }

    const { data: project, error: pErr } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .is("deleted_at", null)
      .single();
    if (pErr) throw pErr;

    let boreholesQuery = supabase
      .from("boreholes")
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("code");
    if (boreholeId) boreholesQuery = boreholesQuery.eq("id", boreholeId);
    const { data: boreholes, error: bErr } = await boreholesQuery;
    if (bErr) throw bErr;

    const boreholeIds = (boreholes ?? []).map((b) => b.id);
    if (boreholeIds.length === 0) {
      return NextResponse.json({ columns: [], rows: [], rawTests: [] });
    }

    const { data: samples, error: sErr } = await supabase
      .from("samples")
      .select("*")
      .in("borehole_id", boreholeIds)
      .is("deleted_at", null)
      .order("code", { ascending: true });
    if (sErr) throw sErr;

    const sampleIds = (samples ?? []).map((s) => s.id);
    if (sampleIds.length === 0) {
      return NextResponse.json({ columns: [], rows: [], rawTests: [] });
    }

    // tests
    const tests: TestRow[] = [];
    for (const group of chunk(sampleIds, 900)) {
      const { data, error } = await supabase
        .from("tests")
        .select("*")
        .in("sample_id", group)
        .is("deleted_at", null);
      if (error) throw error;
      tests.push(...(((data ?? []) as unknown) as TestRow[]));
    }

    const testIds = tests.map((t) => t.id);
    // results + reports
    const results: TestResult[] = [];
    const reports: ReportRow[] = [];
    if (testIds.length) {
      for (const group of chunk(testIds, 900)) {
        const [{ data: rData, error: rErr }, { data: repData, error: repErr }] = await Promise.all([
          supabase.from("test_results").select("*").in("test_id", group),
          supabase.from("reports").select("*").in("test_id", group),
        ]);
        if (rErr) throw rErr;
        if (repErr) throw repErr;
        results.push(...((((rData ?? []) as unknown) as TestResult[])));
        reports.push(...((((repData ?? []) as unknown) as ReportRow[])));
      }
    }

    const out = buildCentralizerRows({
      projects: [project as Project],
      boreholes: ((boreholes ?? []) as unknown) as Borehole[],
      samples: ((samples ?? []) as unknown) as Sample[],
      tests,
      results,
      reports,
      options: { maxPerType },
    });

    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}

