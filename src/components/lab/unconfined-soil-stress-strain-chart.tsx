"use client";

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

export type UnconfinedSoilStressStrainPoint = { strainPct: number; stressKpa: number };

export function UnconfinedSoilStressStrainChart(props: { points: UnconfinedSoilStressStrainPoint[] }) {
  const { points } = props;
  if (points.length < 2) {
    return <p className="text-muted-foreground text-sm">Prea puține puncte pentru grafic.</p>;
  }

  return (
    <div className="w-full" style={{ minHeight: 280 }}>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={points} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            type="number"
            dataKey="strainPct"
            name="ε_v"
            tick={{ fontSize: 11 }}
            label={{
              value: "ε_v (%)",
              position: "bottom",
              offset: 0,
              style: { fontSize: 11 },
            }}
          />
          <YAxis
            type="number"
            dataKey="stressKpa"
            name="σ_v"
            tick={{ fontSize: 11 }}
            label={{
              value: "σ_v (kPa)",
              angle: -90,
              position: "insideLeft",
              style: { fontSize: 11 },
            }}
          />
          <Tooltip
            formatter={(v, name) => {
              const n = typeof v === "number" ? v : Number(v);
              const label = name === "stressKpa" ? "σ_v" : "ε_v";
              return [Number.isFinite(n) ? n.toFixed(name === "stressKpa" ? 0 : 2) : "—", label];
            }}
            labelFormatter={() => ""}
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="stressKpa"
            stroke="oklch(0.42 0.12 160)"
            name="σ_v (kPa)"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
