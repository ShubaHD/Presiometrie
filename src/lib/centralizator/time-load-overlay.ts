import { buildUcsTimeLoadChartData } from "@/lib/ucs-time-load-chart-data";
import { parseUcsCurvePayload } from "@/lib/ucs-instrumentation";
import type { YoungCurvePayload } from "@/lib/young-curve-parse";
import type { Sample, TestRow, TestType } from "@/types/lab";

export type CentralizatorTimeLoadKind = "ucs" | "young";

export type CentralizatorTimeLoadSeries = {
  test_id: string;
  sample_code: string;
  depth_from: number | null;
  depth_to: number | null;
  test_type: CentralizatorTimeLoadKind;
  /** Index 1…maxPerType pe probă (ca UCS_1 / YNG_1). */
  slot: number;
  /** Legendă / tooltip. */
  label: string;
  points: { t: number; load: number }[];
  peak_load_kn: number | null;
  peak_t_s: number | null;
  n_raw: number;
};

const MAX_POINTS_RESPONSE = 450;

function decimate<T>(rows: T[], max: number): T[] {
  if (rows.length <= max) return rows;
  const step = Math.ceil(rows.length / max);
  return rows.filter((_, i) => i % step === 0);
}

function youngPointsFromJson(raw: unknown): YoungCurvePayload["points"] | null {
  if (!raw || typeof raw !== "object") return null;
  const pts = (raw as Record<string, unknown>).points;
  if (!Array.isArray(pts)) return null;
  return pts as YoungCurvePayload["points"];
}

function measNum(m: Map<string, number | null>, key: string): number | undefined {
  const v = m.get(key);
  if (v == null || !Number.isFinite(v)) return undefined;
  return v;
}

function fmtDepth(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 100) return v.toFixed(1);
  if (abs >= 10) return v.toFixed(2);
  return v.toFixed(3);
}

function depthLabel(from: number | null, to: number | null): string {
  const a = fmtDepth(from);
  const b = fmtDepth(to);
  if (a === "—" && b === "—") return "Adâncime —";
  if (b === "—" || a === b) return `${a} m`;
  return `${a}–${b} m`;
}

export function buildMeasMap(
  rows: Array<{ test_id: string; key: string; value: number | null }>,
): Map<string, Map<string, number | null>> {
  const byTest = new Map<string, Map<string, number | null>>();
  for (const r of rows) {
    let inner = byTest.get(r.test_id);
    if (!inner) {
      inner = new Map();
      byTest.set(r.test_id, inner);
    }
    inner.set(r.key, r.value);
  }
  return byTest;
}

/** Aceeași ordine ca în `buildCentralizerRows`: test_date desc, apoi created_at desc. */
function sortTestsCentralizer(a: TestRow, b: TestRow): number {
  const da = a.test_date ?? "";
  const db = b.test_date ?? "";
  if (da !== db) return da < db ? 1 : -1;
  return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0;
}

/**
 * Teste UCS / Young incluse în coloanele indexate (max primul N pe tip și probă).
 */
export function selectIndexedUcsYoungTests(
  samples: Sample[],
  tests: TestRow[],
  maxPerType: number,
  kinds: Set<CentralizatorTimeLoadKind>,
): Array<{ test: TestRow; sample_code: string; depth_from: number | null; depth_to: number | null; slot: number }> {
  const testsBySample = new Map<string, TestRow[]>();
  for (const t of tests) {
    const list = testsBySample.get(t.sample_id) ?? [];
    list.push(t);
    testsBySample.set(t.sample_id, list);
  }

  const out: Array<{ test: TestRow; sample_code: string; depth_from: number | null; depth_to: number | null; slot: number }> = [];

  for (const s of samples) {
    const sampleTests = [...(testsBySample.get(s.id) ?? [])];
    const byType = new Map<TestType, TestRow[]>();
    for (const t of sampleTests) {
      const list = byType.get(t.test_type) ?? [];
      list.push(t);
      byType.set(t.test_type, list);
    }

    for (const [tt, list] of byType.entries()) {
      if (tt !== "ucs" && tt !== "young") continue;
      const kind: CentralizatorTimeLoadKind = tt === "ucs" ? "ucs" : "young";
      if (!kinds.has(kind)) continue;
      list.sort(sortTestsCentralizer);
      const n = Math.min(maxPerType, list.length);
      for (let idx = 0; idx < n; idx += 1) {
        out.push({
          test: list[idx]!,
          sample_code: s.code,
          depth_from: s.depth_from ?? null,
          depth_to: s.depth_to ?? null,
          slot: idx + 1,
        });
      }
    }
  }

  return out;
}

export function buildCentralizatorTimeLoadSeries(args: {
  selected: Array<{ test: TestRow; sample_code: string; depth_from: number | null; depth_to: number | null; slot: number }>;
  measurementsByTest: Map<string, Map<string, number | null>>;
}): CentralizatorTimeLoadSeries[] {
  const { selected, measurementsByTest } = args;
  const series: CentralizatorTimeLoadSeries[] = [];

  for (const { test, sample_code, depth_from, depth_to, slot } of selected) {
    const tt = test.test_type;
    if (tt !== "ucs" && tt !== "young") continue;

    const meas = measurementsByTest.get(test.id) ?? new Map();
    const diameterMm = measNum(meas, "diameter_mm");

    let rawPts: Parameters<typeof buildUcsTimeLoadChartData>[0] = [];
    if (tt === "ucs") {
      const payload = parseUcsCurvePayload(test.ucs_curve_json);
      if (!payload?.points?.length) continue;
      rawPts = payload.points;
    } else {
      const pts = youngPointsFromJson((test as { young_curve_json?: unknown }).young_curve_json);
      if (!pts?.length) continue;
      rawPts = pts as Parameters<typeof buildUcsTimeLoadChartData>[0];
    }

    const subRaw = meas.get("ucs_subtract_initial_seating");
    /** Aliniat la `TestWorkspace`: `subtractSeating` când câmpul ≠ 0; lipsă → forță brută. */
    const subtractSeating = tt === "ucs" && subRaw != null && Number(subRaw) !== 0;

    const seatRaw = measNum(meas, "ucs_seating_load_kn");
    const seatingLoadKn =
      subtractSeating && seatRaw != null && seatRaw > 0 && Number.isFinite(seatRaw) ? seatRaw : undefined;

    const { series: pts } = buildUcsTimeLoadChartData(rawPts, diameterMm, {
      subtractSeating,
      seatingLoadKn: tt === "ucs" ? seatingLoadKn : undefined,
    });

    if (pts.length < 2) continue;

    let peakLoad = -Infinity;
    let peakT: number | null = null;
    for (const p of pts) {
      if (p.load > peakLoad) {
        peakLoad = p.load;
        peakT = p.t;
      }
    }

    const kind: CentralizatorTimeLoadKind = tt === "ucs" ? "ucs" : "young";
    const tag = kind === "ucs" ? "UCS" : "Young";
    const label = `${depthLabel(depth_from, depth_to)} · ${tag} #${slot}`;

    series.push({
      test_id: test.id,
      sample_code,
      depth_from,
      depth_to,
      test_type: kind,
      slot,
      label,
      points: decimate(pts, MAX_POINTS_RESPONSE),
      peak_load_kn: Number.isFinite(peakLoad) ? peakLoad : null,
      peak_t_s: peakT,
      n_raw: pts.length,
    });
  }

  return series;
}
