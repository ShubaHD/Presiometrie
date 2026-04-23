/** Curbă P–ΔH pentru ISO 17892-7 (report-service, fără dependență de web). */

export interface UnconfinedSoilCurvePoint {
  t_s?: number | null;
  load_kn: number;
  disp_mm: number;
}

export interface UnconfinedSoilCurvePayload {
  version?: number;
  points: UnconfinedSoilCurvePoint[];
}

/** ν aproximativ pentru ε_V ≈ ε_ax(1−2ν) fără ε_radial măsurat. */
export const UNCONFINED_SOIL_ASSUMED_POISSON_FOR_VOL_STRAIN = 0.35;

export type UnconfinedSoilStressStrainSeriesRow = {
  t_s: number | null;
  strain: number;
  stress_kpa: number;
  load_kn_net: number;
  disp_mm: number;
  strain_vol_approx: number;
};

export function parseUnconfinedSoilCurvePayload(raw: unknown): UnconfinedSoilCurvePayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const pts = o.points;
  if (!Array.isArray(pts) || pts.length === 0) return null;
  const points: UnconfinedSoilCurvePoint[] = [];
  for (const p of pts) {
    if (!p || typeof p !== "object") continue;
    const r = p as Record<string, unknown>;
    const load = Number(r.load_kn);
    const disp = Number(r.disp_mm);
    if (!Number.isFinite(load) || !Number.isFinite(disp)) continue;
    const tRaw = r.t_s;
    const tr = tRaw === null || tRaw === undefined || tRaw === "" ? null : Number(tRaw);
    points.push({
      t_s: tr !== null && Number.isFinite(tr) ? tr : null,
      load_kn: load,
      disp_mm: disp,
    });
  }
  return points.length > 0
    ? { version: typeof o.version === "number" ? o.version : 1, points }
    : null;
}

/** ε axial și σ_v (kPa) din serie brută (+ disp, ε_V aprox.). */
export function stressStrainSeriesKpa(
  heightMm: number,
  areaMm2: number,
  points: UnconfinedSoilCurvePoint[],
  baselineKn: number,
): UnconfinedSoilStressStrainSeriesRow[] {
  if (heightMm <= 0 || areaMm2 <= 0) return [];
  const hi = heightMm;
  const aiM2 = areaMm2 * 1e-6;
  const nu = UNCONFINED_SOIL_ASSUMED_POISSON_FOR_VOL_STRAIN;
  const out: UnconfinedSoilStressStrainSeriesRow[] = [];
  for (const p of points) {
    const eps = p.disp_mm / hi;
    if (!Number.isFinite(eps) || eps < 0) continue;
    if (eps >= 1 - 1e-9) continue;
    const pNet = p.load_kn - baselineKn;
    if (!Number.isFinite(pNet)) continue;
    const denom = aiM2 / (1 - eps);
    if (denom <= 0) continue;
    const sigmaKpa = pNet / denom;
    const strainVolApprox = eps * (1 - 2 * nu);
    out.push({
      t_s: p.t_s ?? null,
      strain: eps,
      stress_kpa: sigmaKpa,
      load_kn_net: pNet,
      disp_mm: p.disp_mm,
      strain_vol_approx: strainVolApprox,
    });
  }
  return out;
}
