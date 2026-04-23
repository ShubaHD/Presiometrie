import type { PresiometryCurvePayload, PresiometryXKind } from "@/lib/presiometry-curve";

export type PVPoint = { p_kpa: number; x: number; x_kind: PresiometryXKind; t_s?: number };

export function extractPvPoints(curve: PresiometryCurvePayload | null): PVPoint[] {
  if (!curve?.points?.length) return [];
  const x_kind: PresiometryXKind = curve.x_kind === "radius_mm" ? "radius_mm" : "volume_cm3";
  const pts = curve.points
    .map((p) => {
      const p_kpa = typeof p.p_kpa === "number" ? p.p_kpa : Number(p.p_kpa);
      const t_s = p.t_s == null ? undefined : (typeof p.t_s === "number" ? p.t_s : Number(p.t_s));
      const x =
        x_kind === "radius_mm"
          ? typeof p.r_mm === "number"
            ? p.r_mm
            : p.r_mm != null
              ? Number(p.r_mm)
              : typeof p.v_cm3 === "number"
                ? p.v_cm3
                : Number(p.v_cm3)
          : typeof p.v_cm3 === "number"
            ? p.v_cm3
            : Number(p.v_cm3);
      return { p_kpa, x, x_kind, t_s };
    })
    .filter((p) => Number.isFinite(p.p_kpa) && Number.isFinite(p.x));

  const hasTime = pts.some((p) => p.t_s != null && Number.isFinite(p.t_s));
  if (!hasTime) return pts;

  return [...pts].sort((a, b) => (a.t_s ?? 0) - (b.t_s ?? 0));
}

export type LoopWindow = {
  /** Indices in the original `pts` array. */
  peakIndex: number;
  valleyIndex: number;
  nextPeakIndex: number;
};

/**
 * Bucle = secvență încărcare → descărcare → reîncărcare în **presiune**.
 * Fără filtre, zgomotul pas-cu-pas (Δp mic) creează multe triplete +/−/+ false.
 */
export function detectLoopsByPressure(pts: PVPoint[]): LoopWindow[] {
  if (pts.length < 5) return [];

  let pMin = Infinity;
  let pMax = -Infinity;
  for (const p of pts) {
    if (!Number.isFinite(p.p_kpa)) continue;
    pMin = Math.min(pMin, p.p_kpa);
    pMax = Math.max(pMax, p.p_kpa);
  }
  if (!Number.isFinite(pMin) || !Number.isFinite(pMax) || !(pMax > pMin)) return [];
  const span = pMax - pMin;
  /** Δp sub acest prag nu schimbă „sensul” (plateu / zgomot digitizare). */
  const stepTolKpa = Math.max(20, span * 0.0012);
  /** Amplitudine minimă descărcare și reîncărcare față de vale ca bucla să fie fizică. */
  const excursionMinKpa = Math.max(80, span * 0.007);

  const dir: Array<-1 | 0 | 1> = [];
  for (let i = 1; i < pts.length; i++) {
    const dp = pts[i]!.p_kpa - pts[i - 1]!.p_kpa;
    if (!Number.isFinite(dp) || Math.abs(dp) <= stepTolKpa) dir.push(0);
    else dir.push(dp > 0 ? 1 : -1);
  }

  // Reduce runs of direction ignoring zeros
  const runs: Array<{ d: -1 | 1; from: number; to: number }> = [];
  let i = 0;
  while (i < dir.length) {
    while (i < dir.length && dir[i] === 0) i++;
    if (i >= dir.length) break;
    const d = dir[i] as -1 | 1;
    const from = i;
    let to = i;
    while (to + 1 < dir.length && (dir[to + 1] === d || dir[to + 1] === 0)) to++;
    runs.push({ d, from, to });
    i = to + 1;
  }

  const loops: LoopWindow[] = [];
  for (let r = 0; r + 2 < runs.length; r++) {
    const a = runs[r]!;
    const b = runs[r + 1]!;
    const c = runs[r + 2]!;
    if (!(a.d === 1 && b.d === -1 && c.d === 1)) continue;

    const peakIndex = a.to + 1; // transition point index in pts
    const valleyIndex = b.to + 1;
    const nextPeakIndex = c.to + 1;

    if (
      peakIndex <= 0 ||
      valleyIndex <= peakIndex ||
      nextPeakIndex <= valleyIndex ||
      nextPeakIndex >= pts.length
    )
      continue;

    if (valleyIndex - peakIndex < 2 || nextPeakIndex - valleyIndex < 2) continue;

    const pk = pts[peakIndex]!.p_kpa;
    const vl = pts[valleyIndex]!.p_kpa;
    const nx = pts[nextPeakIndex]!.p_kpa;
    if (!Number.isFinite(pk) || !Number.isFinite(vl) || !Number.isFinite(nx)) continue;
    const unloadDp = pk - vl;
    const reloadDp = nx - vl;
    if (unloadDp < excursionMinKpa || reloadDp < excursionMinKpa) continue;

    loops.push({ peakIndex, valleyIndex, nextPeakIndex });
  }

  // Deduplicate overlapping windows (keep earliest)
  const out: LoopWindow[] = [];
  for (const w of loops) {
    const prev = out[out.length - 1];
    if (!prev) out.push(w);
    else if (w.peakIndex === prev.peakIndex && w.valleyIndex === prev.valleyIndex) continue;
    else out.push(w);
  }
  return out;
}

export type Regression = { slope: number | null; intercept: number | null; r2: number | null; n: number };

export function linearRegressionYonX(xs: number[], ys: number[]): Regression {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return { slope: null, intercept: null, r2: null, n };
  let sx = 0,
    sy = 0,
    sxx = 0,
    sxy = 0,
    syy = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i]!;
    const y = ys[i]!;
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
    syy += y * y;
  }
  const den = n * sxx - sx * sx;
  if (Math.abs(den) < 1e-12) return { slope: null, intercept: null, r2: null, n };
  const slope = (n * sxy - sx * sy) / den;
  const intercept = (sy - slope * sx) / n;
  const numR = n * sxy - sx * sy;
  const denR = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
  const r = denR > 0 ? numR / denR : 0;
  const r2 = Number.isFinite(r) ? Math.max(0, Math.min(1, r * r)) : null;
  return { slope, intercept, r2, n };
}

export function pickPointsInPressureWindow(
  pts: PVPoint[],
  fromInclusive: number,
  toInclusive: number,
  pLow: number,
  pHigh: number,
): { xsV: number[]; ysP: number[] } {
  const xsV: number[] = [];
  const ysP: number[] = [];
  const lo = Math.min(pLow, pHigh);
  const hi = Math.max(pLow, pHigh);
  for (let i = fromInclusive; i <= toInclusive && i < pts.length; i++) {
    const p = pts[i]!.p_kpa;
    const v = pts[i]!.x;
    if (!Number.isFinite(p) || !Number.isFinite(v)) continue;
    if (p < lo || p > hi) continue;
    xsV.push(v);
    ysP.push(p);
  }
  return { xsV, ysP };
}

/** Ca `pickPointsInPressureWindow`, plus primul/ultimul index din serie incluși în fereastră (pentru UI). */
export function pickPointsInPressureWindowWithIndices(
  pts: PVPoint[],
  fromInclusive: number,
  toInclusive: number,
  pLow: number,
  pHigh: number,
): { xsV: number[]; ysP: number[]; indexFrom: number | null; indexTo: number | null } {
  const xsV: number[] = [];
  const ysP: number[] = [];
  let indexFrom: number | null = null;
  let indexTo: number | null = null;
  const lo = Math.min(pLow, pHigh);
  const hi = Math.max(pLow, pHigh);
  for (let i = fromInclusive; i <= toInclusive && i < pts.length; i++) {
    const p = pts[i]!.p_kpa;
    const v = pts[i]!.x;
    if (!Number.isFinite(p) || !Number.isFinite(v)) continue;
    if (p < lo || p > hi) continue;
    if (indexFrom == null) indexFrom = i;
    indexTo = i;
    xsV.push(v);
    ysP.push(p);
  }
  return { xsV, ysP, indexFrom, indexTo };
}

export function xAxisLabel(kind: PresiometryXKind): { label: string; unit: string; keySuffix: string } {
  return kind === "radius_mm"
    ? { label: "R", unit: "mm", keySuffix: "mpa_per_mm" }
    : { label: "V", unit: "cm³", keySuffix: "mpa_per_cm3" };
}

export function pWindow3070(pMin: number, pMax: number): { p30: number; p70: number } | null {
  if (!Number.isFinite(pMin) || !Number.isFinite(pMax)) return null;
  const lo = Math.min(pMin, pMax);
  const hi = Math.max(pMin, pMax);
  const dp = hi - lo;
  if (!(dp > 0)) return null;
  return { p30: lo + 0.3 * dp, p70: lo + 0.7 * dp };
}

