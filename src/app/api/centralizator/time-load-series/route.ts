import { requireAuth } from "@/lib/auth/session";
import {
  buildCentralizatorTimeLoadSeries,
  buildMeasMap,
  selectIndexedUcsYoungTests,
  type CentralizatorTimeLoadKind,
} from "@/lib/centralizator/time-load-overlay";
import { toErrorMessage } from "@/lib/to-error-message";
import type { Sample, TestRow } from "@/types/lab";
import { NextResponse } from "next/server";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function parseKinds(raw: string | null): Set<CentralizatorTimeLoadKind> {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return new Set(["ucs", "young"]);
  const parts = s.split(/[, ]+/).filter(Boolean);
  const out = new Set<CentralizatorTimeLoadKind>();
  for (const p of parts) {
    if (p === "ucs") out.add("ucs");
    if (p === "young" || p === "yng" || p === "yn") out.add("young");
  }
  return out.size ? out : new Set(["ucs", "young"]);
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
    const kinds = parseKinds(searchParams.get("kinds"));

    if (!projectId) {
      return NextResponse.json({ error: "Parametru obligatoriu: projectId" }, { status: 400 });
    }

    let boreholesQuery = supabase.from("boreholes").select("id").eq("project_id", projectId).order("code");
    if (boreholeId) boreholesQuery = boreholesQuery.eq("id", boreholeId);
    const { data: boreholes, error: bErr } = await boreholesQuery;
    if (bErr) throw bErr;

    const boreholeIds = (boreholes ?? []).map((b) => b.id);
    if (boreholeIds.length === 0) {
      return NextResponse.json({ series: [] });
    }

    const { data: samples, error: sErr } = await supabase
      .from("samples")
      .select("id,borehole_id,code,depth_from,depth_to,lithology,notes")
      .in("borehole_id", boreholeIds)
      .order("code", { ascending: true });
    if (sErr) throw sErr;

    const sampleIds = (samples ?? []).map((s) => s.id);
    if (sampleIds.length === 0) {
      return NextResponse.json({ series: [] });
    }

    const testsMeta: TestRow[] = [];
    for (const group of chunk(sampleIds, 900)) {
      const { data, error } = await supabase
        .from("tests")
        .select("id,sample_id,test_type,test_date,created_at")
        .in("sample_id", group);
      if (error) throw error;
      testsMeta.push(...(((data ?? []) as unknown) as TestRow[]));
    }

    const selectedMeta = selectIndexedUcsYoungTests(
      (samples ?? []) as Sample[],
      testsMeta,
      maxPerType,
      kinds,
    );
    const needIds = [...new Set(selectedMeta.map((x) => x.test.id))];
    if (needIds.length === 0) {
      return NextResponse.json({ series: [] });
    }

    const curves: TestRow[] = [];
    for (const group of chunk(needIds, 120)) {
      const { data, error } = await supabase
        .from("tests")
        .select("id,sample_id,test_type,test_date,created_at,ucs_curve_json,young_curve_json")
        .in("id", group);
      if (error) throw error;
      curves.push(...(((data ?? []) as unknown) as TestRow[]));
    }
    const curveById = new Map(curves.map((t) => [t.id, t]));

    const selected = selectedMeta.map(({ test, sample_code, depth_from, depth_to, slot }) => {
      const c = curveById.get(test.id);
      return {
        sample_code,
        depth_from,
        depth_to,
        slot,
        test: { ...test, ...(c ?? {}) } as TestRow,
      };
    });

    const measRows: Array<{ test_id: string; key: string; value: number | null }> = [];
    for (const group of chunk(needIds, 900)) {
      const { data, error } = await supabase.from("test_measurements").select("test_id,key,value").in("test_id", group);
      if (error) throw error;
      for (const r of data ?? []) {
        measRows.push({
          test_id: String((r as { test_id: string }).test_id),
          key: String((r as { key: string }).key),
          value: (r as { value: number | null }).value,
        });
      }
    }

    const series = buildCentralizatorTimeLoadSeries({
      selected,
      measurementsByTest: buildMeasMap(measRows),
    });

    return NextResponse.json({ series });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
