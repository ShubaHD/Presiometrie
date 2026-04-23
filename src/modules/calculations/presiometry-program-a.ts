import type { PresiometryCurvePayload } from "@/lib/presiometry-curve";
import type { CalculationFn, CalculationOutput, MeasurementMap, ResultLine } from "./types";
import {
  detectLoopsByPressure,
  extractPvPoints,
  linearRegressionYonX,
  pWindow3070,
  pickPointsInPressureWindow,
  xAxisLabel,
} from "./presiometry-utils";
import { parsePresiometryManualSettings } from "./presiometry-manual";

function n(v: unknown): number | null {
  if (v == null) return null;
  const x = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : null;
}

function line(
  display_order: number,
  key: string,
  label: string,
  value: number | null,
  unit: string | null,
  decimals: number,
  reportable = true,
): ResultLine {
  return { display_order, key, label, value, unit, decimals, reportable };
}

export const calculatePresiometryProgramA: CalculationFn = (m: MeasurementMap, ctx) => {
  const out: CalculationOutput = {
    intermediate: [],
    final: [],
    warnings: [],
    errors: [],
    formulaVersion: "pmt-a-v1",
  };

  const pCtx =
    (ctx as { presiometry?: { curve: PresiometryCurvePayload | null; settings?: unknown | null } } | undefined)
      ?.presiometry ?? null;
  const curve = pCtx?.curve ?? null;
  const manual = parsePresiometryManualSettings(pCtx?.settings ?? null);
  const pts = extractPvPoints(curve);
  if (pts.length < 2) {
    out.errors.push("Lipsește curba de presiometrie (minim 2 puncte p–V). Importați seria în «Serie (import)».");
    return out;
  }
  const axis = xAxisLabel(pts[0]!.x_kind);

  const depthM = n(m.pmt_depth_m);
  out.intermediate.push(line(10, "pmt_depth_m", "Adâncime z", depthM, "m", 2, false));

  // Basic extrema
  let pMax = -Infinity;
  let pMin = Infinity;
  for (const p of pts) {
    pMax = Math.max(pMax, p.p_kpa);
    pMin = Math.min(pMin, p.p_kpa);
  }
  out.intermediate.push(
    line(20, "pmt_pmin_kpa", "Presiune minimă (în serie) p_min", Number.isFinite(pMin) ? pMin : null, "kPa", 0, false),
    line(30, "pmt_pmax_kpa", "Presiune maximă (în serie) p_max", Number.isFinite(pMax) ? pMax : null, "kPa", 0, false),
  );

  const loops = detectLoopsByPressure(pts);
  out.intermediate.push(line(40, "pmt_loops_detected", "Bucle detectate (auto)", loops.length, "—", 0, false));
  if (loops.length === 0) {
    out.warnings.push(
      "Nu am detectat bucle (încărcare–descărcare–reîncărcare). Pentru Program A, importați un export cu bucle sau ajustați parserul după exemplul real.",
    );
  }

  // First loading modulus: auto 30-70% OR manual selection
  const firstPeak = loops[0]?.peakIndex ?? Math.max(1, Math.floor(pts.length / 3));
  const p0 = pts[0]!.p_kpa;
  const pPk = pts[Math.min(firstPeak, pts.length - 1)]!.p_kpa;
  const wLoad = pWindow3070(p0, pPk);
  if (manual?.mode === "manual" && manual.load1) {
    const from = Math.max(0, manual.load1.from);
    const to = Math.min(pts.length - 1, manual.load1.to);
    const xsV: number[] = [];
    const ysP: number[] = [];
    for (let i = from; i <= to; i++) {
      xsV.push(pts[i]!.x);
      ysP.push(pts[i]!.p_kpa);
    }
    const reg = linearRegressionYonX(xsV, ysP);
    const slope = reg.slope != null ? Math.abs(reg.slope) : null;
    out.final.push(
      line(
        100,
        `pmt_a_load1_${axis.keySuffix}`,
        `Modul (manual) prima încărcare: |Δp/Δ${axis.label}|`,
        slope,
        `kPa/${axis.unit}`,
        3,
      ),
      line(110, "pmt_a_load1_r2", "Regresie prima încărcare: R²", reg.r2, "—", 3, false),
      line(120, "pmt_a_load1_n", "Regresie prima încărcare: N puncte", reg.n, "—", 0, false),
    );
  } else if (wLoad) {
    const { xsV, ysP } = pickPointsInPressureWindow(
      pts,
      0,
      Math.min(firstPeak, pts.length - 1),
      wLoad.p30,
      wLoad.p70,
    );
    const reg = linearRegressionYonX(xsV, ysP); // p = a*v + b
    const slope = reg.slope != null ? Math.abs(reg.slope) : null;
    out.final.push(
      line(
        100,
        `pmt_a_load1_${axis.keySuffix}`,
        `Modul (proxy) prima încărcare 30–70%: |Δp/Δ${axis.label}|`,
        slope,
        `kPa/${axis.unit}`,
        3,
      ),
      line(110, "pmt_a_load1_r2", "Regresie prima încărcare: R²", reg.r2, "—", 3, false),
      line(120, "pmt_a_load1_n", "Regresie prima încărcare: N puncte", reg.n, "—", 0, false),
    );
  } else {
    out.warnings.push("Nu pot calcula fereastra 30–70% pentru prima încărcare (Δp≤0).");
  }

  // Loop moduli: unloading + reloading for each detected loop
  let order = 200;
  loops.slice(0, 10).forEach((loop, idx) => {
    const peak = pts[loop.peakIndex]!;
    const valley = pts[loop.valleyIndex]!;
    const w = pWindow3070(valley.p_kpa, peak.p_kpa);
    if (!w) return;

    const manLoop = manual?.mode === "manual" ? manual.loops?.[idx] : undefined;

    const un =
      manual?.mode === "manual" && manLoop?.unload
        ? (() => {
            const from = Math.max(0, manLoop.unload!.from);
            const to = Math.min(pts.length - 1, manLoop.unload!.to);
            const xsV: number[] = [];
            const ysP: number[] = [];
            for (let i = from; i <= to; i++) {
              xsV.push(pts[i]!.x);
              ysP.push(pts[i]!.p_kpa);
            }
            return { xsV, ysP };
          })()
        : pickPointsInPressureWindow(pts, loop.peakIndex, loop.valleyIndex, w.p30, w.p70);

    const re =
      manual?.mode === "manual" && manLoop?.reload
        ? (() => {
            const from = Math.max(0, manLoop.reload!.from);
            const to = Math.min(pts.length - 1, manLoop.reload!.to);
            const xsV: number[] = [];
            const ysP: number[] = [];
            for (let i = from; i <= to; i++) {
              xsV.push(pts[i]!.x);
              ysP.push(pts[i]!.p_kpa);
            }
            return { xsV, ysP };
          })()
        : pickPointsInPressureWindow(pts, loop.valleyIndex, loop.nextPeakIndex, w.p30, w.p70);

    const regUn = linearRegressionYonX(un.xsV, un.ysP);
    const regRe = linearRegressionYonX(re.xsV, re.ysP);
    const kUn = regUn.slope != null ? Math.abs(regUn.slope) : null;
    const kRe = regRe.slope != null ? Math.abs(regRe.slope) : null;

    const i = idx + 1;
    out.final.push(
      line(
        order,
        `pmt_a_loop${i}_unload_${axis.keySuffix}`,
        `Bucla ${i}: descărcare ${manual?.mode === "manual" && manLoop?.unload ? "manual" : "30–70%"} |Δp/Δ${axis.label}|`,
        kUn,
        `kPa/${axis.unit}`,
        3,
      ),
      line(order + 10, `pmt_a_loop${i}_unload_r2`, `Bucla ${i}: descărcare R²`, regUn.r2, "—", 3, false),
      line(
        order + 20,
        `pmt_a_loop${i}_reload_${axis.keySuffix}`,
        `Bucla ${i}: reîncărcare ${manual?.mode === "manual" && manLoop?.reload ? "manual" : "30–70%"} |Δp/Δ${axis.label}|`,
        kRe,
        `kPa/${axis.unit}`,
        3,
      ),
      line(order + 30, `pmt_a_loop${i}_reload_r2`, `Bucla ${i}: reîncărcare R²`, regRe.r2, "—", 3, false),
    );
    order += 50;
  });

  return out;
};

