"use client";

import { decimateRowsForLineChart, rawIndexToChartIndex } from "@/lib/chart-decimate-brush";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const MAX_POINTS = 2000;

function BrushBody(props: {
  raw: { t: number; v: number }[];
  valueLabel: string;
  brushRange?: { from: number; to: number } | null;
  onBrushChange?: (range: { from: number; to: number } | null) => void;
  yKey: "v";
  yFormatter?: (n: number) => string;
}) {
  const { raw, valueLabel, brushRange, onBrushChange, yFormatter } = props;

  const { data, mapToRaw } = useMemo(() => decimateRowsForLineChart(raw, MAX_POINTS), [raw]);
  const hi = Math.max(0, raw.length - 1);

  const propStart = brushRange ? rawIndexToChartIndex(mapToRaw, Math.max(0, Math.min(hi, brushRange.from))) : 0;
  const propEnd = brushRange ? rawIndexToChartIndex(mapToRaw, Math.max(0, Math.min(hi, brushRange.to))) : Math.max(0, data.length - 1);

  const [brushLocal, setBrushLocal] = useState<{ a: number; b: number } | null>(null);
  const brushIdxRef = useRef<{ a: number; b: number } | null>(null);

  const onBrushChangeRef = useRef(onBrushChange);
  useEffect(() => {
    onBrushChangeRef.current = onBrushChange;
  }, [onBrushChange]);

  useEffect(() => {
    const onUp = () => {
      const b = brushIdxRef.current;
      brushIdxRef.current = null;
      setBrushLocal(null);
      if (!b) return;
      const r0 = mapToRaw[b.a] ?? 0;
      const r1 = mapToRaw[b.b] ?? hi;
      onBrushChangeRef.current?.({ from: Math.min(r0, r1), to: Math.max(r0, r1) });
    };
    window.addEventListener("pointerup", onUp);
    return () => window.removeEventListener("pointerup", onUp);
  }, [hi, mapToRaw]);

  const startIdx = brushLocal != null ? brushLocal.a : propStart;
  const endIdx = brushLocal != null ? brushLocal.b : propEnd;

  const dataSliced = useMemo(() => {
    const a = Math.max(0, Math.min(startIdx, endIdx));
    const b = Math.max(0, Math.max(startIdx, endIdx));
    return data.slice(a, b + 1);
  }, [data, startIdx, endIdx]);

  if (dataSliced.length < 2) return null;

  return (
    <div className="w-full" style={{ minHeight: 260 }}>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={dataSliced} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey="t"
            type="number"
            tick={{ fontSize: 11 }}
            label={{ value: "t (s)", position: "insideBottom", offset: -2, style: { fontSize: 11 } }}
          />
          <YAxis
            dataKey="v"
            type="number"
            tick={{ fontSize: 11 }}
            label={{ value: valueLabel, angle: -90, position: "insideLeft", style: { fontSize: 11 } }}
          />
          <Tooltip
            formatter={(v: unknown, name) => {
              const n = typeof v === "number" ? v : Number(v);
              if (!Number.isFinite(n)) return ["—", name === "v" ? valueLabel : "t (s)"];
              const s = yFormatter ? yFormatter(n) : n.toFixed(4);
              return [s, name === "v" ? valueLabel : "t (s)"];
            }}
          />
          <Line
            type="linear"
            dataKey="v"
            stroke="oklch(0.42 0.14 145)"
            dot={false}
            strokeWidth={2}
            isAnimationActive={false}
          />
          {onBrushChange ? (
            <Brush
              startIndex={Math.max(0, Math.min(data.length - 1, startIdx))}
              endIndex={Math.max(0, Math.min(data.length - 1, endIdx))}
              onChange={(r) => {
                if (!r) return;
                const sa = typeof r.startIndex === "number" ? r.startIndex : 0;
                const sb = typeof r.endIndex === "number" ? r.endIndex : 0;
                brushIdxRef.current = { a: sa, b: sb };
                setBrushLocal({ a: sa, b: sb });
              }}
              tickFormatter={() => ""}
              height={22}
            />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
      {data.length < raw.length ? (
        <p className="text-muted-foreground mt-1 text-[10px]">
          Afișare: {data.length} din {raw.length} puncte (eșantionare pentru viteză).
        </p>
      ) : null}
    </div>
  );
}

export function UnconfinedSoilTimeLoadChart(props: {
  data: { t: number; load: number }[];
  netForce: boolean;
  baselineKn: number;
  brushRange?: { from: number; to: number } | null;
  onBrushChange?: (range: { from: number; to: number } | null) => void;
}) {
  const { data, netForce, baselineKn, brushRange, onBrushChange } = props;
  const loadLabel = netForce && baselineKn > 0 ? "F netă (kN)" : "F (kN)";
  const rows = useMemo(() => data.map((p) => ({ t: p.t, v: p.load })), [data]);
  if (rows.length < 2) return null;
  return (
    <BrushBody raw={rows} valueLabel={loadLabel} brushRange={brushRange} onBrushChange={onBrushChange} yKey="v" />
  );
}

export function UnconfinedSoilLoadRateChart(props: {
  data: { t: number; rate: number }[];
  brushRange?: { from: number; to: number } | null;
}) {
  const { data, brushRange } = props;
  const rows = useMemo(() => data.map((p) => ({ t: p.t, v: p.rate })), [data]);
  if (rows.length < 2) return null;
  return (
    <BrushBody
      raw={rows}
      valueLabel="dF/dt (kN/s)"
      brushRange={brushRange}
      yKey="v"
      yFormatter={(n) => n.toFixed(6)}
    />
  );
}

