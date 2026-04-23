"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

export type MohrCircleInput = {
  id: string;
  label: string;
  sigma1Mpa: number;
  sigma3Mpa: number;
};

type Props = {
  circles: MohrCircleInput[];
  envelope?: { cMpa: number; phiDeg: number } | null;
};

function buildArc(center: number, r: number, steps = 48) {
  const arc: { sigma: number; tau: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (Math.PI * i) / steps;
    arc.push({ sigma: center + r * Math.cos(t), tau: r * Math.sin(t) });
  }
  return arc;
}

export function MohrMultiChart({ circles, envelope }: Props) {
  const palette = ["#2563eb", "#16a34a", "#dc2626", "#7c3aed", "#ea580c", "#0891b2"];
  const valid = circles.filter(
    (c) =>
      Number.isFinite(c.sigma1Mpa) &&
      Number.isFinite(c.sigma3Mpa) &&
      c.sigma1Mpa >= c.sigma3Mpa &&
      c.sigma3Mpa >= 0,
  );

  const arcs = valid.map((c) => {
    const center = (c.sigma1Mpa + c.sigma3Mpa) / 2;
    const r = (c.sigma1Mpa - c.sigma3Mpa) / 2;
    return { c, center, r, arc: buildArc(center, r) };
  });

  const minS = Math.min(...arcs.flatMap((a) => [a.c.sigma3Mpa, a.center - a.r])) - 2;
  const maxS = Math.max(...arcs.flatMap((a) => [a.c.sigma1Mpa, a.center + a.r])) + 2;
  const maxT = Math.max(...arcs.map((a) => a.r)) * 1.15 || 1;

  const envLine =
    envelope && Number.isFinite(envelope.cMpa) && Number.isFinite(envelope.phiDeg)
      ? [
          { sigma: minS, tau: envelope.cMpa + minS * Math.tan((envelope.phiDeg * Math.PI) / 180) },
          { sigma: maxS, tau: envelope.cMpa + maxS * Math.tan((envelope.phiDeg * Math.PI) / 180) },
        ]
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cercuri Mohr (τ–σ)</CardTitle>
        <CardDescription>
          Semicercuri τ ≥ 0 pentru toate încercările Triaxial Hoek ale aceleiași probe.
          {envelope && envLine
            ? ` Envelopă: τ = c + σ·tanφ (c=${envelope.cMpa.toFixed(2)} MPa, φ=${envelope.phiDeg.toFixed(1)}°).`
            : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {valid.length < 2 ? (
          <p className="text-muted-foreground text-sm">Ai nevoie de minim 2 încercări (σ₃ diferite) pentru o vedere comparativă.</p>
        ) : (
          <div className="w-full" style={{ minHeight: 300 }}>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
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
                    const pt = p?.[0]?.payload as { sigma?: number; tau?: number } | undefined;
                    return pt?.sigma != null ? `σ ${Number(pt.sigma).toFixed(2)} MPa` : "";
                  }}
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                />
                <Legend />
                {envLine ? (
                  <Line
                    data={envLine}
                    dataKey="tau"
                    name="Envelopă Mohr–Coulomb"
                    type="linear"
                    dot={false}
                    strokeWidth={2}
                    strokeDasharray="6 6"
                    isAnimationActive={false}
                  />
                ) : null}
                {arcs.map((a, idx) => (
                  <Line
                    key={a.c.id}
                    data={a.arc}
                    dataKey="tau"
                    name={`${a.c.label} (σ3=${a.c.sigma3Mpa.toFixed(2)} MPa)`}
                    type="monotone"
                    dot={false}
                    strokeWidth={2}
                    stroke={palette[idx % palette.length]}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

