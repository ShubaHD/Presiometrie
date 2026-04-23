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
  sigma1Mpa: number;
  sigma3Mpa: number;
};

/** Semicerc Mohr în τ–σ: centru ((σ₁+σ₃)/2, 0), rază (σ₁−σ₃)/2. Afișăm ca linie parametrizată. */
export function MohrCircleChart({ sigma1Mpa, sigma3Mpa }: Props) {
  const center = (sigma1Mpa + sigma3Mpa) / 2;
  const r = Math.max((sigma1Mpa - sigma3Mpa) / 2, 0);
  const steps = 48;
  const arc: { sigma: number; tau: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (Math.PI * i) / steps;
    arc.push({
      sigma: center + r * Math.cos(t),
      tau: r * Math.sin(t),
    });
  }

  const minS = Math.min(sigma3Mpa, center - r) - r * 0.15;
  const maxS = Math.max(sigma1Mpa, center + r) + r * 0.15;
  const maxT = r * 1.15 || 1;

  return (
    <div className="w-full" style={{ minHeight: 260 }}>
      <p className="text-muted-foreground mb-2 text-xs">
        Cerc Mohr (semicerc τ ≥ 0) — σ₃ = {sigma3Mpa.toFixed(2)} MPa, σ₁ = {sigma1Mpa.toFixed(2)} MPa
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={arc} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            type="number"
            dataKey="sigma"
            domain={[minS, maxS]}
            tick={{ fontSize: 11 }}
            label={{ value: "σ (MPa)", position: "bottom", offset: 0, style: { fontSize: 11 } }}
          />
          <YAxis
            type="number"
            dataKey="tau"
            domain={[0, maxT]}
            tick={{ fontSize: 11 }}
            label={{ value: "τ (MPa)", angle: -90, position: "insideLeft", style: { fontSize: 11 } }}
          />
          <Tooltip
            formatter={(v) => {
              const n = typeof v === "number" ? v : Number(v);
              return [Number.isFinite(n) ? n.toFixed(2) : "—", ""];
            }}
            labelFormatter={(_, p) => {
              const pt = p?.[0]?.payload as { sigma: number; tau: number } | undefined;
              return pt ? `σ ${pt.sigma.toFixed(2)} MPa` : "";
            }}
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
          />
          <Line type="monotone" dataKey="tau" stroke="oklch(0.45 0.12 250)" strokeWidth={2} dot={false} />
          <ReferenceLine y={0} stroke="oklch(0.5 0 0)" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
