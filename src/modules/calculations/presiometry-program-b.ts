import type { PresiometryCurvePayload } from "@/lib/presiometry-curve";
import type { CalculationFn, CalculationOutput, MeasurementMap, ResultLine } from "./types";
import { slopeKpaPerUnitToMpaPerUnit } from "./presiometry-mp";
import { parsePresiometryManualSettings } from "./presiometry-manual";
import { buildProgramBRegressionSegments } from "./presiometry-regression-segments";
import { detectLoopsByPressure, extractPvPoints, xAxisLabel } from "./presiometry-utils";

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
    formulaVersion: "pmt-b-v3",
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

  const segments = buildProgramBRegressionSegments(pts, manual, loops);

  if (segments.load1) {
    const reg = segments.load1.regression;
    const slope = slopeKpaPerUnitToMpaPerUnit(reg.slope != null ? Math.abs(reg.slope) : null);
    const isManual = segments.load1.source === "manual";
    out.final.push(
      line(
        40,
        `pmt_b_load1_${axis.keySuffix}`,
        isManual ? `GL1: |Δp/Δ${axis.label}|` : `GL1 (30–70%): |Δp/Δ${axis.label}|`,
        slope,
        `MPa/${axis.unit}`,
        3,
      ),
      line(45, "pmt_b_load1_r2", "GL1: R²", reg.r2, "—", 3, false),
      line(48, "pmt_b_load1_n", "GL1: N puncte", reg.n, "—", 0, false),
    );
  } else if (manual?.mode === "manual" && manual.load1) {
    out.warnings.push("GL1 (manual): interval invalid sau prea puține puncte pentru regresie.");
  } else if (manual?.mode === "manual" && !manual.load1) {
    out.warnings.push("Mod manual: setați interval GL1 sau comutați la Auto pentru prima încărcare.");
  }

  if (loops.length === 0) {
    out.warnings.push("Nu am detectat bucle (încărcare–descărcare–reîncărcare); GUR pe bucle nu se calculează.");
    return out;
  }

  loops.slice(0, 10).forEach((_, idx) => {
    const row = segments.loops[idx];
    if (!row) return;
    const order = 100 + idx * 40;
    const reg = row.gUr?.regression ?? { slope: null, intercept: null, r2: null, n: 0 };
    const k = slopeKpaPerUnitToMpaPerUnit(reg.slope != null ? Math.abs(reg.slope) : null);
    const i = idx + 1;
    const manLoop = manual?.mode === "manual" ? manual.loops?.[idx] : undefined;
    const isMan = row.gUr?.source === "manual";
    if (!row.gUr) {
      if (manual?.mode === "manual" && manLoop && (manLoop.gur || manLoop.unload || manLoop.reload)) {
        out.warnings.push(`GUR${i} (manual): interval invalid sau prea puține puncte.`);
      }
      if (manual?.mode !== "manual") {
        out.warnings.push(`GUR${i}: nu am putut extrage puncte (mijloc buclă).`);
      }
      return;
    }
    out.final.push(
      line(
        order,
        `pmt_b_loop${i}_gur_${axis.keySuffix}`,
        `GUR${i}: |Δp/Δ${axis.label}|${isMan ? " (manual)" : " (mijloc buclă)"}`,
        k,
        `MPa/${axis.unit}`,
        3,
      ),
      line(order + 10, `pmt_b_loop${i}_gur_r2`, `GUR${i}: R²`, reg.r2, "—", 3, false),
      line(order + 20, `pmt_b_loop${i}_gur_n`, `GUR${i}: N puncte`, reg.n, "—", 0, false),
    );
  });

  return out;
};
