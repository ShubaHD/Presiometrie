"use client";

import type { UnconfinedSoilStressStrainSeriesRow } from "@/lib/unconfined-soil-curve";
import { UNCONFINED_SOIL_ASSUMED_POISSON_FOR_VOL_STRAIN } from "@/lib/unconfined-soil-curve";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function rowsToSigmaEpsilon(rows: UnconfinedSoilStressStrainSeriesRow[]) {
  return rows.map((r) => ({
    epsPct: r.strain * 100,
    sigmaKpa: r.stress_kpa,
  }));
}

function rowsToTimeDual(rows: UnconfinedSoilStressStrainSeriesRow[]) {
  return rows
    .filter((r) => r.t_s != null && Number.isFinite(r.t_s))
    .map((r) => ({
      t: r.t_s as number,
      epsPct: r.strain * 100,
      dispMm: r.disp_mm,
    }));
}

function rowsToSigmaVol(rows: UnconfinedSoilStressStrainSeriesRow[]) {
  return rows.map((r) => ({
    epsVolPct: r.strain_vol_approx * 100,
    sigmaKpa: r.stress_kpa,
  }));
}

export function UnconfinedSoilInstrumentedChartsPanel(props: { rows: UnconfinedSoilStressStrainSeriesRow[] }) {
  const { rows } = props;
  const se = rowsToSigmaEpsilon(rows);
  const td = rowsToTimeDual(rows);
  const sv = rowsToSigmaVol(rows);
  const nu = UNCONFINED_SOIL_ASSUMED_POISSON_FOR_VOL_STRAIN;

  if (se.length < 2) {
    return <p className="text-muted-foreground text-sm">Prea puține puncte pentru grafice (verificați H, A și curba).</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-sm font-medium">Grafic principal: σ – ε (tensiune vs. deformație)</p>
        <div className="w-full" style={{ minHeight: 280 }}>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={se} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                type="number"
                dataKey="epsPct"
                tick={{ fontSize: 11 }}
                label={{ value: "ε (%)", position: "bottom", offset: 0, style: { fontSize: 11 } }}
              />
              <YAxis
                type="number"
                dataKey="sigmaKpa"
                tick={{ fontSize: 11 }}
                label={{ value: "σ (kPa)", angle: -90, position: "insideLeft", style: { fontSize: 11 } }}
              />
              <Tooltip
                formatter={(v, name) => {
                  const n = typeof v === "number" ? v : Number(v);
                  const lab = name === "sigmaKpa" ? "σ (kPa)" : "ε (%)";
                  return [Number.isFinite(n) ? n.toFixed(name === "sigmaKpa" ? 0 : 2) : "—", lab];
                }}
                contentStyle={{ borderRadius: 8, fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="sigmaKpa"
                stroke="oklch(0.42 0.12 160)"
                name="σ (kPa)"
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {td.length >= 2 ? (
        <div>
          <p className="mb-2 text-sm font-medium">ε – timp și deplasare (ΔH) – timp</p>
          <div className="w-full" style={{ minHeight: 300 }}>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={td} margin={{ top: 8, right: 48, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  type="number"
                  dataKey="t"
                  tick={{ fontSize: 11 }}
                  label={{ value: "t (s)", position: "bottom", offset: 0, style: { fontSize: 11 } }}
                />
                <YAxis
                  yAxisId="left"
                  type="number"
                  dataKey="epsPct"
                  tick={{ fontSize: 11 }}
                  label={{ value: "ε (%)", angle: -90, position: "insideLeft", style: { fontSize: 11 } }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  type="number"
                  dataKey="dispMm"
                  tick={{ fontSize: 11 }}
                  label={{ value: "ΔH (mm)", angle: 90, position: "insideRight", style: { fontSize: 11 } }}
                />
                <Tooltip
                  formatter={(v, name) => {
                    const n = typeof v === "number" ? v : Number(v);
                    if (name === "epsPct") return [Number.isFinite(n) ? n.toFixed(2) : "—", "ε (%)"];
                    if (name === "dispMm") return [Number.isFinite(n) ? n.toFixed(3) : "—", "ΔH (mm)"];
                    return [String(v), String(name)];
                  }}
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="epsPct"
                  stroke="oklch(0.42 0.14 145)"
                  name="ε (%)"
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="dispMm"
                  stroke="oklch(0.45 0.14 300)"
                  name="ΔH (mm)"
                  dot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">Lipsește timpul t pe curbă — graficul ε/ΔH–t nu poate fi afișat.</p>
      )}

      {sv.length >= 2 ? (
        <div>
          <p className="mb-2 text-sm font-medium">σ – ε volumetrică (aprox.)</p>
          <p className="text-muted-foreground mb-2 text-xs">
            ε_V ≈ ε_ax(1 − 2ν), ν = {nu.toFixed(2)} — fără deformații radiale măsurate; orientativ.
          </p>
          <div className="w-full" style={{ minHeight: 280 }}>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={sv} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  type="number"
                  dataKey="epsVolPct"
                  tick={{ fontSize: 11 }}
                  label={{ value: "ε_V,aprox (%)", position: "bottom", offset: 0, style: { fontSize: 11 } }}
                />
                <YAxis
                  type="number"
                  dataKey="sigmaKpa"
                  tick={{ fontSize: 11 }}
                  label={{ value: "σ (kPa)", angle: -90, position: "insideLeft", style: { fontSize: 11 } }}
                />
                <Tooltip
                  formatter={(v, name) => {
                    const n = typeof v === "number" ? v : Number(v);
                    const lab = name === "sigmaKpa" ? "σ (kPa)" : "ε_V,aprox (%)";
                    return [Number.isFinite(n) ? n.toFixed(name === "sigmaKpa" ? 0 : 2) : "—", lab];
                  }}
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="sigmaKpa"
                  stroke="oklch(0.48 0.16 290)"
                  name="σ (kPa)"
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
