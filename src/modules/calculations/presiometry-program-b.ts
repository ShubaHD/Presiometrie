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

export const calculatePresiometryProgramB: CalculationFn = (_m: MeasurementMap, ctx) => {
  const out: CalculationOutput = {
    intermediate: [],
    final: [],
    warnings: [],
    errors: [],
    formulaVersion: "pmt-b-v1",
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

  const loops = detectLoopsByPressure(pts);
  out.intermediate.push(line(10, "pmt_loops_detected", "Bucle detectate (auto)", loops.length, "—", 0, false));
  if (loops.length === 0) {
    out.warnings.push("Nu am detectat bucle (încărcare–descărcare–reîncărcare).");
    return out;
  }

  // Program B focuses on loop moduli (unload + reload).
  let order = 100;
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
        `pmt_b_loop${i}_unload_${axis.keySuffix}`,
        `Bucla ${i}: descărcare ${manual?.mode === "manual" && manLoop?.unload ? "manual" : "30–70%"} |Δp/Δ${axis.label}|`,
        kUn,
        `kPa/${axis.unit}`,
        3,
      ),
      line(order + 10, `pmt_b_loop${i}_unload_r2`, `Bucla ${i}: descărcare R²`, regUn.r2, "—", 3, false),
      line(
        order + 20,
        `pmt_b_loop${i}_reload_${axis.keySuffix}`,
        `Bucla ${i}: reîncărcare ${manual?.mode === "manual" && manLoop?.reload ? "manual" : "30–70%"} |Δp/Δ${axis.label}|`,
        kRe,
        `kPa/${axis.unit}`,
        3,
      ),
      line(order + 30, `pmt_b_loop${i}_reload_r2`, `Bucla ${i}: reîncărcare R²`, regRe.r2, "—", 3, false),
    );
    order += 50;
  });

  return out;
};

