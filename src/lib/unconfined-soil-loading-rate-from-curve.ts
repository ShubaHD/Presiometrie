import type { UnconfinedSoilCurvePoint } from "./unconfined-soil-curve";

function fmtRoFixed(n: number, decimals: number): string {
  return n.toFixed(decimals).replace(".", ",");
}

/**
 * Rată medie între primul și ultimul punct cu timp valid (sec) pe curbă:
 * v_mm/min = Δdisp_mm / Δt · 60 ;  ε̇_%/min = (Δdisp_mm / H₀) / Δt · 60 · 100.
 */
export function estimateUnconfinedSoilLoadingRatesFromCurve(
  points: readonly UnconfinedSoilCurvePoint[],
  heightMm: number,
): {
  ok: boolean;
  compression_rate_line: string | null;
  strain_pct_per_min_line: string | null;
  messages: string[];
} {
  const messages: string[] = [];
  if (!Number.isFinite(heightMm) || heightMm <= 0) {
    messages.push("Setați H₀ (height_mm) în tabul Măsurători.");
    return { ok: false, compression_rate_line: null, strain_pct_per_min_line: null, messages };
  }
  const timed = points.filter(
    (p): p is UnconfinedSoilCurvePoint & { t_s: number } =>
      p.t_s != null && Number.isFinite(p.t_s) && Number.isFinite(p.disp_mm),
  );
  if (timed.length < 2) {
    messages.push(
      "În curbă trebuie timp (Time, sec) pe cel puțin 2 rânduri — tipic din export Uniframe/Controls.",
    );
    return { ok: false, compression_rate_line: null, strain_pct_per_min_line: null, messages };
  }
  timed.sort((a, b) => a.t_s - b.t_s);
  const p0 = timed[0]!;
  const p1 = timed[timed.length - 1]!;
  const dt = p1.t_s - p0.t_s;
  if (!(dt > 0)) {
    messages.push("Timpul din curbă nu crește (t_final ≤ t_inițial).");
    return { ok: false, compression_rate_line: null, strain_pct_per_min_line: null, messages };
  }
  const ddisp = p1.disp_mm - p0.disp_mm;
  const mmPerMin = (ddisp / dt) * 60;
  const strainPctPerMin = (ddisp / heightMm / dt) * 60 * 100;
  if (ddisp < 0) {
    messages.push(
      "Deplasarea cumulativă scade pe interval — verificați sursa deplasării la import (First_mm vs Crosshead).",
    );
  }
  const absMm = Math.abs(mmPerMin);
  const absStrain = Math.abs(strainPctPerMin);
  messages.push("Estimare: medie între primul și ultimul punct cu timp pe curbă.");
  return {
    ok: true,
    compression_rate_line: `${fmtRoFixed(absMm, 2)} mm/min`,
    strain_pct_per_min_line: `${fmtRoFixed(absStrain, 2)} %/min`,
    messages,
  };
}
