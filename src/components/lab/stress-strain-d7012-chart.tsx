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

type Props = {
  deltaSigmaMpa: number;
  deltaEpsilonAxial: number;
  deltaEpsilonLateral: number;
};

/**
 * Schemă tip Fig. 1 D7012: σ vs ε_axial (dreapta) și σ vs ε_lateral (stânga pe același grafic
 * prin traslatări — aici două serii cu același σ pe ordonată, abscise separate în valoare).
 */
export function StressStrainD7012Chart({ deltaSigmaMpa, deltaEpsilonAxial, deltaEpsilonLateral }: Props) {
  const n = 16;
  const axial: { eps: number; sigma: number; serie: string }[] = [];
  const lateral: { eps: number; sigma: number; serie: string }[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    axial.push({
      eps: t * deltaEpsilonAxial,
      sigma: t * deltaSigmaMpa,
      serie: "σ vs ε_axial",
    });
    lateral.push({
      eps: t * deltaEpsilonLateral,
      sigma: t * deltaSigmaMpa,
      serie: "σ vs ε_lateral",
    });
  }

  return (
    <div className="w-full" style={{ minHeight: 280 }}>
      <p className="text-muted-foreground mb-2 text-xs">
        Porțiune liniară (0 → Δ): E ≈ Δσ/Δε_axial, ν ≈ −Δε_lateral/Δε_axial
      </p>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            type="number"
            dataKey="eps"
            name="ε"
            tick={{ fontSize: 11 }}
            label={{ value: "Deformație ε (—)", position: "bottom", offset: 0, style: { fontSize: 11 } }}
          />
          <YAxis
            type="number"
            dataKey="sigma"
            name="σ"
            tick={{ fontSize: 11 }}
            label={{ value: "σ (MPa)", angle: -90, position: "insideLeft", style: { fontSize: 11 } }}
          />
          <Tooltip
            formatter={(v) => {
              const n = typeof v === "number" ? v : Number(v);
              return [Number.isFinite(n) ? String(n) : "—", ""];
            }}
            labelFormatter={() => ""}
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            data={axial}
            type="monotone"
            dataKey="sigma"
            stroke="oklch(0.45 0.14 250)"
            name="σ vs ε_axial"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            data={lateral}
            type="monotone"
            dataKey="sigma"
            stroke="oklch(0.5 0.12 150)"
            name="σ vs ε_lateral"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-muted-foreground mt-1 text-[10px]">
        Notă: ambele curbe folosesc aceeași axă ε pentru simplitate; în raportul ASTM, ε_axial și ε_lateral
        pot fi reprezentate față de origine simetric (Fig. 1).
      </p>
    </div>
  );
}
