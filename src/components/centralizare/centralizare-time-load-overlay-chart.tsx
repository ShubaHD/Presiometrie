"use client";

import type { CentralizatorTimeLoadSeries } from "@/lib/centralizator/time-load-overlay";
import { useMemo } from "react";
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

const COLORS = [
  "oklch(0.42 0.14 145)",
  "oklch(0.45 0.14 250)",
  "oklch(0.5 0.16 35)",
  "oklch(0.48 0.12 300)",
  "oklch(0.4 0.1 200)",
  "oklch(0.52 0.08 145)",
  "oklch(0.38 0.12 85)",
  "oklch(0.46 0.18 25)",
];

export function CentralizareTimeLoadOverlayChart({ series }: { series: CentralizatorTimeLoadSeries[] }) {
  const { tMin, tMax, fMin, fMax } = useMemo(() => {
    let tLo = Infinity;
    let tHi = -Infinity;
    let fLo = Infinity;
    let fHi = -Infinity;
    for (const s of series) {
      for (const p of s.points) {
        tLo = Math.min(tLo, p.t);
        tHi = Math.max(tHi, p.t);
        fLo = Math.min(fLo, p.load);
        fHi = Math.max(fHi, p.load);
      }
    }
    if (!Number.isFinite(tLo)) {
      return { tMin: 0, tMax: 1, fMin: 0, fMax: 1 };
    }
    const padT = (tHi - tLo) * 0.02 || 0.5;
    const padF = (fHi - fLo) * 0.06 || 0.05;
    return {
      tMin: tLo - padT,
      tMax: tHi + padT,
      fMin: Math.min(0, fLo - padF),
      fMax: fHi + padF,
    };
  }, [series]);

  if (series.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Nu există serii timp–sarcină (UCS / Young cu curbă stocată și cel puțin două puncte valide).
      </p>
    );
  }

  return (
    <div className="w-full space-y-2" style={{ minHeight: 320 }}>
      <p className="text-muted-foreground text-xs">
        UCS: forța urmează setarea „scade așezarea” din măsurători, când e completată (ca în pagina testului).
        Young: forță din curbă. Timpul este cel al înregistrării pentru fiecare test (origine la începutul seriei).
      </p>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart margin={{ top: 8, right: 16, left: 4, bottom: 8 }} data={[]}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            type="number"
            dataKey="t"
            domain={[tMin, tMax]}
            tick={{ fontSize: 10 }}
            label={{ value: "t (s)", position: "insideBottom", offset: -2, style: { fontSize: 11 } }}
          />
          <YAxis
            type="number"
            domain={[fMin, fMax]}
            tick={{ fontSize: 10 }}
            label={{ value: "F (kN)", angle: -90, position: "insideLeft", style: { fontSize: 11 } }}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0] as { name?: string; payload?: { t?: number; load?: number } };
              const pt = row.payload;
              const name = row.name ?? "Serie";
              if (!pt || typeof pt.t !== "number" || typeof pt.load !== "number") return null;
              return (
                <div className="bg-background border-border rounded-md border px-2 py-1.5 text-xs shadow-md">
                  <p className="font-medium">{name}</p>
                  <p className="text-muted-foreground mt-0.5">
                    t = {pt.t.toFixed(3)} s · F = {pt.load.toFixed(4)} kN
                  </p>
                </div>
              );
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, maxHeight: 100, overflowY: "auto" }}
            verticalAlign="top"
            align="left"
            height={72}
          />
          {series.map((s, i) => (
            <Line
              key={s.test_id}
              data={s.points}
              type="monotone"
              dataKey="load"
              name={s.label}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={1.6}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
