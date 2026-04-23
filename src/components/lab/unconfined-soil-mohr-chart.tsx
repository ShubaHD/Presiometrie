"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Props = {
  /** Rezistență la compresiune monoaxială q_u (kPa) → σ₁ la eșec, σ₃ = 0. */
  quKpa: number;
  /** Rezistență la forfecare nedrenată c_u (kPa); opțional, dreaptă orizontală τ = c_u. */
  cuKpa: number | null;
};

/** Semicerc Mohr (τ ≥ 0) pentru compresiune monoaxială: σ₁ = q_u, σ₃ = 0; τ_max = q_u/2 (coincide cu c_u dacă c_u = 0,5·q_u). */
export function UnconfinedSoilMohrCircleChart({ quKpa, cuKpa }: Props) {
  const sigma1 = quKpa;
  const sigma3 = 0;
  const center = (sigma1 + sigma3) / 2;
  const r = Math.max((sigma1 - sigma3) / 2, 0);
  const steps = 48;
  const arc: { sigma: number; tau: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (Math.PI * i) / steps;
    arc.push({
      sigma: center + r * Math.cos(t),
      tau: r * Math.sin(t),
    });
  }

  const minS = Math.min(sigma3, center - r) - Math.max(r * 0.12, quKpa * 0.02);
  const maxS = Math.max(sigma1, center + r) + Math.max(r * 0.12, quKpa * 0.02);
  const maxT = Math.max(r * 1.12, cuKpa != null && Number.isFinite(cuKpa) && cuKpa > 0 ? cuKpa * 1.08 : 0, 1);

  const cuLine =
    cuKpa != null && Number.isFinite(cuKpa) && cuKpa > 0 && cuKpa <= maxT * 1.02 ? cuKpa : null;

  return (
    <div className="w-full" style={{ minHeight: 260 }}>
      <p className="text-muted-foreground mb-2 text-xs">
        Cerc Mohr (τ ≥ 0) — σ₃ = 0 kPa, σ₁ = q_u = {quKpa.toFixed(0)} kPa
        {cuLine != null ? `; c_u = ${cuLine.toFixed(0)} kPa (τ = c_u)` : ""}
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={arc} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            type="number"
            dataKey="sigma"
            domain={[minS, maxS]}
            tick={{ fontSize: 11 }}
            label={{ value: "σ (kPa)", position: "bottom", offset: 0, style: { fontSize: 11 } }}
          />
          <YAxis
            type="number"
            dataKey="tau"
            domain={[0, maxT]}
            tick={{ fontSize: 11 }}
            label={{ value: "τ (kPa)", angle: -90, position: "insideLeft", style: { fontSize: 11 } }}
          />
          <Tooltip
            formatter={(v) => {
              const n = typeof v === "number" ? v : Number(v);
              return [Number.isFinite(n) ? n.toFixed(1) : "—", "kPa"];
            }}
            labelFormatter={(_, p) => {
              const pt = p?.[0]?.payload as { sigma: number; tau: number } | undefined;
              return pt ? `σ ${pt.sigma.toFixed(1)} kPa, τ ${pt.tau.toFixed(1)} kPa` : "";
            }}
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
          />
          {cuLine != null ? (
            <ReferenceLine
              y={cuLine}
              stroke="oklch(0.55 0.14 30)"
              strokeDasharray="5 4"
              label={{ value: `τ = c_u`, position: "insideTopRight", fill: "oklch(0.35 0.08 30)", fontSize: 11 }}
            />
          ) : null}
          <Line type="monotone" dataKey="tau" stroke="oklch(0.45 0.12 250)" strokeWidth={2} dot={false} />
          <ReferenceLine y={0} stroke="oklch(0.5 0 0)" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
