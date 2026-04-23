"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getLabUserFromStorage,
  jsonLabHeaders,
  labUserFetchHeaders,
  setLabUserInStorage,
} from "@/lib/lab-client-user";
import { d7012PanelForTestType } from "@/lib/astm-d7012";
import { cn } from "@/lib/utils";
import { classifyIs50MpaStrengthRoOrDash } from "@/lib/plt-is50-strength-class";
import { parsePointLoadReportMetadata } from "@/lib/point-load-report-metadata";
import { MEASUREMENT_PRESETS, unconfinedSoilPresetForMode } from "@/lib/measurement-presets";
import { validateMeasurementsForTestType } from "@/lib/measurement-schemas";
import { newTestOptionLabel } from "@/lib/test-type-options";
import { parsePresiometryCurvePayload } from "@/lib/presiometry-curve";
import {
  ABS_POR_ROCK_DEFAULT,
  ABS_POR_ROCK_META_DEFAULT,
  parseAbsorptionPorosityRockPayload,
  parseAbsorptionPorosityRockReportMetadata,
} from "@/lib/absorption-porosity-rock";
import { UCS_DEFAULT_STRAIN_SCALE } from "@/lib/ucs-curve-parse";
import { parseYoungSettings, YOUNG_DEFAULT_SIGMA_O_PCT, YOUNG_DEFAULT_SIGMA_U_PCT } from "@/lib/young-settings";
import type { YoungCurvePayload } from "@/lib/young-curve-parse";
import {
  buildYoungForceStrainChannelsRows,
  suggestYoungPoissonFlatCutoffIndex,
  YoungForceStrainChannelsChart,
} from "@/components/lab/young-force-strain-channels-chart";
import { isLockActive } from "@/lib/test-lock";
import { effectiveChartFlag, parseTestReportOptions } from "@/lib/test-report-options";
import {
  normalizeUnconfinedSoilMode,
  parseUnconfinedSoilCurvePayload,
  stressStrainSeriesKpa,
} from "@/lib/unconfined-soil-curve";
import { normalizeUcsMode, parseUcsCurvePayload } from "@/lib/ucs-instrumentation";
import type {
  TestFile,
  TestFileRole,
  TestMeasurement,
  TestResult,
  TestRow,
  TestStatus,
  TriaxialRockRun,
} from "@/types/lab";
import { Camera, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { LabBreadcrumb } from "./lab-breadcrumb";
import { MohrCircleChart } from "./mohr-circle-chart";
import { MohrMultiChart, type MohrCircleInput } from "./mohr-multi-chart";
import { StressStrainD7012Chart } from "./stress-strain-d7012-chart";
import { TriaxialChartsPanel } from "./triaxial-charts-panel";
import { UnitWeightBulkTab } from "./unit-weight-bulk-tab";
import { fitMohrCoulomb } from "@/lib/triaxial/compute";
import { PltReportFieldsCard } from "./plt-report-fields-card";
import { TestOperatorQuickCard } from "./test-operator-quick-card";
import { UcsReportFieldsCard } from "./ucs-report-fields-card";
import { buildUcsTimeLoadChartData, UcsTimeLoadChart } from "./ucs-time-load-chart";
import { UcsResultChart } from "./ucs-result-chart";
import { UcsStressTimeChart } from "./ucs-stress-time-chart";
import { UcsBasicTrimSection } from "./ucs-basic-trim-section";
import { PltReferenceFigures } from "./plt-reference-figures";
import { UnconfinedSoilReportFieldsCard } from "./unconfined-soil-report-fields-card";
import { UnconfinedSoilCurveTrimSection } from "./unconfined-soil-curve-trim-section";
import { UnconfinedSoilInstrumentedChartsPanel } from "./unconfined-soil-instrumented-charts-panel";
import { UnconfinedSoilMohrCircleChart } from "./unconfined-soil-mohr-chart";

const DEFAULT_VERIFIED_BY = "ing.geol Craita Radu";

function isLikelyNetworkFailure(message: string): boolean {
  return /failed to fetch|fetch failed|networkerror|load failed|network request failed|aborted|terminated|\breset\b|ECONNRESET|ECONNREFUSED|ETIMEDOUT/i.test(
    message,
  );
}

function formatClientFetchError(message: string): string {
  if (/failed to fetch|fetch failed|networkerror|load failed|network request failed/i.test(message)) {
    return `${message} — Verificați că serverul web rulează (ex. npm run dev în folderul web), conexiunea la internet și variabilele din .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).`;
  }
  return message;
}

async function parseResponseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      `Răspuns neașteptat de la server (${res.status}). Începe cu: ${text.slice(0, 120).replace(/\s+/g, " ")}…`,
    );
  }
}

type MintReportTokenOk = {
  ok: true;
  reportServiceUrl: string;
  token: string;
  expiresAt: number;
  testId: string;
};

/** Token scurt pentru apel browser → report-service (ocolire limită ~10s Vercel Hobby). */
async function mintReportToken(testId: string): Promise<MintReportTokenOk> {
  const res = await fetch(`/api/tests/${testId}/report/token`, {
    method: "POST",
    headers: labUserFetchHeaders(),
    cache: "no-store",
  });
  const json = (await parseResponseJson(res)) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(typeof json.error === "string" ? json.error : "Emitere token raport eșuată.");
  }
  if (
    json.ok !== true ||
    typeof json.reportServiceUrl !== "string" ||
    typeof json.token !== "string" ||
    typeof json.expiresAt !== "number" ||
    typeof json.testId !== "string"
  ) {
    throw new Error("Răspuns token raport invalid.");
  }
  return json as MintReportTokenOk;
}

function normalizeSpecimenRole(r: string | null | undefined): string {
  return String(r ?? "").trim();
}

/** Cod ASTM D5731 Fig. 3 — valori 1–4 în `test_measurements`. */
const PLT_TEST_KIND_SELECT: { value: string; label: string }[] = [
  { value: "4", label: "Neregulat" },
  { value: "1", label: "Diametral" },
  { value: "2", label: "Axial" },
  { value: "3", label: "Bloc (paralelipiped)" },
];

/** Cod orientare încărcare față de planuri slabe (0/1 în `test_measurements`). */
const PLT_ANISOTROPY_SELECT: { value: string; label: string }[] = [
  { value: "0", label: "Perpendicular pe foliație / șistozitate (T)" },
  { value: "1", label: "Paralel cu foliație / șistozitate (//)" },
];

function looksLikeLabImageFile(f: Pick<TestFile, "file_name" | "file_type">): boolean {
  const t = (f.file_type ?? "").toLowerCase();
  if (["jpeg", "jpg", "png", "gif", "webp", "bmp", "heic", "heif"].includes(t)) return true;
  return /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i.test(f.file_name);
}

const TEST_STATUS_OPTIONS: { value: TestStatus; label: string }[] = [
  { value: "draft", label: "Ciornă" },
  { value: "verified", label: "Verificat" },
  { value: "approved", label: "Aprobat" },
  { value: "reported", label: "Raportat" },
];

interface TestDetailResponse {
  test: TestRow & {
    sample: {
      id: string;
      code: string;
      depth_from: number | null;
      depth_to: number | null;
      borehole: {
        id: string;
        code: string;
        name: string | null;
        project: { id: string; code: string; name: string };
      };
    };
  };
  measurements: TestMeasurement[];
  results: TestResult[];
  files: TestFile[];
  reports: Array<{
    id: string;
    template_code: string;
    template_version: string;
    report_number: string | null;
    pdf_path: string;
    generated_at: string;
  }>;
}

type FormValues = Record<string, number | null | undefined>;

export function TestWorkspace(props: {
  projectId: string;
  boreholeId: string;
  sampleId: string;
  testId: string;
}) {
  const YOUNG_DEFAULT_DISP_SCALE_MM_NO_GAUGES = 0.0001; // 0.1µm → mm (common for some machines)
  const { projectId, boreholeId, sampleId, testId } = props;
  const [data, setData] = useState<TestDetailResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [calcWarnings, setCalcWarnings] = useState<string[]>([]);
  const [identName, setIdentName] = useState("");
  const [identId, setIdentId] = useState("");
  const [pendingSpecimenBefore, setPendingSpecimenBefore] = useState<File | null>(null);
  const [pendingSpecimenAfter, setPendingSpecimenAfter] = useState<File | null>(null);
  const [specimenUploadRole, setSpecimenUploadRole] = useState<TestFileRole | null>(null);
  const [youngMode, setYoungMode] = useState<"no_gauges" | "gauges">("no_gauges");
  const [youngSigmaUPct, setYoungSigmaUPct] = useState<number>(YOUNG_DEFAULT_SIGMA_U_PCT);
  const [youngSigmaOPct, setYoungSigmaOPct] = useState<number>(YOUNG_DEFAULT_SIGMA_O_PCT);
  const [youngDispScaleMm, setYoungDispScaleMm] = useState<number | null>(YOUNG_DEFAULT_DISP_SCALE_MM_NO_GAUGES);
  const [youngEMethod, setYoungEMethod] = useState<"eb" | "loading" | "unloading" | "delta" | "isrm">("eb");
  const [youngTrimFrom, setYoungTrimFrom] = useState<number>(0);
  const [youngTrimTo, setYoungTrimTo] = useState<number>(0);
  const [youngPoissonFrom, setYoungPoissonFrom] = useState<number>(0);
  const [youngPoissonTo, setYoungPoissonTo] = useState<number>(0);
  const [youngPoissonAutoCutoff, setYoungPoissonAutoCutoff] = useState<boolean>(true);
  const [youngUseCh6, setYoungUseCh6] = useState<boolean>(true);
  const [youngUseCh7, setYoungUseCh7] = useState<boolean>(true);
  const [showHelp, setShowHelp] = useState<boolean>(true);
  const [preparedBy, setPreparedBy] = useState<string>("");
  const [verifiedBy, setVerifiedBy] = useState<string>("");
  const [otherTriaxialCircles, setOtherTriaxialCircles] = useState<MohrCircleInput[]>([]);
  const [triaxialRuns, setTriaxialRuns] = useState<TriaxialRockRun[]>([]);
  const [selectedTriaxialRunId, setSelectedTriaxialRunId] = useState<string>("");
  const [mcManualEnabled, setMcManualEnabled] = useState(false);
  const [mcManualC, setMcManualC] = useState<number | null>(null);
  const [mcManualPhi, setMcManualPhi] = useState<number | null>(null);
  const [triaxialEpsZSource, setTriaxialEpsZSource] = useState<"lvdta" | "gauges">("lvdta");
  const [hbSigmaCiMpa, setHbSigmaCiMpa] = useState<number | null>(null);
  const lastAutoSignatureRef = useRef<{ testId: string; prepared: string; verified: string } | null>(null);
  const msgRef = useRef<HTMLDivElement>(null);
  const specBeforeInputRef = useRef<HTMLInputElement>(null);
  const specBeforeCameraRef = useRef<HTMLInputElement>(null);
  const specAfterInputRef = useRef<HTMLInputElement>(null);
  const specAfterCameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!msg) return;
    // Important: in measurements tab the save button is far below the global message area.
    // Auto-scroll makes "save failed" / "locked" / validation errors immediately visible.
    msgRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [msg]);

  useEffect(() => {
    const u = getLabUserFromStorage();
    setIdentName(u.displayName);
    setIdentId(u.userId);
  }, []);

  const load = useCallback(async (options?: { softRefresh?: boolean }): Promise<boolean> => {
    if (!options?.softRefresh) setLoadError(null);
    try {
      const res = await fetch(`/api/tests/${testId}`, { cache: "no-store" });
      const json = (await parseResponseJson(res)) as TestDetailResponse & { error?: string };
      if (!res.ok) {
        if (!options?.softRefresh) {
          setLoadError(json.error ?? "Nu s-au putut încărca datele");
        }
        return false;
      }
      setLoadError(null);
      setData(json);
      return true;
    } catch (e) {
      const m = formatClientFetchError(e instanceof Error ? e.message : "Eroare");
      if (!options?.softRefresh) {
        setLoadError(m);
      }
      return false;
    }
  }, [testId]);

  useEffect(() => {
    void load();
  }, [load]);

  const test = data?.test;

  useEffect(() => {
    if (test?.test_type !== "triaxial_rock") {
      setHbSigmaCiMpa(null);
      return;
    }
    const raw = (test as { triaxial_hb_intact_json?: unknown }).triaxial_hb_intact_json;
    if (!raw || typeof raw !== "object") return;
    const v = (raw as Record<string, unknown>).sigma_ci_mpa;
    const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
    if (Number.isFinite(n) && n > 0) setHbSigmaCiMpa(n);
  }, [test?.id, test?.test_type]);

  useEffect(() => {
    if (!test || test.test_type !== "triaxial_rock") {
      setOtherTriaxialCircles([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/samples/${sampleId}/triaxial/mohr`, { cache: "no-store" });
        const j = (await parseResponseJson(res)) as {
          data?: Array<{ id: string; created_at: string; sigma1_mpa: number | null; sigma3_mpa: number | null }>;
          error?: string;
        };
        if (!res.ok) throw new Error(j.error ?? "Nu s-au putut încărca cercurile Mohr.");
        const rows = Array.isArray(j.data) ? j.data : [];
        const circles: MohrCircleInput[] = rows
          .map((r) => ({
            id: r.id,
            label: r.id === test.id ? "Curent" : new Date(r.created_at).toLocaleDateString("ro-RO"),
            sigma1Mpa: Number(r.sigma1_mpa),
            sigma3Mpa: Number(r.sigma3_mpa),
          }))
          .filter((c) => Number.isFinite(c.sigma1Mpa) && Number.isFinite(c.sigma3Mpa) && c.sigma1Mpa >= c.sigma3Mpa);
        if (!cancelled) setOtherTriaxialCircles(circles);
      } catch {
        if (!cancelled) setOtherTriaxialCircles([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sampleId, test?.id, test?.test_type]);

  const loadTriaxialRuns = useCallback(async () => {
    try {
      const res = await fetch(`/api/tests/${testId}/triaxial-runs`, { cache: "no-store" });
      const j = (await parseResponseJson(res)) as { ok?: boolean; runs?: TriaxialRockRun[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Nu s-au putut încărca rulările Triaxial.");
      setTriaxialRuns(Array.isArray(j.runs) ? j.runs : []);
    } catch {
      setTriaxialRuns([]);
    }
  }, [testId]);

  useEffect(() => {
    if (test?.test_type !== "triaxial_rock") {
      setTriaxialRuns([]);
      setSelectedTriaxialRunId("");
      return;
    }
    void loadTriaxialRuns();
  }, [loadTriaxialRuns, test?.test_type]);

  useEffect(() => {
    if (test?.test_type !== "triaxial_rock") return;
    if (triaxialRuns.length === 0) return;
    if (selectedTriaxialRunId && triaxialRuns.some((r) => r.id === selectedTriaxialRunId)) return;
    setSelectedTriaxialRunId(triaxialRuns[0]!.id);
  }, [selectedTriaxialRunId, test?.test_type, triaxialRuns]);

  const selectedTriaxialRun = useMemo(
    () => triaxialRuns.find((r) => r.id === selectedTriaxialRunId) ?? null,
    [selectedTriaxialRunId, triaxialRuns],
  );

  const selectedTriaxialRunCurve = useMemo(() => {
    const raw = selectedTriaxialRun?.curve_json;
    if (!raw || typeof raw !== "object") return null;
    const pts = (raw as Record<string, unknown>).points;
    if (!Array.isArray(pts)) return null;
    return raw as unknown as import("@/lib/triaxial-curve-parse").TriaxialCurvePayload;
  }, [selectedTriaxialRun]);

  const triaxialRunCurvesForOverlay = useMemo(() => {
    if (test?.test_type !== "triaxial_rock") return [];
    const take = triaxialRuns.slice(0, 5);
    const out: Array<{
      id: string;
      label: string;
      curve: import("@/lib/triaxial-curve-parse").TriaxialCurvePayload;
      confiningStressMpa: number;
    }> = [];
    for (const r of take) {
      const raw = r.curve_json;
      if (!raw || typeof raw !== "object") continue;
      const pts = (raw as Record<string, unknown>).points;
      if (!Array.isArray(pts) || pts.length < 2) continue;
      out.push({
        id: r.id,
        label: r.file_name,
        curve: raw as unknown as import("@/lib/triaxial-curve-parse").TriaxialCurvePayload,
        confiningStressMpa: Number(r.sigma3_mpa ?? 0) || 0,
      });
    }
    return out;
  }, [test?.test_type, triaxialRuns]);

  const selectedTriaxialRunGauges = useMemo(() => {
    const pts = selectedTriaxialRunCurve?.points ?? [];
    const hasAxial =
      pts.some((p) => p.strain_ch6 != null && Number.isFinite(p.strain_ch6)) ||
      pts.some((p) => p.strain_ch7 != null && Number.isFinite(p.strain_ch7));
    const hasHoop = pts.some((p) => p.strain_ch8 != null && Number.isFinite(p.strain_ch8));
    return { hasAxial, hasHoop };
  }, [selectedTriaxialRunCurve]);

  useEffect(() => {
    if (!test) return;
    const op = ((test as { operator_name?: unknown }).operator_name as string | null) ?? "";
    const opTrim = op.trim();
    const preparedFromDb = ((test as { prepared_by?: unknown }).prepared_by as string | null) ?? "";
    const verifiedFromDb = ((test as { verified_by?: unknown }).verified_by as string | null) ?? null;

    const preparedDefault = opTrim ? `Laborant ${opTrim}` : "";
    const shouldReplacePrepared =
      preparedFromDb.trim() !== "" ||
      preparedBy.trim() === "" ||
      preparedBy.trim().startsWith("Laborant ");

    if (shouldReplacePrepared) {
      setPreparedBy(preparedFromDb.trim() !== "" ? preparedFromDb : preparedDefault);
    }
    setVerifiedBy(verifiedFromDb ?? DEFAULT_VERIFIED_BY);
  }, [
    test?.id,
    (test as { operator_name?: unknown } | null)?.operator_name,
    (test as { prepared_by?: unknown } | null)?.prepared_by,
    (test as { verified_by?: unknown } | null)?.verified_by,
    preparedBy,
  ]);

  useEffect(() => {
    if (!test) return;
    const me = getLabUserFromStorage().userId;
    const lockLive = isLockActive({
      locked_by_user_id: test.locked_by_user_id ?? null,
      lock_expires_at: test.lock_expires_at ?? null,
    });
    const blocked = lockLive && test.locked_by_user_id !== me;
    if (blocked) return;

    const preparedDb = (((test as { prepared_by?: unknown }).prepared_by as string | null) ?? "").trim();
    const verifiedDb = (((test as { verified_by?: unknown }).verified_by as string | null) ?? "").trim();
    const op = (((test as { operator_name?: unknown }).operator_name as string | null) ?? "").trim();

    const preparedAuto = preparedDb || (op ? `Laborant ${op}` : "");
    const verifiedAuto = verifiedDb || DEFAULT_VERIFIED_BY;

    // Only persist when DB is missing values.
    if (preparedDb !== "" && verifiedDb !== "") return;
    if (!preparedAuto && !verifiedAuto) return;

    const last = lastAutoSignatureRef.current;
    if (last && last.testId === test.id && last.prepared === preparedAuto && last.verified === verifiedAuto) {
      return;
    }
    lastAutoSignatureRef.current = { testId: test.id, prepared: preparedAuto, verified: verifiedAuto };

    void (async () => {
      try {
        await fetch(`/api/tests/${test.id}`, {
          method: "PATCH",
          headers: jsonLabHeaders(),
          body: JSON.stringify({
            prepared_by: preparedDb !== "" ? undefined : preparedAuto || null,
            verified_by: verifiedDb !== "" ? undefined : verifiedAuto || null,
          }),
        });
      } catch {
        // Silent: avoid noisy UI on automatic best-effort persistence.
      }
    })();
  }, [
    test?.id,
    (test as { operator_name?: unknown } | null)?.operator_name,
    (test as { prepared_by?: unknown } | null)?.prepared_by,
    (test as { verified_by?: unknown } | null)?.verified_by,
    (test as { locked_by_user_id?: unknown } | null)?.locked_by_user_id,
    (test as { lock_expires_at?: unknown } | null)?.lock_expires_at,
  ]);

  const showUnitWeightBulkTab = useMemo(
    () =>
      test?.test_type === "unit_weight" ||
      test?.test_type === "ucs" ||
      test?.test_type === "young" ||
      test?.test_type === "triaxial_rock" ||
      test?.test_type === "unconfined_soil" ||
      test?.test_type === "point_load",
    [test?.test_type],
  );

  const resultByKey = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const r of data?.results ?? []) m.set(r.key, r.value);
    return m;
  }, [data?.results]);

  const ucsDiameterMm = useMemo(() => {
    const by = new Map((data?.measurements ?? []).map((x) => [x.key, x.value]));
    const d = Number(by.get("diameter_mm"));
    return Number.isFinite(d) && d > 0 ? d : undefined;
  }, [data?.measurements]);

  const unconfinedHeightMm = useMemo(() => {
    const by = new Map((data?.measurements ?? []).map((x) => [x.key, x.value]));
    const h = Number(by.get("height_mm"));
    return Number.isFinite(h) && h > 0 ? h : null;
  }, [data?.measurements]);

  const ucsCurveParsed = useMemo(
    () => (test?.ucs_curve_json != null ? parseUcsCurvePayload(test.ucs_curve_json) : null),
    [test?.ucs_curve_json],
  );
  const youngCurveParsed = useMemo(() => {
    const raw = (test as { young_curve_json?: unknown } | null)?.young_curve_json;
    if (!raw || typeof raw !== "object") return null;
    const pts = (raw as Record<string, unknown>).points;
    if (!Array.isArray(pts)) return null;
    return raw as YoungCurvePayload;
  }, [test]);

  const triaxialCurveParsed = useMemo(() => {
    const raw = (test as { triaxial_curve_json?: unknown } | null)?.triaxial_curve_json;
    if (!raw || typeof raw !== "object") return null;
    const pts = (raw as Record<string, unknown>).points;
    if (!Array.isArray(pts)) return null;
    return raw as { version?: number; points: Array<Record<string, unknown>> };
  }, [test]);

  const unconfinedSoilCurveParsed = useMemo(
    () =>
      test?.test_type === "unconfined_soil" && test.unconfined_soil_curve_json != null
        ? parseUnconfinedSoilCurvePayload(test.unconfined_soil_curve_json)
        : null,
    [test?.test_type, test?.unconfined_soil_curve_json],
  );

  const showRawDataTab = useMemo(() => {
    const tt = test?.test_type;
    if (tt === "ucs") return (ucsCurveParsed?.points?.length ?? 0) >= 2;
    if (tt === "young") return (youngCurveParsed?.points?.length ?? 0) >= 2;
    if (tt === "unconfined_soil") return (unconfinedSoilCurveParsed?.points?.length ?? 0) >= 2;
    if (tt === "triaxial_rock") return (triaxialCurveParsed?.points?.length ?? 0) >= 2;
    return false;
  }, [test?.test_type, ucsCurveParsed, youngCurveParsed, unconfinedSoilCurveParsed, triaxialCurveParsed]);

  const rawDataModel = useMemo(() => {
    const fmt = (v: unknown, decimals: number) => {
      if (v === null || v === undefined) return "—";
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) return "—";
      return n.toFixed(decimals);
    };

    const tt = test?.test_type;
    const maxRows = 2000;

    if (tt === "triaxial_rock" && triaxialCurveParsed?.points?.length) {
      const pts = triaxialCurveParsed.points;
      const take = pts.slice(0, maxRows);
      const hasT = take.some((p) => p.t_s != null && Number.isFinite(Number(p.t_s)));
      const hasL1 = take.some((p) => p.load_ch1_kn != null && Number.isFinite(Number(p.load_ch1_kn)));
      const hasL2 = take.some((p) => p.load_ch2_kn != null && Number.isFinite(Number(p.load_ch2_kn)));
      const hasD5 = take.some((p) => p.disp_ch5_mm != null && Number.isFinite(Number(p.disp_ch5_mm)));
      const hasC6 = take.some((p) => p.strain_ch6 != null && Number.isFinite(Number(p.strain_ch6)));
      const hasC7 = take.some((p) => p.strain_ch7 != null && Number.isFinite(Number(p.strain_ch7)));
      const hasC8 = take.some((p) => p.strain_ch8 != null && Number.isFinite(Number(p.strain_ch8)));
      const hasC13 = take.some((p) => p.confining_ch13_mpa != null && Number.isFinite(Number(p.confining_ch13_mpa)));
      const hasStress = take.some((p) => p.stress_mpa != null && Number.isFinite(Number(p.stress_mpa)));

      const cols: Array<{ key: string; label: string; cell: (p: (typeof take)[number], i: number) => string }> = [
        { key: "i", label: "#", cell: (_p, i) => String(i) },
      ];
      if (hasT) cols.push({ key: "t_s", label: "t (s)", cell: (p) => fmt((p as { t_s?: unknown }).t_s, 2) });
      if (hasL1)
        cols.push({
          key: "load_ch1_kn",
          label: "Load Ch1 (kN)",
          cell: (p) => fmt((p as { load_ch1_kn?: unknown }).load_ch1_kn, 3),
        });
      if (hasL2)
        cols.push({
          key: "load_ch2_kn",
          label: "Load Ch2 (kN)",
          cell: (p) => fmt((p as { load_ch2_kn?: unknown }).load_ch2_kn, 3),
        });
      if (hasD5)
        cols.push({
          key: "disp_ch5_mm",
          label: "Disp Ch5 (mm)",
          cell: (p) => fmt((p as { disp_ch5_mm?: unknown }).disp_ch5_mm, 3),
        });
      if (hasC6)
        cols.push({
          key: "strain_ch6",
          label: "Strain Ch6 (—)",
          cell: (p) => fmt((p as { strain_ch6?: unknown }).strain_ch6, 8),
        });
      if (hasC7)
        cols.push({
          key: "strain_ch7",
          label: "Strain Ch7 (—)",
          cell: (p) => fmt((p as { strain_ch7?: unknown }).strain_ch7, 8),
        });
      if (hasC8)
        cols.push({
          key: "strain_ch8",
          label: "Strain Ch8 (—)",
          cell: (p) => fmt((p as { strain_ch8?: unknown }).strain_ch8, 8),
        });
      if (hasC13)
        cols.push({
          key: "confining_ch13_mpa",
          label: "σ3 / Ch13 (MPa)",
          cell: (p) => fmt((p as { confining_ch13_mpa?: unknown }).confining_ch13_mpa, 3),
        });
      if (hasStress)
        cols.push({
          key: "stress_mpa",
          label: "Stress (MPa)",
          cell: (p) => fmt((p as { stress_mpa?: unknown }).stress_mpa, 3),
        });

      return { total: pts.length, shown: take.length, cols, rows: take };
    }

    if (tt === "young" && youngCurveParsed?.points?.length) {
      const pts = youngCurveParsed.points;
      const take = pts.slice(0, maxRows);
      const hasLoad = take.some((p) => p.load_kn != null && Number.isFinite(p.load_kn));
      const hasDisp = take.some((p) => p.disp_mm != null && Number.isFinite(p.disp_mm));
      const hasAx = take.some((p) => p.strain_axial != null && Number.isFinite(p.strain_axial));
      const hasLat = take.some((p) => p.strain_lateral != null && Number.isFinite(p.strain_lateral));
      const hasC6 = take.some((p) => p.strain_ch6 != null && Number.isFinite(p.strain_ch6));
      const hasC7 = take.some((p) => p.strain_ch7 != null && Number.isFinite(p.strain_ch7));
      const hasC8 = take.some((p) => p.strain_ch8 != null && Number.isFinite(p.strain_ch8));
      const hasT = take.some((p) => p.t_s != null && Number.isFinite(p.t_s));

      const cols: Array<{ key: string; label: string; cell: (p: (typeof take)[number], i: number) => string }> = [
        { key: "i", label: "#", cell: (_p, i) => String(i) },
      ];
      if (hasT) cols.push({ key: "t_s", label: "t (s)", cell: (p) => fmt(p.t_s, 2) });
      cols.push({ key: "stress_mpa", label: "σ (MPa)", cell: (p) => fmt(p.stress_mpa, 3) });
      if (hasLoad) cols.push({ key: "load_kn", label: "F (kN)", cell: (p) => fmt(p.load_kn, 3) });
      if (hasDisp) cols.push({ key: "disp_mm", label: "Δ (mm)", cell: (p) => fmt(p.disp_mm, 3) });
      if (hasAx) cols.push({ key: "strain_axial", label: "ε_axial (—)", cell: (p) => fmt(p.strain_axial, 8) });
      if (hasLat)
        cols.push({ key: "strain_lateral", label: "ε_lateral (—)", cell: (p) => fmt(p.strain_lateral, 8) });
      if (hasC6) cols.push({ key: "strain_ch6", label: "Ch6 (—)", cell: (p) => fmt(p.strain_ch6, 8) });
      if (hasC7) cols.push({ key: "strain_ch7", label: "Ch7 (—)", cell: (p) => fmt(p.strain_ch7, 8) });
      if (hasC8) cols.push({ key: "strain_ch8", label: "Ch8 (—)", cell: (p) => fmt(p.strain_ch8, 8) });

      return { total: pts.length, shown: take.length, cols, rows: take };
    }

    if (tt === "ucs" && ucsCurveParsed?.points?.length) {
      const pts = ucsCurveParsed.points;
      const take = pts.slice(0, maxRows);
      const hasLoad = take.some((p) => p.load_kn != null && Number.isFinite(p.load_kn));
      const hasRad = take.some((p) => p.strain_radial != null && Number.isFinite(p.strain_radial));
      const hasC6 = take.some((p) => p.strain_ch6 != null && Number.isFinite(p.strain_ch6));
      const hasC7 = take.some((p) => p.strain_ch7 != null && Number.isFinite(p.strain_ch7));
      const hasC8 = take.some((p) => p.strain_ch8 != null && Number.isFinite(p.strain_ch8));
      const hasT = take.some((p) => p.t_s != null && Number.isFinite(p.t_s));

      const cols: Array<{ key: string; label: string; cell: (p: (typeof take)[number], i: number) => string }> = [
        { key: "i", label: "#", cell: (_p, i) => String(i) },
      ];
      if (hasT) cols.push({ key: "t_s", label: "t (s)", cell: (p) => fmt(p.t_s, 2) });
      cols.push({ key: "stress_mpa", label: "σ (MPa)", cell: (p) => fmt(p.stress_mpa, 3) });
      if (hasLoad) cols.push({ key: "load_kn", label: "F (kN)", cell: (p) => fmt(p.load_kn, 3) });
      cols.push({ key: "strain_axial", label: "ε_axial (—)", cell: (p) => fmt(p.strain_axial, 8) });
      if (hasRad) cols.push({ key: "strain_radial", label: "ε_radial (—)", cell: (p) => fmt(p.strain_radial, 8) });
      if (hasC6) cols.push({ key: "strain_ch6", label: "Ch6 (—)", cell: (p) => fmt(p.strain_ch6, 8) });
      if (hasC7) cols.push({ key: "strain_ch7", label: "Ch7 (—)", cell: (p) => fmt(p.strain_ch7, 8) });
      if (hasC8) cols.push({ key: "strain_ch8", label: "Ch8 (—)", cell: (p) => fmt(p.strain_ch8, 8) });

      return { total: pts.length, shown: take.length, cols, rows: take };
    }

    if (tt === "unconfined_soil" && unconfinedSoilCurveParsed?.points?.length) {
      const pts = unconfinedSoilCurveParsed.points;
      const take = pts.slice(0, maxRows);
      const hasT = take.some((p) => p.t_s != null && Number.isFinite(p.t_s));
      const hasLoad = take.some((p) => Number.isFinite(p.load_kn));
      const hasDisp = take.some((p) => Number.isFinite(p.disp_mm));

      const cols: Array<{ key: string; label: string; cell: (p: (typeof take)[number], i: number) => string }> = [
        { key: "i", label: "#", cell: (_p, i) => String(i) },
      ];
      if (hasT) cols.push({ key: "t_s", label: "t (s)", cell: (p) => fmt(p.t_s, 2) });
      if (hasLoad) cols.push({ key: "load_kn", label: "F (kN)", cell: (p) => fmt(p.load_kn, 3) });
      if (hasDisp) cols.push({ key: "disp_mm", label: "Δ (mm)", cell: (p) => fmt(p.disp_mm, 3) });

      return { total: pts.length, shown: take.length, cols, rows: take };
    }

    return null;
  }, [test?.test_type, youngCurveParsed, ucsCurveParsed, unconfinedSoilCurveParsed, triaxialCurveParsed]);

  useEffect(() => {
    if (!test || test.test_type !== "young") return;
    const m = String((test as { young_mode?: unknown }).young_mode ?? "no_gauges");
    const mode = m === "gauges" ? "gauges" : "no_gauges";
    setYoungMode(mode);
    const s = parseYoungSettings((test as { young_settings_json?: unknown }).young_settings_json);
    setYoungSigmaUPct(
      s.sigma_u_pct != null && Number.isFinite(s.sigma_u_pct) ? Number(s.sigma_u_pct) : YOUNG_DEFAULT_SIGMA_U_PCT,
    );
    setYoungSigmaOPct(
      s.sigma_o_pct != null && Number.isFinite(s.sigma_o_pct) ? Number(s.sigma_o_pct) : YOUNG_DEFAULT_SIGMA_O_PCT,
    );
    setYoungDispScaleMm(
      s.displacement_scale_mm != null && Number.isFinite(s.displacement_scale_mm) && s.displacement_scale_mm > 0
        ? Number(s.displacement_scale_mm)
        : mode === "no_gauges"
          ? YOUNG_DEFAULT_DISP_SCALE_MM_NO_GAUGES
          : null,
    );
    const mRaw = String((s as unknown as { e_method?: unknown }).e_method ?? "eb");
    setYoungEMethod(
      mRaw === "loading" || mRaw === "unloading" || mRaw === "delta" || mRaw === "eb" || mRaw === "isrm"
        ? (mRaw as "eb" | "loading" | "unloading" | "delta" | "isrm")
        : "eb",
    );
    const n = (youngCurveParsed?.points?.length ?? 0) | 0;
    const from = s.trim_from != null && Number.isFinite(s.trim_from) ? Math.max(0, Math.min(n - 1, s.trim_from)) : 0;
    const to = s.trim_to != null && Number.isFinite(s.trim_to) ? Math.max(from, Math.min(n - 1, s.trim_to)) : Math.max(0, n - 1);
    setYoungTrimFrom(from);
    setYoungTrimTo(to);
    setYoungUseCh6(s.axial_gauges?.ch6 !== false);
    setYoungUseCh7(s.axial_gauges?.ch7 !== false);
    const pFrom =
      s.poisson_index_from != null && Number.isFinite(s.poisson_index_from)
        ? Math.max(0, Math.min(Math.max(0, to - from), s.poisson_index_from))
        : 0;
    const pTo =
      s.poisson_index_to != null && Number.isFinite(s.poisson_index_to)
        ? Math.max(pFrom, Math.min(Math.max(0, to - from), s.poisson_index_to))
        : Math.max(0, to - from);
    setYoungPoissonFrom(pFrom);
    setYoungPoissonTo(pTo);
    setYoungPoissonAutoCutoff(s.poisson_auto_cutoff !== false);
  }, [test, youngCurveParsed]);

  // Safety: if a curve exists and we somehow end up with a 1-point window, expand to full range
  // so the preview chart can render without requiring manual slider movement.
  useEffect(() => {
    if (!test || test.test_type !== "young") return;
    const n = youngCurveParsed?.points?.length ?? 0;
    if (n < 2) return;
    if (youngTrimFrom === 0 && youngTrimTo === 0) {
      setYoungTrimTo(n - 1);
    }
  }, [test, youngCurveParsed, youngTrimFrom, youngTrimTo]);

  const ucsModeForReport = useMemo(
    () => (test?.test_type === "ucs" ? normalizeUcsMode(test.ucs_mode) : "basic"),
    [test?.test_type, test?.ucs_mode],
  );

  const reportAvailStressTime = useMemo(() => {
    const pts = ucsCurveParsed?.points ?? [];
    let n = 0;
    for (const p of pts) {
      if (p.t_s != null && Number.isFinite(p.t_s) && Number.isFinite(p.stress_mpa)) n++;
    }
    return n >= 2;
  }, [ucsCurveParsed]);

  /** Raport Young: σ–t din `young_curve_json`. */
  const reportAvailYoungStressTime = useMemo(() => {
    const pts = youngCurveParsed?.points ?? [];
    let n = 0;
    for (const p of pts) {
      if (p.t_s != null && Number.isFinite(p.t_s) && Number.isFinite(p.stress_mpa)) n++;
    }
    return n >= 2;
  }, [youngCurveParsed]);

  /** Raport: timp – sarcină (kN), cu F din curbă sau din σ și diametru. */
  const reportAvailTimeLoad = useMemo(() => {
    const pts = ucsCurveParsed?.points ?? [];
    const d = ucsDiameterMm;
    let n = 0;
    for (const p of pts) {
      if (p.t_s == null || !Number.isFinite(p.t_s)) continue;
      if (p.load_kn != null && Number.isFinite(p.load_kn)) n++;
      else if (d != null && d > 0 && Number.isFinite(p.stress_mpa)) n++;
    }
    return n >= 2;
  }, [ucsCurveParsed, ucsDiameterMm]);

  /** Raport PDF: grafic Sarcină – ε_axial (UCS+Young, aceleași puncte ca în report-service). */
  const reportAvailSarcinaAxial = useMemo(() => {
    if (ucsModeForReport !== "instrumented") return false;
    const pts = ucsCurveParsed?.points ?? [];
    const d = ucsDiameterMm;
    let n = 0;
    for (const p of pts) {
      if (!Number.isFinite(p.strain_axial)) continue;
      let load = p.load_kn;
      if (load == null || !Number.isFinite(load)) {
        if (d == null || d <= 0) continue;
        load = (p.stress_mpa * Math.PI * (d / 2) ** 2) / 1000;
      }
      n++;
    }
    return n >= 2;
  }, [ucsCurveParsed, ucsDiameterMm, ucsModeForReport]);

  const showUcsForceStrainChannelsChart = useMemo(() => {
    if (test?.test_type !== "ucs") return false;
    const pts = ucsCurveParsed?.points ?? [];
    if (pts.length < 2) return false;
    for (const p of pts) {
      if (
        (p.strain_ch6 != null && Number.isFinite(p.strain_ch6)) ||
        (p.strain_ch7 != null && Number.isFinite(p.strain_ch7)) ||
        (p.strain_ch8 != null && Number.isFinite(p.strain_ch8))
      ) {
        return true;
      }
    }
    return false;
  }, [test?.test_type, ucsCurveParsed]);

  const reportAvailSpecimenPhotos = useMemo(() => {
    if (
      test?.test_type !== "ucs" &&
      test?.test_type !== "young" &&
      test?.test_type !== "point_load" &&
      test?.test_type !== "unconfined_soil"
    )
      return false;
    const files = data?.files ?? [];
    const hasTagged = files.some(
      (f) =>
        normalizeSpecimenRole(f.file_role) === "specimen_before" ||
        normalizeSpecimenRole(f.file_role) === "specimen_after",
    );
    if (hasTagged) return true;
    return files.some((f) => looksLikeLabImageFile(f));
  }, [test?.test_type, data?.files]);

  const specimenPhotoFiles = useMemo(
    () =>
      (data?.files ?? []).filter((f) => {
        const x = normalizeSpecimenRole(f.file_role);
        return x === "specimen_before" || x === "specimen_after";
      }),
    [data?.files],
  );

  /** Imagini fără rol (ex. încărcări vechi) — le afișăm ca să nu pară „dispărute”. */
  const orphanImageFiles = useMemo(() => {
    const all = data?.files ?? [];
    const tagged = new Set(specimenPhotoFiles.map((f) => f.id));
    return all.filter((f) => !tagged.has(f.id) && looksLikeLabImageFile(f));
  }, [data?.files, specimenPhotoFiles]);

  const pozeTableNote =
    specimenPhotoFiles.length === 0 && orphanImageFiles.length > 0
      ? "Există imagini fără rol „înainte/după” (probă coloana file_role lipsește în baza de date sau încărcare veche). Ștergeți rândurile și reîncărcați cu „Adaugă”, sau aplicați migrarea SQL `test_files_role`."
      : null;

  /** Point load: clasificare din metadata (după calcule) sau derivată din Is(50) din rezultate. */
  const pltStrengthClassDisplay = useMemo(() => {
    if (test?.test_type !== "point_load") return null;
    const meta = parsePointLoadReportMetadata(test.point_load_report_metadata_json);
    const fromMeta = (meta.rock_strength_class ?? "").trim();
    if (fromMeta) return fromMeta;
    const is50Raw = data?.results?.find((r) => r.key === "is50_mpa")?.value;
    const is50 = is50Raw != null ? Number(is50Raw) : NaN;
    return classifyIs50MpaStrengthRoOrDash(Number.isFinite(is50) ? is50 : null);
  }, [test?.test_type, test?.point_load_report_metadata_json, data?.results]);

  const stressStrainDeltas = useMemo(() => {
    const by = new Map((data?.measurements ?? []).map((x) => [x.key, x.value]));
    const ds = by.get("delta_sigma_mpa");
    const ea = by.get("delta_epsilon_axial");
    const el = by.get("delta_epsilon_lateral");
    if (ds == null || ea == null || el == null) return null;
    const n = (v: unknown) => (typeof v === "number" ? v : Number(v));
    const a = n(ds);
    const b = n(ea);
    const c = n(el);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return null;
    return { deltaSigmaMpa: a, deltaEpsilonAxial: b, deltaEpsilonLateral: c };
  }, [data?.measurements]);

  const d7012Panel = useMemo(
    () => (test ? d7012PanelForTestType(test.test_type) : null),
    [test],
  );

  const preset = useMemo(() => {
    if (!test) return [];
    if (test.test_type === "ucs") return MEASUREMENT_PRESETS.ucs;
    if (test.test_type === "absorption_porosity_rock") return [];
    if (test.test_type === "unconfined_soil") {
      return unconfinedSoilPresetForMode(
        normalizeUnconfinedSoilMode(
          (test as { unconfined_soil_mode?: unknown }).unconfined_soil_mode,
        ),
      );
    }
    return MEASUREMENT_PRESETS[test.test_type] ?? [];
  }, [test]);

  const presiometryCurve = useMemo(() => {
    if (!test || test.test_type !== "presiometry") return null;
    return parsePresiometryCurvePayload((test as { presiometry_curve_json?: unknown }).presiometry_curve_json);
  }, [test]);

  const defaults = useMemo(() => {
    const d: FormValues = {};
    if (!test) return d;
    const byKey = new Map((data?.measurements ?? []).map((m) => [m.key, m]));
    for (const p of preset) {
      const v = byKey.get(p.key)?.value;
      if (p.key === "ucs_strain_scale") {
        d[p.key] =
          v === null || v === undefined || !Number.isFinite(Number(v))
            ? UCS_DEFAULT_STRAIN_SCALE
            : Number(v);
        continue;
      }
      if (p.key === "unconfined_disp_source" && (v === null || v === undefined)) {
        d[p.key] = 1;
        continue;
      }
      if (p.key === "unconfined_subtract_initial_seating" && (v === null || v === undefined)) {
        d[p.key] = 1;
        continue;
      }
      d[p.key] = v === null || v === undefined ? undefined : Number(v);
    }
    return d;
  }, [test, data?.measurements, preset]);

  const form = useForm<FormValues>({ defaultValues: {} });

  useEffect(() => {
    form.reset(defaults);
  }, [form, defaults]);

  const [absPorPayload, setAbsPorPayload] = useState(ABS_POR_ROCK_DEFAULT);
  const [absPorMeta, setAbsPorMeta] = useState(ABS_POR_ROCK_META_DEFAULT);

  useEffect(() => {
    if (!test || test.test_type !== "absorption_porosity_rock") return;
    setAbsPorPayload(parseAbsorptionPorosityRockPayload(test.absorption_porosity_rock_json));
    setAbsPorMeta(parseAbsorptionPorosityRockReportMetadata(test.absorption_porosity_rock_report_metadata_json));
  }, [test]);

  const ucsSubtractSeatingW = useWatch({ control: form.control, name: "ucs_subtract_initial_seating" });
  const ucsSeatingLoadKnW = useWatch({ control: form.control, name: "ucs_seating_load_kn" });
  const unconfinedSubtractSeatingW = useWatch({
    control: form.control,
    name: "unconfined_subtract_initial_seating",
  });
  const unconfinedSeatingLoadKnW = useWatch({
    control: form.control,
    name: "unconfined_seating_load_kn",
  });

  const ucsStressBaselineMpa = useMemo(() => {
    if (test?.test_type !== "ucs") return 0;
    const seatingGrossOnly = ucsSubtractSeatingW === 0;
    const manualKn =
      ucsSeatingLoadKnW != null && Number.isFinite(Number(ucsSeatingLoadKnW))
        ? Number(ucsSeatingLoadKnW)
        : NaN;
    const pts = ucsCurveParsed?.points ?? [];
    const d = ucsDiameterMm;
    if (seatingGrossOnly) return 0;
    if (manualKn > 0 && d != null && d > 0) {
      const a = Math.PI * (d / 2) ** 2;
      return (manualKn * 1000) / a;
    }
    if (pts.length === 0) return 0;
    const p0 = pts[0]!;
    if (d != null && d > 0) {
      let blKn = 0;
      if (p0.load_kn != null && Number.isFinite(p0.load_kn) && p0.load_kn >= 0) {
        blKn = p0.load_kn;
      } else {
        blKn = (p0.stress_mpa * Math.PI * (d / 2) ** 2) / 1000;
      }
      const a = Math.PI * (d / 2) ** 2;
      return (blKn * 1000) / a;
    }
    return p0.stress_mpa;
  }, [test?.test_type, ucsSubtractSeatingW, ucsSeatingLoadKnW, ucsCurveParsed, ucsDiameterMm]);

  const ucsTimeLoadChart = useMemo(() => {
    const pts = ucsCurveParsed?.points ?? [];
    if (pts.length === 0) return { series: [] as { t: number; load: number }[], baselineKn: 0 };
    return buildUcsTimeLoadChartData(pts, ucsDiameterMm, {
      subtractSeating: ucsSubtractSeatingW !== 0,
      seatingLoadKn:
        ucsSeatingLoadKnW != null &&
        Number.isFinite(Number(ucsSeatingLoadKnW)) &&
        Number(ucsSeatingLoadKnW) > 0
          ? Number(ucsSeatingLoadKnW)
          : undefined,
    });
  }, [ucsCurveParsed, ucsDiameterMm, ucsSubtractSeatingW, ucsSeatingLoadKnW]);

  const measByKey = useMemo(
    () => new Map((data?.measurements ?? []).map((x) => [x.key, x.value])),
    [data?.measurements],
  );

  const unconfinedSoilSeriesRows = useMemo(() => {
    if (test?.test_type !== "unconfined_soil" || !unconfinedSoilCurveParsed?.points.length) return [];
    const h = Number(measByKey.get("height_mm"));
    const isSq = measByKey.get("unconfined_is_square") === 1;
    const d = Number(measByKey.get("diameter_mm"));
    const side = Number(measByKey.get("side_mm"));
    let area = 0;
    if (isSq) area = side > 0 && Number.isFinite(side) ? side * side : 0;
    else area = d > 0 && Number.isFinite(d) ? Math.PI * (d / 2) ** 2 : 0;
    if (!(h > 0 && area > 0)) return [];
    const pts = unconfinedSoilCurveParsed.points;
    let baselineKn = 0;
    const manualKn =
      unconfinedSeatingLoadKnW != null && Number.isFinite(Number(unconfinedSeatingLoadKnW))
        ? Number(unconfinedSeatingLoadKnW)
        : NaN;
    if (Number.isFinite(manualKn) && manualKn > 0) baselineKn = manualKn;
    else if (unconfinedSubtractSeatingW !== 0 && pts.length > 0) {
      const p0 = pts[0]!;
      baselineKn = Number.isFinite(p0.load_kn) && p0.load_kn >= 0 ? p0.load_kn : 0;
    }
    return stressStrainSeriesKpa(h, area, pts, baselineKn);
  }, [
    test?.test_type,
    unconfinedSoilCurveParsed,
    measByKey,
    unconfinedSubtractSeatingW,
    unconfinedSeatingLoadKnW,
  ]);

  const reportAvailUnconfinedStressStrain = unconfinedSoilSeriesRows.length >= 2;

  const [repCharts, setRepCharts] = useState({
    stress_time: true,
    time_load: true,
    sarcina_axial: true,
    specimen_photos: true,
    plt_astm_figures: true,
    unconfined_stress_strain: true,
    unconfined_include_cu: true,
  });

  useEffect(() => {
    if (!test) return;
    const p = parseTestReportOptions(test.report_options_json);
    if (test.test_type === "ucs") {
      const sarcinaStored = p.ucs_charts?.sarcina_axial ?? p.ucs_charts?.stress_strain;
      setRepCharts({
        stress_time: effectiveChartFlag(p.ucs_charts?.stress_time, reportAvailStressTime),
        time_load: effectiveChartFlag(p.ucs_charts?.time_load, reportAvailTimeLoad),
        sarcina_axial: effectiveChartFlag(sarcinaStored, reportAvailSarcinaAxial),
        specimen_photos: effectiveChartFlag(p.specimen_photos?.include, reportAvailSpecimenPhotos),
        plt_astm_figures: true,
        unconfined_stress_strain: true,
        unconfined_include_cu: true,
      });
      return;
    }
    if (test.test_type === "young") {
      setRepCharts({
        stress_time: effectiveChartFlag(p.ucs_charts?.stress_time, reportAvailYoungStressTime),
        time_load: false,
        sarcina_axial: false,
        specimen_photos: effectiveChartFlag(p.specimen_photos?.include, reportAvailSpecimenPhotos),
        plt_astm_figures: true,
        unconfined_stress_strain: true,
        unconfined_include_cu: true,
      });
      return;
    }
    if (test.test_type === "point_load") {
      setRepCharts({
        stress_time: false,
        time_load: false,
        sarcina_axial: false,
        specimen_photos: effectiveChartFlag(p.specimen_photos?.include, reportAvailSpecimenPhotos),
        plt_astm_figures: effectiveChartFlag(p.plt_astm_figures?.include, true),
        unconfined_stress_strain: true,
        unconfined_include_cu: true,
      });
      return;
    }
    if (test.test_type === "unconfined_soil") {
      setRepCharts({
        stress_time: false,
        time_load: false,
        sarcina_axial: false,
        specimen_photos: effectiveChartFlag(p.specimen_photos?.include, reportAvailSpecimenPhotos),
        plt_astm_figures: true,
        unconfined_stress_strain: effectiveChartFlag(
          p.unconfined_soil_charts?.stress_strain,
          reportAvailUnconfinedStressStrain,
        ),
        unconfined_include_cu: effectiveChartFlag(p.unconfined_soil_results?.include_cu_kpa, true),
      });
    }
  }, [
    test?.id,
    test?.test_type,
    test?.report_options_json,
    test?.ucs_curve_json,
    test?.young_curve_json,
    test?.ucs_mode,
    test?.unconfined_soil_curve_json,
    reportAvailStressTime,
    reportAvailYoungStressTime,
    reportAvailTimeLoad,
    reportAvailSarcinaAxial,
    reportAvailSpecimenPhotos,
    reportAvailUnconfinedStressStrain,
  ]);

  const saveReportChartOptions = useCallback(async () => {
    if (
      !test ||
      (test.test_type !== "ucs" &&
        test.test_type !== "young" &&
        test.test_type !== "point_load" &&
        test.test_type !== "unconfined_soil")
    )
      return;
    setBusy(true);
    setMsg(null);
    try {
      const reportOptionsPayload =
        test.test_type === "point_load"
          ? {
              specimen_photos: {
                include: reportAvailSpecimenPhotos ? repCharts.specimen_photos : false,
              },
              plt_astm_figures: {
                include: repCharts.plt_astm_figures,
              },
            }
          : test.test_type === "young"
            ? {
                ucs_charts: {
                  stress_time: reportAvailYoungStressTime ? repCharts.stress_time : false,
                  time_load: false,
                  sarcina_axial: false,
                },
                specimen_photos: {
                  include: reportAvailSpecimenPhotos ? repCharts.specimen_photos : false,
                },
              }
            : test.test_type === "unconfined_soil"
              ? {
                  unconfined_soil_charts: {
                    stress_strain: reportAvailUnconfinedStressStrain
                      ? repCharts.unconfined_stress_strain
                      : false,
                  },
                  unconfined_soil_results: {
                    include_cu_kpa: repCharts.unconfined_include_cu,
                  },
                  specimen_photos: {
                    include: reportAvailSpecimenPhotos ? repCharts.specimen_photos : false,
                  },
                }
              : {
                  ucs_charts: {
                    stress_time: reportAvailStressTime ? repCharts.stress_time : false,
                    time_load: reportAvailTimeLoad ? repCharts.time_load : false,
                    sarcina_axial: reportAvailSarcinaAxial ? repCharts.sarcina_axial : false,
                  },
                  specimen_photos: {
                    include: reportAvailSpecimenPhotos ? repCharts.specimen_photos : false,
                  },
                };
      const res = await fetch(`/api/tests/${testId}`, {
        method: "PATCH",
        headers: jsonLabHeaders(),
        body: JSON.stringify({
          report_options_json: reportOptionsPayload,
        }),
      });
      const json = await res.json();
      if (res.status === 423) throw new Error(json.error ?? "Test blocat.");
      if (!res.ok) throw new Error(json.error ?? "Salvare eșuată");
      setMsg("Opțiuni raport salvate.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(false);
    }
  }, [
    load,
    repCharts,
    reportAvailStressTime,
    reportAvailYoungStressTime,
    reportAvailTimeLoad,
    reportAvailSarcinaAxial,
    reportAvailSpecimenPhotos,
    reportAvailUnconfinedStressStrain,
    test,
    testId,
  ]);

  const saveMeasurementsCore = useCallback(
    async (vals: FormValues, opts?: { skipReload?: boolean; okMessage?: string | null }) => {
      if (!test) return;
      if (test.test_type === "absorption_porosity_rock") {
        const res = await fetch(`/api/tests/${testId}`, {
          method: "PATCH",
          headers: jsonLabHeaders(),
          body: JSON.stringify({
            absorption_porosity_rock_json: absPorPayload,
            absorption_porosity_rock_report_metadata_json: absPorMeta,
          }),
        });
        const json = (await parseResponseJson(res)) as { error?: string };
        if (res.status === 423) throw new Error(json.error ?? "Test blocat de alt post.");
        if (res.status === 401 || res.status === 403)
          throw new Error("Nu ești autentificat(ă). Reîncarcă pagina și autentifică-te din nou.");
        if (!res.ok) throw new Error(json.error ?? "Salvare eșuată");
        if (opts?.okMessage) setMsg(opts.okMessage);
        if (!opts?.skipReload) await load();
        return;
      }

      const check = validateMeasurementsForTestType(test.test_type, vals as Record<string, unknown>, {
        ucsMode: test.test_type === "ucs" ? "basic" : undefined,
        allowPartialPointLoad: test.test_type === "point_load",
        unconfinedSoilMode:
          test.test_type === "unconfined_soil"
            ? normalizeUnconfinedSoilMode(
                (test as { unconfined_soil_mode?: unknown }).unconfined_soil_mode,
              )
            : undefined,
      });
      if (!check.ok) throw new Error(check.message);

      const rows = preset.map((p, i) => ({
        key: p.key,
        label: p.label,
        value:
          vals[p.key] === undefined || vals[p.key] === null || Number.isNaN(vals[p.key] as number)
            ? null
            : Number(vals[p.key]),
        unit: p.unit,
        display_order: (i + 1) * 10,
        source: "manual" as const,
      }));
      const res = await fetch(`/api/tests/${testId}/measurements`, {
        method: "PUT",
        headers: jsonLabHeaders(),
        body: JSON.stringify({ rows }),
      });
      const json = (await parseResponseJson(res)) as { error?: string };
      if (res.status === 423) throw new Error(json.error ?? "Test blocat de alt post.");
      if (res.status === 401 || res.status === 403)
        throw new Error("Nu ești autentificat(ă). Reîncarcă pagina și autentifică-te din nou.");
      if (!res.ok) throw new Error(json.error ?? `Salvare eșuată (HTTP ${res.status})`);
      if (opts?.okMessage) setMsg(opts.okMessage);
      if (!opts?.skipReload) await load();
    },
    [absPorMeta, absPorPayload, load, preset, test, testId],
  );

  // Point load: auto-salvare măsurători (debounce) ca să nu se piardă la navigare/refresh.
  const pltAutoSaveTimer = useRef<number | null>(null);
  const pltAutoSaveInFlight = useRef(false);
  const pltAutoSaveLastSig = useRef<string>("");
  useEffect(() => {
    if (!test || test.test_type !== "point_load") return;

    const sub = form.watch(() => {
      if (pltAutoSaveTimer.current != null) window.clearTimeout(pltAutoSaveTimer.current);
      pltAutoSaveTimer.current = window.setTimeout(async () => {
        if (!test || test.test_type !== "point_load") return;
        if (pltAutoSaveInFlight.current) return;

        const vals = form.getValues();
        const sig = JSON.stringify({
          plt_test_kind: vals.plt_test_kind ?? null,
          plt_anisotropy: vals.plt_anisotropy ?? null,
          plt_d_mm: vals.plt_d_mm ?? null,
          plt_w_mm: vals.plt_w_mm ?? null,
          plt_w1_mm: vals.plt_w1_mm ?? null,
          plt_w2_mm: vals.plt_w2_mm ?? null,
          plt_w3_mm: vals.plt_w3_mm ?? null,
          plt_l_mm: vals.plt_l_mm ?? null,
          peak_load_kn: vals.peak_load_kn ?? null,
        });
        if (sig === pltAutoSaveLastSig.current) return;
        pltAutoSaveLastSig.current = sig;

        pltAutoSaveInFlight.current = true;
        try {
          await saveMeasurementsCore(vals, { skipReload: true, okMessage: null });
        } catch (e) {
          const m = e instanceof Error ? e.message : "Auto-salvare eșuată";
          setMsg(formatClientFetchError(m));
        } finally {
          pltAutoSaveInFlight.current = false;
        }
      }, 700);
    });

    return () => {
      sub.unsubscribe();
      if (pltAutoSaveTimer.current != null) window.clearTimeout(pltAutoSaveTimer.current);
      pltAutoSaveTimer.current = null;
    };
  }, [form, saveMeasurementsCore, test]);

  const onSaveMeasurements = form.handleSubmit(async (vals) => {
    if (!test) return;
    setBusy(true);
    setMsg(null);
    try {
      await saveMeasurementsCore(vals, {
        okMessage: test.test_type === "absorption_porosity_rock" ? "Date ISO 13755 salvate." : "Măsurători salvate.",
      });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(false);
    }
  });

  const onCalculate = async () => {
    setBusy(true);
    setMsg(null);
    setCalcWarnings([]);
    try {
      // Point load: dacă utilizatorul apasă „Rulează calcule” fără „Salvează măsurători”,
      // UI se reîncarcă după calcule și valorile nesalvate (ex. W1–W3) par că “dispar”.
      if (test?.test_type === "point_load") {
        setMsg("Se salvează măsurători (Point load) și se rulează calcule…");
        await saveMeasurementsCore(form.getValues(), {
          skipReload: true,
          okMessage: null,
        });
      }
      if (test?.test_type === "triaxial_rock") {
        setMsg("Se salvează măsurători (Triaxial) și se rulează calcule…");
        await saveMeasurementsCore(form.getValues(), {
          skipReload: true,
          okMessage: null,
        });
      }

      const youngSettingsOverride =
        test?.test_type === "young"
          ? {
              sigma_u_pct: youngSigmaUPct,
              sigma_o_pct: youngSigmaOPct,
              displacement_scale_mm:
                youngDispScaleMm != null && Number.isFinite(youngDispScaleMm) && youngDispScaleMm > 0
                  ? youngDispScaleMm
                  : null,
              e_method: youngEMethod,
              trim_from: youngTrimFrom,
              trim_to: youngTrimTo,
              axial_gauges: { ch6: youngUseCh6, ch7: youngUseCh7 },
              poisson_index_from: youngPoissonFrom,
              poisson_index_to: youngPoissonTo,
              poisson_auto_cutoff: youngPoissonAutoCutoff,
            }
          : null;

      const triaxialHbSigmaCiOverride =
        test?.test_type === "triaxial_rock" && hbSigmaCiMpa != null && Number.isFinite(hbSigmaCiMpa) && hbSigmaCiMpa > 0
          ? hbSigmaCiMpa
          : null;

      const calcBody =
        youngSettingsOverride || triaxialHbSigmaCiOverride != null
          ? JSON.stringify({
              ...(youngSettingsOverride ? { young_settings_override: youngSettingsOverride } : {}),
              ...(triaxialHbSigmaCiOverride != null ? { triaxial_hb_sigma_ci_mpa: triaxialHbSigmaCiOverride } : {}),
            })
          : undefined;

      const res = await fetch(`/api/tests/${testId}/calculate`, {
        method: "POST",
        headers: jsonLabHeaders(),
        body: calcBody,
      });
      const json = (await parseResponseJson(res)) as Record<string, unknown> & {
        error?: string;
        errors?: string[];
        warnings?: string[];
        formulaVersion?: string;
        ok?: boolean;
      };
      if (res.status === 422) {
        setMsg(Array.isArray(json.errors) ? json.errors.join(" ") : "Calcule incomplete");
        setCalcWarnings(Array.isArray(json.warnings) ? json.warnings : []);
        return;
      }
      if (res.status === 423) throw new Error(json.error ?? "Test blocat de alt post.");
      if (res.status === 401 || res.status === 403)
        throw new Error("Nu ești autentificat(ă). Reîncarcă pagina și autentifică-te din nou.");
      if (!res.ok) throw new Error(json.error ?? "Calcul eșuat");
      setCalcWarnings(Array.isArray(json.warnings) ? json.warnings : []);
      setMsg("Calcule actualizate.");
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : "Eroare";
      setMsg(formatClientFetchError(m));
    } finally {
      setBusy(false);
    }
  };

  const onReport = async () => {
    setBusy(true);
    setMsg(null);
    try {
      setMsg("Se generează PDF-ul (browser → report-service; poate dura 1–2 minute)…");
      const mint = await mintReportToken(testId);
      const res = await fetch(`${mint.reportServiceUrl}/reports`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-report-token": mint.token,
          "x-report-token-exp": String(mint.expiresAt),
        },
        body: JSON.stringify({ testId: mint.testId }),
        cache: "no-store",
      });
      const json = (await parseResponseJson(res)) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Raport eșuat");
      setMsg("Raport generat.");
      await load();
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      setMsg(
        isLikelyNetworkFailure(raw)
          ? `${raw} — Verificați report-service (HTTPS, CORS), redeploy ultimul report-service, apoi „Verifică report-service”.`
          : raw,
      );
    } finally {
      setBusy(false);
    }
  };

  const onReportServiceCheck = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/report-service/status");
      const text = await res.text();
      let j: Record<string, unknown> = {};
      try {
        j = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        setMsg(`Răspuns invalid de la verificare. HTTP ${res.status}`);
        return;
      }
      const hint = typeof j.hint === "string" ? j.hint : "";
      if (j.ok === true) {
        setMsg(
          `Report-service OK la ${String(j.reportServiceUrl ?? "")}. ${hint}`.trim(),
        );
        return;
      }
      if (j.configured === false) {
        setMsg(
          `Config incomplet pe server: URL setat=${String(j.reportServiceUrlSet)}, secret setat=${String(j.reportServiceSecretSet)}. ${hint}`,
        );
        return;
      }
      const err = typeof j.error === "string" ? j.error : "";
      setMsg(
        `Report-service nu e accesibil din Next (${String(j.reportServiceUrl ?? "")}). ${err ? `${err}. ` : ""}${hint}`.trim(),
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Verificare eșuată");
    } finally {
      setBusy(false);
    }
  };

  const onReportPreview = async () => {
    setBusy(true);
    setMsg(null);
    try {
      setMsg("Se încarcă previzualizarea…");
      const mint = await mintReportToken(testId);
      const res = await fetch(`${mint.reportServiceUrl}/reports/preview`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-report-token": mint.token,
          "x-report-token-exp": String(mint.expiresAt),
        },
        body: JSON.stringify({ testId: mint.testId }),
        cache: "no-store",
      });
      const json = (await parseResponseJson(res)) as { error?: string; html?: string };
      if (!res.ok) throw new Error(json.error ?? "Previzualizare eșuată");
      const html = json.html;
      if (typeof html !== "string") throw new Error("Previzualizare: HTML lipsă.");
      setMsg(null);
      const w = window.open("", "_blank");
      if (w) {
        w.document.open();
        w.document.write(html);
        w.document.close();
      } else {
        setMsg("Permiteți ferestre pop-up pentru previzualizare.");
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      if (/failed to fetch|fetch failed|networkerror|load failed|network request failed/i.test(raw)) {
        setMsg(
          "Previzualizare: rețea sau CORS. Redeploy report-service (CORS + token) și verificați URL-ul public.",
        );
      } else {
        setMsg(raw);
      }
    } finally {
      setBusy(false);
    }
  };

  const onSaveSignatures = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/tests/${testId}`, {
        method: "PATCH",
        headers: jsonLabHeaders(),
        body: JSON.stringify({
          prepared_by: preparedBy.trim() || null,
          verified_by: verifiedBy.trim() || null,
        }),
      });
      const json = (await parseResponseJson(res)) as { error?: string };
      if (res.status === 423) throw new Error(json.error ?? "Test blocat.");
      if (!res.ok) throw new Error(json.error ?? "Salvare eșuată");
      setMsg("Semnături salvate.");
      await load({ softRefresh: true });
    } catch (e) {
      const m = e instanceof Error ? e.message : "Eroare";
      setMsg(formatClientFetchError(m));
    } finally {
      setBusy(false);
    }
  };

  const onUploadSpecimenPhoto = async (file: File, role: TestFileRole) => {
    setSpecimenUploadRole(role);
    setBusy(true);
    setMsg(null);
    try {
      const sanitizedName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${testId}/${Date.now()}_${sanitizedName}`;

      const su = await fetch(`/api/storage/signed-upload-url?bucket=lab-files&path=${encodeURIComponent(path)}`, {
        method: "GET",
        headers: labUserFetchHeaders(),
      });
      const suJson = (await parseResponseJson(su)) as { signedUrl?: string; token?: string; error?: string };
      if (!su.ok) throw new Error(suJson.error ?? "Nu pot genera URL de upload.");
      if (!suJson.signedUrl || !suJson.token) throw new Error("URL de upload invalid.");

      const up = await fetch(suJson.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!up.ok) throw new Error(`Upload eșuat (Storage): ${up.status}`);

      const ext = file.name.includes(".") ? file.name.split(".").pop() ?? "" : "";
      const res = await fetch(`/api/tests/${testId}/files/register`, {
        method: "POST",
        headers: jsonLabHeaders(),
        body: JSON.stringify({
          file_name: file.name,
          file_path: path,
          file_type: ext || null,
          file_role: role,
        }),
      });
      const body = (await parseResponseJson(res)) as TestFile & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Înregistrare fișier eșuată");
      const newFile: TestFile = {
        ...(body as TestFile),
        file_role: normalizeSpecimenRole((body as TestFile).file_role) || role,
      };
      setData((prev) => {
        if (!prev) return prev;
        const withoutSameRole = prev.files.filter((f) => f.file_role !== role);
        return {
          ...prev,
          files: [newFile, ...withoutSameRole.filter((f) => f.id !== newFile.id)],
        };
      });
      if (role === "specimen_before") {
        setPendingSpecimenBefore(null);
        if (specBeforeInputRef.current) specBeforeInputRef.current.value = "";
        if (specBeforeCameraRef.current) specBeforeCameraRef.current.value = "";
      } else {
        setPendingSpecimenAfter(null);
        if (specAfterInputRef.current) specAfterInputRef.current.value = "";
        if (specAfterCameraRef.current) specAfterCameraRef.current.value = "";
      }
      setMsg(
        role === "specimen_before"
          ? "Fotografie „înainte de încercare” adăugată și salvată."
          : "Fotografie „după încercare” adăugată și salvată.",
      );
      const reloaded = await load({ softRefresh: true });
      if (!reloaded) {
        setMsg(
          role === "specimen_before"
            ? "Fotografie „înainte” salvată pe server. Reîncărcarea completă a eșuat — lista de mai sus ar trebui să fie la zi; dacă nu, apăsați F5."
            : "Fotografie „după” salvată pe server. Reîncărcarea completă a eșuat — lista de mai sus ar trebui să fie la zi; dacă nu, apăsați F5.",
        );
      }
    } catch (e) {
      setMsg(formatClientFetchError(e instanceof Error ? e.message : "Eroare"));
    } finally {
      setSpecimenUploadRole(null);
      setBusy(false);
    }
  };

  const onDeleteFile = async (fileId: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/tests/${testId}/files/${fileId}`, {
        method: "DELETE",
        headers: labUserFetchHeaders(),
      });
      const json = await res.json();
      if (res.status === 423) throw new Error(json.error ?? "Blocat.");
      if (!res.ok) throw new Error(json.error ?? "Ștergere eșuată");
      setMsg("Fișier eliminat.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(false);
    }
  };

  const onDeleteTriaxialRun = async (runId: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/tests/${testId}/triaxial-runs/${runId}`, {
        method: "DELETE",
        headers: labUserFetchHeaders(),
      });
      const json = await res.json();
      if (res.status === 423) throw new Error(json.error ?? "Blocat.");
      if (!res.ok) throw new Error(json.error ?? "Ștergere eșuată");
      setMsg("Rulare triaxial eliminată.");
      await loadTriaxialRuns();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(false);
    }
  };

  const onPatchTriaxialRun = async (runId: string, patch: { is_suspect?: boolean; observations?: string }) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/tests/${testId}/triaxial-runs/${runId}`, {
        method: "PATCH",
        headers: jsonLabHeaders(),
        body: JSON.stringify(patch),
      });
      const json = (await parseResponseJson(res)) as { error?: string; run?: TriaxialRockRun };
      if (res.status === 423) throw new Error(json.error ?? "Blocat.");
      if (!res.ok) throw new Error(json.error ?? "Actualizare eșuată");
      if (json.run) {
        setTriaxialRuns((prev) => prev.map((r) => (r.id === runId ? (json.run as TriaxialRockRun) : r)));
      } else {
        await loadTriaxialRuns();
      }
      setMsg("Observații salvate.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(false);
    }
  };

  const onImport = async (fileList: FileList | null) => {
    const files = fileList ? Array.from(fileList) : [];
    if (files.length === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      if (test?.test_type === "triaxial_rock") {
        for (const f of files) fd.append("files", f);
      } else {
        fd.set("file", files[0]!);
      }
      const res = await fetch(`/api/tests/${testId}/import`, {
        method: "POST",
        headers: labUserFetchHeaders(),
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Import eșuat");
      if (test?.test_type === "triaxial_rock" && json.bulk === true && Array.isArray(json.runs)) {
        const okCount = json.runs.filter((r: { ok?: unknown }) => r?.ok === true).length;
        const failCount = json.runs.length - okCount;
        let text = `Import triaxial: ${okCount} fișiere OK`;
        if (failCount > 0) text += `, ${failCount} eșuate`;
        text += ".";
        setMsg(text);
        await loadTriaxialRuns();
        await load({ softRefresh: true });
        return;
      }
      let text = `Import: ${json.imported ?? 0} valori.`;
      if (json.ucsCurveImported) {
        if (json.ucsCurveMode === "basic") {
          text = "Curbă UCS importată (mod Basic). ";
          if (typeof json.autoPeakLoadKn === "number" && Number.isFinite(json.autoPeakLoadKn)) {
            text += `Sarcină de vârf preluată automat: ${json.autoPeakLoadKn.toFixed(3)} kN. `;
          }
        } else {
          text = "Curbă UCS importată; mod UCS+Young. ";
        }
        if (typeof json.timeToFailureFromCurve === "string" && json.timeToFailureFromCurve.length > 0) {
          text += `Timp până la rupere (la σ max): ${json.timeToFailureFromCurve} — completat în „Date pentru raport”. `;
        }
        if (Array.isArray(json.curveWarnings) && json.curveWarnings.length > 0) {
          text += json.curveWarnings.join(" ");
        }
      }
      if (json.youngCurveImported) {
        text = "Curbă Young importată (SR EN 14580). Mergeți la setările Young pentru a tăia început/sfârșit dacă e zgomot, apoi rulați calculele.";
        if (Array.isArray(json.curveWarnings) && json.curveWarnings.length > 0) {
          text += ` ${json.curveWarnings.join(" ")}`;
        }
      }
      if (json.unconfinedSoilCurveImported) {
        text =
          "Curbă Uniframe/Controls importată; mod setat la instrumentat. Salvați măsurătorile (H_i, geometrie), apoi «Rulează calcule».";
        if (Array.isArray(json.curveWarnings) && json.curveWarnings.length > 0) {
          text += ` ${json.curveWarnings.join(" ")}`;
        }
      }
      if (json.presiometryCurveImported) {
        const nPts = typeof json.points === "number" && Number.isFinite(json.points) ? json.points : null;
        text = `Curbă presiometrie importată${nPts != null ? `: ${nPts} puncte` : ""}. Apăsați «Rulează calcule».`;
      }
      if (json.storageWarning) text += ` Storage: ${json.storageWarning}`;
      setMsg(text);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(false);
    }
  };

  const onYoungModeChange = async (mode: "no_gauges" | "gauges") => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/tests/${testId}`, {
        method: "PATCH",
        headers: jsonLabHeaders(),
        body: JSON.stringify({ young_mode: mode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Actualizare mod Young eșuată");
      setYoungMode(mode);
      setMsg(mode === "gauges" ? "Mod Young: cu mărci tensiometrice." : "Mod Young: fără mărci tensiometrice.");
      await load({ softRefresh: true });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(false);
    }
  };

  const onUnconfinedSoilModeChange = async (mode: "basic" | "instrumented") => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/tests/${testId}`, {
        method: "PATCH",
        headers: jsonLabHeaders(),
        body: JSON.stringify({ unconfined_soil_mode: mode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Actualizare mod eșuată");
      setMsg(mode === "instrumented" ? "Mod instrumentat (curbă P–ΔH)." : "Mod basic (P și ε la eșec manual).");
      await load({ softRefresh: true });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(false);
    }
  };

  const onSaveYoungSettings = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const payload = {
        sigma_u_pct: youngSigmaUPct,
        sigma_o_pct: youngSigmaOPct,
        displacement_scale_mm:
          youngDispScaleMm != null && Number.isFinite(youngDispScaleMm) && youngDispScaleMm > 0
            ? youngDispScaleMm
            : null,
        e_method: youngEMethod,
        trim_from: youngTrimFrom,
        trim_to: youngTrimTo,
        axial_gauges: { ch6: youngUseCh6, ch7: youngUseCh7 },
        poisson_index_from: youngPoissonFrom,
        poisson_index_to: youngPoissonTo,
        poisson_auto_cutoff: youngPoissonAutoCutoff,
      };
      const res = await fetch(`/api/tests/${testId}`, {
        method: "PATCH",
        headers: jsonLabHeaders(),
        body: JSON.stringify({ young_settings_json: payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Salvare setări Young eșuată");
      setMsg("Setări Young salvate. Rulați calculele pentru Eb / E_loading / E_unloading.");
      await load({ softRefresh: true });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(false);
    }
  };

  const onStatusChange = async (status: TestStatus) => {
    if (!test) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/tests/${testId}`, {
        method: "PATCH",
        headers: jsonLabHeaders(),
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Actualizare status eșuată");
      setMsg("Status actualizat.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(false);
    }
  };

  const onAcquireLock = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/tests/${testId}/lock`, {
        method: "POST",
        headers: jsonLabHeaders(),
        body: JSON.stringify({ ttlMinutes: 30 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Blocare eșuată");
      setMsg(`Editare blocată pentru alți utilizatori (${json.ttlMinutes ?? 30} min).`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(false);
    }
  };

  const onReleaseLock = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/tests/${testId}/unlock`, {
        method: "POST",
        headers: jsonLabHeaders(),
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Eliberare eșuată");
      setMsg("Blocare eliberată.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(false);
    }
  };

  const saveIdentity = () => {
    setLabUserInStorage(identName, identId || identName);
    setMsg("Identitate salvată pentru acest browser.");
  };

  if (loadError) {
    return (
      <div className="p-8">
        <p className="text-destructive text-sm">{loadError}</p>
        <Button type="button" variant="outline" className="mt-4" onClick={() => void load()}>
          Reîncearcă
        </Button>
      </div>
    );
  }

  if (!test || !data) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 p-8 text-sm">
        <Loader2 className="size-4 animate-spin" /> Se încarcă…
      </div>
    );
  }

  const p = test.sample.borehole.project;
  const b = test.sample.borehole;
  const s = test.sample;

  const crumbs = [
    { label: "Proiecte", href: "/projects" },
    { label: p.code, href: `/projects/${projectId}` },
    { label: b.code, href: `/projects/${projectId}/boreholes/${boreholeId}` },
    { label: `Număr probă ${s.code}`, href: `/projects/${projectId}/boreholes/${boreholeId}/samples/${sampleId}` },
    { label: newTestOptionLabel(test.test_type), href: null },
  ];

  const ucsModeStored = test.test_type === "ucs" ? normalizeUcsMode(test.ucs_mode) : "basic";
  const ucsInstrumentedHistory = test.test_type === "ucs" && ucsModeStored === "instrumented";
  // UCS Metoda C: UI folosește doar varianta Basic; instrumented rămâne doar istoric (read-only).
  const ucsMode = "basic";
  const ucsVal = data.results.find((r) => r.key === "ucs_mpa")?.value ?? null;
  const showUcsTimeLoadChart = ucsTimeLoadChart.series.length >= 2;

  const sigma1Mohr = resultByKey.get("sigma1_mpa");
  const sigma3Mohr = resultByKey.get("sigma3_mpa");

  const unconfinedQuMohr = resultByKey.get("qu_kpa");
  const unconfinedCuMohr = resultByKey.get("cu_kpa");
  const showUnconfinedMohr =
    test.test_type === "unconfined_soil" &&
    unconfinedQuMohr != null &&
    Number.isFinite(unconfinedQuMohr) &&
    unconfinedQuMohr > 0;

  const me = getLabUserFromStorage().userId;
  const lockLive = isLockActive({
    locked_by_user_id: test.locked_by_user_id ?? null,
    lock_expires_at: test.lock_expires_at ?? null,
  });
  const blockedByOther = lockLive && test.locked_by_user_id !== me;
  const myLock = lockLive && test.locked_by_user_id === me;
  const ucsReadOnly = blockedByOther || ucsInstrumentedHistory;

  return (
    <div className="p-6 lg:p-8">
      <LabBreadcrumb items={crumbs} />

      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Identitate post / utilizator</CardTitle>
          <CardDescription>
            Salvează în browser pentru a înregistra cine editează și pentru blocare concurentă (2
            calculatoare).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="lab-ident-name">Nume afișat</Label>
            <Input
              id="lab-ident-name"
              value={identName}
              onChange={(e) => setIdentName(e.target.value)}
              className="w-[200px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lab-ident-id">ID post (stabil)</Label>
            <Input
              id="lab-ident-id"
              value={identId}
              onChange={(e) => setIdentId(e.target.value)}
              placeholder="ex. pc-lab-1"
              className="w-[200px]"
            />
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={saveIdentity}>
            Salvează identitatea
          </Button>
        </CardContent>
      </Card>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-foreground text-2xl font-semibold tracking-tight">
            {newTestOptionLabel(test.test_type)}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {p.name} · Foraj {b.code}
            {b.name?.trim() ? ` — ${b.name.trim()}` : ""} · Număr probă {s.code}
          </p>
          <div className="text-muted-foreground mt-3 grid gap-1 text-xs sm:grid-cols-2">
            <p>
              Creat:{" "}
              <span className="text-foreground">
                {test.created_at ? new Date(test.created_at).toLocaleString("ro-RO") : "—"}
              </span>
              {test.created_by && (
                <>
                  {" "}
                  · de <span className="text-foreground">{test.created_by}</span>
                </>
              )}
            </p>
            <p>
              Actualizat:{" "}
              <span className="text-foreground">
                {(test.updated_at ?? test.created_at)
                  ? new Date(test.updated_at ?? test.created_at).toLocaleString("ro-RO")
                  : "—"}
              </span>
              {test.updated_by && (
                <>
                  {" "}
                  · de <span className="text-foreground">{test.updated_by}</span>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-xs">Status</span>
            <Select value={test.status} onValueChange={(v) => void onStatusChange(v as TestStatus)}>
              <SelectTrigger className="w-[160px]" disabled={busy || blockedByOther}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEST_STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {test.formula_version && (
              <Badge variant="outline" className="font-normal">
                Formule v{test.formula_version}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={busy || blockedByOther} onClick={() => void onAcquireLock()}>
              Preia blocare editare
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void onReleaseLock()}>
              Eliberează blocarea
            </Button>
          </div>
        </div>
      </div>

      {blockedByOther && (
        <div
          className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
          role="status"
        >
          <strong>Editare blocată.</strong> {test.locked_by_label ?? test.locked_by_user_id} lucrează la acest
          test
          {test.lock_expires_at && (
            <> până la {new Date(test.lock_expires_at).toLocaleString("ro-RO")}</>
            )}
          . Puteți citi datele; pentru modificări folosiți „Preia blocare” după expirare sau cereți
          colegului să elibereze.
        </div>
      )}

      {ucsInstrumentedHistory && (
        <div className="bg-muted/80 mb-4 rounded-lg border px-3 py-2 text-sm" role="status">
          <strong>Istoric UCS+Young (read-only).</strong> În aplicație rămâne doar varianta UCS Basic (diametru +
          sarcină). Acest test poate fi consultat, dar nu se mai editează.
        </div>
      )}

      {myLock && test.lock_expires_at && (
        <div className="bg-muted/80 mb-4 rounded-lg border px-3 py-2 text-xs" role="status">
          Aveți blocare activă până la {new Date(test.lock_expires_at).toLocaleString("ro-RO")}. Alți posturi nu
          pot salva modificări.
        </div>
      )}

      {msg && (
        <div
          ref={msgRef}
          className="bg-muted/80 mb-4 rounded-lg border px-3 py-2 text-sm"
          role="status"
        >
          {msg}
        </div>
      )}

      {d7012Panel && (
        <Card className="mb-4 border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{d7012Panel.title}</CardTitle>
            <CardDescription className="text-xs whitespace-pre-line">{d7012Panel.summary}</CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground grid gap-3 text-xs sm:grid-cols-2">
            <div>
              <p className="text-foreground mb-1 font-medium">Grafice (raport / interpretare)</p>
              <ul className="list-inside list-disc space-y-0.5">
                {d7012Panel.graphs.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-foreground mb-1 font-medium">Calcule</p>
              <ul className="list-inside list-disc space-y-0.5">
                {d7012Panel.calculations.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="measurements" className="w-full">
        <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="measurements">Măsurători</TabsTrigger>
          {showRawDataTab ? <TabsTrigger value="raw-data">Date brute</TabsTrigger> : null}
          {showUnitWeightBulkTab ? (
            <TabsTrigger value="bulk-density">Greutate volumică</TabsTrigger>
          ) : null}
          <TabsTrigger value="files">POZE</TabsTrigger>
          <TabsTrigger value="calculations">Calcule</TabsTrigger>
          <TabsTrigger value="report">Raport</TabsTrigger>
        </TabsList>

        <TabsContent value="measurements" className="overflow-visible">
          <Card className="mb-4 overflow-visible">
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Help</CardTitle>
                  <CardDescription>
                    Pași recomandați + ce faci când fișierele au date rele (NaN, platou, mărci rupte).
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowHelp((v) => !v)}
                >
                  {showHelp ? "Ascunde" : "Arată"}
                </Button>
              </div>
            </CardHeader>
            {showHelp ? (
              <CardContent className="space-y-3 text-sm">
                {test.test_type === "young" ? (
                  <>
                    <div className="space-y-1">
                      <p className="font-medium">Young — SR EN 14580</p>
                      <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                        <li>
                          În „Măsurători”: completați <strong>height_mm</strong> (obligatoriu). Diametrul ajută
                          la verificări.
                        </li>
                        <li>
                          Importați fișierul de la presă (Time/Load/Stress/Displacement/Strain ch6–ch8).
                        </li>
                        <li>
                          Alegeți „Mod de măsurare”: <strong>Fără mărci</strong> (ε din deplasare) sau{" "}
                          <strong>Cu mărci</strong> (ε din Strain ch).
                        </li>
                      </ul>
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium">Dacă sunt mărci stricate (cu mărci)</p>
                      <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                        <li>
                          Dacă <strong>Ch6</strong> sau <strong>Ch7</strong> e plat/blocat/lipsă: debifați
                          canalul. ε_axial folosit la <strong>E și ν</strong> devine media canalelor bifate.
                        </li>
                        <li>
                          Dacă <strong>Ch8</strong> se rupe: folosiți <strong>Brush</strong> pe grafic ca să
                          păstrați doar zona inițială bună pentru ν și/sau activați <strong>Auto-cutoff</strong>.
                        </li>
                        <li>
                          Dacă nu vedeți canalele brute pe grafic: re-importați fișierul (importurile vechi nu
                          aveau Ch6/7/8 stocate).
                        </li>
                      </ul>
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium">Dacă sunt date “rele” în fișier</p>
                      <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                        <li>
                          <strong>NaN/goluri</strong>: sunt ignorate punctual; dacă devin dominante, canalul trebuie
                          exclus sau intervalul redus.
                        </li>
                        <li>
                          <strong>Platou</strong> (valoare repetată): indică de obicei marcă ruptă/blocată → excludeți
                          intervalul sau canalul.
                        </li>
                        <li>
                          <strong>Semn negativ</strong>: poate fi convenție; important e să fie consecvent și să nu
                          băgați porțiuni defecte în fit/regresie.
                        </li>
                      </ul>
                    </div>
                  </>
                ) : test.test_type === "ucs" ? (
                  <>
                    <div className="space-y-1">
                      <p className="font-medium">UCS (simplu)</p>
                      <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                        <li>
                          Completați <strong>diameter_mm</strong> (și height_mm pentru verificări H/D).
                        </li>
                        <li>
                          Pentru UCS simplu: introduceți <strong>peak_load</strong> sau importați Time/Load/Stress
                          pentru grafice.
                        </li>
                        <li>
                          Dacă începutul e zgomotos: decupați/ignorați primele puncte (așezare).
                        </li>
                      </ul>
                    </div>
                  </>
                ) : test.test_type === "unconfined_soil" ? (
                  <>
                    <div className="space-y-1">
                      <p className="font-medium">Compresiune monoaxială sol (SR EN ISO 17892-7)</p>
                      <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                        <li>
                          Completați geometria; pentru Uniframe/Controls alegeți sursa deplasării, apoi importați.
                          Alternativ: fișier text cu rânduri Di și Fi (fără timp).
                        </li>
                        <li>
                          Dacă seria are platouri/rupturi la sfârșit: folosiți <strong>Brush</strong> pe graficul
                          t–F din «Măsurători» și <strong>Decupează curbă</strong> (salvare în baza de date), apoi
                          rulați calculele.
                        </li>
                      </ul>
                    </div>
                  </>
                ) : test.test_type === "point_load" ? (
                  <>
                    <div className="space-y-1">
                      <p className="font-medium">Point load (ASTM D5731)</p>
                      <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                        <li>
                          În „Măsurători”: alegeți <strong>Tip probă</strong> (Neregulat / Diametral / Axial).
                        </li>
                        <li>
                          Completați <strong>D</strong> și <strong>L</strong>. Pentru <strong>Diametral</strong> (tip
                          1), <strong>De = D</strong> se calculează automat.
                        </li>
                        <li>
                          Pentru <strong>Axial</strong> (2): completați și <strong>W</strong>. Pentru{" "}
                          <strong>Neregulat</strong> (4): completați <strong>W1</strong>, <strong>W2</strong>,{" "}
                          <strong>W3</strong> — aplicația folosește media \((W_1+W_2+W_3)/3\).
                        </li>
                        <li>
                          Introduceți <strong>P</strong> (sarcina la rupere, kN), apoi apăsați <strong>Salvează
                          măsurători</strong>.
                        </li>
                        <li>
                          Apăsați <strong>Rulează calcule</strong> pentru Is / Is(50) și De. Dacă nu aveți K pentru
                          corelația UCS, completați <strong>k</strong> (opțional) ca să obțineți și estimarea
                          <strong>σ</strong>
                          <sub>uc</sub> ≈ <strong>k</strong>·Is(50).
                        </li>
                        <li>
                          Ghid orientativ pentru <strong>k (UCS)</strong>:
                          <div className="mt-2 overflow-x-auto rounded-md border bg-background">
                            <table className="w-full text-xs">
                              <thead className="bg-muted/50">
                                <tr>
                                  <th className="px-2 py-1 text-left font-medium">Tip rocă</th>
                                  <th className="px-2 py-1 text-left font-medium">k (uzual)</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr className="border-t">
                                  <td className="px-2 py-1">roci slabe</td>
                                  <td className="px-2 py-1">15 – 20</td>
                                </tr>
                                <tr className="border-t">
                                  <td className="px-2 py-1">roci medii</td>
                                  <td className="px-2 py-1">20 – 22</td>
                                </tr>
                                <tr className="border-t">
                                  <td className="px-2 py-1">roci dure</td>
                                  <td className="px-2 py-1">22 – 25</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </li>
                      </ul>
                    </div>
                  </>
                ) : test.test_type === "presiometry" ? (
                  <>
                    <div className="space-y-1">
                      <p className="font-medium">Presiometrie (SR EN ISO 22476-5)</p>
                      <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                        <li>
                          În „Măsurători”: completați adâncimea și datele geometrice (dacă sunt disponibile).
                        </li>
                        <li>
                          În „Măsurători/Serie”: importați sau introduceți seria <strong>p–V</strong> (presiune vs
                          volum/deformație) și salvați.
                        </li>
                        <li>
                          În „Calcule”: rulați calculele; dacă seria are porțiuni defecte, decupați intervalul și
                          recalculați.
                        </li>
                        <li>
                          În „Raport”: completați câmpurile cerute și generați PDF.
                        </li>
                      </ul>
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    Pentru acest tip de test: completați măsurătorile obligatorii, importați fișierul dacă există,
                    apoi rulați calculele. Dacă apar NaN/platouri: reduceți intervalul sau corectați sursa datelor.
                  </p>
                )}
              </CardContent>
            ) : null}
          </Card>

          {test.test_type === "young" ? (
            <Card className="mb-4 overflow-visible">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Young — SR EN 14580</CardTitle>
                <CardDescription>
                  Importați fișierul de la presă (Time/Load/Displacement/Stress). Puteți „tăia” începutul și
                  sfârșitul (zgomot) cu slider-ele, apoi rulați calculele pentru Eb (oficial) și E încărcare /
                  E descărcare (aux.).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {youngMode === "gauges" && youngCurveParsed?.points?.length ? (
                  <div className="rounded-md border p-3">
                    <p className="text-muted-foreground mb-2 text-sm">
                      Grafic Forță (kN) vs mărci tensiometrice (Ch6/Ch7/Ch8). Selectați cu Brush intervalul valid
                      pentru ν (excludeți zona unde Ch8 s-a rupt și a rămas blocat).
                    </p>
                    {(() => {
                      const ptsAll = youngCurveParsed.points;
                      const trimFrom = Math.max(0, Math.min(ptsAll.length - 1, youngTrimFrom));
                      const trimTo = Math.max(trimFrom, Math.min(ptsAll.length - 1, youngTrimTo));
                      const pts = ptsAll.slice(trimFrom, trimTo + 1);
                      const rows = buildYoungForceStrainChannelsRows(pts);
                      const hi = Math.max(0, pts.length - 1);
                      const from = Math.max(0, Math.min(hi, Math.min(youngPoissonFrom, youngPoissonTo)));
                      const to = Math.max(from, Math.min(hi, Math.max(youngPoissonFrom, youngPoissonTo)));
                      const suggested =
                        youngPoissonAutoCutoff ? suggestYoungPoissonFlatCutoffIndex(pts, from, to) : null;

                      const stats = (k: "strain_ch6" | "strain_ch7") => {
                        const vs: number[] = [];
                        for (const p of pts) {
                          const v = (p as unknown as Record<string, unknown>)[k];
                          const n = typeof v === "number" ? v : Number(v);
                          if (Number.isFinite(n)) vs.push(n);
                        }
                        if (vs.length < 3) return { ok: false, n: vs.length, flat: false };
                        let min = Infinity;
                        let max = -Infinity;
                        let flatRun = 0;
                        let bestFlatRun = 0;
                        for (let i = 0; i < vs.length; i++) {
                          const x = vs[i]!;
                          if (x < min) min = x;
                          if (x > max) max = x;
                          if (i > 0) {
                            if (Math.abs(vs[i]! - vs[i - 1]!) <= Math.max(1e-12, (max - min) * 1e-6)) flatRun++;
                            else flatRun = 0;
                            if (flatRun > bestFlatRun) bestFlatRun = flatRun;
                          }
                        }
                        const range = max - min;
                        const flat = range <= 1e-9 || bestFlatRun >= 25;
                        return { ok: true, n: vs.length, flat };
                      };
                      const s6 = stats("strain_ch6");
                      const s7 = stats("strain_ch7");
                      const suggestDisableCh6 = s6.ok && (s6.flat || s6.n < Math.max(10, s7.n * 0.2));
                      const suggestDisableCh7 = s7.ok && (s7.flat || s7.n < Math.max(10, s6.n * 0.2));
                      return (
                        <div className="space-y-2">
                          <YoungForceStrainChannelsChart
                            rows={rows}
                            poissonRange={{ from, to }}
                            suggestedCutoffIndex={suggested}
                            onBrushChange={(r) => {
                              setYoungPoissonFrom(r.from);
                              setYoungPoissonTo(r.to);
                            }}
                          />
                          <div className="flex flex-wrap items-center gap-3">
                            <label className="flex cursor-pointer items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                className="size-4"
                                checked={youngUseCh6}
                                disabled={busy || blockedByOther}
                                onChange={(e) => setYoungUseCh6(e.target.checked)}
                              />
                              Folosește Ch6 (axial)
                            </label>
                            <label className="flex cursor-pointer items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                className="size-4"
                                checked={youngUseCh7}
                                disabled={busy || blockedByOther}
                                onChange={(e) => setYoungUseCh7(e.target.checked)}
                              />
                              Folosește Ch7 (axial)
                            </label>
                            {(suggestDisableCh6 || suggestDisableCh7) && !(busy || blockedByOther) ? (
                              <button
                                type="button"
                                className="text-xs underline"
                                onClick={() => {
                                  if (suggestDisableCh6) setYoungUseCh6(false);
                                  if (suggestDisableCh7) setYoungUseCh7(false);
                                }}
                              >
                                Aplică sugestie (exclude marcă suspectă)
                              </button>
                            ) : null}
                          </div>
                          <label className="flex cursor-pointer items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              className="size-4"
                              checked={youngPoissonAutoCutoff}
                              disabled={busy || blockedByOther}
                              onChange={(e) => setYoungPoissonAutoCutoff(e.target.checked)}
                            />
                            Auto-cutoff Ch8 (exclude platou/blocare)
                          </label>
                          {suggested != null ? (
                            <p className="text-muted-foreground text-xs">Cutoff sugerat: index {suggested}</p>
                          ) : null}
                        </div>
                      );
                    })()}
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Mod de măsurare</Label>
                    <Select
                      value={youngMode}
                      disabled={busy || blockedByOther}
                      onValueChange={(v) => void onYoungModeChange(v as "no_gauges" | "gauges")}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="start" side="bottom" sideOffset={6} className="z-[200]">
                        <SelectItem value="no_gauges">Fără mărci (ε = ΔL/L din deplasare)</SelectItem>
                        <SelectItem value="gauges">Cu mărci (ε din Strain ch)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Limite SR EN 14580 (procente din σmax, ciclu 3)</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        max={1}
                        value={youngSigmaUPct}
                        disabled={busy || blockedByOther}
                        onChange={(e) => setYoungSigmaUPct(Number(e.target.value))}
                      />
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        max={1}
                        value={youngSigmaOPct}
                        disabled={busy || blockedByOther}
                        onChange={(e) => setYoungSigmaOPct(Number(e.target.value))}
                      />
                    </div>
                    <p className="text-muted-foreground text-xs">σu / σo (ex. 0.02 și 0.33)</p>
                  </div>
                </div>
                <div className="max-w-sm space-y-1.5">
                  <Label>Metodă pentru modul E</Label>
                  <Select
                    value={youngEMethod}
                    disabled={busy || blockedByOther}
                    onValueChange={(v) => setYoungEMethod(v as "eb" | "loading" | "unloading" | "delta" | "isrm")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="start" side="bottom" sideOffset={6} className="z-[200]">
                      <SelectItem value="eb">Eb (SR EN 14580, ciclu 3)</SelectItem>
                      <SelectItem value="loading">E încărcare (ciclu 3, auxiliar)</SelectItem>
                      <SelectItem value="unloading">E descărcare (ciclu 3, auxiliar)</SelectItem>
                      <SelectItem value="delta">Δσ/Δε (manual, fără curbă)</SelectItem>
                      <SelectItem value="isrm">ISRM (Etan/Esec/Eavg la 50% σmax)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-muted-foreground text-xs">
                    Cu curbă importată, primele 3 opțiuni folosesc fit liniar pe ciclu 3. „Δσ/Δε” folosește
                    câmpurile delta_* din Măsurători.
                  </p>
                </div>
                {youngMode === "no_gauges" ? (
                  <div className="max-w-sm space-y-1.5">
                    <Label>Factor deplasare (mm / unitate în fișier)</Label>
                    <Input
                      type="number"
                      step="any"
                      min={0}
                      value={youngDispScaleMm ?? ""}
                      disabled={busy || blockedByOther}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        if (v === "") {
                          setYoungDispScaleMm(null);
                          return;
                        }
                        const n = Number(v);
                        setYoungDispScaleMm(Number.isFinite(n) && n > 0 ? n : null);
                      }}
                    />
                    <p className="text-muted-foreground text-xs">
                      Gol = auto-detect (recomandat). Dacă e necesar: 1 (mm), 0.001 (µm → mm) sau 0.0001 (0.1µm → mm).
                    </p>
                  </div>
                ) : null}

                {youngCurveParsed?.points?.length ? (
                  <div className="space-y-3">
                    <div className="rounded-md border p-3">
                      <p className="text-muted-foreground mb-2 text-sm">
                        Previzualizare: σ – t (din curbă importată). Trim: {youngTrimFrom}…{youngTrimTo} din{" "}
                        {youngCurveParsed.points.length - 1}.
                      </p>
                      <UcsStressTimeChart
                        points={
                          youngCurveParsed.points.slice(
                            Math.max(0, Math.min(youngTrimFrom, youngTrimTo)),
                            Math.max(0, Math.max(youngTrimFrom, youngTrimTo)) + 1,
                          )
                        }
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Start (taie început)</Label>
                        <input
                          type="range"
                          min={0}
                          max={Math.max(0, youngCurveParsed.points.length - 1)}
                          value={youngTrimFrom}
                          disabled={busy || blockedByOther}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setYoungTrimFrom(v);
                            if (v > youngTrimTo) setYoungTrimTo(v);
                          }}
                          className="w-full"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Final (taie sfârșit)</Label>
                        <input
                          type="range"
                          min={0}
                          max={Math.max(0, youngCurveParsed.points.length - 1)}
                          value={youngTrimTo}
                          disabled={busy || blockedByOther}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setYoungTrimTo(v);
                            if (v < youngTrimFrom) setYoungTrimFrom(v);
                          }}
                          className="w-full"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Nu există curbă Young importată încă. Folosiți câmpul „Import CSV / TXT / XLSX” de mai jos.
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" disabled={busy || blockedByOther} onClick={() => void onSaveYoungSettings()}>
                    Salvează setări Young
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {test.test_type === "unconfined_soil" ? (
            <Card className="mb-4 overflow-visible">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Compresiune monoaxială — SR EN ISO 17892-7</CardTitle>
                <CardDescription>
                  Import <strong>.txt</strong> Uniframe/Controls (Time, kN, mm). Pentru
                  Uniframe, alegeți sursa deplasării în măsurători (Crosshead sau primul canal mm) înainte de import.
                  Mod instrumentat: curbă stocată; mod basic: P și ε la eșec manual.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="max-w-sm space-y-1.5">
                  <Label>Mod de lucru</Label>
                  <Select
                    value={normalizeUnconfinedSoilMode(
                      (test as { unconfined_soil_mode?: unknown }).unconfined_soil_mode,
                    )}
                    disabled={busy || blockedByOther}
                    onValueChange={(v) => void onUnconfinedSoilModeChange(v as "basic" | "instrumented")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="start" side="bottom" sideOffset={6} className="z-[200]">
                      <SelectItem value="basic">Basic — sarcină și torsiune la eșec</SelectItem>
                      <SelectItem value="instrumented">Instrumentat — serie din import</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {unconfinedSoilCurveParsed?.points?.length ? (
                  <>
                    <div className="rounded-md border p-3">
                      <p className="text-muted-foreground mb-2 text-sm">
                        Grafice din curbă și măsurători salvate (aceleași ca la «Calcule» și în raportul PDF; salvați
                        măsurătorile după modificări).
                      </p>
                      <UnconfinedSoilInstrumentedChartsPanel rows={unconfinedSoilSeriesRows} />
                    </div>
                    <div className="rounded-md border p-3">
                      <p className="mb-2 text-sm font-medium">Decupare curbă (t – F)</p>
                      <UnconfinedSoilCurveTrimSection
                        testId={testId}
                        unconfinedSoilCurveJson={test.unconfined_soil_curve_json}
                        subtractSeating={unconfinedSubtractSeatingW !== 0}
                        seatingLoadKn={
                          unconfinedSeatingLoadKnW != null &&
                          Number.isFinite(Number(unconfinedSeatingLoadKnW)) &&
                          Number(unconfinedSeatingLoadKnW) > 0
                            ? Number(unconfinedSeatingLoadKnW)
                            : undefined
                        }
                        disabled={busy || blockedByOther}
                        onUpdated={() => void load()}
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Nu există curbă importată. Folosiți „Import CSV / TXT / XLSX” cu fișier Uniframe (.txt).
                  </p>
                )}
                {showUnconfinedMohr ? (
                  <div className="rounded-md border p-3">
                    <p className="mb-2 text-sm font-medium">Cerc Mohr (q_u, c_u)</p>
                    <p className="text-muted-foreground mb-2 text-xs">
                      σ₁ = q_u, σ₃ = 0; tangenta la c_u = 0,5·q_u pe planul Mohr–Coulomb (φ_u = 0).
                    </p>
                    <UnconfinedSoilMohrCircleChart
                      quKpa={unconfinedQuMohr as number}
                      cuKpa={
                        unconfinedCuMohr != null && Number.isFinite(unconfinedCuMohr) ? unconfinedCuMohr : null
                      }
                    />
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {test.test_type === "ucs" &&
            (reportAvailStressTime || showUcsTimeLoadChart || showUcsForceStrainChannelsChart) && (
            <Card className="mb-4 overflow-visible">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Grafice (preview import)</CardTitle>
                <CardDescription>
                  Varianta Basic: la importul fișierului tabular se folosesc doar Time + Load/Stress (ch6–ch8 sunt
                  ignorate). Puteți selecta intervalul pe grafic și decupa curba.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <UcsBasicTrimSection
                  testId={testId}
                  ucsCurveJson={test.ucs_curve_json}
                  ucsModulusSettingsJson={test.ucs_modulus_settings_json}
                  diameterMm={ucsDiameterMm}
                  subtractSeating={ucsSubtractSeatingW !== 0}
                  seatingLoadKn={
                    ucsSeatingLoadKnW != null &&
                    Number.isFinite(Number(ucsSeatingLoadKnW)) &&
                    Number(ucsSeatingLoadKnW) > 0
                      ? Number(ucsSeatingLoadKnW)
                      : undefined
                  }
                  stressBaselineMpa={ucsStressBaselineMpa > 0 ? ucsStressBaselineMpa : undefined}
                  disabled={busy || ucsReadOnly}
                  readOnly={ucsReadOnly}
                  onUpdated={() => void load()}
                />
              </CardContent>
            </Card>
          )}

          {(test.test_type === "ucs" || test.test_type === "young") && (
            <UcsReportFieldsCard
              testId={testId}
              test={test}
              disabled={busy || blockedByOther}
              onSaved={() => void load({ softRefresh: true })}
              onMessage={setMsg}
            />
          )}

          {test.test_type === "unconfined_soil" ? (
            <UnconfinedSoilReportFieldsCard
              testId={testId}
              test={test}
              disabled={busy || blockedByOther}
              onSaved={() => void load({ softRefresh: true })}
              onMessage={setMsg}
              curveForRateEstimate={unconfinedSoilCurveParsed}
              heightMmForRateEstimate={unconfinedHeightMm}
            />
          ) : null}

          {test.test_type === "point_load" ? <PltReferenceFigures /> : null}

          {test.test_type === "point_load" ? (
            <PltReportFieldsCard
              testId={testId}
              test={test}
              disabled={busy || blockedByOther}
              onSaved={() => void load({ softRefresh: true })}
              onMessage={setMsg}
            />
          ) : null}

          {(test.test_type === "triaxial_rock" ||
            test.test_type === "unit_weight" ||
            test.test_type === "absorption_porosity_rock" ||
            test.test_type === "sr_en_1926" ||
            test.test_type === "presiometry") && (
            <TestOperatorQuickCard
              testId={testId}
              test={test}
              disabled={busy || blockedByOther}
              onSaved={() => void load({ softRefresh: true })}
              onMessage={setMsg}
            />
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Măsurători</CardTitle>
              <CardDescription>
                {test.test_type === "unit_weight" ? (
                  <>
                    Metodă clasică (opțional): masă uscată și volum aparent. Pentru cântărire submersă (cu sau
                    fără parafină) folosiți tabul „Greutate volumică”, apoi „Rulează calcule”.
                  </>
                ) : test.test_type === "ucs" ? (
                  <>
                    Introducere manuală sau import. Pentru grafice (t–F, σ–t): importați fișier tabular de la presă
                    (Time, Load ch…). Opțional: γ din submersă — tab „Greutate volumică”, apoi „Rulează calcule”.
                  </>
                ) : test.test_type === "point_load" ? (
                  <>
                    <strong>ASTM D5731-16.</strong> Mai jos, fiecare rubrică are o scurtă explicație. Consultați Fig. 3 de
                    deasupra pentru D, W, L. Calcule: <strong>Is = P/De²</strong> (P în N),{" "}
                    <strong>Is(50) = Is·(De/50)^0,45</strong>; opțional <strong>σ_uc ≈ K·Is(50)</strong>. Avertismente
                    geometrice la „Rulează calcule”.
                  </>
                ) : test.test_type === "unconfined_soil" ? (
                  <>
                    <strong>SR EN ISO 17892-7.</strong> Geometrie, apoi import .txt Uniframe, export Di/Fi (.txt /
                    .csv) sau mod basic. Opțional: γ și w din tab „Greutate volumică”. ε_v = ΔH/H_i; σ_v =
                    P/(A_i/(1−ε_v)); q_u, c_u = 0,5·q_u.
                  </>
                ) : test.test_type === "presiometry" ? (
                  <>
                    <strong>SR EN ISO 22476-5.</strong> Completați adâncimea și datele geometrice, apoi importați seria
                    p–V (presiune vs volum/deformație). Folosiți tabul „Raport” pentru câmpuri specifice și generați
                    PDF.
                  </>
                ) : showUnitWeightBulkTab ? (
                  <>
                    Introducere manuală sau import. Opțional: greutate volumică din submersă — tab „Greutate
                    volumică”, apoi „Rulează calcule”.
                  </>
                ) : (
                  <>Introducere manuală sau import.</>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {preset.length === 0 ? (
                test.test_type === "absorption_porosity_rock" ? (
                  <form onSubmit={onSaveMeasurements} className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">ISO 13755 — Epruvete (3 buc.)</CardTitle>
                        <CardDescription>
                          Introduceți masele: m_d (uscat), m_s (SSD), m_sub (submers). Valorile se folosesc la calcule
                          și în raport (individual + medie).
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="overflow-auto rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-[140px]">Epruvetă</TableHead>
                                <TableHead className="whitespace-nowrap">m_d (g)</TableHead>
                                <TableHead className="whitespace-nowrap">m_s (SSD) (g)</TableHead>
                                <TableHead className="whitespace-nowrap">m_sub (g)</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {absPorPayload.specimens.map((s, idx) => (
                                <TableRow key={idx}>
                                  <TableCell className="font-medium">
                                    <Input
                                      value={s.label}
                                      disabled={blockedByOther}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setAbsPorPayload((p) => {
                                          const next = { ...p, specimens: [...p.specimens] };
                                          next.specimens[idx] = { ...next.specimens[idx]!, label: v };
                                          return next;
                                        });
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      step="any"
                                      disabled={blockedByOther}
                                      value={s.mass_dry_g ?? ""}
                                      onChange={(e) => {
                                        const v = e.target.value === "" ? null : Number(e.target.value);
                                        setAbsPorPayload((p) => {
                                          const next = { ...p, specimens: [...p.specimens] };
                                          next.specimens[idx] = {
                                            ...next.specimens[idx]!,
                                            mass_dry_g: v != null && Number.isFinite(v) ? v : null,
                                          };
                                          return next;
                                        });
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      step="any"
                                      disabled={blockedByOther}
                                      value={s.mass_sat_ssd_g ?? ""}
                                      onChange={(e) => {
                                        const v = e.target.value === "" ? null : Number(e.target.value);
                                        setAbsPorPayload((p) => {
                                          const next = { ...p, specimens: [...p.specimens] };
                                          next.specimens[idx] = {
                                            ...next.specimens[idx]!,
                                            mass_sat_ssd_g: v != null && Number.isFinite(v) ? v : null,
                                          };
                                          return next;
                                        });
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      step="any"
                                      disabled={blockedByOther}
                                      value={s.mass_submerged_g ?? ""}
                                      onChange={(e) => {
                                        const v = e.target.value === "" ? null : Number(e.target.value);
                                        setAbsPorPayload((p) => {
                                          const next = { ...p, specimens: [...p.specimens] };
                                          next.specimens[idx] = {
                                            ...next.specimens[idx]!,
                                            mass_submerged_g: v != null && Number.isFinite(v) ? v : null,
                                          };
                                          return next;
                                        });
                                      }}
                                    />
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        <p className="text-muted-foreground text-xs">
                          Rezultatul absorbției (și media) se raportează la 0,1% conform standardului.
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">ISO 13755 — Date raport</CardTitle>
                        <CardDescription>
                          Completați câmpurile cerute în raport (denumiri piatră, proveniență, finisaj, date, abateri,
                          observații).
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1 sm:col-span-2">
                          <Label>Client (nume + adresă)</Label>
                          <Input
                            disabled={blockedByOther}
                            value={absPorMeta.client_name_address ?? ""}
                            onChange={(e) => setAbsPorMeta((m) => ({ ...m, client_name_address: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Denumire petrografică</Label>
                          <Input
                            disabled={blockedByOther}
                            value={absPorMeta.stone_petrographic_name ?? ""}
                            onChange={(e) => setAbsPorMeta((m) => ({ ...m, stone_petrographic_name: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Denumire comercială</Label>
                          <Input
                            disabled={blockedByOther}
                            value={absPorMeta.stone_commercial_name ?? ""}
                            onChange={(e) => setAbsPorMeta((m) => ({ ...m, stone_commercial_name: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Țara / regiunea de extracție</Label>
                          <Input
                            disabled={blockedByOther}
                            value={absPorMeta.extraction_country_region ?? ""}
                            onChange={(e) =>
                              setAbsPorMeta((m) => ({ ...m, extraction_country_region: e.target.value }))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Furnizor</Label>
                          <Input
                            disabled={blockedByOther}
                            value={absPorMeta.supplier_name ?? ""}
                            onChange={(e) => setAbsPorMeta((m) => ({ ...m, supplier_name: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Direcție anizotropie (dacă e relevant)</Label>
                          <Input
                            disabled={blockedByOther}
                            value={absPorMeta.anisotropy_direction ?? ""}
                            onChange={(e) => setAbsPorMeta((m) => ({ ...m, anisotropy_direction: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Finisaj suprafață (dacă e relevant)</Label>
                          <Input
                            disabled={blockedByOther}
                            value={absPorMeta.surface_finish ?? ""}
                            onChange={(e) => setAbsPorMeta((m) => ({ ...m, surface_finish: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Prelevare efectuată de</Label>
                          <Input
                            disabled={blockedByOther}
                            value={absPorMeta.sampling_by ?? ""}
                            onChange={(e) => setAbsPorMeta((m) => ({ ...m, sampling_by: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Data livrării</Label>
                          <Input
                            disabled={blockedByOther}
                            value={absPorMeta.delivery_date ?? ""}
                            onChange={(e) => setAbsPorMeta((m) => ({ ...m, delivery_date: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Data preparării</Label>
                          <Input
                            disabled={blockedByOther}
                            value={absPorMeta.preparation_date ?? ""}
                            onChange={(e) => setAbsPorMeta((m) => ({ ...m, preparation_date: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <Label>Abateri de la standard + justificare</Label>
                          <Textarea
                            disabled={blockedByOther}
                            value={absPorMeta.deviations ?? ""}
                            onChange={(e) => setAbsPorMeta((m) => ({ ...m, deviations: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <Label>Observații</Label>
                          <Textarea
                            disabled={blockedByOther}
                            value={absPorMeta.remarks ?? ""}
                            onChange={(e) => setAbsPorMeta((m) => ({ ...m, remarks: e.target.value }))}
                          />
                        </div>
                      </CardContent>
                    </Card>

                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" disabled={busy || blockedByOther}>
                        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                        Salvează date ISO 13755
                      </Button>
                    </div>
                  </form>
                ) : (
                  <p className="text-muted-foreground text-sm">Nu există preset de măsurători pentru acest tip.</p>
                )
              ) : (
                <form onSubmit={onSaveMeasurements} className="space-y-4">
                  {test.test_type === "presiometry" ? (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Serie presiometrie (p–V)</CardTitle>
                        <CardDescription>
                          Importați seria cu câmpul de mai jos. Curba se salvează în test și este folosită la „Calcule”.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {presiometryCurve?.points?.length ? (
                          <div className="overflow-auto rounded-md border">
                            <Table>
                              <TableHeader className="bg-muted/40">
                                <TableRow>
                                  <TableHead className="w-[70px]">#</TableHead>
                                  <TableHead className="whitespace-nowrap">p (kPa)</TableHead>
                                  <TableHead className="whitespace-nowrap">V (cm³)</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {presiometryCurve.points.slice(0, 20).map((p, i) => (
                                  <TableRow key={i}>
                                    <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                                    <TableCell className="font-mono text-xs tabular-nums">{Math.round(p.p_kpa)}</TableCell>
                                    <TableCell className="font-mono text-xs tabular-nums">
                                      {Math.round(p.v_cm3 * 100) / 100}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        ) : (
                          <p className="text-muted-foreground text-sm">Nu există serie importată încă.</p>
                        )}
                      </CardContent>
                    </Card>
                  ) : null}
                  {(() => {
                    const filteredPreset =
                      test.test_type === "point_load"
                        ? (() => {
                            const rawK = form.watch("plt_test_kind");
                            const pk =
                              rawK != null && Number.isFinite(Number(rawK))
                                ? Math.floor(Number(rawK))
                                : undefined;
                            return preset.filter((r) => {
                              if (r.key === "plt_w_mm" && pk === 4) return false;
                              if (["plt_w1_mm", "plt_w2_mm", "plt_w3_mm"].includes(r.key) && pk !== 4) {
                                return false;
                              }
                              return true;
                            });
                          })()
                        : preset;

                    const renderRow = (row: (typeof preset)[number]) => {
                      if (test.test_type === "unconfined_soil" && row.key === "unconfined_is_square") {
                        const raw = form.watch("unconfined_is_square");
                        const n = raw != null && Number.isFinite(Number(raw)) ? Math.floor(Number(raw)) : NaN;
                        const standard = Number.isFinite(n) && (n === 0 || n === 1);
                        const selectValue = Number.isFinite(n) ? String(n) : "";
                        return (
                          <div key={row.key} className="space-y-1.5">
                            <input
                              type="hidden"
                              {...form.register("unconfined_is_square", { valueAsNumber: true })}
                            />
                            <Label htmlFor={row.key}>
                              {row.label} <span className="text-muted-foreground">({row.unit})</span>
                            </Label>
                            {"hint" in row && row.hint ? (
                              <p className="text-muted-foreground text-xs leading-relaxed">{row.hint}</p>
                            ) : null}
                            <Select
                              value={selectValue}
                              disabled={blockedByOther}
                              onValueChange={(v) => {
                                if (v === "") {
                                  form.setValue("unconfined_is_square", 0, { shouldDirty: true });
                                  return;
                                }
                                form.setValue("unconfined_is_square", Number(v), { shouldDirty: true });
                              }}
                            >
                              <SelectTrigger id={row.key} className="w-full">
                                <SelectValue placeholder="Selectați forma" />
                              </SelectTrigger>
                              <SelectContent align="start" side="bottom" sideOffset={6} className="z-[200]">
                                <SelectItem value="0">Cilindru</SelectItem>
                                <SelectItem value="1">Pătrat</SelectItem>
                                {Number.isFinite(n) && !standard ? (
                                  <SelectItem value={String(n)}>{String(n)} (din date vechi)</SelectItem>
                                ) : null}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      }
                      if (
                        test.test_type === "unconfined_soil" &&
                        (row.key === "unconfined_subtract_initial_seating" || row.key === "unconfined_disp_source")
                      ) {
                        const raw = form.watch(row.key);
                        const n = raw != null && Number.isFinite(Number(raw)) ? Math.floor(Number(raw)) : NaN;
                        const standard = Number.isFinite(n) && (n === 0 || n === 1);
                        const selectValue = Number.isFinite(n) ? String(n) : "";
                        const label =
                          row.key === "unconfined_subtract_initial_seating"
                            ? "Scade așezarea din primul punct"
                            : "Import Uniframe: deplasare";
                        return (
                          <div key={row.key} className="space-y-1.5">
                            <input type="hidden" {...form.register(row.key, { valueAsNumber: true })} />
                            <Label htmlFor={row.key}>
                              {label} <span className="text-muted-foreground">({row.unit})</span>
                            </Label>
                            <Select
                              value={selectValue}
                              disabled={blockedByOther}
                              onValueChange={(v) => {
                                if (v === "") {
                                  form.setValue(row.key, 1, { shouldDirty: true });
                                  return;
                                }
                                form.setValue(row.key, Number(v), { shouldDirty: true });
                              }}
                            >
                              <SelectTrigger id={row.key} className="w-full">
                                <SelectValue placeholder="Selectați opțiunea" />
                              </SelectTrigger>
                              <SelectContent align="start" side="bottom" sideOffset={6} className="z-[200]">
                                {row.key === "unconfined_disp_source" ? (
                                  <>
                                    <SelectItem value="0">Primul canal (mm)</SelectItem>
                                    <SelectItem value="1">Crosshead (mm)</SelectItem>
                                  </>
                                ) : (
                                  <>
                                    <SelectItem value="1">Da</SelectItem>
                                    <SelectItem value="0">Nu</SelectItem>
                                  </>
                                )}
                                {Number.isFinite(n) && !standard ? (
                                  <SelectItem value={String(n)}>{String(n)} (din date vechi)</SelectItem>
                                ) : null}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      }
                      if (test.test_type === "point_load" && row.key === "plt_test_kind") {
                        const raw = form.watch("plt_test_kind");
                        const n = raw != null && Number.isFinite(Number(raw)) ? Math.floor(Number(raw)) : NaN;
                        const standard = Number.isFinite(n) && n >= 1 && n <= 4;
                        const selectValue = Number.isFinite(n) ? String(n) : "";
                        return (
                          <div key={row.key} className="space-y-1.5">
                            <input type="hidden" {...form.register("plt_test_kind", { valueAsNumber: true })} />
                            <Label htmlFor={row.key}>
                              {row.label}{" "}
                              <span className="text-muted-foreground">({row.unit})</span>
                            </Label>
                            {"hint" in row && row.hint ? (
                              <p className="text-muted-foreground text-xs leading-relaxed">{row.hint}</p>
                            ) : null}
                            <Select
                              value={selectValue}
                              disabled={blockedByOther}
                              onValueChange={(v) => {
                                if (v === "") {
                                  form.setValue("plt_test_kind", undefined, { shouldDirty: true });
                                  return;
                                }
                                form.setValue("plt_test_kind", Number(v), { shouldDirty: true });
                              }}
                            >
                              <SelectTrigger id={row.key} className="w-full">
                                <SelectValue placeholder="Selectați tipul probei" />
                              </SelectTrigger>
                              <SelectContent align="start" side="bottom" sideOffset={6} className="z-[200]">
                                <SelectItem value="">— Selectați —</SelectItem>
                                {PLT_TEST_KIND_SELECT.map((o) => (
                                  <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                  </SelectItem>
                                ))}
                                {Number.isFinite(n) && !standard ? (
                                  <SelectItem value={String(n)}>{String(n)} (din date vechi)</SelectItem>
                                ) : null}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      }
                      if (test.test_type === "point_load" && row.key === "plt_anisotropy") {
                        const raw = form.watch("plt_anisotropy");
                        const n = raw != null && Number.isFinite(Number(raw)) ? Math.floor(Number(raw)) : NaN;
                        const standard = Number.isFinite(n) && (n === 0 || n === 1);
                        const selectValue = Number.isFinite(n) ? String(n) : "";
                        return (
                          <div key={row.key} className="space-y-1.5">
                            <input type="hidden" {...form.register("plt_anisotropy", { valueAsNumber: true })} />
                            <Label htmlFor={row.key}>
                              {row.label} <span className="text-muted-foreground">({row.unit})</span>
                            </Label>
                            {"hint" in row && row.hint ? (
                              <p className="text-muted-foreground text-xs leading-relaxed">{row.hint}</p>
                            ) : null}
                            <Select
                              value={selectValue}
                              disabled={blockedByOther}
                              onValueChange={(v) => {
                                if (v === "") {
                                  form.setValue("plt_anisotropy", undefined, { shouldDirty: true });
                                  return;
                                }
                                form.setValue("plt_anisotropy", Number(v), { shouldDirty: true });
                              }}
                            >
                              <SelectTrigger id={row.key} className="w-full">
                                <SelectValue placeholder="Selectați opțiunea" />
                              </SelectTrigger>
                              <SelectContent align="start" side="bottom" sideOffset={6} className="z-[200]">
                                <SelectItem value="">— (nu se aplică) —</SelectItem>
                                {PLT_ANISOTROPY_SELECT.map((o) => (
                                  <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                  </SelectItem>
                                ))}
                                {Number.isFinite(n) && !standard ? (
                                  <SelectItem value={String(n)}>{String(n)} (din date vechi)</SelectItem>
                                ) : null}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      }
                      return (
                        <div key={row.key} className="space-y-1.5">
                          <Label htmlFor={row.key}>
                            {row.label} <span className="text-muted-foreground">({row.unit})</span>
                          </Label>
                          {"hint" in row && row.hint ? (
                            <p className="text-muted-foreground text-xs leading-relaxed">{row.hint}</p>
                          ) : null}
                          <Input
                            id={row.key}
                            type="number"
                            step="any"
                            disabled={blockedByOther}
                            {...form.register(row.key, { valueAsNumber: true })}
                          />
                        </div>
                      );
                    };

                    return (
                      <div className="space-y-4">
                        <div
                          className={cn(
                            "grid gap-4",
                            test.test_type === "point_load"
                              ? "max-w-2xl grid-cols-1"
                              : "max-w-xl sm:grid-cols-2",
                          )}
                        >
                          {filteredPreset.map(renderRow)}
                        </div>
                      </div>
                    );
                  })()}
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={busy || blockedByOther}>
                      {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                      Salvează măsurători
                    </Button>
                  </div>
                </form>
              )}
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="import-file">
                  {test?.test_type === "presiometry"
                    ? "Import serie presiometrie (TXT/CSV/TSV): p_kpa; v_cm3 (opțional t_s)"
                    : "Import CSV / TXT / XLSX — mod UCS: key; value — mod UCS+Young: export tab presă"}
                </Label>
                <Input
                  id="import-file"
                  type="file"
                  accept=".csv,.txt,.tsv,.xlsx,.xls"
                  disabled={busy || ucsReadOnly}
                  multiple={test?.test_type === "triaxial_rock"}
                  onChange={(e) => void onImport(e.target.files)}
                />
                {test?.test_type === "triaxial_rock" ? (
                  <div className="text-muted-foreground text-xs">
                    Selectați 3–5 fișiere (σ₃ diferite). Vor apărea într-o listă persistentă și vor fi folosite la
                    cercuri Mohr / încadrări.
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {showRawDataTab ? (
          <TabsContent value="raw-data" keepMounted>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Date brute (din fișierul importat)</CardTitle>
                <CardDescription>
                  Tabel cu valorile parse-uite din TXT/CSV. Dacă ceva pare greșit (semn, platou, NaN), aici le vedeți
                  exact cum au intrat în aplicație.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {rawDataModel ? (
                  <>
                    <p className="text-muted-foreground text-sm">
                      Afișez <strong>{rawDataModel.shown}</strong> din <strong>{rawDataModel.total}</strong> rânduri
                      (primele). Pentru fișiere foarte mari limităm afișarea ca să rămână rapid.
                    </p>
                    <div className="max-h-[65vh] overflow-auto rounded-md border">
                      <Table>
                        <TableHeader className="sticky top-0 bg-background">
                          <TableRow>
                            {rawDataModel.cols.map((c) => (
                              <TableHead key={c.key} className="whitespace-nowrap text-xs">
                                {c.label}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rawDataModel.rows.map((p, i) => (
                            <TableRow key={i}>
                              {rawDataModel.cols.map((c) => (
                                <TableCell key={c.key} className="whitespace-nowrap font-mono text-xs tabular-nums">
                                  {c.cell(p as never, i)}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Nu există date brute importate (încă). Importați un fișier în tabul „Măsurători”.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        {showUnitWeightBulkTab ? (
          <TabsContent value="bulk-density">
            <UnitWeightBulkTab
              testId={testId}
              payload={test.unit_weight_submerged_json}
              disabled={busy || blockedByOther}
              onSaved={() => void load({ softRefresh: true })}
              onMessage={setMsg}
            />
          </TabsContent>
        ) : null}

        <TabsContent value="files" keepMounted>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Poze probă</CardTitle>
              <CardDescription>
                Încărcați fotografiile înainte și după încercare. Pot fi incluse în raportul PDF (UCS, Young sau
                Point load — tab Raport).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="spec-before">Fotografie probă — înainte de încercare</Label>
                  <input
                    ref={specBeforeCameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    disabled={busy || blockedByOther}
                    className="sr-only"
                    aria-hidden
                    tabIndex={-1}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setPendingSpecimenBefore(f);
                      if (specBeforeInputRef.current) specBeforeInputRef.current.value = "";
                    }}
                  />
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <Input
                      ref={specBeforeInputRef}
                      id="spec-before"
                      type="file"
                      accept="image/*"
                      disabled={busy || blockedByOther}
                      className="cursor-pointer sm:max-w-xs"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        setPendingSpecimenBefore(f);
                        if (specBeforeCameraRef.current) specBeforeCameraRef.current.value = "";
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={busy || blockedByOther}
                      onClick={() => specBeforeCameraRef.current?.click()}
                      aria-label="Fă poză cu camera (înainte de încercare)"
                    >
                      <Camera className="size-4 shrink-0" aria-hidden />
                      Fă poză
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="gap-1.5"
                      disabled={busy || blockedByOther || !pendingSpecimenBefore}
                      onClick={() => {
                        if (pendingSpecimenBefore) void onUploadSpecimenPhoto(pendingSpecimenBefore, "specimen_before");
                      }}
                    >
                      {specimenUploadRole === "specimen_before" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : null}
                      Adaugă
                    </Button>
                  </div>
                  {pendingSpecimenBefore ? (
                    <p className="text-muted-foreground text-xs">
                      Selectat: <span className="text-foreground font-medium">{pendingSpecimenBefore.name}</span> —
                      apăsați „Adaugă” pentru a încărca.
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-xs">
                      Din PC: alegeți fișierul. Pe tabletă: „Fă poză” deschide camera. Apoi „Adaugă”. Înlocuiește
                      automat o imagine anterioară cu același rol.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="spec-after">Fotografie probă — după încercare</Label>
                  <input
                    ref={specAfterCameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    disabled={busy || blockedByOther}
                    className="sr-only"
                    aria-hidden
                    tabIndex={-1}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setPendingSpecimenAfter(f);
                      if (specAfterInputRef.current) specAfterInputRef.current.value = "";
                    }}
                  />
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <Input
                      ref={specAfterInputRef}
                      id="spec-after"
                      type="file"
                      accept="image/*"
                      disabled={busy || blockedByOther}
                      className="cursor-pointer sm:max-w-xs"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        setPendingSpecimenAfter(f);
                        if (specAfterCameraRef.current) specAfterCameraRef.current.value = "";
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={busy || blockedByOther}
                      onClick={() => specAfterCameraRef.current?.click()}
                      aria-label="Fă poză cu camera (după încercare)"
                    >
                      <Camera className="size-4 shrink-0" aria-hidden />
                      Fă poză
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="gap-1.5"
                      disabled={busy || blockedByOther || !pendingSpecimenAfter}
                      onClick={() => {
                        if (pendingSpecimenAfter) void onUploadSpecimenPhoto(pendingSpecimenAfter, "specimen_after");
                      }}
                    >
                      {specimenUploadRole === "specimen_after" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : null}
                      Adaugă
                    </Button>
                  </div>
                  {pendingSpecimenAfter ? (
                    <p className="text-muted-foreground text-xs">
                      Selectat: <span className="text-foreground font-medium">{pendingSpecimenAfter.name}</span> —
                      apăsați „Adaugă” pentru a încărca.
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-xs">
                      JPEG / PNG recomandat; max. 8 MB. Din PC sau „Fă poză” pe tabletă, apoi „Adaugă”.
                    </p>
                  )}
                </div>
              </div>
              {pozeTableNote ? (
                <p className="text-amber-900 dark:text-amber-100 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs dark:border-amber-800 dark:bg-amber-950/40">
                  {pozeTableNote}
                </p>
              ) : null}
              <ScrollArea className="h-[320px] rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Rol</TableHead>
                      <TableHead>Nume</TableHead>
                      <TableHead>Tip</TableHead>
                      <TableHead>Încărcat</TableHead>
                      <TableHead className="w-[100px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {specimenPhotoFiles.length === 0 && orphanImageFiles.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-muted-foreground">
                          Nicio poză încă. Alegeți fișierul sau „Fă poză”, apoi „Adaugă”.
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {specimenPhotoFiles.map((f) => (
                          <TableRow key={f.id}>
                            <TableCell className="text-sm">
                              {normalizeSpecimenRole(f.file_role) === "specimen_before"
                                ? "Înainte"
                                : normalizeSpecimenRole(f.file_role) === "specimen_after"
                                  ? "După"
                                  : "—"}
                            </TableCell>
                            <TableCell className="font-medium">{f.file_name}</TableCell>
                            <TableCell>{f.file_type ?? "—"}</TableCell>
                            <TableCell className="text-muted-foreground text-xs">
                              {new Date(f.uploaded_at).toLocaleString("ro-RO")}
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                disabled={busy || blockedByOther}
                                onClick={() => void onDeleteFile(f.id)}
                              >
                                Șterge
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        {orphanImageFiles.map((f) => (
                          <TableRow key={f.id} className="bg-muted/30">
                            <TableCell className="text-muted-foreground text-sm">—</TableCell>
                            <TableCell className="font-medium">{f.file_name}</TableCell>
                            <TableCell>{f.file_type ?? "—"}</TableCell>
                            <TableCell className="text-muted-foreground text-xs">
                              {new Date(f.uploaded_at).toLocaleString("ro-RO")}
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                disabled={busy || blockedByOther}
                                onClick={() => void onDeleteFile(f.id)}
                              >
                                Șterge
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calculations">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-lg">Rezultate calculate</CardTitle>
                <CardDescription>
                  Motorul de calcule salvează în baza de date; fără formule în UI.
                  {test.test_type === "unit_weight"
                    ? " Pentru γ din submersă: salvați mai întâi tabul „Greutate volumică”, apoi rulați calculele."
                    : showUnitWeightBulkTab
                      ? " Dacă folosiți submersă pentru γ: salvați tabul „Greutate volumică”, apoi rulați calculele (γ se adaugă la rezultatele testului)."
                      : null}
                  {test.test_type === "point_load"
                    ? " După «Rulează calcule», clasificarea ISRM din Is(50) apare sub tabel. Online: migrare SQL `point_load_report_metadata_json` + redeploy aplicație și report-service."
                    : null}
                </CardDescription>
              </div>
              <Button type="button" onClick={() => void onCalculate()} disabled={busy || blockedByOther}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Rulează calcule
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {test.test_type === "triaxial_rock" && triaxialRuns.length >= 2 ? (
                <div className="rounded-md border bg-muted/40 px-3 py-2.5 text-sm">
                  <p className="font-medium">Set de încercări (Varianta B)</p>
                  <p className="text-muted-foreground mt-1">
                    Acest test conține mai multe probe (fișiere). Tabelul de mai jos afișează rezultatele setului (ex.
                    c și φ). Valorile pe fiecare probă (σ₃/σ₁) sunt în „Rulări triaxial importate”.
                  </p>
                </div>
              ) : null}
              {test.test_type === "triaxial_rock" && triaxialRuns.length >= 2 ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Hoek–Brown (intact): fit pentru mi</CardTitle>
                    <CardDescription>
                      Introduceți σci (UCS) în MPa. Apoi apăsați „Rulează calcule” pentru a obține mi din punctele
                      (σ₃, σ₁) ale rulărilor importate.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="hb-sigma-ci">σci (UCS) (MPa)</Label>
                      <Input
                        id="hb-sigma-ci"
                        type="number"
                        step="any"
                        value={hbSigmaCiMpa ?? ""}
                        disabled={busy || blockedByOther}
                        onChange={(e) => {
                          const s = e.target.value.trim();
                          setHbSigmaCiMpa(s === "" ? null : Number(s));
                        }}
                        className="w-56"
                      />
                    </div>
                    <div className="text-muted-foreground text-xs">
                      mi se calculează doar dacă există minim 2 rulări valide și σci este {"\u003e"} 0.
                    </div>
                  </CardContent>
                </Card>
              ) : null}
              {calcWarnings.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                  {calcWarnings.map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Indicator</TableHead>
                    <TableHead>Valoare</TableHead>
                    <TableHead>Unitate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.results.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-muted-foreground">
                        Rulați calculele după salvarea măsurătorilor.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (test.test_type === "triaxial_rock" && triaxialRuns.length >= 2
                      ? data.results.filter((r) =>
                          [
                            "mohr_c_mpa",
                            "mohr_phi_deg",
                            "hb_sigma_ci_mpa",
                            "hb_mi",
                            "hb_rmse_mpa",
                            "young_modulus_gpa",
                            "poisson_ratio",
                            "shear_modulus_gpa",
                            "bulk_modulus_gpa",
                          ].includes(
                            r.key,
                          ),
                        )
                      : data.results
                    ).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.label}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {r.value === null ? "—" : Number(r.value).toFixed(r.decimals)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{r.unit ?? "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              {test.test_type === "point_load" && (
                <div className="rounded-md border bg-muted/40 px-3 py-2.5 text-sm">
                  <p className="font-medium">Clasificare rezistență (automat din Is(50))</p>
                  <p className="text-muted-foreground mt-1">
                    {pltStrengthClassDisplay != null && pltStrengthClassDisplay !== "—" ? (
                      pltStrengthClassDisplay
                    ) : (
                      <>
                        Lipsește încă — apăsați «Rulează calcule» cu măsurători complete (P, De / D+W). Dacă
                        tot nu apare pe server: verificați migrarea SQL pentru coloana{" "}
                        <code className="rounded bg-muted px-1 text-xs">point_load_report_metadata_json</code> și
                        că ultimul cod este deploy-at.
                      </>
                    )}
                  </p>
                </div>
              )}
              {test.test_type === "ucs" && showUcsTimeLoadChart && (
                <div className="pt-2">
                  <p className="text-muted-foreground mb-2 text-sm">
                    Timp – forță (F) din curbă stocată; F netă dacă scădeți așezarea la măsurători (ca la
                    „Rulează calcule”).
                  </p>
                  <UcsTimeLoadChart
                    data={ucsTimeLoadChart.series}
                    netForce={ucsSubtractSeatingW !== 0}
                    baselineKn={ucsTimeLoadChart.baselineKn}
                  />
                </div>
              )}
              {test.test_type === "ucs" && reportAvailStressTime && ucsCurveParsed?.points && (
                <div className="pt-2">
                  <p className="text-muted-foreground mb-2 text-sm">
                    Rezistență la compresiune σ (MPa) în funcție de timp — din curbă; cu așezare scăzută se
                    afișează σ netă (aceeași regulă ca F netă).
                  </p>
                  <UcsStressTimeChart
                    points={ucsCurveParsed.points}
                    stressBaselineMpa={ucsStressBaselineMpa > 0 ? ucsStressBaselineMpa : undefined}
                  />
                </div>
              )}
              {test.test_type === "ucs" &&
                ucsVal !== null &&
                !Number.isNaN(Number(ucsVal)) &&
                !reportAvailStressTime && (
                  <div className="pt-2">
                    <p className="text-muted-foreground mb-2 text-sm">
                      {ucsModeStored === "instrumented" || ucsCurveParsed?.points?.length
                        ? "Valoare UCS — adăugați coloana Time în serie pentru grafice σ(t) și F(t)."
                        : "Vizualizare rapidă — valoare UCS (MPa)"}
                    </p>
                    <UcsResultChart valueMpa={Number(ucsVal)} />
                  </div>
                )}
              {test.test_type === "triaxial_rock" && triaxialRuns.length < 2 ? (
                <>
                  {sigma1Mohr != null &&
                    sigma3Mohr != null &&
                    Number.isFinite(sigma1Mohr) &&
                    Number.isFinite(sigma3Mohr) && (
                      <div className="pt-2">
                        <p className="text-muted-foreground mb-2 text-sm">Cerc Mohr (încercare curentă)</p>
                        <MohrCircleChart sigma1Mpa={Number(sigma1Mohr)} sigma3Mpa={Number(sigma3Mohr)} />
                      </div>
                    )}
                  {triaxialCurveParsed?.points?.length ? (
                    <div className="pt-4">
                      <p className="text-muted-foreground mb-2 text-sm">Grafice instrumentate (din import)</p>
                      <TriaxialChartsPanel
                        curve={triaxialCurveParsed as unknown as import("@/lib/triaxial-curve-parse").TriaxialCurvePayload}
                        diameterMm={Number(measByKey.get("diameter_mm") ?? 0) || 36}
                        heightMm={Number(measByKey.get("height_mm") ?? 0) || 76}
                        confiningStressMpa={
                          Number(measByKey.get("confining_stress_mpa") ?? 0) || Number(sigma3Mohr ?? 0) || 0
                        }
                      />
                    </div>
                  ) : null}
                </>
              ) : null}
              {test.test_type === "triaxial_rock" ? (
                <div className="pt-4 space-y-3">
                  {triaxialRuns.length >= 2 ? (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Vizualizare probă (selectează fișier)</CardTitle>
                        <CardDescription>
                          Pentru graficele instrumentate și cercul Mohr pe o singură probă, alege rularea de mai jos.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <Select
                          value={selectedTriaxialRunId}
                          onValueChange={(v) => setSelectedTriaxialRunId(v ?? "")}
                        >
                          <SelectTrigger className="max-w-xl">
                            <SelectValue placeholder="Alege rularea" />
                          </SelectTrigger>
                          <SelectContent>
                            {triaxialRuns.map((r) => (
                              <SelectItem key={r.id} value={r.id}>
                                {r.file_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {selectedTriaxialRun ? (
                          <div className="text-sm text-muted-foreground">
                            σ₃={selectedTriaxialRun.sigma3_mpa ?? "—"} MPa, σ₁={selectedTriaxialRun.sigma1_mpa ?? "—"} MPa
                          </div>
                        ) : null}
                        {selectedTriaxialRun && selectedTriaxialRun.sigma1_mpa != null && selectedTriaxialRun.sigma3_mpa != null ? (
                          <MohrCircleChart sigma1Mpa={Number(selectedTriaxialRun.sigma1_mpa)} sigma3Mpa={Number(selectedTriaxialRun.sigma3_mpa)} />
                        ) : null}
                        {selectedTriaxialRunCurve?.points?.length ? (
                          <div className="pt-2">
                            <p className="text-muted-foreground mb-2 text-sm">Grafice instrumentate (rularea selectată)</p>
                            <div className="mb-3 flex flex-wrap items-center gap-3">
                              <div className="flex items-center gap-2">
                                <Label className="text-xs">εz sursă</Label>
                                <Select
                                  value={triaxialEpsZSource}
                                  onValueChange={(v) => setTriaxialEpsZSource((v === "gauges" ? "gauges" : "lvdta") as "lvdta" | "gauges")}
                                >
                                  <SelectTrigger className="w-64">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="lvdta">Fără mărci: Ch5 (LVDT/deplasare)</SelectItem>
                                    <SelectItem value="gauges" disabled={!selectedTriaxialRunGauges.hasAxial}>
                                      Cu mărci: Ch6/Ch7 (axial)
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="text-muted-foreground text-xs">
                                Detectat: axial {selectedTriaxialRunGauges.hasAxial ? "Ch6/Ch7" : "—"}, radial{" "}
                                {selectedTriaxialRunGauges.hasHoop ? "Ch8" : "—"}
                              </div>
                            </div>
                            <TriaxialChartsPanel
                              curve={selectedTriaxialRunCurve}
                              diameterMm={Number(measByKey.get("diameter_mm") ?? 0) || 36}
                              heightMm={Number(measByKey.get("height_mm") ?? 0) || 76}
                              confiningStressMpa={Number(selectedTriaxialRun?.sigma3_mpa ?? 0) || 0}
                              epsZSource={triaxialEpsZSource}
                            />
                          </div>
                        ) : null}
                        {triaxialRunCurvesForOverlay.length >= 2 ? (
                          <div className="pt-4">
                            <p className="text-muted-foreground mb-2 text-sm">
                              Grafice instrumentate (toate rulările încărcate, max. 5)
                            </p>
                            <TriaxialChartsPanel
                              runs={triaxialRunCurvesForOverlay}
                              diameterMm={Number(measByKey.get("diameter_mm") ?? 0) || 36}
                              heightMm={Number(measByKey.get("height_mm") ?? 0) || 76}
                              confiningStressMpa={0}
                              epsZSource={triaxialEpsZSource}
                            />
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  ) : null}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Rulări triaxial importate (lista fișierelor)</CardTitle>
                      <CardDescription>
                        Fiecare fișier importat este păstrat separat și produce un punct (σ₃, σ₁) pentru cercuri Mohr.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {triaxialRuns.length === 0 ? (
                        <p className="text-muted-foreground text-sm">Nu există rulări importate încă.</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Fișier</TableHead>
                              <TableHead className="text-right">σ₃ (MPa)</TableHead>
                              <TableHead className="text-right">σ₁ (MPa)</TableHead>
                              <TableHead>Observații</TableHead>
                              <TableHead>Avertizări</TableHead>
                              <TableHead className="text-right">Acțiuni</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {triaxialRuns.map((r) => (
                              <TableRow key={r.id}>
                                <TableCell className="font-medium">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span>{r.file_name}</span>
                                    {(() => {
                                      const pts =
                                        r.curve_json && typeof r.curve_json === "object"
                                          ? ((r.curve_json as Record<string, unknown>).points as unknown)
                                          : null;
                                      const arr = Array.isArray(pts) ? (pts as Array<Record<string, unknown>>) : [];
                                      const hasAxial =
                                        arr.some((p) => Number.isFinite(Number(p.strain_ch6))) ||
                                        arr.some((p) => Number.isFinite(Number(p.strain_ch7)));
                                      const hasHoop = arr.some((p) => Number.isFinite(Number(p.strain_ch8)));
                                      return (
                                        <>
                                          <Badge variant={hasAxial ? "default" : "secondary"}>
                                            {hasAxial ? "Cu mărci (axial)" : "Fără mărci"}
                                          </Badge>
                                          {hasHoop ? <Badge variant="outline">Ch8 radial</Badge> : null}
                                        </>
                                      );
                                    })()}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
                                  {typeof r.sigma3_mpa === "number" && Number.isFinite(r.sigma3_mpa)
                                    ? Number(r.sigma3_mpa).toFixed(3)
                                    : "—"}
                                </TableCell>
                                <TableCell className="text-right">
                                  {typeof r.sigma1_mpa === "number" && Number.isFinite(r.sigma1_mpa)
                                    ? Number(r.sigma1_mpa).toFixed(3)
                                    : "—"}
                                </TableCell>
                                <TableCell className="min-w-[320px]">
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                      <Button
                                        type="button"
                                        variant={r.is_suspect ? "destructive" : "outline"}
                                        size="sm"
                                        disabled={busy || blockedByOther}
                                        onClick={() =>
                                          void onPatchTriaxialRun(r.id, { is_suspect: !Boolean(r.is_suspect) })
                                        }
                                      >
                                        {r.is_suspect ? "Proba suspectă" : "Marchează suspectă"}
                                      </Button>
                                    </div>
                                    <Textarea
                                      value={r.observations ?? ""}
                                      disabled={busy || blockedByOther}
                                      placeholder="Observații manuale despre probă (fisuri, stratificație, rupere, probleme la montaj, etc.)"
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setTriaxialRuns((prev) =>
                                          prev.map((x) => (x.id === r.id ? { ...x, observations: v } : x)),
                                        );
                                      }}
                                      onBlur={() => void onPatchTriaxialRun(r.id, { observations: r.observations ?? "" })}
                                      className="min-h-[72px]"
                                    />
                                  </div>
                                </TableCell>
                                <TableCell className="max-w-[360px]">
                                  {Array.isArray(r.import_warnings) && r.import_warnings.length > 0 ? (
                                    <div className="text-xs text-muted-foreground">
                                      {r.import_warnings.slice(0, 2).join(" ")}
                                      {r.import_warnings.length > 2 ? " …" : ""}
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    disabled={busy || blockedByOther}
                                    onClick={() => void onDeleteTriaxialRun(r.id)}
                                  >
                                    Șterge
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                  {(() => {
                    const circles: MohrCircleInput[] = triaxialRuns
                      .map((r) => ({
                        id: r.id,
                        label: r.file_name,
                        sigma1Mpa: Math.max(Number(r.sigma1_mpa), Number(r.sigma3_mpa)),
                        sigma3Mpa: Math.min(Number(r.sigma1_mpa), Number(r.sigma3_mpa)),
                      }))
                      .filter(
                        (c) =>
                          Number.isFinite(c.sigma1Mpa) && Number.isFinite(c.sigma3Mpa) && c.sigma3Mpa >= 0,
                      );

                    if (circles.length < 2) return null;
                    const env = (() => {
                      const pts = circles.map((c) => ({
                        sampleId: c.id,
                        sigma3Mpa: c.sigma3Mpa,
                        sigma1PeakMpa: c.sigma1Mpa,
                        peakIndex: 0,
                      }));
                      const mc = fitMohrCoulomb(pts);
                      return mc.cMpa != null && mc.phiDeg != null ? { cMpa: mc.cMpa, phiDeg: mc.phiDeg } : null;
                    })();

                    const manualEnv =
                      mcManualEnabled &&
                      mcManualC != null &&
                      Number.isFinite(mcManualC) &&
                      mcManualPhi != null &&
                      Number.isFinite(mcManualPhi)
                        ? { cMpa: mcManualC, phiDeg: mcManualPhi }
                        : null;

                    return (
                      <div className="space-y-3">
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-base">Envelopă Mohr–Coulomb (ajustare manuală)</CardTitle>
                            <CardDescription>
                              Dacă o probă e suspectă, poți ajusta manual c și φ pentru linia de envelope (nu modifică
                              cercurile).
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="flex flex-wrap items-center gap-3">
                              <Button
                                type="button"
                                variant={mcManualEnabled ? "default" : "outline"}
                                onClick={() => {
                                  const next = !mcManualEnabled;
                                  setMcManualEnabled(next);
                                  if (next) {
                                    if (mcManualC == null) setMcManualC(env?.cMpa ?? null);
                                    if (mcManualPhi == null) setMcManualPhi(env?.phiDeg ?? null);
                                  }
                                }}
                              >
                                {mcManualEnabled ? "Envelopă manuală: ON" : "Envelopă manuală: OFF"}
                              </Button>
                              <div className="flex items-center gap-2">
                                <Label className="text-xs">c (MPa)</Label>
                                <Input
                                  className="w-28"
                                  type="number"
                                  step="any"
                                  value={mcManualC ?? ""}
                                  disabled={!mcManualEnabled}
                                  onChange={(e) => {
                                    const s = e.target.value.trim();
                                    setMcManualC(s === "" ? null : Number(s));
                                  }}
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={!mcManualEnabled}
                                  onClick={() => setMcManualC((v) => (v == null ? v : v - 0.5))}
                                >
                                  −
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={!mcManualEnabled}
                                  onClick={() => setMcManualC((v) => (v == null ? v : v + 0.5))}
                                >
                                  +
                                </Button>
                              </div>
                              <div className="flex items-center gap-2">
                                <Label className="text-xs">φ (°)</Label>
                                <Input
                                  className="w-28"
                                  type="number"
                                  step="any"
                                  value={mcManualPhi ?? ""}
                                  disabled={!mcManualEnabled}
                                  onChange={(e) => {
                                    const s = e.target.value.trim();
                                    setMcManualPhi(s === "" ? null : Number(s));
                                  }}
                                />
                              </div>
                              {!mcManualEnabled && env ? (
                                <div className="text-muted-foreground text-xs">
                                  Auto: c={env.cMpa.toFixed(2)} MPa, φ={env.phiDeg.toFixed(1)}°
                                </div>
                              ) : null}
                            </div>
                          </CardContent>
                        </Card>
                        <MohrMultiChart circles={circles} envelope={manualEnv ?? env} />
                      </div>
                    );
                  })()}
                </div>
              ) : null}
              {test.test_type === "unconfined_soil" && unconfinedSoilSeriesRows.length >= 2 && (
                <div className="pt-2">
                  <p className="text-muted-foreground mb-2 text-sm">
                    Grafice instrumentate (σ–ε, ε/ΔH–t, σ–ε_V) — același model ca în «Măsurători» și în PDF.
                  </p>
                  <UnconfinedSoilInstrumentedChartsPanel rows={unconfinedSoilSeriesRows} />
                </div>
              )}
              {showUnconfinedMohr && (
                <div className="pt-2">
                  <p className="text-muted-foreground mb-2 text-sm">Cerc Mohr (q_u, c_u)</p>
                  <UnconfinedSoilMohrCircleChart
                    quKpa={unconfinedQuMohr as number}
                    cuKpa={unconfinedCuMohr != null && Number.isFinite(unconfinedCuMohr) ? unconfinedCuMohr : null}
                  />
                </div>
              )}
              {stressStrainDeltas &&
                (test.test_type === "young" ||
                  (test.test_type === "triaxial_rock" &&
                    resultByKey.has("young_modulus_gpa"))) && (
                  <div className="pt-2">
                    <p className="text-muted-foreground mb-2 text-sm">Porțiune liniară σ–ε (schematic)</p>
                    <StressStrainD7012Chart
                      deltaSigmaMpa={stressStrainDeltas.deltaSigmaMpa}
                      deltaEpsilonAxial={stressStrainDeltas.deltaEpsilonAxial}
                      deltaEpsilonLateral={stressStrainDeltas.deltaEpsilonLateral}
                    />
                  </div>
                )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="report">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-lg">Raport PDF</CardTitle>
                <CardDescription>
                  Generat de report-service (Handlebars + Puppeteer). Browserul primește un token scurt de la
                  Next și apelează direct report-service (PDF/previzualizare), astfel că funcționează și pe
                  Vercel Hobby fără limita ~10s a API Next. PDF-ul poate dura 1–2 minute. Local:{" "}
                  <code className="text-xs">cd report-service && npm run dev</code>, în{" "}
                  <code className="text-xs">web/.env.local</code>{" "}
                  <code className="text-xs">REPORT_SERVICE_URL</code> + același{" "}
                  <code className="text-xs">REPORT_SERVICE_SECRET</code> ca în report-service.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void onReportServiceCheck()}
                  disabled={busy || blockedByOther}
                >
                  Verifică report-service
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void onReportPreview()}
                  disabled={
                    busy ||
                    blockedByOther ||
                    (test.test_type !== "ucs" &&
                      test.test_type !== "young" &&
                      test.test_type !== "triaxial_rock" &&
                      test.test_type !== "point_load" &&
                      test.test_type !== "unconfined_soil" &&
                      test.test_type !== "absorption_porosity_rock")
                  }
                >
                  Previzualizare raport
                </Button>
                <Button
                  type="button"
                  onClick={() => void onReport()}
                  disabled={
                    busy ||
                    blockedByOther ||
                    (test.test_type !== "ucs" &&
                      test.test_type !== "young" &&
                      test.test_type !== "triaxial_rock" &&
                      test.test_type !== "point_load" &&
                      test.test_type !== "unconfined_soil" &&
                      test.test_type !== "absorption_porosity_rock")
                  }
                >
                  {test.test_type === "young"
                    ? "Generează PDF (Young)"
                    : test.test_type === "triaxial_rock"
                      ? "Generează PDF (Triaxial Hoek)"
                    : test.test_type === "point_load"
                      ? "Generează PDF (Point load)"
                      : test.test_type === "unconfined_soil"
                        ? "Generează PDF (ISO 17892-7)"
                        : test.test_type === "absorption_porosity_rock"
                          ? "Generează PDF (ISO 13755)"
                          : "Generează PDF (UCS)"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border px-4 py-3">
                <p className="text-sm font-medium">Semnături în raport (per test)</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Apar în secțiunea „Semnături” din PDF ca „Întocmit” și „Verificat”. Pot fi diferite pentru fiecare
                  test.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="rep-prepared-by">Întocmit</Label>
                    <Input
                      id="rep-prepared-by"
                      disabled={busy || blockedByOther}
                      value={preparedBy}
                      onChange={(e) => setPreparedBy(e.target.value)}
                      placeholder="Nume și prenume"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rep-verified-by">Verificat</Label>
                    <Select
                      value={verifiedBy}
                      onValueChange={(v) => setVerifiedBy(v ?? "")}
                      disabled={busy || blockedByOther}
                    >
                      <SelectTrigger id="rep-verified-by" className="w-full">
                        <SelectValue placeholder="Selectați..." />
                      </SelectTrigger>
                      <SelectContent align="start" side="bottom" sideOffset={6} className="z-[200]">
                        <SelectItem value={DEFAULT_VERIFIED_BY}>{DEFAULT_VERIFIED_BY}</SelectItem>
                        <SelectItem value="">—</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" disabled={busy || blockedByOther} onClick={() => void onSaveSignatures()}>
                    Salvează semnături
                  </Button>
                </div>
              </div>

              {(test.test_type === "ucs" ||
                test.test_type === "young" ||
                test.test_type === "point_load" ||
                test.test_type === "unconfined_soil") && (
                <div className="space-y-3 rounded-lg border px-4 py-3">
                  <p className="text-sm font-medium">
                    {test.test_type === "point_load" || test.test_type === "unconfined_soil"
                      ? "Opțiuni raport PDF"
                      : "Grafice în raport"}
                  </p>
                  {test.test_type === "ucs" ? (
                    <p className="text-muted-foreground text-xs">
                      Mod <strong>UCS</strong> (diametru + sarcină): dacă există timp pe curbă —{" "}
                      <strong>Efort – timp</strong> și <strong>Timp – sarcină (kN)</strong>. Mod{" "}
                      <strong>UCS+Young</strong>: și <strong>Sarcină – ε_axial</strong>. Salvați opțiunile înainte
                      de generare. Online: redeploy report-service dacă PDF-ul eșuează cu eroare de rețea/CORS.
                    </p>
                  ) : test.test_type === "point_load" ? (
                    <p className="text-muted-foreground text-xs">
                      Raport Point load (ASTM D5731-16): antet,{" "}
                      <strong>9 secțiuni structurate</strong> (card „Date pentru raport PDF”),{" "}
                      <strong>Fig. 3</strong> (D, W, L) dacă e bifat, fotografii probă (opțional). Salvați opțiunile
                      și câmpurile raport înainte de generare.
                    </p>
                  ) : test.test_type === "unconfined_soil" ? (
                    <p className="text-muted-foreground text-xs">
                      Raport <strong>SR EN ISO 17892-7</strong>: măsurători, rezultate (q_u, c_u), opțional grafic
                      σ_v–ε_v dacă există curbă instrumentată. Fotografii probă din tab POZE.
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-xs">
                      Raportul Young (D7012): antet, identificare probă, condiții, măsurători și rezultate (E, ν).
                      Dacă curbă importată are <strong>timp (t)</strong> și <strong>efort (σ)</strong>, puteți
                      include <strong>Efort – timp (σ–t)</strong> în PDF. Salvați opțiunile înainte de generare.
                    </p>
                  )}
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    {test.test_type === "unconfined_soil" ? (
                      <>
                        <label className="flex cursor-pointer items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="mt-0.5 size-4"
                            checked={reportAvailUnconfinedStressStrain && repCharts.unconfined_stress_strain}
                            disabled={blockedByOther || !reportAvailUnconfinedStressStrain}
                            onChange={(e) =>
                              setRepCharts((c) => ({ ...c, unconfined_stress_strain: e.target.checked }))
                            }
                          />
                          <span>
                            Grafic σ_v – ε_v (kPa, %) în PDF{" "}
                            {!reportAvailUnconfinedStressStrain ? (
                              <span className="text-muted-foreground">
                                (import curbă + geometrie + măsurători salvate)
                              </span>
                            ) : null}
                          </span>
                        </label>
                        <label className="flex cursor-pointer items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="mt-0.5 size-4"
                            checked={repCharts.unconfined_include_cu}
                            disabled={blockedByOther}
                            onChange={(e) =>
                              setRepCharts((c) => ({ ...c, unconfined_include_cu: e.target.checked }))
                            }
                          />
                          <span>Include c_u (0,5·q_u) în PDF (ISO 17892-7 §8.2 a)</span>
                        </label>
                      </>
                    ) : test.test_type === "point_load" ? (
                      <label className="flex cursor-pointer items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4"
                          checked={repCharts.plt_astm_figures}
                          disabled={blockedByOther}
                          onChange={(e) =>
                            setRepCharts((c) => ({ ...c, plt_astm_figures: e.target.checked }))
                          }
                        />
                        <span>Fig. 3 ASTM D5731 în PDF</span>
                      </label>
                    ) : (
                      <label className="flex cursor-pointer items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4"
                          checked={
                            (test.test_type === "young"
                              ? reportAvailYoungStressTime
                              : reportAvailStressTime) && repCharts.stress_time
                          }
                          disabled={
                            blockedByOther ||
                            (test.test_type === "young"
                              ? !reportAvailYoungStressTime
                              : !reportAvailStressTime)
                          }
                          onChange={(e) => setRepCharts((c) => ({ ...c, stress_time: e.target.checked }))}
                        />
                        <span>
                          Efort – timp (σ – t){" "}
                          {test.test_type === "young" ? (
                            !reportAvailYoungStressTime ? (
                              <span className="text-muted-foreground">
                                (curbă Young cu Time și σ; import tab presă)
                              </span>
                            ) : null
                          ) : !reportAvailStressTime ? (
                            <span className="text-muted-foreground">
                              (curbă cu Time și σ; import tab presă sau date existente)
                            </span>
                          ) : null}
                        </span>
                      </label>
                    )}
                    {test.test_type === "ucs" ? (
                      <>
                        <label className="flex cursor-pointer items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="mt-0.5 size-4"
                            checked={reportAvailTimeLoad && repCharts.time_load}
                            disabled={blockedByOther || !reportAvailTimeLoad}
                            onChange={(e) => setRepCharts((c) => ({ ...c, time_load: e.target.checked }))}
                          />
                          <span>
                            Timp – sarcină (t – F, kN){" "}
                            {!reportAvailTimeLoad ? (
                              <span className="text-muted-foreground">
                                (timp pe curbă + F din Load sau σ + diametru)
                              </span>
                            ) : null}
                          </span>
                        </label>
                        {ucsModeForReport === "instrumented" ? (
                          <label className="flex cursor-pointer items-start gap-2 text-sm">
                            <input
                              type="checkbox"
                              className="mt-0.5 size-4"
                              checked={reportAvailSarcinaAxial && repCharts.sarcina_axial}
                              disabled={blockedByOther || !reportAvailSarcinaAxial}
                              onChange={(e) =>
                                setRepCharts((c) => ({ ...c, sarcina_axial: e.target.checked }))
                              }
                            />
                            <span>
                              Sarcină – ε_axial (F – deformație axială){" "}
                              {!reportAvailSarcinaAxial ? (
                                <span className="text-muted-foreground">
                                  (UCS+Young: ε_axial + F sau diametru pentru F din σ)
                                </span>
                              ) : null}
                            </span>
                          </label>
                        ) : null}
                      </>
                    ) : null}
                    {(test.test_type === "ucs" ||
                      test.test_type === "young" ||
                      test.test_type === "point_load" ||
                      test.test_type === "unconfined_soil") && (
                      <label className="flex cursor-pointer items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4"
                          checked={reportAvailSpecimenPhotos && repCharts.specimen_photos}
                          disabled={blockedByOther || !reportAvailSpecimenPhotos}
                          onChange={(e) =>
                            setRepCharts((c) => ({ ...c, specimen_photos: e.target.checked }))
                          }
                        />
                        <span>
                          Fotografii probă (înainte / după){" "}
                          {!reportAvailSpecimenPhotos ? (
                            <span className="text-muted-foreground">(încărcați imagini în tab POZE)</span>
                          ) : null}
                        </span>
                      </label>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={busy || blockedByOther}
                    onClick={() => void saveReportChartOptions()}
                  >
                    Salvează opțiuni raport
                  </Button>
                </div>
              )}
              {test.test_type !== "ucs" &&
                test.test_type !== "young" &&
                test.test_type !== "point_load" &&
                test.test_type !== "unconfined_soil" && (
                  <p className="text-muted-foreground text-sm">
                    PDF disponibil pentru UCS, Young (D7012), Point load (D5731) și compresiune monoaxială pământ
                    (ISO 17892-7). Pentru alte tipuri, export din tab Rezultate / API.
                  </p>
                )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Șablon</TableHead>
                    <TableHead>Versiune</TableHead>
                    <TableHead>Generat</TableHead>
                    <TableHead className="text-right">Acțiuni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.reports.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        Niciun raport încă.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.reports.map((r) => (
                      <ReportDownloadRow
                        key={r.id}
                        testId={testId}
                        reportId={r.id}
                        pdfPath={r.pdf_path}
                        meta={r}
                        disabled={busy || blockedByOther}
                        onDeleted={() => void load()}
                        setMsg={setMsg}
                      />
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReportDownloadRow({
  testId,
  reportId,
  pdfPath,
  meta,
  disabled,
  onDeleted,
  setMsg,
}: {
  testId: string;
  reportId: string;
  pdfPath: string;
  meta: { template_code: string; template_version: string; generated_at: string };
  disabled: boolean;
  onDeleted: () => void;
  setMsg: (msg: string | null) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const open = async () => {
    setErr(null);
    try {
      const res = await fetch(
        `/api/storage/signed-url?bucket=${encodeURIComponent("reports")}&path=${encodeURIComponent(pdfPath)}`,
      );
      const json = (await res.json()) as { signedUrl?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Link eșuat");
      setUrl(json.signedUrl ?? null);
      if (json.signedUrl) window.open(json.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Eroare");
    }
  };

  const remove = async () => {
    if (
      !window.confirm(
        "Ștergeți acest raport PDF din listă și din stocare? Acțiunea nu poate fi anulată.",
      )
    ) {
      return;
    }
    setDeleting(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/tests/${testId}/reports/${reportId}`, {
        method: "DELETE",
        headers: labUserFetchHeaders(),
      });
      const json = (await res.json()) as { error?: string };
      if (res.status === 423) throw new Error(json.error ?? "Test blocat.");
      if (!res.ok) throw new Error(json.error ?? "Ștergere eșuată");
      setMsg("Raport șters.");
      onDeleted();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Eroare");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <TableRow>
      <TableCell>{meta.template_code}</TableCell>
      <TableCell>{meta.template_version}</TableCell>
      <TableCell className="text-muted-foreground text-xs">
        {new Date(meta.generated_at).toLocaleString("ro-RO")}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void open()} disabled={disabled}>
            Deschide PDF
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => void remove()}
            disabled={disabled || deleting}
          >
            {deleting ? <Loader2 className="size-4 animate-spin" /> : null}
            Șterge
          </Button>
        </div>
        {err && <span className="text-destructive mt-1 block text-xs">{err}</span>}
        {url && <span className="sr-only">{url}</span>}
      </TableCell>
    </TableRow>
  );
}

