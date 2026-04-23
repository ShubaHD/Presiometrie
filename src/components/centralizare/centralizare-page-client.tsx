"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CENTRALIZER_SIGMA_C_UCS_KEY, CENTRALIZER_SIGMA_C_YOUNG_KEY } from "@/lib/centralizator/aggregate";
import type { Borehole, Project } from "@/types/lab";
import { CentralizareTimeLoadOverlayChart } from "@/components/centralizare/centralizare-time-load-overlay-chart";
import type { CentralizatorTimeLoadSeries } from "@/lib/centralizator/time-load-overlay";
import { Loader2, Download } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type CentralizerRow = {
  project_code: string;
  project_name: string;
  borehole_code: string;
  sample_code: string;
  depth_from: number | null;
  depth_to: number | null;
  lithology: string | null;
  tests_total: number;
  values: Record<string, number | string | null>;
};

type CentralizerResponse = {
  columns: string[];
  rows: CentralizerRow[];
};

function centralizerColumnLabel(c: string): string {
  if (c === CENTRALIZER_SIGMA_C_UCS_KEY) return "σc UCS (MPa)";
  if (c === CENTRALIZER_SIGMA_C_YOUNG_KEY) return "σc Young (MPa)";
  return c;
}

type Paginated<T> = { data: T[]; total: number; page: number; pageSize: number };

function bucketize(values: number[], bins: number): Array<{ x: string; count: number }> {
  const v = values.filter((n) => Number.isFinite(n));
  if (v.length === 0) return [];
  const min = Math.min(...v);
  const max = Math.max(...v);
  if (min === max) return [{ x: `${min.toFixed(2)}`, count: v.length }];
  const step = (max - min) / bins;
  const counts = new Array(bins).fill(0);
  for (const n of v) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((n - min) / step)));
    counts[idx] += 1;
  }
  return counts.map((c, i) => {
    const a = min + i * step;
    const b = i === bins - 1 ? max : min + (i + 1) * step;
    return { x: `${a.toFixed(1)}–${b.toFixed(1)}`, count: c };
  });
}

export function CentralizarePageClient() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string>("");
  const [boreholes, setBoreholes] = useState<Borehole[]>([]);
  const [boreholeId, setBoreholeId] = useState<string>("");
  const [maxPerType, setMaxPerType] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CentralizerResponse | null>(null);
  const [mainTab, setMainTab] = useState("table");
  const [curveKinds, setCurveKinds] = useState<"both" | "ucs" | "young">("both");
  const [timeLoadSeries, setTimeLoadSeries] = useState<CentralizatorTimeLoadSeries[] | null>(null);
  const [timeLoadKey, setTimeLoadKey] = useState<string | null>(null);
  const [timeLoadLoading, setTimeLoadLoading] = useState(false);
  const [timeLoadErr, setTimeLoadErr] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    const res = await fetch(`/api/projects?page=1&pageSize=200`);
    const j = (await res.json()) as Paginated<Project> & { error?: string };
    if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
    return j.data ?? [];
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const p = await loadProjects();
        if (cancelled) return;
        setProjects(p);
        if (!projectId && p.length) setProjectId(p[0].id);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Eroare încărcare proiecte.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!projectId) return;
    setBoreholeId("");
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/boreholes?page=1&pageSize=400`);
        const j = (await res.json()) as Paginated<Borehole> & { error?: string };
        if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
        if (!cancelled) setBoreholes(j.data ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Eroare încărcare foraje.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const loadCentralizer = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ projectId, maxPerType: String(maxPerType) });
      if (boreholeId) params.set("boreholeId", boreholeId);
      const res = await fetch(`/api/centralizator/data?${params}`);
      const j = (await res.json()) as CentralizerResponse & { error?: string };
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setData(j);
      setTimeLoadKey(null);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Eroare încărcare centralizator.");
    } finally {
      setLoading(false);
    }
  }, [projectId, boreholeId, maxPerType]);

  useEffect(() => {
    void loadCentralizer();
  }, [loadCentralizer]);

  const timeLoadFetchKey = `${projectId}|${boreholeId}|${maxPerType}|${curveKinds}`;

  useEffect(() => {
    if (mainTab !== "charts" || !projectId) return;
    if (timeLoadKey === timeLoadFetchKey) return;
    let cancelled = false;
    setTimeLoadErr(null);
    setTimeLoadLoading(true);
    void (async () => {
      try {
        const p = new URLSearchParams({ projectId, maxPerType: String(maxPerType) });
        if (boreholeId) p.set("boreholeId", boreholeId);
        if (curveKinds !== "both") p.set("kinds", curveKinds);
        const res = await fetch(`/api/centralizator/time-load-series?${p}`);
        const j = (await res.json()) as { series?: CentralizatorTimeLoadSeries[]; error?: string };
        if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
        if (cancelled) return;
        setTimeLoadSeries(j.series ?? []);
        setTimeLoadKey(timeLoadFetchKey);
      } catch (e) {
        if (!cancelled) {
          setTimeLoadSeries(null);
          setTimeLoadErr(e instanceof Error ? e.message : "Eroare curbe");
        }
      } finally {
        if (!cancelled) setTimeLoadLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mainTab, projectId, boreholeId, maxPerType, curveKinds, timeLoadFetchKey, timeLoadKey]);

  const tableColumns = useMemo(() => {
    const base = [
      "borehole_code",
      "sample_code",
      "depth_from",
      "depth_to",
      "lithology",
      "tests_total",
      CENTRALIZER_SIGMA_C_UCS_KEY,
      CENTRALIZER_SIGMA_C_YOUNG_KEY,
    ];
    const dynamicAll = (data?.columns ?? []).filter((c) => !base.includes(c) && !c.startsWith("project_"));
    // Hide columns that have no values across all rows.
    const dynamic = dynamicAll.filter((c) => {
      for (const r of data?.rows ?? []) {
        const v = r.values?.[c];
        if (v === null || v === undefined) continue;
        if (typeof v === "number") {
          if (Number.isFinite(v)) return true;
          continue;
        }
        const s = String(v).trim();
        if (s.length > 0) return true;
      }
      return false;
    });
    return [...base, ...dynamic];
  }, [data?.columns, data?.rows]);

  const fmtCell = (v: string | number | null): string => {
    if (v === null) return "—";
    if (typeof v === "number") {
      return Number.isFinite(v) ? v.toFixed(2) : "—";
    }
    const s = String(v);
    return s.trim().length ? s : "—";
  };

  const coreValue = (r: CentralizerRow, c: string): string | number | null => {
    switch (c) {
      case "borehole_code":
        return r.borehole_code;
      case "sample_code":
        return r.sample_code;
      case "depth_from":
        return r.depth_from;
      case "depth_to":
        return r.depth_to;
      case "lithology":
        return r.lithology;
      case "tests_total":
        return r.tests_total;
      default:
        return null;
    }
  };

  const ucsVals = useMemo(() => {
    const out: number[] = [];
    for (const r of data?.rows ?? []) {
      for (let i = 1; i <= maxPerType; i += 1) {
        const v = r.values[`UCS_${i}_σc`];
        if (typeof v === "number") out.push(v);
      }
    }
    return out;
  }, [data?.rows, maxPerType]);

  const histUcs = useMemo(() => bucketize(ucsVals, 12), [ucsVals]);

  const scatterUcsVsE = useMemo(() => {
    const pts: Array<{ ucs: number; e: number }> = [];
    for (const r of data?.rows ?? []) {
      const u = r.values["UCS_1_σc"];
      const e = r.values["UCS_1_E"];
      if (typeof u === "number" && typeof e === "number") pts.push({ ucs: u, e });
    }
    return pts;
  }, [data?.rows]);

  const downloadProject = () => {
    if (!projectId) return;
    const p = new URLSearchParams({ projectId, maxPerType: String(maxPerType) });
    window.location.href = `/api/centralizator/export-project?${p}`;
  };

  const downloadBorehole = () => {
    if (!boreholeId) return;
    const p = new URLSearchParams({ boreholeId, maxPerType: String(maxPerType) });
    window.location.href = `/api/centralizator/export-borehole?${p}`;
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Centralizare</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Un rând = o probă. Dacă o probă are mai multe teste de același tip, coloanele sunt indexate: UCS_1, UCS_2…
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtre & export</CardTitle>
          <CardDescription>Export Excel pe proiect sau pe foraj.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label>Proiect</Label>
              <Select value={projectId} onValueChange={(v) => setProjectId(String(v ?? ""))}>
                <SelectTrigger className="min-w-56">
                  <SelectValue placeholder="Alege proiect" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label>Foraj (opțional)</Label>
              <Select value={boreholeId} onValueChange={(v) => setBoreholeId(String(v ?? ""))}>
                <SelectTrigger className="min-w-44">
                  <SelectValue placeholder="Toate" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Toate</SelectItem>
                  {boreholes.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label>Max teste/tip</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={maxPerType}
                onChange={(e) => setMaxPerType(parseInt(e.target.value, 10) || 3)}
                className="w-24"
              />
            </div>

            <Button type="button" variant="outline" onClick={() => void loadCentralizer()} disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : null}
              Reîncarcă
            </Button>

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={downloadProject} disabled={!projectId || loading}>
                <Download className="size-4" />
                Export Proiect (Excel)
              </Button>
              <Button type="button" variant="secondary" onClick={downloadBorehole} disabled={!boreholeId || loading}>
                <Download className="size-4" />
                Export Foraj (Excel)
              </Button>
            </div>
          </div>

          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </CardContent>
      </Card>

      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList>
          <TabsTrigger value="table">Tabel</TabsTrigger>
          <TabsTrigger value="charts">Grafice</TabsTrigger>
        </TabsList>

        <TabsContent value="table" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Centralizator</CardTitle>
              <CardDescription>{data?.rows?.length ?? 0} probe</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    {tableColumns.map((c) => (
                      <TableHead key={c}>{centralizerColumnLabel(c)}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.rows ?? []).map((r) => (
                    <TableRow key={r.sample_code + r.borehole_code}>
                      {tableColumns.map((c) => {
                        const v = coreValue(r, c) ?? r.values[c] ?? null;
                        return <TableCell key={c}>{fmtCell(v as string | number | null)}</TableCell>;
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="charts" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle className="text-base">Timp – sarcină (UCS / Young)</CardTitle>
                <CardDescription>
                  Curbe suprapuse din aceleași teste ca în centralizator (max {maxPerType} / tip / probă). Legenda =
                  adâncime probă + tip + index (hover pentru valori).
                </CardDescription>
              </div>
              <div className="flex flex-col gap-1 sm:min-w-40">
                <Label className="text-xs">Serii afișate</Label>
                <Select
                  value={curveKinds}
                  onValueChange={(v) => {
                    setCurveKinds((v as "both" | "ucs" | "young") ?? "both");
                    setTimeLoadKey(null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">UCS + Young</SelectItem>
                    <SelectItem value="ucs">Doar UCS</SelectItem>
                    <SelectItem value="young">Doar Young</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {timeLoadErr ? <p className="text-destructive text-sm">{timeLoadErr}</p> : null}
              {timeLoadLoading ? (
                <div className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Loader2 className="size-4 animate-spin" />
                  Se încarcă curbele…
                </div>
              ) : (
                <>
                  <CentralizareTimeLoadOverlayChart series={timeLoadSeries ?? []} />
                  {(timeLoadSeries?.length ?? 0) > 0 ? (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Adâncime</TableHead>
                            <TableHead>Tip</TableHead>
                            <TableHead>#</TableHead>
                            <TableHead className="text-right">F max (kN)</TableHead>
                            <TableHead className="text-right">t la F max (s)</TableHead>
                            <TableHead className="text-right">Puncte (serie)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(timeLoadSeries ?? []).map((s) => (
                            <TableRow key={s.test_id}>
                              <TableCell className="font-medium">
                                {s.depth_from != null && s.depth_to != null
                                  ? `${Number(s.depth_from).toFixed(2)}–${Number(s.depth_to).toFixed(2)} m`
                                  : s.depth_from != null
                                    ? `${Number(s.depth_from).toFixed(2)} m`
                                    : "—"}
                              </TableCell>
                              <TableCell>{s.test_type === "ucs" ? "UCS" : "Young"}</TableCell>
                              <TableCell>{s.slot}</TableCell>
                              <TableCell className="text-right">
                                {s.peak_load_kn != null && Number.isFinite(s.peak_load_kn)
                                  ? s.peak_load_kn.toFixed(3)
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-right">
                                {s.peak_t_s != null && Number.isFinite(s.peak_t_s) ? s.peak_t_s.toFixed(3) : "—"}
                              </TableCell>
                              <TableCell className="text-right">{s.n_raw}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Distribuție UCS σc (MPa)</CardTitle>
              <CardDescription>Histogramă din valorile disponibile (UCS_1…UCS_n).</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={histUcs}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="x" interval={0} angle={-20} textAnchor="end" height={55} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="currentColor" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Corelație UCS σc vs E</CardTitle>
              <CardDescription>Din UCS_1 (unde există ambele).</CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" dataKey="ucs" name="σc" unit=" MPa" />
                  <YAxis type="number" dataKey="e" name="E" unit=" GPa" />
                  <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                  <Scatter data={scatterUcsVsE} fill="currentColor" />
                </ScatterChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

