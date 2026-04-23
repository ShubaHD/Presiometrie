/** Curbă P–ΔH pentru ISO 17892-7 (disp_mm = scurtare cumulativă, pozitivă). */

export interface UnconfinedSoilCurvePoint {
  t_s?: number | null;
  load_kn: number;
  disp_mm: number;
}

export interface UnconfinedSoilCurvePayload {
  version?: number;
  points: UnconfinedSoilCurvePoint[];
}

export const UNCONFINED_SOIL_STRAIN_LIMIT = 0.15;

/**
 * Poisson aproximativ pentru ε_V ≈ ε_ax(1−2ν) când nu există deformații radiale măsurate
 * (afisare inginereasca; nu inlocuieste masuratori volumetrice).
 */
export const UNCONFINED_SOIL_ASSUMED_POISSON_FOR_VOL_STRAIN = 0.35;

/** Rand din `stressStrainSeriesKpa` (serie filtrata pentru σ–ε). */
export type UnconfinedSoilStressStrainSeriesRow = {
  t_s: number | null;
  strain: number;
  stress_kpa: number;
  load_kn_net: number;
  disp_mm: number;
  /** ε_V ≈ ε_ax(1−2ν), ν = UNCONFINED_SOIL_ASSUMED_POISSON_FOR_VOL_STRAIN */
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

export function clampUnconfinedSoilCurveForStorage(
  payload: UnconfinedSoilCurvePayload,
  maxPoints = 25000,
): UnconfinedSoilCurvePayload {
  if (payload.points.length <= maxPoints) return payload;
  return { ...payload, points: payload.points.slice(0, maxPoints) };
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

export type UniframeDispSource = "first_mm" | "crosshead";

export function looksLikeUniframeControlsTab(firstLine: string): boolean {
  const s = firstLine.trim();
  if (!s.includes("\t")) return false;
  const lower = s.toLowerCase();
  if (!lower.includes("crosshead") && !/=\s*ch\s*\d/i.test(s)) return false;
  if (!/\d+\s*=\s*/.test(s)) return false;
  return true;
}

/**
 * Parse export Uniframe/Controls: rând 1 mapare canale, rând 2 Nr/Time/1/2/3, rând 3 unități, apoi date, -END-.
 */
export function parseUniframeControlsExport(
  text: string,
  options: { dispSource: UniframeDispSource },
): { points: UnconfinedSoilCurvePoint[]; warnings: string[] } {
  const warnings: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 4) {
    return { points: [], warnings: ["Fișier prea scurt."] };
  }

  const unitLineIdx = lines.findIndex((l, i) => i >= 2 && /\bsec\b/i.test(l) && /\bkN\b/i.test(l));
  const dataStart = unitLineIdx >= 0 ? unitLineIdx + 1 : 3;
  const points: UnconfinedSoilCurvePoint[] = [];

  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === "-END-" || line.startsWith("-END-")) break;
    const parts = line.split("\t").map((x) => x.trim());
    if (parts.length < 5) continue;
    const t = Number(parts[1]!.replace(",", "."));
    const loadKn = Number(parts[2]!.replace(",", "."));
    const mm1 = Number(parts[3]!.replace(",", "."));
    const mm2 = Number(parts[4]!.replace(",", "."));
    if (!Number.isFinite(t) || !Number.isFinite(loadKn)) continue;
    const dispRaw = options.dispSource === "crosshead" ? mm2 : mm1;
    if (!Number.isFinite(dispRaw)) continue;
    points.push({ t_s: t, load_kn: loadKn, disp_mm: dispRaw });
  }

  if (points.length === 0) {
    warnings.push("Nu s-au găsit puncte valide.");
    return { points, warnings };
  }

  const d0 = points[0]!.disp_mm;
  for (const p of points) {
    p.disp_mm = p.disp_mm - d0;
  }

  return { points, warnings };
}

export function normalizeUnconfinedSoilMode(v: unknown): "basic" | "instrumented" {
  return v === "instrumented" ? "instrumented" : "basic";
}
