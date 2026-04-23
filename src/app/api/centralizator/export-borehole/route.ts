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
    const boreholeId = (searchParams.get("boreholeId") ?? "").trim();
    const maxPerTypeRaw = parseInt(searchParams.get("maxPerType") ?? "", 10);
    const maxPerType = Number.isFinite(maxPerTypeRaw) ? Math.min(10, Math.max(1, maxPerTypeRaw)) : 3;
    if (!boreholeId) return NextResponse.json({ error: "Parametru obligatoriu: boreholeId" }, { status: 400 });

    const { data: borehole, error: bErr } = await supabase
      .from("boreholes")
      .select("*")
      .eq("id", boreholeId)
      .is("deleted_at", null)
      .single();
    if (bErr) throw bErr;

    const { data: project, error: pErr } = await supabase
      .from("projects")
      .select("*")
      .eq("id", borehole.project_id)
      .is("deleted_at", null)
      .single();
    if (pErr) throw pErr;

    const { data: samples, error: sErr } = await supabase
      .from("samples")
      .select("*")
      .eq("borehole_id", boreholeId)
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
      boreholes: [borehole as Borehole],
      samples: ((samples ?? []) as unknown) as Sample[],
      tests,
      results,
      reports,
      options: { maxPerType },
    });

    const wb = XLSX.utils.book_new();
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
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(centralRows), "Centralizator");

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
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawRows), "RawTests");

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
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(glossary), "Glossary");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const filename = `roca-centralizator-borehole-${borehole.code}.xlsx`;

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

