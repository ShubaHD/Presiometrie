"use client";

import { decimateRowsForLineChart, rawIndexToChartIndex } from "@/lib/chart-decimate-brush";
import type { YoungCurvePoint } from "@/lib/young-curve-parse";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const MAX_POINTS = 2500;

type Row = { i: number; load: number; ch6: number | null; ch7: number | null; ch8: number | null };

export function buildYoungForceStrainChannelsRows(
  points: YoungCurvePoint[],
): Row[] {
  const out: Row[] = [];
  let i = 0;
  for (const p of points) {
    const load = p.load_kn;
    if (load == null || !Number.isFinite(load)) continue;
    out.push({
      i,
      load,
      ch6: p.strain_ch6 != null && Number.isFinite(p.strain_ch6) ? p.strain_ch6 : null,
      ch7: p.strain_ch7 != null && Number.isFinite(p.strain_ch7) ? p.strain_ch7 : null,
      ch8: p.strain_ch8 != null && Number.isFinite(p.strain_ch8) ? p.strain_ch8 : null,
    });
    i++;
  }
  return out;
}

export function suggestYoungPoissonFlatCutoffIndex(
  points: YoungCurvePoint[],
  i0: number,
  i1: number,
): number | null {
  const lo = Math.max(0, Math.min(i0, i1));
  const hi = Math.min(points.length - 1, Math.max(i0, i1));
  if (hi - lo < 25) return null;

  const get = (p: YoungCurvePoint) => {
    const v = p.strain_ch8;
    if (v != null && Number.isFinite(v)) return v;
    const vr = p.strain_lateral;
    if (vr != null && Number.isFinite(vr)) return vr;
    return null;
  };

  let minV = Infinity;
  let maxV = -Infinity;
  for (let k = lo; k <= hi; k++) {
    const v = get(points[k]!);
    if (v == null) continue;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  if (!Number.isFinite(minV) || !Number.isFinite(maxV)) return null;
  const range = Math.max(0, maxV - minV);
  const tol = Math.max(1e-12, range * 1e-6);
  const runNeed = 25;

  let prev: number | null = null;
  let run = 0;
  for (let k = lo; k <= hi; k++) {
    const v = get(points[k]!);
    if (v == null) {
      prev = null;
      run = 0;
      continue;
    }
    if (prev !== null && Math.abs(v - prev) <= tol) run++;
    else run = 0;
    prev = v;
    if (run >= runNeed) return Math.max(lo, k - runNeed);
  }
  return null;
}

/** Brush: local indices during drag; parent updates only on pointerup (avoids full-page re-render per pixel). */
function YoungForceStrainBrushBody(props: {
  raw: Row[];
  poissonRange: { from: number; to: number } | null;
  suggestedCutoffIndex: number | null;
  onBrushChange?: (range: { from: number; to: number }) => void;
}) {
  const { raw, poissonRange, suggestedCutoffIndex, onBrushChange } = props;
  const { data, mapToRaw } = useMemo(() => decimateRowsForLineChart(raw, MAX_POINTS), [raw]);
  const hi = Math.max(0, raw.length - 1);
  const dataHi = Math.max(0, data.length - 1);

  const shade =
    poissonRange && hi >= 1
      ? {
          a: Math.max(0, Math.min(poissonRange.from, poissonRange.to)),
          b: Math.max(0, Math.min(hi, Math.max(poissonRange.from, poissonRange.to))),
        }
      : null;

  const propBrushStart =
    mapToRaw.length > 0
      ? shade
        ? rawIndexToChartIndex(mapToRaw, Math.min(shade.a, shade.b))
        : 0
      : 0;
  const propBrushEnd =
    mapToRaw.length > 0
      ? shade
        ? rawIndexToChartIndex(mapToRaw, Math.max(shade.a, shade.b))
        : dataHi
      : dataHi;

  const [brushLocal, setBrushLocal] = useState<{ a: number; b: number } | null>(null);
  const brushIdxRef = useRef<{ a: number; b: number } | null>(null);
  const draggingRef = useRef(false);
  const mapToRawRef = useRef(mapToRaw);
  const hiRef = useRef(hi);
  const onBrushChangeRef = useRef(onBrushChange);
  useEffect(() => {
    mapToRawRef.current = mapToRaw;
    hiRef.current = hi;
    onBrushChangeRef.current = onBrushChange;
  }, [mapToRaw, hi, onBrushChange]);

  useEffect(() => {
    if (draggingRef.current) return;
    const t = setTimeout(() => setBrushLocal(null), 0);
    return () => clearTimeout(t);
  }, [poissonRange?.from, poissonRange?.to, raw.length]);

  useEffect(() => {
    const flush = () => {
      if (!draggingRef.current) return;
      const b = brushIdxRef.current;
      draggingRef.current = false;
      brushIdxRef.current = null;
      setBrushLocal(null);
      if (b) {
        const mr = mapToRawRef.current;
        const h = hiRef.current;
        const ra = mr[b.a] ?? 0;
        const rb = mr[b.b] ?? h;
        onBrushChangeRef.current?.({ from: Math.min(ra, rb), to: Math.max(ra, rb) });
      }
    };
    window.addEventListener("pointerup", flush, true);
    window.addEventListener("pointercancel", flush, true);
    return () => {
      window.removeEventListener("pointerup", flush, true);
      window.removeEventListener("pointercancel", flush, true);
    };
  }, []);

  const startIdx = brushLocal != null ? brushLocal.a : propBrushStart;
  const endIdx = brushLocal != null ? brushLocal.b : propBrushEnd;

  let nuLo: number | null = null;
  let nuHi: number | null = null;
  if (brushLocal != null) {
    const r0 = mapToRaw[brushLocal.a] ?? 0;
    const r1 = mapToRaw[brushLocal.b] ?? hi;
    nuLo = Math.min(r0, r1);
    nuHi = Math.max(r0, r1);
  } else if (shade) {
    nuLo = Math.min(shade.a, shade.b);
    nuHi = Math.max(shade.a, shade.b);
  }
  const x1 = nuLo != null ? raw[nuLo]?.load : undefined;
  const x2 = nuHi != null ? raw[nuHi]?.load : undefined;

  const cut = suggestedCutoffIndex != null ? Math.max(0, Math.min(hi, suggestedCutoffIndex)) : null;
  const cutX = cut != null ? raw[cut]?.load : null;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="load"
          type="number"
          tick={{ fontSize: 11 }}
          label={{ value: "F (kN)", position: "insideBottom", offset: -2, style: { fontSize: 11 } }}
        />
        <YAxis
          type="number"
          tick={{ fontSize: 11 }}
          label={{ value: "ε (—)", angle: -90, position: "insideLeft", style: { fontSize: 11 } }}
        />
        <Tooltip
          formatter={(v: unknown, name) => {
            const n = typeof v === "number" ? v : Number(v);
            const s = Number.isFinite(n) ? n.toExponential(4) : "—";
            const nm =
              name === "ch6" ? "Ch6" : name === "ch7" ? "Ch7" : name === "ch8" ? "Ch8" : String(name);
            return [s, nm];
          }}
          labelFormatter={(x) => {
            const n = typeof x === "number" ? x : Number(x);
            return Number.isFinite(n) ? `F ${n.toFixed(3)} kN` : "";
          }}
          contentStyle={{ borderRadius: 8, fontSize: 12 }}
        />
        <Line type="linear" dataKey="ch6" stroke="oklch(0.45 0.14 250)" dot={false} isAnimationActive={false} />
        <Line type="linear" dataKey="ch7" stroke="oklch(0.48 0.12 180)" dot={false} isAnimationActive={false} />
        <Line type="linear" dataKey="ch8" stroke="oklch(0.55 0.12 30)" dot={false} isAnimationActive={false} />

        {nuLo != null && nuHi != null && x1 != null && x2 != null ? (
          <ReferenceArea
            x1={Math.min(x1, x2)}
            x2={Math.max(x1, x2)}
            strokeOpacity={0}
            fill="oklch(0.55 0.12 260)"
            fillOpacity={0.10}
          />
        ) : null}

        {cutX != null ? (
          <ReferenceArea
            x1={cutX}
            x2={raw[hi]?.load}
            strokeOpacity={0}
            fill="oklch(0.75 0.12 60)"
            fillOpacity={0.08}
          />
        ) : null}

        {onBrushChange ? (
          <Brush
            height={22}
            stroke="oklch(0.5 0 0)"
            startIndex={startIdx}
            endIndex={endIdx}
            onChange={(range: { startIndex?: number; endIndex?: number }) => {
              const sa = Math.max(0, Math.min(dataHi, range.startIndex ?? 0));
              const sb = Math.max(0, Math.min(dataHi, range.endIndex ?? dataHi));
              draggingRef.current = true;
              brushIdxRef.current = { a: sa, b: sb };
              setBrushLocal({ a: sa, b: sb });
            }}
          />
        ) : null}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function YoungForceStrainChannelsChart(props: {
  rows: Row[];
  poissonRange: { from: number; to: number } | null;
  suggestedCutoffIndex: number | null;
  onBrushChange?: (range: { from: number; to: number }) => void;
}) {
  const { rows: raw, poissonRange, suggestedCutoffIndex, onBrushChange } = props;
  if (!raw || raw.length < 2) return null;

  return (
    <div className="w-full" style={{ minHeight: 280 }}>
      <YoungForceStrainBrushBody
        raw={raw}
        poissonRange={poissonRange}
        suggestedCutoffIndex={suggestedCutoffIndex}
        onBrushChange={onBrushChange}
      />
      <p className="text-muted-foreground mt-1 text-[10px]">
        Zona violet = interval folosit pentru ν (după Brush). Zona galbenă = porțiune exclusă de auto-cutoff (Ch8
        platou/blocat).
      </p>
    </div>
  );
}
