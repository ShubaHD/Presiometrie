"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export { buildUcsTimeLoadChartData } from "@/lib/ucs-time-load-chart-data";

const MAX_POINTS = 2000;

function decimate<T>(rows: T[], max: number): T[] {
  if (rows.length <= max) return rows;
  const step = Math.ceil(rows.length / max);
  return rows.filter((_, i) => i % step === 0);
}

/** Timp (s) vs forță (kN), din punctele curbei; aliniat la aceeași regulă de așezare ca la calcule. */
export function UcsTimeLoadChart(props: {
  data: { t: number; load: number }[];
  netForce: boolean;
  baselineKn: number;
}) {
  const { data: raw, netForce, baselineKn } = props;
  const chartData = decimate(raw, MAX_POINTS);
  const loadLabel =
    netForce && baselineKn > 0 ? "F netă (kN)" : "F (kN)";
  if (chartData.length < 2) return null;

  return (
    <div className="w-full" style={{ minHeight: 260 }}>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey="t"
            type="number"
            tick={{ fontSize: 11 }}
            label={{ value: "t (s)", position: "insideBottom", offset: -2, style: { fontSize: 11 } }}
          />
          <YAxis
            dataKey="load"
            type="number"
            tick={{ fontSize: 11 }}
            label={{ value: loadLabel, angle: -90, position: "insideLeft", style: { fontSize: 11 } }}
          />
          <Tooltip
            formatter={(v: unknown, name) => {
              const n = typeof v === "number" ? v : Number(v);
              const s = Number.isFinite(n) ? n.toFixed(4) : "—";
              return [s, name === "load" ? loadLabel : "t (s)"];
            }}
          />
          <Line
            type="linear"
            dataKey="load"
            stroke="oklch(0.42 0.14 145)"
            dot={false}
            strokeWidth={2}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      {chartData.length < raw.length ? (
        <p className="text-muted-foreground mt-1 text-[10px]">
          Afișare: {chartData.length} din {raw.length} puncte (eșantionare pentru viteză).
        </p>
      ) : null}
    </div>
  );
}
