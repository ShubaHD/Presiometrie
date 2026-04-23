"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { TriaxialCurvePayload, TriaxialCurvePoint } from "@/lib/triaxial-curve-parse";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Props = {
  curve?: TriaxialCurvePayload;
  runs?: Array<{ id: string; label: string; curve: TriaxialCurvePayload; confiningStressMpa: number }>;
  diameterMm: number;
  heightMm: number;
  confiningStressMpa: number;
  epsZSource?: "lvdta" | "gauges";
};

function areaMm2(diameterMm: number) {
  return (Math.PI * diameterMm * diameterMm) / 4;
}

function firstFinite<T>(xs: Array<T>, toNum: (v: T) => number | null) {
  for (const x of xs) {
    const n = toNum(x);
    if (n != null && Number.isFinite(n)) return n;
  }
  return null;
}

function toDerivedSeries(args: Props) {
  const { curve, diameterMm, heightMm, confiningStressMpa, epsZSource } = args;
  const pts = curve?.points ?? [];
  const a0 = areaMm2(diameterMm);
  const disp0 = firstFinite(pts, (p) => (p.disp_ch5_mm != null && Number.isFinite(p.disp_ch5_mm) ? p.disp_ch5_mm : null));

  const out: Array<{
    i: number;
    epsZ: number | null;
    sigma1: number | null;
    q: number | null;
    sigma3: number | null;
  }> = [];

  const hasGauges =
    pts.some((p) => p.strain_ch6 != null && Number.isFinite(p.strain_ch6)) ||
    pts.some((p) => p.strain_ch7 != null && Number.isFinite(p.strain_ch7));

  for (let i = 0; i < pts.length; i++) {
    const p: TriaxialCurvePoint = pts[i]!;
    const load = p.load_ch1_kn ?? p.load_ch2_kn ?? null;
    const sigma3 = p.confining_ch13_mpa != null && Number.isFinite(p.confining_ch13_mpa) ? p.confining_ch13_mpa : confiningStressMpa;

    const sigma1FromStressCol = p.stress_mpa != null && Number.isFinite(p.stress_mpa) ? p.stress_mpa : null;
    const sigma1FromLoad =
      load != null && Number.isFinite(load) && a0 > 0 ? (load * 1000) / a0 + sigma3 : null;
    const sigma1 = sigma1FromStressCol ?? sigma1FromLoad;

    const disp = p.disp_ch5_mm != null && Number.isFinite(p.disp_ch5_mm) ? p.disp_ch5_mm : null;
    const epsZFromLvdta = disp0 != null && disp != null && heightMm > 0 ? ((disp - disp0) / heightMm) * -1 : null;
    const e6 = p.strain_ch6 != null && Number.isFinite(p.strain_ch6) ? p.strain_ch6 : null;
    const e7 = p.strain_ch7 != null && Number.isFinite(p.strain_ch7) ? p.strain_ch7 : null;
    const epsZFromGauges =
      e6 != null && e7 != null ? (e6 + e7) / 2 : e6 != null ? e6 : e7 != null ? e7 : null;

    // Convention: compression positive (same as rest of app)
    const wantGauges = epsZSource === "gauges";
    const epsZ = wantGauges && hasGauges ? epsZFromGauges : epsZFromLvdta;

    const q = sigma1 != null && sigma3 != null ? sigma1 - sigma3 : null;
    out.push({ i, epsZ, sigma1, q, sigma3 });
  }
  return out;
}

export function TriaxialChartsPanel(props: Props) {
  const palette = ["#2563eb", "#16a34a", "#dc2626", "#7c3aed", "#ea580c", "#0891b2", "#0f766e"];
  const runs =
    props.runs && props.runs.length > 0
      ? props.runs
      : props.curve
        ? [
            {
              id: "single",
              label: "Curba",
              curve: props.curve,
              confiningStressMpa: props.confiningStressMpa,
            },
          ]
        : [];

  const seriesByRun = runs.map((r) => ({
    id: r.id,
    label: r.label,
    series: toDerivedSeries({
      ...props,
      curve: r.curve,
      confiningStressMpa: r.confiningStressMpa,
    }),
  }));

  const anyPoints = seriesByRun.some((x) => x.series.length >= 2);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">σ1–εz</CardTitle>
          <CardDescription>
            Din curbă importată (Load/Stress + εz din {props.epsZSource === "gauges" ? "Ch6/Ch7" : "Ch5"}).
          </CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {!anyPoints ? (
            <p className="text-muted-foreground text-sm">Nu există suficiente puncte în curbe pentru a desena graficul.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  type="number"
                  dataKey="epsZ"
                  tick={{ fontSize: 11 }}
                  label={{ value: "εz (—)", position: "bottom", offset: 0, style: { fontSize: 11 } }}
                />
                <YAxis
                  type="number"
                  dataKey="sigma1"
                  tick={{ fontSize: 11 }}
                  label={{ value: "σ1 (MPa)", angle: -90, position: "insideLeft", style: { fontSize: 11 } }}
                />
                <Tooltip
                  formatter={(v, name) => {
                    const n = typeof v === "number" ? v : Number(v);
                    return [Number.isFinite(n) ? n.toFixed(2) : "—", String(name)];
                  }}
                  labelFormatter={(_, p) => {
                    const pt = p?.[0]?.payload as { epsZ?: number } | undefined;
                    return pt?.epsZ != null && Number.isFinite(Number(pt.epsZ)) ? `εz ${Number(pt.epsZ).toFixed(4)}` : "";
                  }}
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                />
                <Legend />
                {seriesByRun.map((s, idx) => (
                  <Line
                    key={s.id}
                    data={s.series}
                    type="monotone"
                    dataKey="sigma1"
                    name={s.label}
                    dot={false}
                    strokeWidth={2}
                    stroke={palette[idx % palette.length]}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">q–εz</CardTitle>
          <CardDescription>\(q=σ1-σ3\).</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {!anyPoints ? (
            <p className="text-muted-foreground text-sm">Nu există suficiente puncte în curbe pentru a desena graficul.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  type="number"
                  dataKey="epsZ"
                  tick={{ fontSize: 11 }}
                  label={{ value: "εz (—)", position: "bottom", offset: 0, style: { fontSize: 11 } }}
                />
                <YAxis
                  type="number"
                  dataKey="q"
                  tick={{ fontSize: 11 }}
                  label={{ value: "q (MPa)", angle: -90, position: "insideLeft", style: { fontSize: 11 } }}
                />
                <Tooltip
                  formatter={(v, name) => {
                    const n = typeof v === "number" ? v : Number(v);
                    return [Number.isFinite(n) ? n.toFixed(2) : "—", String(name)];
                  }}
                  labelFormatter={(_, p) => {
                    const pt = p?.[0]?.payload as { epsZ?: number } | undefined;
                    return pt?.epsZ != null && Number.isFinite(Number(pt.epsZ)) ? `εz ${Number(pt.epsZ).toFixed(4)}` : "";
                  }}
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                />
                <Legend />
                {seriesByRun.map((s, idx) => (
                  <Line
                    key={s.id}
                    data={s.series}
                    type="monotone"
                    dataKey="q"
                    name={s.label}
                    dot={false}
                    strokeWidth={2}
                    stroke={palette[idx % palette.length]}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

