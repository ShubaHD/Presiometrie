import { requireAuth } from "@/lib/auth/session";
import { buildCentralizerRows } from "@/lib/centralizator/aggregate";
import { CENTRALIZER_SPECS } from "@/lib/centralizator/spec";
import { toErrorMessage } from "@/lib/to-error-message";
import type { Borehole, Project, ReportRow, Sample, TestResult, TestRow } from "@/types/lab";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

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
    const maxPerTypeRaw = parseInt(searchParams.get("maxPerType") ?? "", 10);
    const maxPerType = Number.isFinite(maxPerTypeRaw) ? Math.min(10, Math.max(1, maxPerTypeRaw)) : 3;
    if (!projectId) return NextResponse.json({ error: "Parametru obligatoriu: projectId" }, { status: 400 });

    const { data: project, error: pErr } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .is("deleted_at", null)
      .single();
    if (pErr) throw pErr;

    const { data: boreholes, error: bErr } = await supabase
      .from("boreholes")
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("code");
    if (bErr) throw bErr;

    const boreholeIds = (boreholes ?? []).map((b) => b.id);
    const { data: samples, error: sErr } = await supabase
      .from("samples")
      .select("*")
      .in("borehole_id", boreholeIds)
      .is("deleted_at", null);
    if (sErr) throw sErr;

    const sampleIds = (samples ?? []).map((s) => s.id);
    const tests: TestRow[] = [];
    for (const group of chunk(sampleIds, 900)) {
      const { data, error } = await supabase.from("tests").select("*").in("sample_id", group).is("deleted_at", null);
      if (error) throw error;
      tests.push(...((((data ?? []) as unknown) as TestRow[])));
    }
    const testIds = tests.map((t) => t.id);

    const results: TestResult[] = [];
    const reports: ReportRow[] = [];
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

    const agg = buildCentralizerRows({
      projects: [project as Project],
      boreholes: ((boreholes ?? []) as unknown) as Borehole[],
      samples: ((samples ?? []) as unknown) as Sample[],
      tests,
      results,
      reports,
      options: { maxPerType },
    });

    const wb = XLSX.utils.book_new();

    // Sheet Centralizator
    const centralRows = agg.rows.map((r) => {
      const base: Record<string, unknown> = {
        project_code: r.project_code,
        project_name: r.project_name,
        borehole_code: r.borehole_code,
        sample_code: r.sample_code,
        depth_from: r.depth_from,
        depth_to: r.depth_to,
        lithology: r.lithology,
        tests_total: r.tests_total,
      };
      for (const c of agg.columns) {
        if (c in base) continue;
        base[c] = r.values[c] ?? null;
      }
      return base;
    });
    const wsCentral = XLSX.utils.json_to_sheet(centralRows);
    XLSX.utils.book_append_sheet(wb, wsCentral, "Centralizator");

    // Sheet RawTests (wide minimal)
    const rawRows = agg.rawTests.map((t) => ({
      sample_id: t.sample_id,
      test_id: t.test_id,
      test_type: t.test_type,
      status: t.status,
      test_date: t.test_date,
      created_at: t.created_at,
      pdf_path: t.report_pdf_path,
      results_json: JSON.stringify(t.results),
    }));
    const wsRaw = XLSX.utils.json_to_sheet(rawRows);
    XLSX.utils.book_append_sheet(wb, wsRaw, "RawTests");

    // Sheet Charts (tabele statistice, fără obiecte chart)
    const ucsVals: number[] = [];
    const eVals: number[] = [];
    for (const r of agg.rows) {
      for (let i = 1; i <= maxPerType; i += 1) {
        const u = r.values[`UCS_${i}_σc`];
        const e = r.values[`UCS_${i}_E`];
        if (typeof u === "number") ucsVals.push(u);
        if (typeof e === "number") eVals.push(e);
      }
    }
    const stats = (arr: number[]) => {
      const s = [...arr].sort((a, b) => a - b);
      const n = s.length;
      const at = (p: number) => (n ? s[Math.min(n - 1, Math.max(0, Math.floor(p * (n - 1))))] : null);
      const avg = n ? s.reduce((a, b) => a + b, 0) / n : null;
      return { n, min: n ? s[0] : null, p25: at(0.25), median: at(0.5), p75: at(0.75), max: n ? s[n - 1] : null, avg };
    };
    const chartSheetRows = [
      { metric: "UCS σc (MPa)", ...stats(ucsVals) },
      { metric: "UCS E (GPa)", ...stats(eVals) },
    ];
    const wsCharts = XLSX.utils.json_to_sheet(chartSheetRows);
    XLSX.utils.book_append_sheet(wb, wsCharts, "Charts");

    // Sheet Glossary
    const glossary: Array<Record<string, unknown>> = [];
    for (const spec of Object.values(CENTRALIZER_SPECS)) {
      for (const f of spec.fields) {
        glossary.push({
          test_type: spec.testType,
          prefix: spec.prefix,
          label: f.label,
          key: f.key,
          unit: f.unit ?? "",
          decimals: f.decimals ?? "",
        });
      }
    }
    const wsGloss = XLSX.utils.json_to_sheet(glossary);
    XLSX.utils.book_append_sheet(wb, wsGloss, "Glossary");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const filename = `roca-centralizator-project-${project.code}.xlsx`;

    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename=\"${filename}\"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}

