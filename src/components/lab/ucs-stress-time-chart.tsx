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

const MAX_POINTS = 2000;

function decimate<T>(rows: T[], max: number): T[] {
  if (rows.length <= max) return rows;
  const step = Math.ceil(rows.length / max);
  return rows.filter((_, i) => i % step === 0);
}

/** σ (MPa) vs timp (s) din punctele curbei importate; conexiune liniară (fără monotone). */
export function UcsStressTimeChart(props: {
  points: Array<{ t_s?: number | null; stress_mpa: number }>;
  /** Dacă > 0, se afișează σ − baseline (aliniat la calculele UCS nete). */
  stressBaselineMpa?: number;
}) {
  const { points, stressBaselineMpa = 0 } = props;
  const bl = stressBaselineMpa > 0 && Number.isFinite(stressBaselineMpa) ? stressBaselineMpa : 0;
  const raw = points
    .filter((p) => p.t_s != null && Number.isFinite(p.t_s) && Number.isFinite(p.stress_mpa))
    .map((p) => ({ t: p.t_s as number, stress: p.stress_mpa - bl }));
  const stressLabel = bl > 0 ? "σ netă (MPa)" : "σ (MPa)";
  const data = decimate(raw, MAX_POINTS);
  if (data.length < 2) return null;

  return (
    <div className="w-full" style={{ minHeight: 260 }}>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey="t"
            type="number"
            tick={{ fontSize: 11 }}
            label={{ value: "t (s)", position: "insideBottom", offset: -2, style: { fontSize: 11 } }}
          />
          <YAxis
            dataKey="stress"
            type="number"
            tick={{ fontSize: 11 }}
            label={{ value: stressLabel, angle: -90, position: "insideLeft", style: { fontSize: 11 } }}
          />
          <Tooltip
            formatter={(v: unknown, name) => {
              const n = typeof v === "number" ? v : Number(v);
              const s = Number.isFinite(n) ? n.toFixed(4) : "—";
              return [s, name === "stress" ? stressLabel : "t (s)"];
            }}
          />
          <Line
            type="linear"
            dataKey="stress"
            stroke="oklch(0.35 0.05 260)"
            dot={false}
            strokeWidth={2}
            isAnimationActive={false}
          />
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
