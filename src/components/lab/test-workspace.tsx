"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { jsonLabHeaders, labUserFetchHeaders } from "@/lib/lab-client-user";
import { useLabLocale } from "@/components/lab/lab-locale-provider";
import { reportsStorageBucket } from "@/lib/reports-bucket";
import { MEASUREMENT_PRESETS } from "@/lib/measurement-presets";
import { PMT_PROBE_DIAMETER_MM, PMT_SEATING_R_MM_DEFAULT } from "@/lib/presiometry-defaults";
import { parsePresiometryCurvePayload } from "@/lib/presiometry-curve";
import { validateMeasurementsForTestType } from "@/lib/measurement-schemas";
import { newTestOptionLabel } from "@/lib/test-type-options";
import type { ReportRow, TestMeasurement, TestResult, TestRow, TestType } from "@/types/lab";
import { Crosshair, ExternalLink, Hand, Loader2, MousePointer2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { useForm } from "react-hook-form";
import { LabBreadcrumb } from "./lab-breadcrumb";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PresiometryManualSettings } from "@/modules/calculations/presiometry-manual";
import {
  parsePresiometryManualSettings,
  PRESIOMETRY_MANUAL_LOOP_UI_SLOTS,
} from "@/modules/calculations/presiometry-manual";
import type { PresiometryRegressionSegment } from "@/modules/calculations/presiometry-regression-segments";
import {
  buildProgramARegressionSegments,
  buildProgramBRegressionSegments,
  tangentEndpointsRawX,
} from "@/modules/calculations/presiometry-regression-segments";
import { KPA_PER_MPA } from "@/modules/calculations/presiometry-mp";
import { detectLoopsByPressure, extractPvPoints, pWindow3070 } from "@/modules/calculations/presiometry-utils";

type ApiGet = {
  test: TestRow & {
    sample?: {
      id: string;
      code: string;
      borehole?: { id: string; code: string; project?: { id: string; code: string } };
    };
  };
  measurements: TestMeasurement[];
  results: TestResult[];
  files: Array<{ id: string; file_name: string; file_path: string; uploaded_at: string; file_role?: string | null }>;
  reports: ReportRow[];
};

function readSpecimenPhotosInclude(reportOptionsJson: unknown): boolean {
  if (reportOptionsJson == null) return true;
  if (typeof reportOptionsJson !== "object") return true;
  const sp = (reportOptionsJson as Record<string, unknown>).specimen_photos;
  if (sp && typeof sp === "object" && "include" in sp) {
    return Boolean((sp as Record<string, unknown>).include);
  }
  return true;
}

function isPresiometryType(tt: unknown): tt is TestType {
  return (
    tt === "presiometry_program_a" ||
    tt === "presiometry_program_b" ||
    tt === "presiometry_program_c"
  );
}

/** Domeniu numeric cu marjă — evită axa X de la 0 când toate valorile sunt într-un pliu îngust (ex. R ≈ 36 mm). */
function axisDomainPadded(values: number[], padRatio = 0.06): [number, number] | undefined {
  if (!values.length) return undefined;
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return undefined;
  const span = hi - lo;
  const pad =
    span > 0 ? span * padRatio : Math.max(Math.abs(lo), Math.abs(hi), 1e-6) * Math.max(padRatio, 0.02);
  return [lo - pad, hi + pad];
}

type ChartNavMode = "hand" | "cursor";

function PresiometryChartZoomShell({
  navMode,
  onNavModeChange,
  disableTransform,
  children,
}: {
  navMode: ChartNavMode;
  onNavModeChange: (m: ChartNavMode) => void;
  disableTransform: boolean;
  children: ReactNode;
}) {
  return (
    <TransformWrapper
      disabled={disableTransform}
      minScale={0.35}
      maxScale={10}
      limitToBounds={false}
      centerOnInit
      panning={{
        disabled: disableTransform || navMode !== "hand",
        allowLeftClickPan: true,
      }}
      wheel={{ step: 0.12, disabled: disableTransform }}
      pinch={{ disabled: disableTransform }}
      doubleClick={{ disabled: true }}
    >
      {(ctx) => (
        <div className="w-full">
          <div className="mb-1 flex flex-wrap items-center justify-end gap-1">
            <Button
              type="button"
              variant={navMode === "hand" ? "default" : "outline"}
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              title="Mână: trageți pentru panoramare; rotița = zoom"
              onClick={() => onNavModeChange("hand")}
            >
              <Hand className="size-3.5" />
              Mână
            </Button>
            <Button
              type="button"
              variant={navMode === "cursor" ? "default" : "outline"}
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              title="Cursor: fără panoramare la drag"
              onClick={() => onNavModeChange("cursor")}
            >
              <MousePointer2 className="size-3.5" />
              Cursor
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={disableTransform}
              onClick={() => void ctx.resetTransform()}
            >
              Reset zoom
            </Button>
          </div>
          <TransformComponent
            wrapperClass="w-full max-w-full overflow-hidden rounded-md border border-border/80 bg-background"
            wrapperStyle={{
              width: "100%",
              maxWidth: "100%",
              height: 280,
              touchAction: disableTransform ? undefined : "none",
            }}
            contentClass="!block !h-[280px] !w-full !min-h-[280px] !min-w-0 !max-w-full"
            contentStyle={{
              width: "100%",
              maxWidth: "100%",
              height: 280,
              minHeight: 280,
              display: "block",
            }}
          >
            {children}
          </TransformComponent>
        </div>
      )}
    </TransformWrapper>
  );
}

/** Ticks pe axa R sau δ (mm): preferință 0,5 mm; dacă ar fi prea dese, trece la 1 mm. */
function xTicksHalfMmOrCoarser(
  domain: [number, number] | undefined,
  dataLo: number,
  dataHi: number,
  maxTicks = 55,
): number[] {
  const lo = domain ? Math.min(domain[0], domain[1]) : Math.min(dataLo, dataHi);
  const hi = domain ? Math.max(domain[0], domain[1]) : Math.max(dataLo, dataHi);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return [];
  const halfLo = Math.floor(lo * 2);
  const halfHi = Math.ceil(hi * 2);
  if (halfHi - halfLo + 1 <= maxTicks) {
    const ticks: number[] = [];
    for (let h = halfLo; h <= halfHi; h++) ticks.push(h / 2);
    return ticks;
  }
  const mmLo = Math.floor(lo);
  const mmHi = Math.ceil(hi);
  const ticks: number[] = [];
  for (let m = mmLo; m <= mmHi; m++) ticks.push(m);
  return ticks;
}

function formatMmAxisTick(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "";
  const r = Math.round(n * 10) / 10;
  const ri = Math.round(r);
  return Math.abs(r - ri) < 1e-5 ? String(ri) : r.toFixed(1);
}

function toIndex(s: string): number | null {
  const n = Number(String(s ?? "").trim());
  return Number.isFinite(n) ? Math.floor(n) : null;
}

function indexRange(a: string, b: string): { from: number; to: number } | null {
  const from = toIndex(a);
  const to = toIndex(b);
  if (from == null || to == null) return null;
  if (from === to) return null;
  return { from: Math.min(from, to), to: Math.max(from, to) };
}

/** Manual efectiv pentru previzualizare grafic: draft dacă mod manual, altfel setările salvate. */
function buildEffectiveManual(
  draft: {
    mode: "auto" | "manual";
    load1_from: string;
    load1_to: string;
    loops: Array<{
      unload_from: string;
      unload_to: string;
      reload_from: string;
      reload_to: string;
      gur_from: string;
      gur_to: string;
    }>;
  },
  saved: PresiometryManualSettings | null,
  xKind: "radius_mm" | "volume_cm3",
): PresiometryManualSettings {
  if (draft.mode === "auto") return saved ?? { mode: "auto" };
  const load1 = indexRange(draft.load1_from, draft.load1_to);
  const loops = draft.loops.map((row) => ({
    unload: indexRange(row.unload_from, row.unload_to),
    reload: indexRange(row.reload_from, row.reload_to),
    gur: indexRange(row.gur_from, row.gur_to),
  }));
  return { mode: "manual", x_kind: xKind, load1, loops };
}

function tangentLineTwoPoints(
  seg: PresiometryRegressionSegment,
  space: "raw" | "delta",
  r0: number,
): Array<{ x: number; p_kpa: number }> {
  const { slope, intercept } = seg.regression;
  if (slope == null || intercept == null || seg.xsV.length < 1) return [];
  const xMin = Math.min(...seg.xsV);
  const xMax = Math.max(...seg.xsV);
  const e = tangentEndpointsRawX(slope, intercept, xMin, xMax, 0.08);
  if (!e) return [];
  if (space === "raw") {
    return [
      { x: e.x1, p_kpa: e.p1 },
      { x: e.x2, p_kpa: e.p2 },
    ];
  }
  return [
    { x: e.x1 - r0, p_kpa: e.p1 },
    { x: e.x2 - r0, p_kpa: e.p2 },
  ];
}

export function TestWorkspace({
  projectId,
  boreholeId,
  sampleId,
  testId,
}: {
  projectId: string;
  boreholeId: string;
  sampleId: string;
  testId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [test, setTest] = useState<ApiGet["test"] | null>(null);
  const [measurements, setMeasurements] = useState<TestMeasurement[]>([]);
  const [results, setResults] = useState<TestResult[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [specimenPhotosInPdf, setSpecimenPhotosInPdf] = useState(true);
  const { locale: reportLocale } = useLabLocale();

  /** `silent`: nu ascunde întreg ecranul (păstrează tab-ul activ); folosit după salvări / calcule. */
  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/tests/${testId}`);
      const json = (await res.json()) as ApiGet & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Eroare încărcare test.");
      setTest(json.test);
      setMeasurements(json.measurements ?? []);
      setResults(json.results ?? []);
      setReports(json.reports ?? []);
      setSpecimenPhotosInPdf(readSpecimenPhotosInclude((json.test as TestRow).report_options_json));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Eroare");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [testId]);

  useEffect(() => {
    void load();
  }, [load]);

  const testType = (test as { test_type?: unknown } | null)?.test_type;
  const okType = isPresiometryType(testType) ? testType : null;

  const curve = useMemo(() => {
    if (!test || !okType) return null;
    return parsePresiometryCurvePayload((test as { presiometry_curve_json?: unknown }).presiometry_curve_json);
  }, [test, okType]);

  const xKind = curve?.x_kind === "radius_mm" ? "radius_mm" : "volume_cm3";
  const xLabel = xKind === "radius_mm" ? "R (mm)" : "V (cm³)";
  /** Deplasare radială corectată față de așezare (SR EN ISO 22476-5 — notație δ); în date = Δ față de R la așezare. */
  const xLabelDelta = xKind === "radius_mm" ? "δ (mm)" : "ΔV (cm³)";

  const byKey = useMemo(() => {
    const m = new Map<string, TestMeasurement>();
    for (const r of measurements) m.set(r.key, r);
    return m;
  }, [measurements]);

  const seatingRmm = useMemo(() => {
    const raw = byKey.get("pmt_seating_r_mm")?.value;
    const n =
      raw === null || raw === undefined
        ? NaN
        : typeof raw === "number"
          ? raw
          : Number(String(raw).replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : PMT_SEATING_R_MM_DEFAULT;
  }, [byKey]);

  const chartSeries = useMemo(() => {
    type PrRow = { x: number; p_kpa: number; p_mpa: number; idx: number };
    const pvPts = extractPvPoints(curve);
    if (pvPts.length === 0)
      return {
        pr: [] as PrRow[],
        pdr: [] as PrRow[],
        loops: [] as ReturnType<typeof detectLoopsByPressure>,
        w3070: null as null | { p30: number; p70: number },
        w3070Mpa: null as null | { p30: number; p70: number },
        prXDomain: undefined as [number, number] | undefined,
        pdrXDomain: undefined as [number, number] | undefined,
        nPoints: 0,
        r0: 0,
      };
    const r0 = xKind === "radius_mm" ? seatingRmm : pvPts[0]!.x;
    const pr: PrRow[] = pvPts.map((p, idx) => ({
      x: p.x,
      p_kpa: p.p_kpa,
      p_mpa: p.p_kpa / KPA_PER_MPA,
      idx,
    }));
    const pdr: PrRow[] = pvPts.map((p, idx) => ({
      x: p.x - r0,
      p_kpa: p.p_kpa,
      p_mpa: p.p_kpa / KPA_PER_MPA,
      idx,
    }));
    const loops = detectLoopsByPressure(pvPts);
    const pMin = Math.min(...pvPts.map((p) => p.p_kpa));
    const pMax = Math.max(...pvPts.map((p) => p.p_kpa));
    const w3070 = pWindow3070(pMin, pMax);
    const w3070Mpa =
      w3070 && Number.isFinite(w3070.p30) && Number.isFinite(w3070.p70)
        ? { p30: w3070.p30 / KPA_PER_MPA, p70: w3070.p70 / KPA_PER_MPA }
        : null;
    const prXDomain = axisDomainPadded(pr.map((p) => p.x));
    const pdrXDomain = axisDomainPadded(pdr.map((p) => p.x));
    return { pr, pdr, loops, w3070, w3070Mpa, prXDomain, pdrXDomain, nPoints: pvPts.length, r0 };
  }, [curve, xKind, seatingRmm]);

  const prXAxisRadiusTicks = useMemo(() => {
    if (xKind !== "radius_mm" || chartSeries.pr.length === 0) return null;
    const xs = chartSeries.pr.map((p) => p.x);
    const d0 = Math.min(...xs);
    const d1 = Math.max(...xs);
    return xTicksHalfMmOrCoarser(chartSeries.prXDomain, d0, d1);
  }, [xKind, chartSeries.pr, chartSeries.prXDomain]);

  const pdrXAxisDeltaTicks = useMemo(() => {
    if (xKind !== "radius_mm" || chartSeries.pdr.length === 0) return null;
    const xs = chartSeries.pdr.map((p) => p.x);
    const d0 = Math.min(...xs);
    const d1 = Math.max(...xs);
    return xTicksHalfMmOrCoarser(chartSeries.pdrXDomain, d0, d1);
  }, [xKind, chartSeries.pdr, chartSeries.pdrXDomain]);

  const manualSettings = useMemo(() => {
    if (!test) return null;
    return parsePresiometryManualSettings(
      (test as { presiometry_settings_json?: unknown }).presiometry_settings_json ?? null,
    );
  }, [test]);

  const [manualDraft, setManualDraft] = useState(() => ({
    mode: "auto" as "auto" | "manual",
    load1_from: "",
    load1_to: "",
    loops: Array.from({ length: PRESIOMETRY_MANUAL_LOOP_UI_SLOTS }).map(() => ({
      unload_from: "",
      unload_to: "",
      reload_from: "",
      reload_to: "",
      gur_from: "",
      gur_to: "",
    })),
  }));

  useEffect(() => {
    const mode = manualSettings?.mode ?? "auto";
    const load1 = manualSettings?.load1 ?? null;
    const loops = manualSettings?.loops ?? [];
    setManualDraft((d) => ({
      ...d,
      mode,
      load1_from: load1 ? String(load1.from) : "",
      load1_to: load1 ? String(load1.to) : "",
      loops: d.loops.map((row, i) => {
        const src = loops[i];
        return {
          unload_from: src?.unload ? String(src.unload.from) : "",
          unload_to: src?.unload ? String(src.unload.to) : "",
          reload_from: src?.reload ? String(src.reload.from) : "",
          reload_to: src?.reload ? String(src.reload.to) : "",
          gur_from: src?.gur ? String(src.gur.from) : "",
          gur_to: src?.gur ? String(src.gur.to) : "",
        };
      }),
    }));
  }, [manualSettings]);

  const effectiveManual = useMemo(
    () => buildEffectiveManual(manualDraft, manualSettings, xKind),
    [manualDraft, manualSettings, xKind],
  );

  const regressionSegments = useMemo(() => {
    if (!okType || !curve || chartSeries.nPoints < 2) return null;
    const pvPts = extractPvPoints(curve);
    const loops = detectLoopsByPressure(pvPts);
    if (okType === "presiometry_program_a") {
      return buildProgramARegressionSegments(pvPts, effectiveManual, loops);
    }
    if (okType === "presiometry_program_b") {
      return buildProgramBRegressionSegments(pvPts, effectiveManual, loops);
    }
    return null;
  }, [okType, curve, effectiveManual, chartSeries.nPoints]);

  const presiometryViz = useMemo(() => {
    type Area = { key: string; x1: number; x2: number; fill: string };
    type Tan = { key: string; label: string; pts: Array<{ x: number; p_mpa: number }>; stroke: string };
    const empty = { areasPr: [] as Area[], areasPdr: [] as Area[], tangentsPr: [] as Tan[], tangentsPdr: [] as Tan[] };
    if (!regressionSegments || !curve) return empty;
    const pv = extractPvPoints(curve);
    if (!pv.length) return empty;
    const r0 = chartSeries.r0;
    const fills = ["oklch(0.55 0.12 250 / 0.12)", "oklch(0.55 0.14 30 / 0.12)", "oklch(0.5 0.12 150 / 0.12)"];
    const strokes = ["oklch(0.42 0.16 250)", "oklch(0.5 0.18 30)", "oklch(0.42 0.14 150)", "oklch(0.45 0.12 300)"];
    const pickStroke = (i: number) => strokes[i % strokes.length]!;

    const xExtent = (seg: PresiometryRegressionSegment | null): [number, number] | null => {
      if (!seg) return null;
      if (seg.indexFrom != null && seg.indexTo != null && pv[seg.indexFrom!] && pv[seg.indexTo!]) {
        const a = pv[seg.indexFrom]!.x;
        const b = pv[seg.indexTo]!.x;
        return [Math.min(a, b), Math.max(a, b)];
      }
      if (seg.xsV.length) return [Math.min(...seg.xsV), Math.max(...seg.xsV)];
      return null;
    };

    const areasPr: Area[] = [];
    const areasPdr: Area[] = [];
    let fi = 0;

    const pushSeg = (seg: PresiometryRegressionSegment | null, key: string) => {
      const xr = xExtent(seg);
      if (!xr || !seg) return;
      const fill = fills[fi % fills.length]!;
      fi++;
      areasPr.push({ key: `a-pr-${key}`, x1: xr[0], x2: xr[1], fill });
      areasPdr.push({
        key: `a-pdr-${key}`,
        x1: xr[0] - r0,
        x2: xr[1] - r0,
        fill,
      });
    };

    const tangentsPr: Tan[] = [];
    const tangentsPdr: Tan[] = [];
    let ti = 0;

    const pushTan = (seg: PresiometryRegressionSegment | null) => {
      if (!seg) return;
      const pr = tangentLineTwoPoints(seg, "raw", r0);
      if (pr.length < 2) return;
      const pdr = tangentLineTwoPoints(seg, "delta", r0);
      if (pdr.length < 2) return;
      const stroke = pickStroke(ti++);
      tangentsPr.push({
        key: `t-pr-${seg.symbol}`,
        label: seg.symbol,
        pts: pr.map(({ x, p_kpa }) => ({ x, p_mpa: p_kpa / KPA_PER_MPA })),
        stroke,
      });
      tangentsPdr.push({
        key: `t-pdr-${seg.symbol}`,
        label: seg.symbol,
        pts: pdr.map(({ x, p_kpa }) => ({ x, p_mpa: p_kpa / KPA_PER_MPA })),
        stroke,
      });
    };

    if (regressionSegments.load1) {
      pushSeg(regressionSegments.load1, "GL1");
      pushTan(regressionSegments.load1);
    }
    if (okType === "presiometry_program_b") {
      const loopsB = regressionSegments.loops as Array<{ gUr: PresiometryRegressionSegment | null }>;
      loopsB.forEach((pair, i) => {
        if (pair.gUr) {
          pushSeg(pair.gUr, `GUR${i + 1}`);
          pushTan(pair.gUr);
        }
      });
    } else {
      const loopsA = regressionSegments.loops as Array<{
        unload: PresiometryRegressionSegment | null;
        reload: PresiometryRegressionSegment | null;
      }>;
      loopsA.forEach((pair, i) => {
        if (pair.unload) {
          pushSeg(pair.unload, `GU${i + 1}`);
          pushTan(pair.unload);
        }
        if (pair.reload) {
          pushSeg(pair.reload, `GR${i + 1}`);
          pushTan(pair.reload);
        }
      });
    }

    return { areasPr, areasPdr, tangentsPr, tangentsPdr };
  }, [regressionSegments, curve, chartSeries.r0, okType]);

  type ChartPickTarget =
    | null
    | "load1_from"
    | "load1_to"
    | { k: "unload_from"; loop: number }
    | { k: "unload_to"; loop: number }
    | { k: "reload_from"; loop: number }
    | { k: "reload_to"; loop: number }
    | { k: "gur_from"; loop: number }
    | { k: "gur_to"; loop: number };

  const [chartPick, setChartPick] = useState<ChartPickTarget>(null);
  const [chartNavPr, setChartNavPr] = useState<ChartNavMode>("cursor");
  const [chartNavPdr, setChartNavPdr] = useState<ChartNavMode>("cursor");

  const showRegressionOverlays =
    manualDraft.mode === "auto" && (okType === "presiometry_program_a" || okType === "presiometry_program_b");

  /** Puncte fixe pe grafic pentru indicii setați în mod Manual (rămân vizibile după click). */
  const manualPickMarkers = useMemo(() => {
    if (manualDraft.mode !== "manual" || chartSeries.pr.length === 0) {
      return [] as Array<{ key: string; idx: number; label: string; fill: string; stroke: string }>;
    }
    const n = chartSeries.pr.length;
    const out: Array<{ key: string; idx: number; label: string; fill: string; stroke: string }> = [];
    const pushIf = (key: string, idxStr: string, fill: string, label: string) => {
      if (!String(idxStr ?? "").trim()) return;
      const idx = toIndex(idxStr);
      if (idx == null || idx < 0 || idx >= n) return;
      out.push({ key, idx, label, fill, stroke: "oklch(0.25 0.02 260 / 0.65)" });
    };
    if (okType === "presiometry_program_a" || okType === "presiometry_program_b") {
      pushIf("mk-GL1-from", manualDraft.load1_from, "oklch(0.62 0.22 280)", "GL1·from");
      pushIf("mk-GL1-to", manualDraft.load1_to, "oklch(0.52 0.2 280)", "GL1·to");
    }
    manualDraft.loops.forEach((row, i) => {
      const bi = i + 1;
      if (okType === "presiometry_program_b") {
        pushIf(`mk-GUR${bi}-f`, row.gur_from, "oklch(0.58 0.2 200)", `GUR${bi}·from`);
        pushIf(`mk-GUR${bi}-t`, row.gur_to, "oklch(0.48 0.18 200)", `GUR${bi}·to`);
      } else {
        pushIf(`mk-GU${bi}-f`, row.unload_from, "oklch(0.62 0.2 35)", `GU${bi}·from`);
        pushIf(`mk-GU${bi}-t`, row.unload_to, "oklch(0.52 0.18 35)", `GU${bi}·to`);
        pushIf(`mk-GR${bi}-f`, row.reload_from, "oklch(0.55 0.18 155)", `GR${bi}·from`);
        pushIf(`mk-GR${bi}-t`, row.reload_to, "oklch(0.48 0.16 155)", `GR${bi}·to`);
      }
    });
    return out;
  }, [manualDraft.mode, manualDraft.load1_from, manualDraft.load1_to, manualDraft.loops, chartSeries.pr, okType]);

  const applyChartPickIndex = useCallback(
    (idx: number) => {
      if (chartPick == null) return;
      setManualDraft((d) => {
        const next = { ...d, mode: "manual" as const };
        if (chartPick === "load1_from") return { ...next, load1_from: String(idx) };
        if (chartPick === "load1_to") return { ...next, load1_to: String(idx) };
        if ("k" in chartPick) {
          const { k, loop } = chartPick;
          const rows = d.loops.map((row, j) => {
            if (j !== loop) return row;
            if (k === "unload_from") return { ...row, unload_from: String(idx) };
            if (k === "unload_to") return { ...row, unload_to: String(idx) };
            if (k === "reload_from") return { ...row, reload_from: String(idx) };
            if (k === "reload_to") return { ...row, reload_to: String(idx) };
            if (k === "gur_from") return { ...row, gur_from: String(idx) };
            if (k === "gur_to") return { ...row, gur_to: String(idx) };
            return row;
          });
          return { ...next, loops: rows };
        }
        return d;
      });
      setChartPick(null);
    },
    [chartPick],
  );

  const lineDotForPicking =
    chartPick && manualDraft.mode === "manual"
      ? (props: { cx?: number; cy?: number; index?: number }) => {
          const { cx, cy, index } = props;
          if (cx == null || cy == null || index == null) return <g key={`d-${index}`} />;
          return (
            <circle
              key={`pick-${index}`}
              cx={cx}
              cy={cy}
              r={12}
              fill="rgba(0,0,0,0.02)"
              style={{ cursor: "crosshair" }}
              onClick={(e) => {
                e.stopPropagation();
                applyChartPickIndex(index);
              }}
            />
          );
        }
      : false;

  /** Payload salvat în `presiometry_settings_json`; folosit și înainte de «Rulează calcule» ca serverul să vadă același mod ca în UI. */
  const buildPresiometrySettingsPayload = useCallback((): Record<string, unknown> | null => {
    if (okType !== "presiometry_program_a" && okType !== "presiometry_program_b") return null;
    const toInt = (s: string) => {
      const n = Number(String(s ?? "").trim());
      return Number.isFinite(n) ? Math.floor(n) : null;
    };
    const range = (a: string, b: string) => {
      const u = toInt(a);
      const v = toInt(b);
      if (u == null || v == null) return null;
      const from = Math.min(u, v);
      const to = Math.max(u, v);
      if (to <= from) return null;
      return { from, to };
    };
    return {
      mode: manualDraft.mode,
      x_kind: xKind,
      load1: manualDraft.mode === "manual" ? range(manualDraft.load1_from, manualDraft.load1_to) : null,
      loops:
        manualDraft.mode === "manual"
          ? manualDraft.loops.map((l) => ({
              unload: range(l.unload_from, l.unload_to),
              reload: range(l.reload_from, l.reload_to),
              gur: range(l.gur_from, l.gur_to),
            }))
          : [],
    };
  }, [okType, manualDraft, xKind]);

  const saveManualSettings = async () => {
    if (!okType) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const payload = buildPresiometrySettingsPayload();
      if (!payload) {
        setBusy(false);
        return;
      }

      const res = await fetch(`/api/tests/${testId}`, {
        method: "PATCH",
        headers: jsonLabHeaders(),
        body: JSON.stringify({ presiometry_settings_json: payload }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Eroare salvare setări.");
      setMsg("Setări manuale salvate.");
      await load({ silent: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(false);
    }
  };

  const presetRows = useMemo(() => (okType ? MEASUREMENT_PRESETS[okType] : []), [okType]);

  const form = useForm<Record<string, unknown>>({
    defaultValues: {},
    values: Object.fromEntries(presetRows.map((r) => [r.key, byKey.get(r.key)?.value ?? ""])),
  });

  useEffect(() => {
    if (!okType) return;
    const hasKey = presetRows.some((r) => r.key === "pmt_packer_diameter_mm");
    if (!hasKey) return;
    const current = form.getValues("pmt_packer_diameter_mm");
    const n =
      current === "" || current === null || current === undefined
        ? null
        : typeof current === "number"
          ? current
          : Number(String(current).replace(",", "."));
    if (n == null || !Number.isFinite(n) || n <= 0) {
      form.setValue("pmt_packer_diameter_mm", 70);
    }
  }, [okType, presetRows, form]);

  useEffect(() => {
    if (!okType) return;
    const hasKey = presetRows.some((r) => r.key === "pmt_seating_r_mm");
    if (!hasKey) return;
    const current = form.getValues("pmt_seating_r_mm");
    const n =
      current === "" || current === null || current === undefined
        ? null
        : typeof current === "number"
          ? current
          : Number(String(current).replace(",", "."));
    if (n == null || !Number.isFinite(n) || n <= 0) {
      form.setValue("pmt_seating_r_mm", PMT_SEATING_R_MM_DEFAULT);
    }
  }, [okType, presetRows, form]);

  const saveMeasurements = async () => {
    if (!okType) return;
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const values = form.getValues();
      const v = validateMeasurementsForTestType(okType, values);
      if (!v.ok) throw new Error(v.message);

      const payload = presetRows.map((r, idx) => {
        const raw = values[r.key];
        if (r.valueKind === "text") {
          const s =
            raw === "" || raw === null || raw === undefined ? null : String(raw).trim().slice(0, 1000);
          return {
            key: r.key,
            label: r.label,
            value: s,
            unit: r.unit,
            display_order: (idx + 1) * 10,
          };
        }
        const num =
          raw === "" || raw === null || raw === undefined
            ? null
            : typeof raw === "number"
              ? raw
              : Number(String(raw).replace(",", "."));
        return {
          key: r.key,
          label: r.label,
          value: Number.isFinite(Number(num)) ? Number(num) : null,
          unit: r.unit,
          display_order: (idx + 1) * 10,
        };
      });

      const res = await fetch(`/api/tests/${testId}/measurements`, {
        method: "PUT",
        headers: jsonLabHeaders(),
        body: JSON.stringify({ rows: payload }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Eroare salvare.");
      setMsg("Măsurători salvate.");
      await load({ silent: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(false);
    }
  };

  const runCalc = async () => {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const presPayload = buildPresiometrySettingsPayload();
      if (presPayload) {
        const patchRes = await fetch(`/api/tests/${testId}`, {
          method: "PATCH",
          headers: jsonLabHeaders(),
          body: JSON.stringify({ presiometry_settings_json: presPayload }),
        });
        const patchJson = (await patchRes.json()) as { error?: string };
        if (!patchRes.ok) {
          throw new Error(patchJson.error ?? "Eroare sincronizare setări presiometrie înainte de calcul.");
        }
      }

      const res = await fetch(`/api/tests/${testId}/calculate`, { method: "POST", headers: jsonLabHeaders() });
      const json = (await res.json()) as { ok?: boolean; error?: string; errors?: string[] };
      if (!res.ok) throw new Error(json.error ?? (json.errors?.[0] ?? "Eroare calcul."));
      setMsg("Calcule actualizate.");
      await load({ silent: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(false);
    }
  };

  const importCurve = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch(`/api/tests/${testId}/import`, {
        method: "POST",
        body: fd,
        // Let the browser set multipart boundaries; do not send JSON Content-Type here.
        headers: labUserFetchHeaders(),
      });
      const json = (await res.json()) as { error?: string; points?: number; presiometryCurveImported?: boolean };
      if (!res.ok) throw new Error(json.error ?? "Eroare import.");
      setMsg(
        json.presiometryCurveImported
          ? `Curbă importată${typeof json.points === "number" ? `: ${json.points} puncte` : ""}.`
          : "Import reușit.",
      );
      await load({ silent: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(false);
    }
  };

  const generatePdf = async () => {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch(`/api/tests/${testId}/report`, {
        method: "POST",
        headers: { ...jsonLabHeaders(), "X-ROCA-Report-Sync": "1" },
        body: JSON.stringify({ locale: reportLocale === "en" ? "en" : "ro" }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Eroare PDF.");
      setMsg("Raport generat (verificați lista rapoarte).");
      await load({ silent: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(false);
    }
  };

  const checkReportService = async () => {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/report-service/status");
      const j = (await res.json()) as { ok?: boolean; hint?: string; error?: string };
      if (!res.ok) {
        setErr(typeof j.error === "string" ? j.error : "Eroare verificare.");
        return;
      }
      setMsg(j.ok === true ? (j.hint ?? "Report-service OK.") : (j.hint ?? "Report-service indisponibil sau neconfigurat."));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(false);
    }
  };

  const openReportPreview = () => {
    const q = reportLocale === "en" ? "?locale=en" : "";
    window.open(`/api/tests/${testId}/report/preview${q}`, "_blank", "noopener,noreferrer");
  };

  const saveReportOptions = async () => {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch(`/api/tests/${testId}`, {
        method: "PATCH",
        headers: jsonLabHeaders(),
        body: JSON.stringify({
          report_options_json: { specimen_photos: { include: specimenPhotosInPdf } },
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Eroare salvare opțiuni.");
      setMsg("Opțiuni raport salvate.");
      await load({ silent: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(false);
    }
  };

  const openReportPdf = async (pdfPath: string) => {
    setErr(null);
    try {
      const res = await fetch(
        `/api/storage/signed-url?bucket=${encodeURIComponent(reportsStorageBucket())}&path=${encodeURIComponent(pdfPath)}`,
      );
      const j = (await res.json()) as { signedUrl?: string; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Nu s-a putut deschide PDF-ul.");
      if (j.signedUrl) window.open(j.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Eroare");
    }
  };

  const deleteReport = async (reportId: string) => {
    if (!window.confirm("Ștergeți acest raport din listă și din storage?")) return;
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch(`/api/tests/${testId}/reports/${reportId}`, {
        method: "DELETE",
        headers: jsonLabHeaders(),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Eroare ștergere.");
      setMsg("Raport șters.");
      await load({ silent: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(false);
    }
  };

  if (loading || !test) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 p-8 text-sm">
        <Loader2 className="size-4 animate-spin" /> Se încarcă…
      </div>
    );
  }

  if (!okType) {
    return (
      <div className="p-8">
        <p className="text-destructive text-sm">Tip test nesuportat în această aplicație.</p>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      <LabBreadcrumb
        items={[
          { label: "Proiecte", href: "/projects" },
          { label: test.sample?.borehole?.project?.code ?? String(projectId), href: `/projects/${projectId}` },
          {
            label: test.sample?.borehole?.code ?? String(boreholeId),
            href: `/projects/${projectId}/boreholes/${boreholeId}`,
          },
          {
            label: test.sample?.code ?? String(sampleId),
            href: `/projects/${projectId}/boreholes/${boreholeId}/samples/${sampleId}`,
          },
          { label: newTestOptionLabel(okType), href: null },
        ]}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{newTestOptionLabel(okType)}</h1>
          <p className="text-muted-foreground text-sm">SR EN ISO 22476-5</p>
        </div>
        <Badge variant="secondary">{test.status ?? "draft"}</Badge>
      </div>

      {err ? <p className="text-destructive mb-3 text-sm">{err}</p> : null}
      {msg ? <p className="text-emerald-700 mb-3 text-sm">{msg}</p> : null}

      <Tabs defaultValue="measurements" className="space-y-4">
        <TabsList>
          <TabsTrigger value="measurements">Măsurători</TabsTrigger>
          <TabsTrigger value="series">Serie (import)</TabsTrigger>
          <TabsTrigger value="charts">Grafice</TabsTrigger>
          <TabsTrigger value="calc">Calcule</TabsTrigger>
          <TabsTrigger value="report">Raport</TabsTrigger>
        </TabsList>

        <TabsContent value="measurements" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Date test</CardTitle>
              <CardDescription>Completați câmpurile necesare pentru raport și calcule.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {presetRows.map((r) => (
                <div key={r.key} className="grid gap-1.5">
                  <Label htmlFor={r.key}>
                    {r.label} <span className="text-muted-foreground">({r.unit})</span>
                  </Label>
                  {r.valueKind === "text" ? (
                    <Textarea
                      id={r.key}
                      rows={r.key === "pmt_notes_field" ? 3 : 2}
                      className="min-h-0"
                      {...form.register(r.key)}
                    />
                  ) : (
                    <Input id={r.key} {...form.register(r.key)} />
                  )}
                </div>
              ))}
              <div className="pt-2">
                <Button type="button" disabled={busy} onClick={() => void saveMeasurements()}>
                  {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Salvează măsurători
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Note</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Textarea
                value={test.notes ?? ""}
                onChange={(e) => setTest((t) => (t ? { ...t, notes: e.target.value } : t))}
                placeholder="Observații…"
              />
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setErr(null);
                  setMsg(null);
                  try {
                    const res = await fetch(`/api/tests/${testId}`, {
                      method: "PATCH",
                      headers: jsonLabHeaders(),
                      body: JSON.stringify({ notes: test.notes ?? null }),
                    });
                    const json = (await res.json()) as { error?: string };
                    if (!res.ok) throw new Error(json.error ?? "Eroare salvare note.");
                    setMsg("Note salvate.");
                    await load({ silent: true });
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : "Eroare");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Salvează note
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="series" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Import serie presiometrie</CardTitle>
              <CardDescription>
                TXT/CSV/TSV. Pentru Elast Logger: `Pressure[MPa]` + `R[mm]` + `Pass time[hh:mm:ss]` (import p–R).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-1.5">
                <Label htmlFor="import-file">Fișier</Label>
                <Input
                  id="import-file"
                  type="file"
                  accept=".csv,.txt,.tsv"
                  disabled={busy}
                  onChange={(e) => void importCurve(e.target.files?.[0] ?? null)}
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <p className="text-sm font-medium">Previzualizare (primele 20 puncte)</p>
                {curve?.points?.length ? (
                  <div className="overflow-auto rounded-md border">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow>
                          <TableHead className="w-[70px]">#</TableHead>
                          <TableHead className="whitespace-nowrap">p (MPa)</TableHead>
                          <TableHead className="whitespace-nowrap">{xLabel}</TableHead>
                          <TableHead className="whitespace-nowrap">t (s)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {curve.points.slice(0, 20).map((p, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                            <TableCell className="font-mono text-xs tabular-nums">
                              {Math.round((p.p_kpa / KPA_PER_MPA) * 1000) / 1000}
                            </TableCell>
                            <TableCell className="font-mono text-xs tabular-nums">
                              {Math.round((xKind === "radius_mm" ? (p.r_mm ?? p.v_cm3) : p.v_cm3) * 100) / 100}
                            </TableCell>
                            <TableCell className="font-mono text-xs tabular-nums">
                              {p.t_s != null ? Math.round(p.t_s * 100) / 100 : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">Nu există serie importată încă.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="charts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Grafice</CardTitle>
              <CardDescription className="space-y-1 text-xs">
                <span>
                  {xKind === "radius_mm"
                    ? `p–R (raw) și p–δ: δ = R − R așezare. Pentru sondă Ø${PMT_PROBE_DIAMETER_MM} mm, așezarea este la R = ${PMT_SEATING_R_MM_DEFAULT} mm (R = Ø/2); puteți suprascrie în «R la așezare» din măsurători.`
                    : "p–V și p–ΔV (Δ față de primul punct)."}
                </span>
                {okType === "presiometry_program_a" ? (
                  <span className="text-muted-foreground block">
                    Legenda ISO (Program A): <span className="font-medium">p</span> (MPa), <span className="font-medium">δ</span>;{" "}
                    <span className="font-medium">GL1</span> prima încărcare; <span className="font-medium">GUi</span> /{" "}
                    <span className="font-medium">GRi</span> descărcare / reîncărcare (30–70% sau manual). Benzi =
                    intervale regresie; linii punctate = tangente.
                  </span>
                ) : okType === "presiometry_program_b" ? (
                  <span className="text-muted-foreground block">
                    Legenda ISO (Program B): <span className="font-medium">GL1</span> prima încărcare (ca la A);{" "}
                    <span className="font-medium">GURi</span> = un singur modul pe buclă (regresie în bandă de presiune
                    la mijlocul buclei, sau interval manual). Benzi / tangente ca mai sus.
                  </span>
                ) : null}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {!curve?.points?.length ? (
                <p className="text-muted-foreground text-sm">Importați seria pentru a vedea graficele.</p>
              ) : (
                <>
                  {chartPick ? (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
                      Faceți click pe un punct al diagramei <strong>p–{xKind === "radius_mm" ? "R" : "V"}</strong> de mai sus
                      pentru a seta{" "}
                      {chartPick === "load1_from" && "«Încărcare 1 (from)»"}
                      {chartPick === "load1_to" && "«Încărcare 1 (to)»"}
                      {chartPick != null &&
                        typeof chartPick === "object" &&
                        "k" in chartPick &&
                        chartPick.k === "unload_from" &&
                        `bucla ${chartPick.loop + 1} unload from`}
                      {chartPick != null &&
                        typeof chartPick === "object" &&
                        "k" in chartPick &&
                        chartPick.k === "unload_to" &&
                        `bucla ${chartPick.loop + 1} unload to`}
                      {chartPick != null &&
                        typeof chartPick === "object" &&
                        "k" in chartPick &&
                        chartPick.k === "reload_from" &&
                        `bucla ${chartPick.loop + 1} reload from`}
                      {chartPick != null &&
                        typeof chartPick === "object" &&
                        "k" in chartPick &&
                        chartPick.k === "reload_to" &&
                        `bucla ${chartPick.loop + 1} reload to`}
                      {chartPick != null &&
                        typeof chartPick === "object" &&
                        "k" in chartPick &&
                        chartPick.k === "gur_from" &&
                        `bucla ${chartPick.loop + 1} GUR (from)`}
                      {chartPick != null &&
                        typeof chartPick === "object" &&
                        "k" in chartPick &&
                        chartPick.k === "gur_to" &&
                        `bucla ${chartPick.loop + 1} GUR (to)`}{" "}
                      (index în serie).{" "}
                      <Button type="button" variant="ghost" size="sm" className="ml-2 h-7 px-2" onClick={() => setChartPick(null)}>
                        Anulează
                      </Button>
                    </div>
                  ) : null}
                  <div className="w-full space-y-1">
                    <p className="text-muted-foreground text-xs">Curba p–{xKind === "radius_mm" ? "R" : "V"}</p>
                    <PresiometryChartZoomShell
                      navMode={chartNavPr}
                      onNavModeChange={setChartNavPr}
                      disableTransform={chartPick != null}
                    >
                      <ResponsiveContainer width="100%" height={280}>
                        <LineChart data={chartSeries.pr} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis
                            type="number"
                            dataKey="x"
                            domain={chartSeries.prXDomain ?? ["auto", "auto"]}
                            ticks={
                              xKind === "radius_mm" && prXAxisRadiusTicks?.length ? prXAxisRadiusTicks : undefined
                            }
                            tickFormatter={(v) =>
                              xKind === "radius_mm" ? formatMmAxisTick(v) : String(typeof v === "number" ? v : Number(v))
                            }
                            tick={{ fontSize: 11 }}
                            label={{ value: xLabel, position: "bottom", offset: 0, style: { fontSize: 11 } }}
                          />
                          <YAxis
                            type="number"
                            dataKey="p_mpa"
                            tick={{ fontSize: 11 }}
                            label={{ value: "p (MPa)", angle: -90, position: "insideLeft", style: { fontSize: 11 } }}
                          />
                          <Tooltip
                            formatter={(v) => {
                              const n = typeof v === "number" ? v : Number(v);
                              return [Number.isFinite(n) ? String(Math.round(n * 10000) / 10000) : "—", "MPa"];
                            }}
                            labelFormatter={() => ""}
                            contentStyle={{ borderRadius: 8, fontSize: 12 }}
                          />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          {showRegressionOverlays &&
                            presiometryViz.areasPr.map((a) => (
                              <ReferenceArea
                                key={a.key}
                                x1={a.x1}
                                x2={a.x2}
                                strokeOpacity={0}
                                fill={a.fill}
                                ifOverflow="visible"
                              />
                            ))}
                          <Line
                            type="monotone"
                            dataKey="p_mpa"
                            stroke="oklch(0.45 0.14 250)"
                            name="p"
                            dot={lineDotForPicking || false}
                            isAnimationActive={false}
                          />
                          {showRegressionOverlays &&
                            presiometryViz.tangentsPr.map((t) => (
                              <ReferenceLine
                                key={t.key}
                                segment={[
                                  { x: t.pts[0]!.x, y: t.pts[0]!.p_mpa },
                                  { x: t.pts[1]!.x, y: t.pts[1]!.p_mpa },
                                ]}
                                stroke={t.stroke}
                                strokeWidth={2}
                                strokeDasharray="6 4"
                                ifOverflow="extendDomain"
                                label={{
                                  value: t.label,
                                  position: "middle",
                                  fill: t.stroke,
                                  fontSize: 10,
                                  fontWeight: 600,
                                }}
                              />
                            ))}
                          {showRegressionOverlays &&
                            chartSeries.w3070Mpa?.p30 != null &&
                            chartSeries.w3070Mpa?.p70 != null && (
                              <>
                                <ReferenceLine
                                  y={chartSeries.w3070Mpa.p30}
                                  stroke="oklch(0.65 0.15 90)"
                                  strokeDasharray="4 4"
                                  ifOverflow="extendDomain"
                                />
                                <ReferenceLine
                                  y={chartSeries.w3070Mpa.p70}
                                  stroke="oklch(0.65 0.15 90)"
                                  strokeDasharray="4 4"
                                  ifOverflow="extendDomain"
                                />
                              </>
                            )}
                          {showRegressionOverlays &&
                            chartSeries.loops.slice(0, 6).flatMap((w, idx) => {
                              const peak = chartSeries.pr[w.peakIndex];
                              const valley = chartSeries.pr[w.valleyIndex];
                              if (!peak || !valley) return [];
                              return [
                                <ReferenceDot
                                  key={`peak-${idx}`}
                                  x={peak.x}
                                  y={peak.p_mpa}
                                  r={4}
                                  fill="oklch(0.55 0.18 30)"
                                  stroke="none"
                                />,
                                <ReferenceDot
                                  key={`valley-${idx}`}
                                  x={valley.x}
                                  y={valley.p_mpa}
                                  r={4}
                                  fill="oklch(0.6 0.16 140)"
                                  stroke="none"
                                />,
                              ];
                            })}
                          {manualDraft.mode === "manual" &&
                            manualPickMarkers.map((m) => {
                              const row = chartSeries.pr[m.idx];
                              if (!row) return null;
                              return (
                                <ReferenceDot
                                  key={m.key}
                                  x={row.x}
                                  y={row.p_mpa}
                                  r={5}
                                  fill={m.fill}
                                  stroke={m.stroke}
                                  strokeWidth={1.5}
                                  label={{
                                    value: `${m.label} #${m.idx}`,
                                    position: "top",
                                    fill: m.fill,
                                    fontSize: 9,
                                    fontWeight: 600,
                                  }}
                                />
                              );
                            })}
                        </LineChart>
                      </ResponsiveContainer>
                    </PresiometryChartZoomShell>
                    {showRegressionOverlays ? (
                      <p className="text-muted-foreground text-[10px]">
                        Marcaje: portocaliu = vârf buclă, verde = minim buclă (auto). Portocaliu deschis = praguri 30% /
                        70% din domeniul p (MPa). Benzi colorate = intervale regresie; linii colorate punctat = tangente{" "}
                        <span className="font-medium">G</span>.
                      </p>
                    ) : manualDraft.mode === "manual" && manualPickMarkers.length > 0 ? (
                      <p className="text-muted-foreground text-[10px]">
                        Punctele colorate cu etichetă rămân pe curbă pentru fiecare index setat (manual).
                      </p>
                    ) : null}
                  </div>

                  <div className="w-full space-y-1">
                    <p className="text-muted-foreground text-xs">
                      Curba p–{xKind === "radius_mm" ? "δ" : "ΔV"} ({xLabelDelta})
                    </p>
                    <PresiometryChartZoomShell
                      navMode={chartNavPdr}
                      onNavModeChange={setChartNavPdr}
                      disableTransform={false}
                    >
                      <ResponsiveContainer width="100%" height={280}>
                        <LineChart data={chartSeries.pdr} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis
                            type="number"
                            dataKey="x"
                            domain={chartSeries.pdrXDomain ?? ["auto", "auto"]}
                            ticks={
                              xKind === "radius_mm" && pdrXAxisDeltaTicks?.length ? pdrXAxisDeltaTicks : undefined
                            }
                            tickFormatter={(v) =>
                              xKind === "radius_mm" ? formatMmAxisTick(v) : String(typeof v === "number" ? v : Number(v))
                            }
                            tick={{ fontSize: 11 }}
                            label={{
                              value: xLabelDelta,
                              position: "bottom",
                              offset: 0,
                              style: { fontSize: 11 },
                            }}
                          />
                          <YAxis
                            type="number"
                            dataKey="p_mpa"
                            tick={{ fontSize: 11 }}
                            label={{ value: "p (MPa)", angle: -90, position: "insideLeft", style: { fontSize: 11 } }}
                          />
                          <Tooltip
                            formatter={(v) => {
                              const n = typeof v === "number" ? v : Number(v);
                              return [Number.isFinite(n) ? String(Math.round(n * 10000) / 10000) : "—", "MPa"];
                            }}
                            labelFormatter={() => ""}
                            contentStyle={{ borderRadius: 8, fontSize: 12 }}
                          />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          {showRegressionOverlays &&
                            presiometryViz.areasPdr.map((a) => (
                              <ReferenceArea
                                key={a.key}
                                x1={a.x1}
                                x2={a.x2}
                                strokeOpacity={0}
                                fill={a.fill}
                                ifOverflow="visible"
                              />
                            ))}
                          <Line
                            type="monotone"
                            dataKey="p_mpa"
                            stroke="oklch(0.5 0.12 150)"
                            name="p"
                            dot={false}
                            isAnimationActive={false}
                          />
                          {showRegressionOverlays &&
                            presiometryViz.tangentsPdr.map((t) => (
                              <ReferenceLine
                                key={t.key}
                                segment={[
                                  { x: t.pts[0]!.x, y: t.pts[0]!.p_mpa },
                                  { x: t.pts[1]!.x, y: t.pts[1]!.p_mpa },
                                ]}
                                stroke={t.stroke}
                                strokeWidth={2}
                                strokeDasharray="6 4"
                                ifOverflow="extendDomain"
                                label={{
                                  value: t.label,
                                  position: "middle",
                                  fill: t.stroke,
                                  fontSize: 10,
                                  fontWeight: 600,
                                }}
                              />
                            ))}
                          {manualDraft.mode === "manual" &&
                            manualPickMarkers.map((m) => {
                              const row = chartSeries.pdr[m.idx];
                              if (!row) return null;
                              return (
                                <ReferenceDot
                                  key={m.key}
                                  x={row.x}
                                  y={row.p_mpa}
                                  r={5}
                                  fill={m.fill}
                                  stroke={m.stroke}
                                  strokeWidth={1.5}
                                  label={{
                                    value: `${m.label} #${m.idx}`,
                                    position: "top",
                                    fill: m.fill,
                                    fontSize: 9,
                                    fontWeight: 600,
                                  }}
                                />
                              );
                            })}
                        </LineChart>
                      </ResponsiveContainer>
                    </PresiometryChartZoomShell>
                  </div>
                </>
              )}

              {okType !== "presiometry_program_c" ? (
                <Card className="bg-muted/30">
                  <CardHeader>
                    <CardTitle className="text-sm">Selecții calcul (auto / manual)</CardTitle>
                    <CardDescription className="text-xs">
                      Dacă buclele nu sunt perfecte, setați intervalele (index 0…N-1) sau folosiți butoanele{" "}
                      <Crosshair className="inline size-3 align-text-bottom" /> apoi faceți click pe diagrama{" "}
                      <strong>p–{xKind === "radius_mm" ? "R" : "V"}</strong>
                      {curve?.points?.length ? " de mai sus." : " (după import serie în acest tab)."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Label className="text-xs">Mod</Label>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={manualDraft.mode === "auto" ? "default" : "secondary"}
                          disabled={busy}
                          onClick={() => setManualDraft((d) => ({ ...d, mode: "auto" }))}
                        >
                          Auto
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={manualDraft.mode === "manual" ? "default" : "secondary"}
                          disabled={busy}
                          onClick={() => setManualDraft((d) => ({ ...d, mode: "manual" }))}
                        >
                          Manual
                        </Button>
                      </div>
                      <span className="text-muted-foreground text-xs">
                        {chartSeries.nPoints ? `N=${chartSeries.nPoints} puncte (serie pentru calcule)` : "Fără serie"}
                      </span>
                    </div>

                    {chartPick && curve?.points?.length ? (
                      <p className="text-xs text-amber-800 dark:text-amber-200">
                        Faceți click pe diagrama <strong>p–{xKind === "radius_mm" ? "R" : "V"}</strong> de mai sus.
                      </p>
                    ) : chartPick && !curve?.points?.length ? (
                      <p className="text-xs text-amber-800 dark:text-amber-200">
                        Importați seria în acest tab sau din tab-ul «Serie» pentru a alege punctul pe curbă, sau{" "}
                        <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => setChartPick(null)}>
                          anulați
                        </Button>
                        .
                      </p>
                    ) : null}

                    {manualDraft.mode === "manual" ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 sm:items-end">
                          <div>
                            <Label className="text-xs">
                              {okType === "presiometry_program_b" ? "GL1 — from (indice)" : "Încărcare 1 (from)"}
                            </Label>
                            <div className="flex gap-1">
                              <Input
                                className="min-w-0 flex-1"
                                value={manualDraft.load1_from}
                                onChange={(e) => setManualDraft((d) => ({ ...d, load1_from: e.target.value }))}
                                placeholder="ex. 5"
                              />
                              {okType === "presiometry_program_a" || okType === "presiometry_program_b" ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="size-9 shrink-0"
                                  title="Alege punct pe graficul p–R de mai sus"
                                  disabled={busy}
                                  onClick={() => setChartPick("load1_from")}
                                >
                                  <Crosshair className="size-3.5" />
                                </Button>
                              ) : null}
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs">
                              {okType === "presiometry_program_b" ? "GL1 — to (indice)" : "Încărcare 1 (to)"}
                            </Label>
                            <div className="flex gap-1">
                              <Input
                                className="min-w-0 flex-1"
                                value={manualDraft.load1_to}
                                onChange={(e) => setManualDraft((d) => ({ ...d, load1_to: e.target.value }))}
                                placeholder="ex. 25"
                              />
                              {okType === "presiometry_program_a" || okType === "presiometry_program_b" ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="size-9 shrink-0"
                                  title="Alege punct pe graficul p–R de mai sus"
                                  disabled={busy}
                                  onClick={() => setChartPick("load1_to")}
                                >
                                  <Crosshair className="size-3.5" />
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div className="overflow-auto rounded-md border">
                          {okType === "presiometry_program_b" ? (
                            <Table>
                              <TableHeader className="bg-muted/40">
                                <TableRow>
                                  <TableHead className="w-[70px]">Buclă</TableHead>
                                  <TableHead>GUR (from)</TableHead>
                                  <TableHead>GUR (to)</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {manualDraft.loops.map((row, i) => (
                                  <TableRow key={i}>
                                    <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                                    <TableCell>
                                      <div className="flex gap-1">
                                        <Input
                                          className="min-w-0 flex-1"
                                          value={row.gur_from}
                                          onChange={(e) =>
                                            setManualDraft((d) => ({
                                              ...d,
                                              loops: d.loops.map((x, j) =>
                                                j === i ? { ...x, gur_from: e.target.value } : x,
                                              ),
                                            }))
                                          }
                                          placeholder="ex. 30"
                                        />
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="icon"
                                          className="size-9 shrink-0"
                                          title="Alege punct pe graficul p–R de mai sus"
                                          disabled={busy}
                                          onClick={() => setChartPick({ k: "gur_from", loop: i })}
                                        >
                                          <Crosshair className="size-3.5" />
                                        </Button>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex gap-1">
                                        <Input
                                          className="min-w-0 flex-1"
                                          value={row.gur_to}
                                          onChange={(e) =>
                                            setManualDraft((d) => ({
                                              ...d,
                                              loops: d.loops.map((x, j) => (j === i ? { ...x, gur_to: e.target.value } : x)),
                                            }))
                                          }
                                          placeholder="ex. 80"
                                        />
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="icon"
                                          className="size-9 shrink-0"
                                          title="Alege punct pe graficul p–R de mai sus"
                                          disabled={busy}
                                          onClick={() => setChartPick({ k: "gur_to", loop: i })}
                                        >
                                          <Crosshair className="size-3.5" />
                                        </Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          ) : (
                            <Table>
                              <TableHeader className="bg-muted/40">
                                <TableRow>
                                  <TableHead className="w-[70px]">Buclă</TableHead>
                                  <TableHead>Unload from</TableHead>
                                  <TableHead>Unload to</TableHead>
                                  <TableHead>Reload from</TableHead>
                                  <TableHead>Reload to</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {manualDraft.loops.map((row, i) => (
                                  <TableRow key={i}>
                                    <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                                    <TableCell>
                                      <div className="flex gap-1">
                                        <Input
                                          className="min-w-0 flex-1"
                                          value={row.unload_from}
                                          onChange={(e) =>
                                            setManualDraft((d) => ({
                                              ...d,
                                              loops: d.loops.map((x, j) =>
                                                j === i ? { ...x, unload_from: e.target.value } : x,
                                              ),
                                            }))
                                          }
                                          placeholder="ex. 30"
                                        />
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="icon"
                                          className="size-9 shrink-0"
                                          title="Alege punct pe graficul p–R de mai sus"
                                          disabled={busy}
                                          onClick={() => setChartPick({ k: "unload_from", loop: i })}
                                        >
                                          <Crosshair className="size-3.5" />
                                        </Button>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex gap-1">
                                        <Input
                                          className="min-w-0 flex-1"
                                          value={row.unload_to}
                                          onChange={(e) =>
                                            setManualDraft((d) => ({
                                              ...d,
                                              loops: d.loops.map((x, j) =>
                                                j === i ? { ...x, unload_to: e.target.value } : x,
                                              ),
                                            }))
                                          }
                                          placeholder="ex. 55"
                                        />
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="icon"
                                          className="size-9 shrink-0"
                                          title="Alege punct pe graficul p–R de mai sus"
                                          disabled={busy}
                                          onClick={() => setChartPick({ k: "unload_to", loop: i })}
                                        >
                                          <Crosshair className="size-3.5" />
                                        </Button>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex gap-1">
                                        <Input
                                          className="min-w-0 flex-1"
                                          value={row.reload_from}
                                          onChange={(e) =>
                                            setManualDraft((d) => ({
                                              ...d,
                                              loops: d.loops.map((x, j) =>
                                                j === i ? { ...x, reload_from: e.target.value } : x,
                                              ),
                                            }))
                                          }
                                          placeholder="ex. 56"
                                        />
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="icon"
                                          className="size-9 shrink-0"
                                          title="Alege punct pe graficul p–R de mai sus"
                                          disabled={busy}
                                          onClick={() => setChartPick({ k: "reload_from", loop: i })}
                                        >
                                          <Crosshair className="size-3.5" />
                                        </Button>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex gap-1">
                                        <Input
                                          className="min-w-0 flex-1"
                                          value={row.reload_to}
                                          onChange={(e) =>
                                            setManualDraft((d) => ({
                                              ...d,
                                              loops: d.loops.map((x, j) =>
                                                j === i ? { ...x, reload_to: e.target.value } : x,
                                              ),
                                            }))
                                          }
                                          placeholder="ex. 80"
                                        />
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="icon"
                                          className="size-9 shrink-0"
                                          title="Alege punct pe graficul p–R de mai sus"
                                          disabled={busy}
                                          onClick={() => setChartPick({ k: "reload_to", loop: i })}
                                        >
                                          <Crosshair className="size-3.5" />
                                        </Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          )}
                        </div>
                      </div>
                    ) : null}

                    <div className="flex gap-2">
                      <Button type="button" variant="secondary" disabled={busy} onClick={() => void saveManualSettings()}>
                        Salvează selecții
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calc" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Calcule</CardTitle>
              <CardDescription className="space-y-1">
                <span>
                  {okType === "presiometry_program_c"
                    ? "Program C (creep): în această versiune avem import + structură. Calculele de creep vor fi adăugate ulterior."
                    : okType === "presiometry_program_b"
                      ? "Program B: GL1 (prima încărcare) + GUR pe buclă (bandă la mijlocul buclei sau manual)."
                      : "Program A: GL1 + GU / GR pe ferestre 30–70% (sau manual)."}
                </span>
                {okType !== "presiometry_program_c" ? (
                  <span className="text-muted-foreground block text-xs">
                    Selecțiile auto / manual și alegerea punctelor pe curbă sunt în tab-ul <strong>Grafice</strong>.
                  </span>
                ) : null}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button type="button" disabled={busy} onClick={() => void runCalc()}>
                {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Rulează calcule
              </Button>
              <Separator />
              {results.length ? (
                <div className="overflow-auto rounded-md border">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead>Rezultat</TableHead>
                        <TableHead className="w-[160px] text-right">Valoare</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-sm">{r.label}</TableCell>
                          <TableCell className="text-right font-mono text-xs tabular-nums">
                            {r.value == null ? "—" : `${r.value.toFixed(r.decimals)} ${r.unit ?? ""}`.trim()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">Nu există rezultate încă.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="report" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Raport PDF</CardTitle>
              <CardDescription>
                PDF-urile sunt generate de <code className="bg-muted rounded px-1 text-xs">report-service</code>{" "}
                (șabloane Handlebars + Chromium). Verificați serviciul și previzualizați înainte de a salva varianta
                finală în listă.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void checkReportService()}>
                {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Verifică report-service
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={openReportPreview}>
                <ExternalLink className="mr-2 size-4" />
                Previzualizare raport
              </Button>
              <Button type="button" size="sm" disabled={busy} onClick={() => void generatePdf()}>
                {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Generează PDF (SR EN ISO 22476-5)
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Semnături în raport (per test)</CardTitle>
              <CardDescription>Text afișat în casetele Întocmit / Verificat din PDF. Folosiți „Salvează semnături”.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-1.5 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="prepared-by">Întocmit</Label>
                  <Input
                    id="prepared-by"
                    value={test?.prepared_by ?? ""}
                    onChange={(e) => setTest((t) => (t ? { ...t, prepared_by: e.target.value } : t))}
                    disabled={busy || !test}
                    placeholder="Nume, funcție"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="verified-by">Verificat</Label>
                  <Input
                    id="verified-by"
                    value={test?.verified_by ?? ""}
                    onChange={(e) => setTest((t) => (t ? { ...t, verified_by: e.target.value } : t))}
                    disabled={busy || !test}
                    placeholder="Nume, funcție"
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={busy || !test}
                onClick={async () => {
                  if (!test) return;
                  setBusy(true);
                  setErr(null);
                  setMsg(null);
                  try {
                    const res = await fetch(`/api/tests/${testId}`, {
                      method: "PATCH",
                      headers: jsonLabHeaders(),
                      body: JSON.stringify({
                        prepared_by: test.prepared_by?.trim() || null,
                        verified_by: test.verified_by?.trim() || null,
                      }),
                    });
                    const json = (await res.json()) as { error?: string };
                    if (!res.ok) throw new Error(json.error ?? "Eroare salvare semnături.");
                    setMsg("Semnături salvate.");
                    await load({ silent: true });
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : "Eroare");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Salvează semnături
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Opțiuni raport PDF</CardTitle>
              <CardDescription>Se aplică la următoarea previzualizare sau generare PDF.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-2">
                <input
                  id="specimen-photos-pdf"
                  type="checkbox"
                  className="border-input text-primary mt-1 size-4 shrink-0 rounded"
                  checked={specimenPhotosInPdf}
                  onChange={(e) => setSpecimenPhotosInPdf(e.target.checked)}
                  disabled={busy}
                />
                <Label htmlFor="specimen-photos-pdf" className="cursor-pointer leading-snug font-normal">
                  Fotografii probă (înainte / după) în PDF
                </Label>
              </div>
              <Button type="button" variant="secondary" disabled={busy} onClick={() => void saveReportOptions()}>
                Salvează opțiuni raport
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Rapoarte generate</CardTitle>
              <CardDescription>PDF-uri salvate în storage pentru acest test.</CardDescription>
            </CardHeader>
            <CardContent>
              {reports.length ? (
                <div className="overflow-auto rounded-md border">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead>Șablon</TableHead>
                        <TableHead>Versiune</TableHead>
                        <TableHead>Nr. raport</TableHead>
                        <TableHead>Generat</TableHead>
                        <TableHead className="text-right">Acțiuni</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reports.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-xs">{r.template_code ?? "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{r.template_version ?? "—"}</TableCell>
                          <TableCell className="text-sm">{r.report_number ?? "—"}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {new Date(r.generated_at).toLocaleString("ro-RO")}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8"
                                onClick={() => void openReportPdf(r.pdf_path)}
                              >
                                Deschide PDF
                              </Button>
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                className="h-8"
                                disabled={busy}
                                onClick={() => void deleteReport(r.id)}
                              >
                                Șterge
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">Nu există rapoarte generate încă.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

