import type { CalculationContext, CalculationOutput, MeasurementMap } from "./types";
import { YOUNG_DEFAULT_SIGMA_O_PCT, YOUNG_DEFAULT_SIGMA_U_PCT } from "@/lib/young-settings";
import type { YoungCurvePoint } from "@/lib/young-curve-parse";

const FORMULA_VERSION = "1.1.0-sr-en-14580";

/** Mesaj pentru utilizator după fit liniar Eb (σ–ε, ciclu 3). */
function ebR2QualityMessage(r2: number): string {
  const s = r2.toFixed(4);
  if (r2 >= 0.995) {
    return `Calitate fit Eb (SR EN 14580, ciclu 3): R² = ${s} — foarte bine (~1.00).`;
  }
  if (r2 > 0.95) {
    return `Calitate fit Eb (SR EN 14580, ciclu 3): R² = ${s} — foarte bun pentru E (> 0.95).`;
  }
  if (r2 > 0.9) {
    return `Calitate fit Eb (SR EN 14580, ciclu 3): R² = ${s} — acceptabil (> 0.90).`;
  }
  return `Calitate fit Eb (SR EN 14580, ciclu 3): R² = ${s} — neacceptabil pentru estimarea E (≤ 0.90). Exemplu tipic neacceptabil: R² ≈ 0.21. Verificați factorul deplasare, decupajul curbei (trim) și limitele σu–σo.`;
}

function num(m: MeasurementMap, key: string): number | null {
  const v = m[key];
  if (v === undefined || v === null || Number.isNaN(v)) return null;
  return v;
}

/**
 * ASTM D7012 — Metoda D: E, ν, G, K din porțiune liniară (uniaxial).
 * E = Δσ/Δε_a ; ν = −Δε_l/Δε_a ; G = E/(2(1+ν)) ; K = E/(3(1−2ν)).
 */
export function calculateYoung(
  measurements: MeasurementMap,
  ctx?: CalculationContext,
): CalculationOutput {
  const warnings: string[] = [];
  const errors: string[] = [];

  const diameterMm = num(measurements, "diameter_mm");
  const heightMm = num(measurements, "height_mm");
  const ds = num(measurements, "delta_sigma_mpa");
  const ea = num(measurements, "delta_epsilon_axial");
  const el = num(measurements, "delta_epsilon_lateral");

  const youngCtx = ctx?.young;
  const curvePts = youngCtx?.curve?.points ?? null;
  const curveMode = youngCtx?.mode ?? null;
  const eMethod = youngCtx?.settings.e_method ?? null;

  /** σ maxim pe întreaga curbă stocată (trepte / rupere); nu e UCS formal SR EN 1926. */
  let peakStressCurveMpa: number | null = null;
  if (curvePts && curvePts.length > 0) {
    let smax = -Infinity;
    for (const p of curvePts) {
      if (Number.isFinite(p.stress_mpa) && p.stress_mpa > smax) smax = p.stress_mpa;
    }
    if (Number.isFinite(smax) && smax > 0) peakStressCurveMpa = smax;
  }

  if (curvePts && curvePts.length >= 8 && curveMode) {
    if (curveMode === "no_gauges") {
      if (heightMm === null || !(heightMm > 0)) {
        errors.push("Young (fără mărci): setați height_mm pentru ε = ΔL/L.");
      }
    }
  } else {
    // fallback: metoda clasică Δσ/Δε (ASTM D7012, pentru compatibilitate)
    if (ds === null) errors.push("Lipsește Δσ (delta_sigma_mpa).");
    if (ea === null) errors.push("Lipsește Δε_axial.");
    if (el === null) errors.push("Lipsește Δε_lateral.");
    if (ea !== null && ea === 0) errors.push("Δε_axial trebuie să fie nenul.");
  }

  if (diameterMm !== null && heightMm !== null && diameterMm > 0) {
    const ratio = heightMm / diameterMm;
    if (ratio < 2 || ratio > 2.5) {
      warnings.push(
        `Raport H/D = ${ratio.toFixed(2)} — recomandat 2,0–2,5:1 (ASTM D7012 / probă cilindrică).`,
      );
    }
  }

  if (errors.length > 0) {
    return { intermediate: [], final: [], warnings, errors, formulaVersion: FORMULA_VERSION };
  }

  const linReg = (xs: number[], ys: number[]) => {
    if (xs.length !== ys.length || xs.length < 2) return null;
    const n = xs.length;
    let sx = 0,
      sy = 0,
      sxx = 0,
      sxy = 0;
    for (let i = 0; i < n; i++) {
      const x = xs[i]!;
      const y = ys[i]!;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      sx += x;
      sy += y;
      sxx += x * x;
      sxy += x * y;
    }
    const denom = n * sxx - sx * sx;
    if (Math.abs(denom) < 1e-18) return null;
    const slope = (n * sxy - sx * sy) / denom;
    const intercept = (sy - slope * sx) / n;
    // r2
    const ybar = sy / n;
    let ssTot = 0,
      ssRes = 0;
    for (let i = 0; i < n; i++) {
      const x = xs[i]!;
      const y = ys[i]!;
      const yhat = slope * x + intercept;
      ssTot += (y - ybar) * (y - ybar);
      ssRes += (y - yhat) * (y - yhat);
    }
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;
    return { slope, intercept, r2 };
  };

  const argmax = (arr: number[]) => {
    let bi = 0;
    let bv = -Infinity;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i]!;
      if (v > bv) {
        bv = v;
        bi = i;
      }
    }
    return bi;
  };

  const localMaxima = (arr: number[], minPeakAbs: number) => {
    // Robust peak picking:
    // - tolerates flat tops (plateaus)
    // - tolerates small jitter around peaks
    const out: number[] = [];
    if (arr.length < 3) return out;
    let i = 1;
    while (i < arr.length - 1) {
      const prev = arr[i - 1]!;
      const cur = arr[i]!;
      const next = arr[i + 1]!;
      if (!Number.isFinite(prev) || !Number.isFinite(cur) || !Number.isFinite(next)) {
        i++;
        continue;
      }
      if (cur < minPeakAbs) {
        i++;
        continue;
      }
      // rising edge
      if (cur > prev) {
        // plateau?
        let j = i;
        while (j + 1 < arr.length && arr[j + 1] === arr[j]) j++;
        const after = j + 1 < arr.length ? arr[j + 1]! : -Infinity;
        if (after < arr[j]!) {
          // choose middle of plateau as peak index
          out.push(Math.floor((i + j) / 2));
          i = j + 1;
          continue;
        }
      }
      // strict-ish local maximum (allow equal neighbors)
      if (cur >= prev && cur >= next && (cur > prev || cur > next)) {
        out.push(i);
        i++;
        continue;
      }
      i++;
    }
    // de-duplicate close peaks (keep highest)
    const merged: number[] = [];
    const window = 3;
    for (const p of out) {
      const last = merged[merged.length - 1];
      if (last == null) {
        merged.push(p);
        continue;
      }
      if (p - last <= window) {
        if (arr[p]! > arr[last]!) merged[merged.length - 1] = p;
      } else {
        merged.push(p);
      }
    }
    return merged;
  };

  const localMinBefore = (arr: number[], iPeak: number) => {
    let bestI = 0;
    let bestV = Infinity;
    for (let i = 0; i <= iPeak; i++) {
      const v = arr[i]!;
      if (v < bestV) {
        bestV = v;
        bestI = i;
      }
    }
    return bestI;
  };

  const localMinAfter = (arr: number[], iPeak: number) => {
    let bestI = iPeak;
    let bestV = Infinity;
    for (let i = iPeak; i < arr.length; i++) {
      const v = arr[i]!;
      if (v < bestV) {
        bestV = v;
        bestI = i;
      }
    }
    return bestI;
  };

  const applyTrim = (pts: YoungCurvePoint[]) => {
    const fromRaw = youngCtx?.settings.trim_from;
    const toRaw = youngCtx?.settings.trim_to;
    const from = fromRaw != null ? Math.max(0, Math.min(pts.length - 1, fromRaw)) : 0;
    const to =
      toRaw != null ? Math.max(from, Math.min(pts.length - 1, toRaw)) : pts.length - 1;
    return pts.slice(from, to + 1);
  };

  const suggestPoissonFlatCutoffIndex = (pts: YoungCurvePoint[], i0: number, i1: number): number | null => {
    const lo = Math.max(0, Math.min(i0, i1));
    const hi = Math.min(pts.length - 1, Math.max(i0, i1));
    if (hi - lo < 25) return null;

    const get = (p: YoungCurvePoint) => {
      const v = p.strain_ch8;
      if (v != null && Number.isFinite(v)) return v;
      const vr = p.strain_lateral;
      if (vr != null && Number.isFinite(vr)) return vr;
      return null;
    };

    let minV = Infinity;
    let maxV = -Infinity;
    for (let k = lo; k <= hi; k++) {
      const v = get(pts[k]!);
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
      const v = get(pts[k]!);
      if (v == null) {
        prev = null;
        run = 0;
        continue;
      }
      if (prev !== null && Math.abs(v - prev) <= tol) run++;
      else run = 0;
      prev = v;
      if (run >= runNeed) return Math.max(lo, k - runNeed);
    }
    return null;
  };

  const computeStrain = (pts: YoungCurvePoint[]) => {
    if (curveMode === "gauges") {
      const sel = youngCtx?.settings.axial_gauges;
      const use6 = sel ? sel.ch6 !== false : true;
      const use7 = sel ? sel.ch7 !== false : true;
      // If user disables both, fall back to stored axial strain.
      if (!use6 && !use7) return pts.map((p) => p.strain_axial);

      return pts.map((p) => {
        const vs: number[] = [];
        if (use6 && p.strain_ch6 != null && Number.isFinite(p.strain_ch6)) vs.push(p.strain_ch6);
        if (use7 && p.strain_ch7 != null && Number.isFinite(p.strain_ch7)) vs.push(p.strain_ch7);
        if (vs.length === 0) {
          // fallback per-point to computed axial if present
          return p.strain_axial;
        }
        return vs.length === 1 ? vs[0]! : (vs[0]! + vs[1]!) / 2;
      });
    }
    // no_gauges
    const h = heightMm!;
    const median = (arr: number[]) => {
      if (!arr.length) return null;
      const a = [...arr].sort((x, y) => x - y);
      const mid = Math.floor(a.length / 2);
      return a.length % 2 === 1 ? a[mid]! : (a[mid - 1]! + a[mid]!) / 2;
    };
    const dispVals = pts
      .map((p) => p.disp_mm)
      .filter((x): x is number => x != null && Number.isFinite(x));
    const maxDisp = dispVals.length ? Math.max(...dispVals.map((x) => Math.abs(x))) : 0;
    const scaleRaw = youngCtx?.settings.displacement_scale_mm;
    const candidates = [1, 0.001, 0.0001] as const; // mm / unitate brută (mm, µm, 0.1µm)
    const pickAutoScale = () => {
      // Heuristic by modulus plausibility: try a few common scales and pick one that yields a reasonable rock modulus.
      // This avoids common cases where the device exports displacement in 0.1µm or µm without units in header.
      const stress = pts.map((p) => p.stress_mpa).filter((x) => Number.isFinite(x));
      const sMax = stress.length ? Math.max(...stress) : NaN;
      if (!Number.isFinite(sMax) || sMax <= 0) return 0.001;

      const scoreFor = (scale: number) => {
        // Use ISRM-style Esec at 50% σmax (secant), on an increasing-stress envelope.
        let bestS = -Infinity;
        const env: Array<{ s: number; e: number }> = [];
        for (const p of pts) {
          const s = p.stress_mpa;
          const d = p.disp_mm;
          if (!Number.isFinite(s)) continue;
          if (d == null || !Number.isFinite(d)) continue;
          const e = ((d - ds0) * scale) / h;
          if (!Number.isFinite(e)) continue;
          if (s >= bestS) {
            bestS = s;
            env.push({ s, e });
          }
        }
        if (env.length < 4) return { ok: false, err: Infinity };
        const sigmaStar = 0.5 * bestS;
        let epsStar: number | null = null;
        for (let i = 1; i < env.length; i++) {
          const a = env[i - 1]!;
          const b = env[i]!;
          if (sigmaStar >= a.s && sigmaStar <= b.s && b.s !== a.s) {
            const t = (sigmaStar - a.s) / (b.s - a.s);
            epsStar = a.e + t * (b.e - a.e);
            break;
          }
        }
        if (epsStar == null || !(epsStar > 0)) return { ok: false, err: Infinity };
        const eSecMpa = sigmaStar / epsStar;
        // plausible rock E range (very broad): 5–150 GPa
        const lo = 5_000;
        const hi = 150_000;
        const target = 40_000; // typical rock; matches your reference tool outputs
        const ok = Number.isFinite(eSecMpa) && eSecMpa >= lo && eSecMpa <= hi;
        const err = ok ? Math.abs(eSecMpa - target) : Infinity;
        return { ok, err };
      };

      let best = { scale: 0.001, err: Infinity };
      for (const c of candidates) {
        const s = scoreFor(c);
        if (s.ok && s.err < best.err) best = { scale: c, err: s.err };
      }
      return best.err < Infinity ? best.scale : 0.001;
    };

    const dispScale =
      scaleRaw != null && Number.isFinite(scaleRaw) && scaleRaw > 0 ? scaleRaw : pickAutoScale();
    if (scaleRaw == null) {
      warnings.push(
        `Factor deplasare auto-detect: ${dispScale} mm/unitate (editabil la setări Young).`,
      );
    }

    // Baseline for displacement: prefer median displacement at near-zero stress to avoid early spikes/outliers.
    // Many instruments emit a large negative/positive displacement transient at t≈0.
    const nearZeroStressDisp = pts
      .slice(0, Math.max(20, Math.floor(pts.length * 0.1)))
      .filter((p) => Number.isFinite(p.stress_mpa) && Math.abs(p.stress_mpa) <= 0.5)
      .map((p) => p.disp_mm)
      .filter((x): x is number => x != null && Number.isFinite(x));
    const earlyDisp = pts
      .slice(0, Math.max(30, Math.floor(pts.length * 0.1)))
      .map((p) => p.disp_mm)
      .filter((x): x is number => x != null && Number.isFinite(x));
    const ds0 =
      median(nearZeroStressDisp) ??
      median(earlyDisp) ??
      pts.find((p) => p.disp_mm != null && Number.isFinite(p.disp_mm))?.disp_mm ??
      0;
    return pts.map((p) =>
      p.disp_mm != null && Number.isFinite(p.disp_mm)
        ? ((p.disp_mm - ds0) * dispScale) / h
        : null,
    );
  };

  let eEbMpa: number | null = null;
  let eLoadMpa: number | null = null;
  let eUnloadMpa: number | null = null;
  let r2Eb: number | null = null;
  let nuFromCurve: number | null = null;
  let isrmSigmaStarMpa: number | null = null;
  let isrmEtanMpa: number | null = null;
  let isrmEsecMpa: number | null = null;
  let isrmEavgMpa: number | null = null;

  if (curvePts && curvePts.length >= 8 && curveMode && eMethod !== "isrm") {
    const pts = applyTrim(curvePts);
    const stress = pts.map((p) => p.stress_mpa);
    const strain = computeStrain(pts);
    const lateral = pts.map((p) => p.strain_lateral);

    // cycle detection: pick 3rd peak in the trimmed series (threshold relative to σmax)
    const sGlobalMax = Math.max(...stress.filter((x) => Number.isFinite(x)));
    // If the test continues into a much higher stress range, earlier cycles can be far below σmax.
    // Use a gentle relative threshold so we still detect low-stress cycles (typical for pre-cycling).
    const minPeakAbs = Number.isFinite(sGlobalMax) ? Math.max(0.5, sGlobalMax * 0.05) : 0.5;
    const peaks = localMaxima(stress, minPeakAbs);
    if (peaks.length < 3) {
      warnings.push("Cicluri insuficiente în curbă pentru SR EN 14580 (nu s-au găsit 3 vârfuri).");
    } else {
      const iPeak3 = peaks[2]!;
      const iStart = localMinBefore(stress, iPeak3);
      const iEnd = localMinAfter(stress, iPeak3);
      const loadSeg = { lo: iStart, hi: iPeak3 };
      const unloadSeg = { lo: iPeak3, hi: iEnd };

      const sMax = stress[iPeak3]!;
      const suPct =
        youngCtx?.settings.sigma_u_pct != null && Number.isFinite(youngCtx.settings.sigma_u_pct)
          ? Math.max(0, youngCtx.settings.sigma_u_pct!)
          : YOUNG_DEFAULT_SIGMA_U_PCT;
      const soPct =
        youngCtx?.settings.sigma_o_pct != null && Number.isFinite(youngCtx.settings.sigma_o_pct)
          ? Math.max(suPct, youngCtx.settings.sigma_o_pct!)
          : YOUNG_DEFAULT_SIGMA_O_PCT;
      const sigmaU = sMax * suPct;
      const sigmaO = sMax * soPct;

      const indicesInWindow = (seg: { lo: number; hi: number }) => {
        const idx: number[] = [];
        for (let i = seg.lo; i <= seg.hi; i++) {
          const s = stress[i]!;
          const e = strain[i];
          if (e == null || !Number.isFinite(e)) continue;
          if (s >= sigmaU && s <= sigmaO) idx.push(i);
        }
        return idx;
      };

      const fitFromIndices = (idx: number[]) => {
        if (idx.length < 2) return null;
        const xs = idx.map((i) => strain[i] as number);
        const ys = idx.map((i) => stress[i]!);
        return linReg(xs, ys);
      };

      const fitLoad = fitFromIndices(indicesInWindow(loadSeg));
      if (fitLoad && Number.isFinite(fitLoad.slope)) {
        eEbMpa = fitLoad.slope > 0 ? fitLoad.slope : null;
        eLoadMpa = eEbMpa;
        r2Eb = Number.isFinite(fitLoad.r2) ? fitLoad.r2 : null;
        if (r2Eb != null && Number.isFinite(r2Eb)) {
          warnings.push(ebR2QualityMessage(r2Eb));
        }
      } else {
        warnings.push("Eb: nu s-a putut ajusta o linie pe intervalul σu–σo (ciclul 3).");
      }

      const fitUn = fitFromIndices(indicesInWindow(unloadSeg));
      if (fitUn && Number.isFinite(fitUn.slope)) {
        eUnloadMpa = fitUn.slope < 0 ? -fitUn.slope : fitUn.slope;
      } else {
        warnings.push("E descărcare: nu s-a putut ajusta o linie pe intervalul ales (ciclul 3).");
      }

      // ν din curbă, dacă există ε_lateral pe același interval (folosim regresie ε_lateral vs ε_axial).
      const nuFromIdx = (idx: number[]) => {
        if (idx.length < 2) return null;
        const xs: number[] = [];
        const ys: number[] = [];
        for (const i of idx) {
          const ex = strain[i];
          const ey = lateral[i];
          if (ex == null || !Number.isFinite(ex)) continue;
          if (ey == null || !Number.isFinite(ey)) continue;
          xs.push(ex);
          ys.push(ey);
        }
        const fit = linReg(xs, ys);
        if (!fit) return null;
        const slope = fit.slope;
        if (!Number.isFinite(slope)) return null;
        return -slope;
      };

      const idxDefaultForNu = eMethod === "unloading" ? indicesInWindow(unloadSeg) : indicesInWindow(loadSeg);
      const ptsTrim = pts; // already trimmed above
      const manualFrom = youngCtx?.settings.poisson_index_from;
      const manualTo = youngCtx?.settings.poisson_index_to;
      const useManual =
        manualFrom != null &&
        manualTo != null &&
        Number.isFinite(manualFrom) &&
        Number.isFinite(manualTo) &&
        ptsTrim.length >= 2;
      if (useManual) {
        const lo = Math.max(0, Math.min(ptsTrim.length - 1, Math.min(manualFrom!, manualTo!)));
        let hi = Math.max(lo, Math.min(ptsTrim.length - 1, Math.max(manualFrom!, manualTo!)));
        const autoCut = youngCtx?.settings.poisson_auto_cutoff !== false;
        if (autoCut) {
          const cut = suggestPoissonFlatCutoffIndex(ptsTrim, lo, hi);
          if (cut != null && cut > lo + 2) hi = Math.min(hi, cut);
        }
        const idx: number[] = [];
        for (let i = lo; i <= hi; i++) idx.push(i);
        nuFromCurve = nuFromIdx(idx);
      } else {
        nuFromCurve = nuFromIdx(idxDefaultForNu);
      }
    }
  }

  // ISRM Suggested Method (UCS on rock): Etan/Esec/Eavg at 50% of σmax.
  // We compute an increasing-stress envelope (running max) to ignore pre-cycles.
  if (curvePts && curvePts.length >= 8 && curveMode && eMethod === "isrm") {
    const pts = applyTrim(curvePts);
    const stress = pts.map((p) => p.stress_mpa);
    const strain = computeStrain(pts);

    const envS: number[] = [];
    const envE: number[] = [];
    let sMax = -Infinity;
    for (let i = 0; i < stress.length; i++) {
      const s = stress[i]!;
      const e = strain[i];
      if (!Number.isFinite(s)) continue;
      if (e == null || !Number.isFinite(e)) continue;
      if (s >= sMax) {
        sMax = s;
        envS.push(s);
        envE.push(e);
      }
    }

    if (envS.length >= 8 && Number.isFinite(sMax) && sMax > 0) {
      const sigmaStar = 0.5 * sMax;
      isrmSigmaStarMpa = sigmaStar;

      const interpEpsilonAtSigma = (sigma: number) => {
        if (envS.length < 2) return null;
        for (let i = 1; i < envS.length; i++) {
          const s0 = envS[i - 1]!;
          const s1 = envS[i]!;
          const e0 = envE[i - 1]!;
          const e1 = envE[i]!;
          if (!(Number.isFinite(s0) && Number.isFinite(s1) && Number.isFinite(e0) && Number.isFinite(e1))) continue;
          if (sigma >= s0 && sigma <= s1 && s1 !== s0) {
            const t = (sigma - s0) / (s1 - s0);
            return e0 + t * (e1 - e0);
          }
        }
        return null;
      };

      const epsStar = interpEpsilonAtSigma(sigmaStar);
      if (epsStar != null && Number.isFinite(epsStar) && epsStar > 0) {
        isrmEsecMpa = sigmaStar / epsStar;
      } else {
        warnings.push("ISRM: nu s-a putut interpola ε la 50% din σmax (verificați curba/deplasarea).");
      }

      // Etan: regression window around 50% σmax (tight window approximates a tangent).
      const lo = 0.48 * sMax;
      const hi = 0.52 * sMax;
      const xs: number[] = [];
      const ys: number[] = [];
      for (let i = 0; i < envS.length; i++) {
        const s = envS[i]!;
        const e = envE[i]!;
        if (s >= lo && s <= hi) {
          xs.push(e);
          ys.push(s);
        }
      }
      const fit = linReg(xs, ys);
      if (fit && Number.isFinite(fit.slope) && fit.slope > 0) {
        isrmEtanMpa = fit.slope;
      } else {
        warnings.push("ISRM: nu s-a putut face fit liniar pe fereastra 48%–52% din σmax.");
      }

      if (isrmEtanMpa != null && isrmEsecMpa != null) {
        isrmEavgMpa = (isrmEtanMpa + isrmEsecMpa) / 2;
      }
    } else {
      warnings.push("ISRM: curba nu are suficiente puncte valide pentru a calcula σmax și pante.");
    }
  }

  // ISRM: ν din ε_lateral vs ε_axial pe 48–52% din σmax (curbă trim-uită), fără ciclul EN 14580.
  if (curvePts && curvePts.length >= 8 && curveMode && eMethod === "isrm" && nuFromCurve == null) {
    const pts = applyTrim(curvePts);
    const stress = pts.map((p) => p.stress_mpa);
    const strain = computeStrain(pts);
    const lateral = pts.map((p) => p.strain_lateral);
    const sGlobalMax = Math.max(...stress.filter((x) => Number.isFinite(x)));
    if (Number.isFinite(sGlobalMax) && sGlobalMax > 0) {
      const lo = 0.48 * sGlobalMax;
      const hi = 0.52 * sGlobalMax;
      const xs: number[] = [];
      const ys: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const s = stress[i]!;
        const ex = strain[i];
        const ey = lateral[i];
        if (!Number.isFinite(s) || s < lo || s > hi) continue;
        if (ex == null || !Number.isFinite(ex)) continue;
        if (ey == null || !Number.isFinite(ey)) continue;
        xs.push(ex);
        ys.push(ey);
      }
      const fit = linReg(xs, ys);
      if (fit && Number.isFinite(fit.slope)) {
        nuFromCurve = -fit.slope;
      }
    }
  }

  const curveEMpa =
    eMethod === "isrm"
      ? isrmEavgMpa
      : eMethod === "delta"
        ? null
        : eMethod === "unloading"
          ? eUnloadMpa
          : eMethod === "loading"
            ? eLoadMpa
            : eEbMpa; // default: Eb

  const eMpa = curveEMpa ?? eEbMpa ?? (ds! / ea!);
  const eGpa = eMpa / 1000;
  const nu =
    nuFromCurve != null && Number.isFinite(nuFromCurve)
      ? nuFromCurve
      : el != null && ea != null && ea !== 0
        ? -el / ea
        : NaN;

  if (!Number.isFinite(nu)) {
    warnings.push(
      "ν nu a putut fi calculat (lipsă ε_lateral pe curbă și lipsă Δε_lateral/Δε_axial la măsurători).",
    );
  }

  if (Number.isFinite(nu) && (nu <= -1 || nu > 0.55)) {
    warnings.push(`ν = ${nu.toFixed(4)} este atipic; verificați semnele și convenția pentru ε_lateral.`);
  }

  const denomG = 2 * (1 + nu);
  const denomK = 3 * (1 - 2 * nu);
  if (!Number.isFinite(denomG) || Math.abs(denomG) < 1e-6) {
    return {
      intermediate: [],
      final: [],
      warnings,
      errors: ["ν invalid — G nu poate fi calculat."],
      formulaVersion: FORMULA_VERSION,
    };
  }
  if (Math.abs(denomK) < 1e-6) {
    return {
      intermediate: [],
      final: [],
      warnings,
      errors: ["ν aproape de 0,5 — K nu poate fi calculat."],
      formulaVersion: FORMULA_VERSION,
    };
  }

  const gGpa = eGpa / denomG;
  const kGpa = eGpa / denomK;

  /** Aliniat la UCS: aceeași cheie/etichetă pentru raport PDF și centralizare. */
  const specimenAreaIntermediate =
    diameterMm != null && Number.isFinite(diameterMm) && diameterMm > 0
      ? [
          {
            key: "specimen_area_mm2",
            label: "Arie secțiune",
            value: Math.PI * (diameterMm / 2) ** 2,
            unit: "mm²",
            decimals: 2,
            reportable: true,
            display_order: 8,
          },
        ]
      : [];

  return {
    intermediate: [
      ...specimenAreaIntermediate,
      {
        key: "young_modulus_mpa",
        label:
          eMethod === "isrm"
            ? "Modul Young E (ISRM, Eaverage)"
            : curveEMpa != null || eEbMpa != null
              ? "Modul Young E (din curbă)"
              : "Modul Young E (Δσ/Δε_a)",
        value: eMpa,
        unit: "MPa",
        decimals: 2,
        reportable: true,
        display_order: 10,
      },
      ...(eMethod === "isrm"
        ? ([
            {
              key: "isrm_sigma_star_mpa",
              label: "ISRM: σ* (50% din σmax)",
              value: isrmSigmaStarMpa,
              unit: "MPa",
              decimals: 2,
              reportable: false,
              display_order: 11,
            },
            {
              key: "young_modulus_isrm_etan_mpa",
              label: "ISRM: E_tan (48–52% σmax)",
              value: isrmEtanMpa,
              unit: "MPa",
              decimals: 2,
              reportable: true,
              display_order: 12,
            },
            {
              key: "young_modulus_isrm_esec_mpa",
              label: "ISRM: E_sec (0–σ*)",
              value: isrmEsecMpa,
              unit: "MPa",
              decimals: 2,
              reportable: true,
              display_order: 13,
            },
            {
              key: "young_modulus_isrm_eavg_mpa",
              label: "ISRM: E_average",
              value: isrmEavgMpa,
              unit: "MPa",
              decimals: 2,
              reportable: true,
              display_order: 14,
            },
          ] as const)
        : []),
      ...(eMethod === "isrm" && nuFromCurve != null
        ? ([
            {
              key: "poisson_ratio_from_curve",
              label: "ν (din curbă, 48–52% σmax, ISRM)",
              value: nuFromCurve,
              unit: "—",
              decimals: 4,
              reportable: false,
              display_order: 15,
            },
          ] as const)
        : []),
      ...(eMethod !== "isrm" && eEbMpa != null
        ? ([
            {
              key: "young_modulus_eb_mpa",
              label: "Modul static Eb (SR EN 14580, ciclu 3)",
              value: eEbMpa,
              unit: "MPa",
              decimals: 2,
              reportable: true,
              display_order: 12,
            },
            {
              key: "young_modulus_loading_mpa",
              label: "E încărcare (ciclu 3, auxiliar)",
              value: eLoadMpa,
              unit: "MPa",
              decimals: 2,
              reportable: true,
              display_order: 13,
            },
            {
              key: "young_modulus_unloading_mpa",
              label: "E descărcare (ciclu 3, auxiliar)",
              value: eUnloadMpa,
              unit: "MPa",
              decimals: 2,
              reportable: true,
              display_order: 14,
            },
            {
              key: "young_modulus_eb_r2",
              label: "Eb: R² (fit liniar)",
              value: r2Eb,
              unit: "—",
              decimals: 4,
              reportable: false,
              display_order: 15,
            },
            ...(nuFromCurve != null
              ? ([
                  {
                    key: "poisson_ratio_from_curve",
                    label: "ν (din curbă, fit ε_lateral vs ε_axial)",
                    value: nuFromCurve,
                    unit: "—",
                    decimals: 4,
                    reportable: false,
                    display_order: 16,
                  },
                ] as const)
              : []),
          ] as const)
        : []),
    ],
    final: [
      {
        key: "peak_stress_curve_mpa",
        label: "Rezistență la compresiune uniaxială",
        value: peakStressCurveMpa,
        unit: "MPa",
        decimals: 2,
        reportable: true,
        display_order: 17,
      },
      {
        key: "young_modulus_gpa",
        label: "Modul Young E",
        value: eGpa,
        unit: "GPa",
        decimals: 3,
        reportable: true,
        display_order: 20,
      },
      ...(eMethod === "isrm"
        ? ([
            {
              key: "young_modulus_isrm_etan_gpa",
              label: "ISRM: E_tan",
              value: isrmEtanMpa != null ? isrmEtanMpa / 1000 : null,
              unit: "GPa",
              decimals: 3,
              reportable: true,
              display_order: 24,
            },
            {
              key: "young_modulus_isrm_esec_gpa",
              label: "ISRM: E_sec",
              value: isrmEsecMpa != null ? isrmEsecMpa / 1000 : null,
              unit: "GPa",
              decimals: 3,
              reportable: true,
              display_order: 25,
            },
            {
              key: "young_modulus_isrm_eavg_gpa",
              label: "ISRM: E_average",
              value: isrmEavgMpa != null ? isrmEavgMpa / 1000 : null,
              unit: "GPa",
              decimals: 3,
              reportable: true,
              display_order: 26,
            },
          ] as const)
        : []),
      ...(eMethod !== "isrm" && eEbMpa != null
        ? ([
            {
              key: "young_modulus_eb_gpa",
              label: "Eb (SR EN 14580)",
              value: eEbMpa / 1000,
              unit: "GPa",
              decimals: 3,
              reportable: true,
              display_order: 21,
            },
            {
              key: "young_modulus_loading_gpa",
              label: "E încărcare (aux.)",
              value: eLoadMpa != null ? eLoadMpa / 1000 : null,
              unit: "GPa",
              decimals: 3,
              reportable: true,
              display_order: 22,
            },
            {
              key: "young_modulus_unloading_gpa",
              label: "E descărcare (aux.)",
              value: eUnloadMpa != null ? eUnloadMpa / 1000 : null,
              unit: "GPa",
              decimals: 3,
              reportable: true,
              display_order: 23,
            },
          ] as const)
        : []),
      {
        key: "poisson_ratio",
        label: "Coeficient Poisson ν",
        value: Number.isFinite(nu) ? nu : null,
        unit: "—",
        decimals: 4,
        reportable: true,
        display_order: 30,
      },
      {
        key: "shear_modulus_gpa",
        label: "Modul forfecare G = E/(2(1+ν))",
        value: gGpa,
        unit: "GPa",
        decimals: 3,
        reportable: true,
        display_order: 40,
      },
      {
        key: "bulk_modulus_gpa",
        label: "Modul volumetric K = E/(3(1−2ν))",
        value: kGpa,
        unit: "GPa",
        decimals: 3,
        reportable: true,
        display_order: 50,
      },
    ],
    warnings,
    errors: [],
    formulaVersion: FORMULA_VERSION,
  };
}
