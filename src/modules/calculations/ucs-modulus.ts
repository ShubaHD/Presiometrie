import type { UcsCurvePoint } from "@/lib/ucs-instrumentation";
import type { UcsModulusSettings } from "@/lib/ucs-instrumentation";

export interface LinearFit {
  slope: number;
  intercept: number;
  r2: number;
}

/** Regresie liniară y ~ a + b x (x = ε, y = σ); panta = modul în MPa. */
export function linearRegression(xs: number[], ys: number[]): LinearFit | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i]!;
    sy += ys[i]!;
  }
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx < 1e-18) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r2 = syy > 1e-18 ? (sxy * sxy) / (sxx * syy) : 0;
  return { slope, intercept, r2: Math.min(1, Math.max(0, r2)) };
}

function argmax(arr: number[]): number {
  let j = 0;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i]! > arr[j]!) j = i;
  }
  return j;
}

function nearlyMonotonicInc(xs: number[], tol: number): boolean {
  for (let i = 1; i < xs.length; i++) {
    if (xs[i]! < xs[i - 1]! - tol) return false;
  }
  return true;
}

/**
 * Fereastră liniară pe ramura de încărcare (până la vârf σ).
 * Caută fereastra cu R² maxim peste prag, pantă pozitivă.
 */
export function autoLoadingLinearWindow(points: UcsCurvePoint[]): {
  i0: number;
  i1: number;
  r2: number;
  eMpa: number;
} | null {
  const stress = points.map((p) => p.stress_mpa);
  const strain = points.map((p) => p.strain_axial);
  const iPeak = argmax(stress);
  const n = iPeak + 1;
  if (n < 8) return null;
  const minW = Math.max(5, Math.floor(n * 0.03));
  const maxW = Math.min(120, Math.floor(n * 0.4));
  let best: { i0: number; i1: number; r2: number; eMpa: number } | null = null;
  const strainTol = Math.max(1e-9, (strain[iPeak]! - strain[0]!) * 1e-6);
  for (let w = minW; w <= maxW; w++) {
    for (let i = 0; i + w <= n; i++) {
      const xs = strain.slice(i, i + w);
      const ys = stress.slice(i, i + w);
      if (!nearlyMonotonicInc(xs, strainTol)) continue;
      const fit = linearRegression(xs, ys);
      if (!fit || fit.r2 < 0.985 || fit.slope <= 0) continue;
      if (!best || fit.r2 > best.r2) {
        best = { i0: i, i1: i + w - 1, r2: fit.r2, eMpa: fit.slope };
      }
    }
  }
  return best;
}

/** Fallback: 15%–55% din indicii 0..iPeak. */
export function fallbackLoadingWindow(iPeak: number): { i0: number; i1: number } {
  const n = iPeak + 1;
  const i0 = Math.max(0, Math.floor(n * 0.15));
  const i1 = Math.max(i0 + 3, Math.floor(n * 0.55));
  return { i0, i1: Math.min(iPeak, i1) };
}

export function findUnloadingSegments(stress: number[], iPeak: number): Array<{ lo: number; hi: number }> {
  const out: Array<{ lo: number; hi: number }> = [];
  if (iPeak >= stress.length - 1) return out;
  let lo = iPeak;
  for (let k = iPeak + 1; k < stress.length; k++) {
    if (stress[k]! < stress[k - 1]!) continue;
    if (k - 1 > lo && k - 1 - lo >= 3) out.push({ lo, hi: k - 1 });
    lo = k;
  }
  if (stress.length - 1 > lo && stress.length - 1 - lo >= 3) {
    out.push({ lo, hi: stress.length - 1 });
  }
  return out;
}

export function modulusFromInterval(
  points: UcsCurvePoint[],
  i0: number,
  i1: number,
  opts?: { allowUnloadingSlope?: boolean },
): { eMpa: number; r2: number } | null {
  const lo = Math.max(0, Math.min(i0, i1));
  const hi = Math.min(points.length - 1, Math.max(i0, i1));
  if (hi - lo < 2) return null;
  const xs = points.slice(lo, hi + 1).map((p) => p.strain_axial);
  const ys = points.slice(lo, hi + 1).map((p) => p.stress_mpa);
  const fit = linearRegression(xs, ys);
  if (!fit) return null;
  if (fit.slope > 0) return { eMpa: fit.slope, r2: fit.r2 };
  if (opts?.allowUnloadingSlope && fit.slope < 0) {
    return { eMpa: -fit.slope, r2: fit.r2 };
  }
  return null;
}

export function secantModulusMpa(points: UcsCurvePoint[], i0: number, i1: number): number | null {
  const lo = Math.max(0, Math.min(i0, i1));
  const hi = Math.min(points.length - 1, Math.max(i0, i1));
  if (lo === hi) return null;
  const e0 = points[lo]!.strain_axial;
  const e1 = points[hi]!.strain_axial;
  const s0 = points[lo]!.stress_mpa;
  const s1 = points[hi]!.stress_mpa;
  const de = e1 - e0;
  if (Math.abs(de) < 1e-12) return null;
  const v = (s1 - s0) / de;
  return v > 0 ? v : null;
}

export function tangentModulusMpa(
  points: UcsCurvePoint[],
  center: number,
  halfWindow: number,
): { eMpa: number; r2: number; i0: number; i1: number } | null {
  const c = Math.max(0, Math.min(points.length - 1, Math.floor(center)));
  const h = Math.max(2, halfWindow);
  const i0 = Math.max(0, c - h);
  const i1 = Math.min(points.length - 1, c + h);
  const m = modulusFromInterval(points, i0, i1, { allowUnloadingSlope: true });
  if (!m) return null;
  return { ...m, i0, i1 };
}

export interface ModulusSolveResult {
  eMpa: number;
  r2: number | null;
  i0: number;
  i1: number;
  method: UcsModulusSettings["method"];
  auto: boolean;
}

export function solveYoungModulusMpa(
  points: UcsCurvePoint[],
  settings: UcsModulusSettings,
): ModulusSolveResult | null {
  const stress = points.map((p) => p.stress_mpa);
  const iPeak = argmax(stress);
  const auto = settings.auto_interval !== false;

  if (settings.method === "secant") {
    if (auto) {
      const fb = fallbackLoadingWindow(iPeak);
      const v = secantModulusMpa(points, fb.i0, fb.i1);
      if (v === null) return null;
      return { eMpa: v, r2: null, i0: fb.i0, i1: fb.i1, method: "secant", auto: true };
    }
    const a = settings.index_from ?? 0;
    const b = settings.index_to ?? Math.min(points.length - 1, iPeak);
    const v = secantModulusMpa(points, a, b);
    if (v === null) return null;
    return { eMpa: v, r2: null, i0: Math.min(a, b), i1: Math.max(a, b), method: "secant", auto: false };
  }

  if (settings.method === "tangent") {
    const c =
      settings.index_center !== undefined
        ? settings.index_center
        : Math.floor(iPeak * 0.35);
    const hw = settings.window_half ?? 10;
    const t = tangentModulusMpa(points, c, hw);
    if (!t) return null;
    return {
      eMpa: t.eMpa,
      r2: t.r2,
      i0: t.i0,
      i1: t.i1,
      method: "tangent",
      auto: settings.index_center === undefined,
    };
  }

  if (settings.method === "unloading") {
    const segs = findUnloadingSegments(stress, iPeak);
    const idx = Math.min(settings.unloading_segment_index ?? 0, Math.max(0, segs.length - 1));
    if (segs.length === 0) return null;
    const { lo, hi } = segs[idx]!;
    const m = modulusFromInterval(points, lo, hi, { allowUnloadingSlope: true });
    if (!m) return null;
    return { eMpa: m.eMpa, r2: m.r2, i0: lo, i1: hi, method: "unloading", auto: true };
  }

  // loading_linear
  if (auto) {
    const w = autoLoadingLinearWindow(points);
    if (w) {
      return {
        eMpa: w.eMpa,
        r2: w.r2,
        i0: w.i0,
        i1: w.i1,
        method: "loading_linear",
        auto: true,
      };
    }
    const fb = fallbackLoadingWindow(iPeak);
    const m = modulusFromInterval(points, fb.i0, fb.i1);
    if (!m) return null;
    return {
      eMpa: m.eMpa,
      r2: m.r2,
      i0: fb.i0,
      i1: fb.i1,
      method: "loading_linear",
      auto: true,
    };
  }

  const a = settings.index_from ?? 0;
  const b = settings.index_to ?? iPeak;
  const m = modulusFromInterval(points, a, b);
  if (!m) return null;
  return {
    eMpa: m.eMpa,
    r2: m.r2,
    i0: Math.min(a, b),
    i1: Math.max(a, b),
    method: "loading_linear",
    auto: false,
  };
}

export function suggestPoissonFlatCutoffIndex(
  points: UcsCurvePoint[],
  i0: number,
  i1: number,
): number | null {
  const lo = Math.max(0, Math.min(i0, i1));
  const hi = Math.min(points.length - 1, Math.max(i0, i1));
  if (hi - lo < 25) return null;

  const get = (p: UcsCurvePoint) => {
    const v = p.strain_ch8;
    if (v != null && Number.isFinite(v)) return v;
    const vr = p.strain_radial;
    if (vr != null && Number.isFinite(vr)) return vr;
    return null;
  };

  // Estimate dynamic range in interval for tolerance scaling
  let minV = Infinity;
  let maxV = -Infinity;
  for (let k = lo; k <= hi; k++) {
    const v = get(points[k]!);
    if (v == null) continue;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  if (!Number.isFinite(minV) || !Number.isFinite(maxV)) return null;
  const range = Math.max(0, maxV - minV);
  const tol = Math.max(1e-12, range * 1e-6);
  const runNeed = 25;

  let prev: number | null = null;
  let run = 0;
  for (let k = lo; k <= hi; k++) {
    const v = get(points[k]!);
    if (v == null) {
      prev = null;
      run = 0;
      continue;
    }
    if (prev !== null && Math.abs(v - prev) <= tol) run++;
    else run = 0;
    prev = v;
    if (run >= runNeed) {
      // cutoff start index (first index of long flat run)
      return Math.max(lo, k - runNeed);
    }
  }
  return null;
}

/** Poisson din același interval: medie ν = ε_rad / ε_ax (ambele pozitive tipic la compresiune / dilatare laterală). */
export function poissonFromInterval(
  points: UcsCurvePoint[],
  i0: number,
  i1: number,
): number | null {
  const lo = Math.max(0, Math.min(i0, i1));
  const hi = Math.min(points.length - 1, Math.max(i0, i1));
  let sra = 0;
  let ssa = 0;
  let n = 0;
  for (let k = lo; k <= hi; k++) {
    const p = points[k]!;
    const er = p.strain_radial;
    if (er === null || er === undefined || !Number.isFinite(er)) return null;
    sra += er;
    ssa += p.strain_axial;
    n++;
  }
  if (n < 2 || Math.abs(ssa) < 1e-12) return null;
  const nu = sra / ssa;
  return Number.isFinite(nu) ? nu : null;
}
