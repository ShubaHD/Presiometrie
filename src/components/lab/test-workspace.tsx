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
import { MEASUREMENT_PRESETS } from "@/lib/measurement-presets";
import { parsePresiometryCurvePayload } from "@/lib/presiometry-curve";
import { validateMeasurementsForTestType } from "@/lib/measurement-schemas";
import { newTestOptionLabel } from "@/lib/test-type-options";
import type { TestMeasurement, TestResult, TestRow, TestType } from "@/types/lab";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { LabBreadcrumb } from "./lab-breadcrumb";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { detectLoopsByPressure, pWindow3070 } from "@/modules/calculations/presiometry-utils";
import { parsePresiometryManualSettings } from "@/modules/calculations/presiometry-manual";

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
  reports: Array<{ id: string; pdf_path: string; generated_at: string }>;
};

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

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/tests/${testId}`);
      const json = (await res.json()) as ApiGet & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Eroare încărcare test.");
      setTest(json.test);
      setMeasurements(json.measurements ?? []);
      setResults(json.results ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Eroare");
    } finally {
      setLoading(false);
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
    return Number.isFinite(n) && n > 0 ? n : 38;
  }, [byKey]);

  const chartSeries = useMemo(() => {
    const pts = (curve?.points ?? [])
      .map((p) => {
        const p_kpa = typeof p.p_kpa === "number" ? p.p_kpa : Number(p.p_kpa);
        const r_mm = p.r_mm ?? p.v_cm3;
        const v_cm3 = p.v_cm3;
        const x = xKind === "radius_mm" ? Number(r_mm) : Number(v_cm3);
        return { p_kpa, x, r_mm: Number(r_mm), v_cm3: Number(v_cm3) };
      })
      .filter((p) => Number.isFinite(p.p_kpa) && Number.isFinite(p.x));
    if (pts.length === 0)
      return {
        pr: [],
        pdr: [],
        loops: [],
        w3070: null as null | { p30: number; p70: number },
        prXDomain: undefined as [number, number] | undefined,
      };
    const r0 = xKind === "radius_mm" ? seatingRmm : pts[0]!.v_cm3;
    const pr = pts.map((p) => ({ x: p.x, p_kpa: p.p_kpa }));
    const pdr =
      xKind === "radius_mm"
        ? pts.map((p) => ({ x: p.r_mm - r0, p_kpa: p.p_kpa }))
        : pts.map((p) => ({ x: p.v_cm3 - r0, p_kpa: p.p_kpa }));
    const loops = detectLoopsByPressure(
      pts.map((p) => ({ p_kpa: p.p_kpa, x: p.x, x_kind: xKind as "radius_mm" | "volume_cm3" })),
    );
    const pMin = Math.min(...pts.map((p) => p.p_kpa));
    const pMax = Math.max(...pts.map((p) => p.p_kpa));
    const w3070 = pWindow3070(pMin, pMax);
    const prXDomain = axisDomainPadded(pr.map((p) => p.x));
    return { pr, pdr, loops, w3070, prXDomain };
  }, [curve, xKind, seatingRmm]);

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
    loops: Array.from({ length: 6 }).map(() => ({
      unload_from: "",
      unload_to: "",
      reload_from: "",
      reload_to: "",
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
        };
      }),
    }));
  }, [manualSettings]);

  const saveManualSettings = async () => {
    if (!okType) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const toInt = (s: string) => {
        const n = Number(String(s ?? "").trim());
        return Number.isFinite(n) ? Math.floor(n) : null;
      };
      const range = (a: string, b: string) => {
        const from = toInt(a);
        const to = toInt(b);
        if (from == null || to == null) return null;
        if (to <= from) return null;
        return { from, to };
      };
      const payload = {
        mode: manualDraft.mode,
        x_kind: xKind,
        load1: manualDraft.mode === "manual" ? range(manualDraft.load1_from, manualDraft.load1_to) : null,
        loops:
          manualDraft.mode === "manual"
            ? manualDraft.loops.map((l) => ({
                unload: range(l.unload_from, l.unload_to),
                reload: range(l.reload_from, l.reload_to),
              }))
            : [],
      };

      const res = await fetch(`/api/tests/${testId}`, {
        method: "PATCH",
        headers: jsonLabHeaders(),
        body: JSON.stringify({ presiometry_settings_json: payload }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Eroare salvare setări.");
      setMsg("Setări manuale salvate.");
      await load();
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
      form.setValue("pmt_seating_r_mm", 38);
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
      await load();
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
      const res = await fetch(`/api/tests/${testId}/calculate`, { method: "POST", headers: jsonLabHeaders() });
      const json = (await res.json()) as { ok?: boolean; error?: string; errors?: string[] };
      if (!res.ok) throw new Error(json.error ?? (json.errors?.[0] ?? "Eroare calcul."));
      setMsg("Calcule actualizate.");
      await load();
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
      await load();
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
      const res = await fetch(`/api/tests/${testId}/report`, { method: "POST", headers: jsonLabHeaders() });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Eroare PDF.");
      setMsg("Raport generat (verificați lista rapoarte).");
      await load();
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
                  <Input id={r.key} {...form.register(r.key)} />
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
                    await load();
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
                          <TableHead className="whitespace-nowrap">p (kPa)</TableHead>
                          <TableHead className="whitespace-nowrap">{xLabel}</TableHead>
                          <TableHead className="whitespace-nowrap">t (s)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {curve.points.slice(0, 20).map((p, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                            <TableCell className="font-mono text-xs tabular-nums">{Math.round(p.p_kpa)}</TableCell>
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
              <CardDescription>
                {xKind === "radius_mm"
                  ? "Elast Logger: p–R și p–ΔR (R în mm)."
                  : "p–V și p–ΔV (V în cm³)."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {!curve?.points?.length ? (
                <p className="text-muted-foreground text-sm">Importați seria pentru a vedea graficele.</p>
              ) : (
                <>
                  <div className="w-full" style={{ minHeight: 320 }}>
                    <p className="text-muted-foreground mb-2 text-xs">Curba p–{xKind === "radius_mm" ? "R" : "V"}</p>
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={chartSeries.pr} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis
                          type="number"
                          dataKey="x"
                          domain={chartSeries.prXDomain ?? ["auto", "auto"]}
                          tick={{ fontSize: 11 }}
                          label={{ value: xLabel, position: "bottom", offset: 0, style: { fontSize: 11 } }}
                        />
                        <YAxis
                          type="number"
                          dataKey="p_kpa"
                          tick={{ fontSize: 11 }}
                          label={{ value: "p (kPa)", angle: -90, position: "insideLeft", style: { fontSize: 11 } }}
                        />
                        <Tooltip
                          formatter={(v) => {
                            const n = typeof v === "number" ? v : Number(v);
                            return [Number.isFinite(n) ? String(Math.round(n * 100) / 100) : "—", ""];
                          }}
                          labelFormatter={() => ""}
                          contentStyle={{ borderRadius: 8, fontSize: 12 }}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Line
                          type="monotone"
                          dataKey="p_kpa"
                          stroke="oklch(0.45 0.14 250)"
                          name="p"
                          dot={false}
                          isAnimationActive={false}
                        />
                        {(okType === "presiometry_program_a" || okType === "presiometry_program_b") &&
                          chartSeries.w3070?.p30 != null &&
                          chartSeries.w3070?.p70 != null && (
                            <>
                              <ReferenceLine
                                y={chartSeries.w3070.p30}
                                stroke="oklch(0.65 0.15 90)"
                                strokeDasharray="4 4"
                                ifOverflow="extendDomain"
                              />
                              <ReferenceLine
                                y={chartSeries.w3070.p70}
                                stroke="oklch(0.65 0.15 90)"
                                strokeDasharray="4 4"
                                ifOverflow="extendDomain"
                              />
                            </>
                          )}
                        {(okType === "presiometry_program_a" || okType === "presiometry_program_b") &&
                          chartSeries.loops.slice(0, 6).flatMap((w, idx) => {
                            const peak = chartSeries.pr[w.peakIndex];
                            const valley = chartSeries.pr[w.valleyIndex];
                            if (!peak || !valley) return [];
                            return [
                              <ReferenceDot
                                key={`peak-${idx}`}
                                x={peak.x}
                                y={peak.p_kpa}
                                r={4}
                                fill="oklch(0.55 0.18 30)"
                                stroke="none"
                              />,
                              <ReferenceDot
                                key={`valley-${idx}`}
                                x={valley.x}
                                y={valley.p_kpa}
                                r={4}
                                fill="oklch(0.6 0.16 140)"
                                stroke="none"
                              />,
                            ];
                          })}
                      </LineChart>
                    </ResponsiveContainer>
                    {(okType === "presiometry_program_a" || okType === "presiometry_program_b") ? (
                      <p className="text-muted-foreground mt-1 text-[10px]">
                        Marcaje: portocaliu = vârf buclă, verde = minim buclă (auto). Liniile punctate = praguri 30% / 70% din domeniul p.
                      </p>
                    ) : null}
                  </div>

                  <div className="w-full" style={{ minHeight: 320 }}>
                    <p className="text-muted-foreground mb-2 text-xs">
                      Curba p–Δ{ xKind === "radius_mm" ? "R" : "V" }
                    </p>
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={chartSeries.pdr} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis
                          type="number"
                          dataKey="x"
                          tick={{ fontSize: 11 }}
                          label={{
                            value: xKind === "radius_mm" ? "ΔR (mm)" : "ΔV (cm³)",
                            position: "bottom",
                            offset: 0,
                            style: { fontSize: 11 },
                          }}
                        />
                        <YAxis
                          type="number"
                          dataKey="p_kpa"
                          tick={{ fontSize: 11 }}
                          label={{ value: "p (kPa)", angle: -90, position: "insideLeft", style: { fontSize: 11 } }}
                        />
                        <Tooltip
                          formatter={(v) => {
                            const n = typeof v === "number" ? v : Number(v);
                            return [Number.isFinite(n) ? String(Math.round(n * 100) / 100) : "—", ""];
                          }}
                          labelFormatter={() => ""}
                          contentStyle={{ borderRadius: 8, fontSize: 12 }}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Line
                          type="monotone"
                          dataKey="p_kpa"
                          stroke="oklch(0.5 0.12 150)"
                          name="p"
                          dot={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calc" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Calcule</CardTitle>
              <CardDescription>
                {okType === "presiometry_program_c"
                  ? "Program C (creep): în această versiune avem import + structură. Calculele de creep vor fi adăugate ulterior."
                  : "Program A/B: moduluri pe ferestre 30–70% (detecție bucle auto)."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {okType !== "presiometry_program_c" ? (
                <Card className="bg-muted/30">
                  <CardHeader>
                    <CardTitle className="text-sm">Selecții calcul (auto / manual)</CardTitle>
                    <CardDescription className="text-xs">
                      Dacă buclele nu sunt perfecte, poți seta manual intervalele (index puncte din serie, 0…N-1).
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
                        {curve?.points?.length ? `N=${curve.points.length} puncte` : "Fără serie"}
                      </span>
                    </div>

                    {manualDraft.mode === "manual" ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:items-end">
                          <div>
                            <Label className="text-xs">Încărcare 1 (from)</Label>
                            <Input
                              value={manualDraft.load1_from}
                              onChange={(e) => setManualDraft((d) => ({ ...d, load1_from: e.target.value }))}
                              placeholder="ex. 5"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Încărcare 1 (to)</Label>
                            <Input
                              value={manualDraft.load1_to}
                              onChange={(e) => setManualDraft((d) => ({ ...d, load1_to: e.target.value }))}
                              placeholder="ex. 25"
                            />
                          </div>
                        </div>

                        <div className="overflow-auto rounded-md border">
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
                                    <Input
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
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      value={row.unload_to}
                                      onChange={(e) =>
                                        setManualDraft((d) => ({
                                          ...d,
                                          loops: d.loops.map((x, j) => (j === i ? { ...x, unload_to: e.target.value } : x)),
                                        }))
                                      }
                                      placeholder="ex. 55"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input
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
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      value={row.reload_to}
                                      onChange={(e) =>
                                        setManualDraft((d) => ({
                                          ...d,
                                          loops: d.loops.map((x, j) => (j === i ? { ...x, reload_to: e.target.value } : x)),
                                        }))
                                      }
                                      placeholder="ex. 80"
                                    />
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
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
              <CardDescription>Generează PDF prin `report-service`.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button type="button" disabled={busy} onClick={() => void generatePdf()}>
                {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Generează PDF
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

