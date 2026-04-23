"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function UcsResultChart({ valueMpa }: { valueMpa: number }) {
  const data = [{ name: "UCS", valoare: valueMpa }];
  return (
    <div className="w-full" style={{ minHeight: 240 }}>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis
            tick={{ fontSize: 12 }}
            label={{ value: "MPa", angle: -90, position: "insideLeft", style: { fontSize: 11 } }}
          />
          <Tooltip
            formatter={(v) => {
              const n = typeof v === "number" ? v : Number(v);
              const s = Number.isFinite(n) ? n.toFixed(3) : "—";
              return [`${s} MPa`, "UCS"];
            }}
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
          />
          <Bar
            dataKey="valoare"
            fill="oklch(0.439 0 0)"
            radius={[6, 6, 0, 0]}
            name="UCS"
            maxBarSize={96}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
