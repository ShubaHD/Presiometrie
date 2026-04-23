import type { PresiometryManualSettings } from "./presiometry-manual";
import type { LoopWindow, PVPoint, Regression } from "./presiometry-utils";
import {
  linearRegressionYonX,
  pWindow3070,
  pickPointsInPressureWindowWithIndices,
} from "./presiometry-utils";

export type PresiometryRegressionSegment = {
  /** Etichetă tip standard: G_L1, G_U1, G_R1, … */
  symbol: string;
  source: "manual" | "auto3070";
  regression: Regression;
  xsV: number[];
  ysP: number[];
  indexFrom: number | null;
  indexTo: number | null;
};

function manualRangeArrays(
  pts: PVPoint[],
  from: number,
  to: number,
): { xsV: number[]; ysP: number[]; indexFrom: number; indexTo: number } | null {
  const lo = Math.max(0, Math.min(from, to, pts.length - 1));
  const hi = Math.min(pts.length - 1, Math.max(from, to, 0));
  const xsV: number[] = [];
  const ysP: number[] = [];
  for (let i = lo; i <= hi; i++) {
    xsV.push(pts[i]!.x);
    ysP.push(pts[i]!.p_kpa);
  }
  if (xsV.length < 2) return null;
  return { xsV, ysP, indexFrom: lo, indexTo: hi };
}

function segmentFromArrays(
  symbol: string,
  source: "manual" | "auto3070",
  xsV: number[],
  ysP: number[],
  indexFrom: number | null,
  indexTo: number | null,
): PresiometryRegressionSegment | null {
  if (xsV.length < 2 || ysP.length < 2) return null;
  const regression = linearRegressionYonX(xsV, ysP);
  if (regression.slope == null || regression.intercept == null) return null;
  return { symbol, source, regression, xsV, ysP, indexFrom, indexTo };
}

export function buildFirstLoadingSegmentProgramA(
  pts: PVPoint[],
  manual: PresiometryManualSettings | null,
  loops: LoopWindow[],
): PresiometryRegressionSegment | null {
  const firstPeak = loops[0]?.peakIndex ?? Math.max(1, Math.floor(pts.length / 3));
  const p0 = pts[0]!.p_kpa;
  const pPk = pts[Math.min(firstPeak, pts.length - 1)]!.p_kpa;
  const wLoad = pWindow3070(p0, pPk);

  if (manual?.mode === "manual" && manual.load1) {
    const arr = manualRangeArrays(pts, manual.load1.from, manual.load1.to);
    if (!arr) return null;
    return segmentFromArrays("G_L1", "manual", arr.xsV, arr.ysP, arr.indexFrom, arr.indexTo);
  }
  if (!wLoad) return null;
  const picked = pickPointsInPressureWindowWithIndices(
    pts,
    0,
    Math.min(firstPeak, pts.length - 1),
    wLoad.p30,
    wLoad.p70,
  );
  return segmentFromArrays("G_L1", "auto3070", picked.xsV, picked.ysP, picked.indexFrom, picked.indexTo);
}

export function buildLoopUnloadReloadSegments(
  pts: PVPoint[],
  manual: PresiometryManualSettings | null,
  loop: LoopWindow,
  loopIndexZeroBased: number,
): { unload: PresiometryRegressionSegment | null; reload: PresiometryRegressionSegment | null } {
  const peak = pts[loop.peakIndex]!;
  const valley = pts[loop.valleyIndex]!;
  const w = pWindow3070(valley.p_kpa, peak.p_kpa);
  if (!w) return { unload: null, reload: null };

  const i = loopIndexZeroBased + 1;
  const manLoop = manual?.mode === "manual" ? manual.loops?.[loopIndexZeroBased] : undefined;

  let un: { xsV: number[]; ysP: number[]; indexFrom: number | null; indexTo: number | null };
  if (manual?.mode === "manual" && manLoop?.unload) {
    const arr = manualRangeArrays(pts, manLoop.unload.from, manLoop.unload.to);
    un = arr
      ? { xsV: arr.xsV, ysP: arr.ysP, indexFrom: arr.indexFrom, indexTo: arr.indexTo }
      : { xsV: [], ysP: [], indexFrom: null, indexTo: null };
  } else {
    un = pickPointsInPressureWindowWithIndices(pts, loop.peakIndex, loop.valleyIndex, w.p30, w.p70);
  }

  let re: { xsV: number[]; ysP: number[]; indexFrom: number | null; indexTo: number | null };
  if (manual?.mode === "manual" && manLoop?.reload) {
    const arr = manualRangeArrays(pts, manLoop.reload.from, manLoop.reload.to);
    re = arr
      ? { xsV: arr.xsV, ysP: arr.ysP, indexFrom: arr.indexFrom, indexTo: arr.indexTo }
      : { xsV: [], ysP: [], indexFrom: null, indexTo: null };
  } else {
    re = pickPointsInPressureWindowWithIndices(pts, loop.valleyIndex, loop.nextPeakIndex, w.p30, w.p70);
  }

  const unload = segmentFromArrays(
    `G_U${i}`,
    manual?.mode === "manual" && manLoop?.unload ? "manual" : "auto3070",
    un.xsV,
    un.ysP,
    un.indexFrom,
    un.indexTo,
  );
  const reload = segmentFromArrays(
    `G_R${i}`,
    manual?.mode === "manual" && manLoop?.reload ? "manual" : "auto3070",
    re.xsV,
    re.ysP,
    re.indexFrom,
    re.indexTo,
  );

  return { unload, reload };
}

/**
 * Program B (ISO): un singur modul **G_URi** pe buclă — regresie liniară pe punctele din buclă
 * într-o bandă de presiune în jurul mijlocului (p_vârf + p_vale)/2 (bandă lărgită dacă sunt prea puține puncte).
 * Mod manual: preferă `loops[i].gur`; altfel reunește intervalele unload/reload dacă există (compat înapoi).
 */
export function buildProgramBMidLoopGurSegment(
  pts: PVPoint[],
  manual: PresiometryManualSettings | null,
  loop: LoopWindow,
  loopIndexZeroBased: number,
): PresiometryRegressionSegment | null {
  const i = loopIndexZeroBased + 1;
  const sym = `G_UR${i}`;
  const manLoop = manual?.mode === "manual" ? manual.loops?.[loopIndexZeroBased] : undefined;
  const loI = loop.peakIndex;
  const hiI = loop.nextPeakIndex;

  if (manual?.mode === "manual" && manLoop?.gur) {
    const arr = manualRangeArrays(pts, manLoop.gur.from, manLoop.gur.to);
    if (!arr) return null;
    return segmentFromArrays(sym, "manual", arr.xsV, arr.ysP, arr.indexFrom, arr.indexTo);
  }

  if (manual?.mode === "manual" && (manLoop?.unload || manLoop?.reload)) {
    let mergedFrom = Infinity;
    let mergedTo = -Infinity;
    if (manLoop.unload) {
      mergedFrom = Math.min(mergedFrom, manLoop.unload.from, manLoop.unload.to);
      mergedTo = Math.max(mergedTo, manLoop.unload.from, manLoop.unload.to);
    }
    if (manLoop.reload) {
      mergedFrom = Math.min(mergedFrom, manLoop.reload.from, manLoop.reload.to);
      mergedTo = Math.max(mergedTo, manLoop.reload.from, manLoop.reload.to);
    }
    if (mergedFrom !== Infinity && mergedTo > mergedFrom) {
      const from = Math.max(loI, mergedFrom);
      const to = Math.min(hiI, mergedTo);
      if (to > from) {
        const arr = manualRangeArrays(pts, from, to);
        if (arr) return segmentFromArrays(sym, "manual", arr.xsV, arr.ysP, arr.indexFrom, arr.indexTo);
      }
    }
  }

  const peak = pts[loop.peakIndex]!;
  const valley = pts[loop.valleyIndex]!;
  const pk = peak.p_kpa;
  const vk = valley.p_kpa;
  const pMax = Math.max(pk, vk);
  const pMin = Math.min(pk, vk);
  const dp = pMax - pMin;
  if (!(dp > 0)) return null;
  const pMid = (pMax + pMin) / 2;
  let halfBand = 0.12 * dp;
  const maxHalf = 0.48 * dp;
  for (let attempt = 0; attempt < 16 && halfBand <= maxHalf; attempt++) {
    const pLo = pMid - halfBand;
    const pHi = pMid + halfBand;
    const picked = pickPointsInPressureWindowWithIndices(pts, loI, hiI, pLo, pHi);
    if (picked.xsV.length >= 4) {
      return segmentFromArrays(sym, "auto3070", picked.xsV, picked.ysP, picked.indexFrom, picked.indexTo);
    }
    halfBand += 0.03 * dp;
  }
  return null;
}

export function buildProgramARegressionSegments(
  pts: PVPoint[],
  manual: PresiometryManualSettings | null,
  loops: LoopWindow[],
): {
  load1: PresiometryRegressionSegment | null;
  loops: Array<{ unload: PresiometryRegressionSegment | null; reload: PresiometryRegressionSegment | null }>;
} {
  const load1 = buildFirstLoadingSegmentProgramA(pts, manual, loops);
  const loopSegs = loops.slice(0, 10).map((lp, idx) => buildLoopUnloadReloadSegments(pts, manual, lp, idx));
  return { load1, loops: loopSegs };
}

export function buildProgramBRegressionSegments(
  pts: PVPoint[],
  manual: PresiometryManualSettings | null,
  loops: LoopWindow[],
): {
  load1: PresiometryRegressionSegment | null;
  loops: Array<{ gUr: PresiometryRegressionSegment | null }>;
} {
  const load1 = buildFirstLoadingSegmentProgramA(pts, manual, loops);
  const loopSegs = loops.slice(0, 10).map((lp, idx) => ({
    gUr: buildProgramBMidLoopGurSegment(pts, manual, lp, idx),
  }));
  return { load1, loops: loopSegs };
}

/** Capete pentru dreaptă p = slope·x + intercept în spațiul x al seriei (R sau V). */
export function tangentEndpointsRawX(
  slope: number,
  intercept: number,
  xMin: number,
  xMax: number,
  marginRatio = 0.08,
): { x1: number; p1: number; x2: number; p2: number } | null {
  if (!Number.isFinite(slope) || !Number.isFinite(intercept) || !Number.isFinite(xMin) || !Number.isFinite(xMax)) {
    return null;
  }
  const span = Math.max(xMax - xMin, 1e-9);
  const marg = span * marginRatio;
  const x1 = xMin - marg;
  const x2 = xMax + marg;
  return { x1, p1: slope * x1 + intercept, x2, p2: slope * x2 + intercept };
}

/** Aceeași dreaptă în coordonate (x', p) cu x' = x_raw − r0 (grafic p–ΔR). p = slope·x' + (intercept + slope·r0). */
export function tangentInDeltaSpace(slope: number, intercept: number, r0: number): {
  slope: number;
  intercept: number;
} {
  return { slope, intercept: intercept + slope * r0 };
}
