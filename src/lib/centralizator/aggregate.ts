import type { Borehole, Project, ReportRow, Sample, TestResult, TestRow, TestType } from "@/types/lab";
import { CENTRALIZER_SPECS } from "./spec";

export type CentralizerCoreRow = {
  project_id: string;
  project_code: string;
  project_name: string;
  borehole_id: string;
  borehole_code: string;
  sample_id: string;
  sample_code: string;
  depth_from: number | null;
  depth_to: number | null;
  lithology: string | null;
  sample_notes: string | null;
};

export type CentralizerRow = CentralizerCoreRow & {
  /** Număr total de teste asociate probei. */
  tests_total: number;
  /** Coloane KPI și metadata pe test (indexate). */
  values: Record<string, number | string | null>;
};

export type AggregationOptions = {
  /** Câte teste max per tip includem în coloane. Restul rămân în RawTests. */
  maxPerType: number;
};

function numOrNull(x: unknown): number | null {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

/** Eticheta coloanei σc în `CENTRALIZER_SPECS` (UCS și Young). */
const SIGMA_C_COL_LABEL = "σc";

/** Rezumat: prima valoare σc din sloturile 1…N pentru prefix UCS / YNG. */
export const CENTRALIZER_SIGMA_C_UCS_KEY = "σc_UCS";
export const CENTRALIZER_SIGMA_C_YOUNG_KEY = "σc_Young";

function firstSlotSigmaC(
  values: Record<string, number | string | null>,
  prefix: "UCS" | "YNG",
  maxPerType: number,
): number | null {
  for (let i = 1; i <= maxPerType; i += 1) {
    const k = `${prefix}_${i}_${SIGMA_C_COL_LABEL}`;
    const v = values[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

export function buildCentralizerRows(args: {
  projects: Project[];
  boreholes: Borehole[];
  samples: Sample[];
  tests: TestRow[];
  results: TestResult[];
  reports: ReportRow[];
  options: AggregationOptions;
}): {
  columns: string[];
  rows: CentralizerRow[];
  rawTests: Array<{
    test_id: string;
    sample_id: string;
    test_type: TestType;
    status: string;
    test_date: string | null;
    created_at: string;
    report_pdf_path: string | null;
    results: Record<string, number | string | null>;
  }>;
} {
  const { projects, boreholes, samples, tests, results, reports, options } = args;

  const projById = new Map(projects.map((p) => [p.id, p]));
  const holeById = new Map(boreholes.map((b) => [b.id, b]));

  const testsBySample = new Map<string, TestRow[]>();
  for (const t of tests) {
    const list = testsBySample.get(t.sample_id) ?? [];
    list.push(t);
    testsBySample.set(t.sample_id, list);
  }

  const resultsByTest = new Map<string, TestResult[]>();
  for (const r of results) {
    const list = resultsByTest.get(r.test_id) ?? [];
    list.push(r);
    resultsByTest.set(r.test_id, list);
  }

  const reportsByTest = new Map<string, ReportRow[]>();
  for (const rep of reports) {
    const list = reportsByTest.get(rep.test_id) ?? [];
    list.push(rep);
    reportsByTest.set(rep.test_id, list);
  }
  for (const list of reportsByTest.values()) {
    list.sort((a, b) => (a.generated_at < b.generated_at ? 1 : a.generated_at > b.generated_at ? -1 : 0));
  }

  // Coloane: core + KPI multiple.
  const columns: string[] = [
    "project_code",
    "project_name",
    "borehole_code",
    "sample_code",
    "depth_from",
    "depth_to",
    "lithology",
    "tests_total",
  ];
  for (const tt of Object.keys(CENTRALIZER_SPECS) as TestType[]) {
    const spec = CENTRALIZER_SPECS[tt];
    for (let i = 1; i <= options.maxPerType; i += 1) {
      for (const f of spec.fields) {
        columns.push(`${spec.prefix}_${i}_${f.label}`);
      }
      columns.push(`${spec.prefix}_${i}_status`);
      columns.push(`${spec.prefix}_${i}_date`);
      columns.push(`${spec.prefix}_${i}_pdf`);
    }
  }

  columns.splice(8, 0, CENTRALIZER_SIGMA_C_UCS_KEY, CENTRALIZER_SIGMA_C_YOUNG_KEY);

  const rawTests: Array<{
    test_id: string;
    sample_id: string;
    test_type: TestType;
    status: string;
    test_date: string | null;
    created_at: string;
    report_pdf_path: string | null;
    results: Record<string, number | string | null>;
  }> = [];

  const rows: CentralizerRow[] = [];

  for (const s of samples) {
    const hole = holeById.get(s.borehole_id);
    const project = hole ? projById.get(hole.project_id) : undefined;
    if (!hole || !project) continue;

    const sampleTests = [...(testsBySample.get(s.id) ?? [])];
    const values: Record<string, number | string | null> = {};

    // Grupare pe tip.
    const byType = new Map<TestType, TestRow[]>();
    for (const t of sampleTests) {
      const list = byType.get(t.test_type) ?? [];
      list.push(t);
      byType.set(t.test_type, list);
    }

    for (const [tt, list] of byType.entries()) {
      // Ordonare: test_date desc, apoi created_at desc.
      list.sort((a, b) => {
        const da = a.test_date ?? "";
        const db = b.test_date ?? "";
        if (da !== db) return da < db ? 1 : -1;
        return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0;
      });

      const spec = CENTRALIZER_SPECS[tt];
      for (let idx = 0; idx < Math.min(options.maxPerType, list.length); idx += 1) {
        const t = list[idx];
        const i = idx + 1;
        const prefix = spec.prefix;

        const tRes = resultsByTest.get(t.id) ?? [];
        const map: Record<string, number | string | null> = {};
        for (const r of tRes) {
          map[r.key] = r.value;
        }

        for (const f of spec.fields) {
          const v = map[f.key];
          values[`${prefix}_${i}_${f.label}`] = v == null ? null : numOrNull(v);
        }

        values[`${prefix}_${i}_status`] = t.status ?? null;
        values[`${prefix}_${i}_date`] = t.test_date ?? null;
        const rep = (reportsByTest.get(t.id) ?? [])[0];
        values[`${prefix}_${i}_pdf`] = rep?.pdf_path ?? null;

        rawTests.push({
          test_id: t.id,
          sample_id: t.sample_id,
          test_type: t.test_type,
          status: t.status,
          test_date: t.test_date ?? null,
          created_at: t.created_at,
          report_pdf_path: rep?.pdf_path ?? null,
          results: map,
        });
      }

      // Restul (peste maxPerType) intră doar în RawTests.
      for (let idx = options.maxPerType; idx < list.length; idx += 1) {
        const t = list[idx];
        const tRes = resultsByTest.get(t.id) ?? [];
        const map: Record<string, number | string | null> = {};
        for (const r of tRes) {
          map[r.key] = r.value;
        }
        const rep = (reportsByTest.get(t.id) ?? [])[0];
        rawTests.push({
          test_id: t.id,
          sample_id: t.sample_id,
          test_type: t.test_type,
          status: t.status,
          test_date: t.test_date ?? null,
          created_at: t.created_at,
          report_pdf_path: rep?.pdf_path ?? null,
          results: map,
        });
      }
    }

    values[CENTRALIZER_SIGMA_C_UCS_KEY] = firstSlotSigmaC(values, "UCS", options.maxPerType);
    values[CENTRALIZER_SIGMA_C_YOUNG_KEY] = firstSlotSigmaC(values, "YNG", options.maxPerType);

    rows.push({
      project_id: project.id,
      project_code: project.code,
      project_name: project.name,
      borehole_id: hole.id,
      borehole_code: hole.code,
      sample_id: s.id,
      sample_code: s.code,
      depth_from: s.depth_from,
      depth_to: s.depth_to,
      lithology: s.lithology,
      sample_notes: s.notes,
      tests_total: sampleTests.length,
      values,
    });
  }

  // Sortare: foraj, apoi probă (lexic).
  rows.sort((a, b) => {
    if (a.borehole_code !== b.borehole_code) return a.borehole_code.localeCompare(b.borehole_code);
    return a.sample_code.localeCompare(b.sample_code);
  });

  return { columns, rows, rawTests };
}

