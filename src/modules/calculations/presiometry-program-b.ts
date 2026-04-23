import type { PresiometryCurvePayload } from "@/lib/presiometry-curve";
import type { CalculationFn, CalculationOutput, MeasurementMap, ResultLine } from "./types";
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
    formulaVersion: "pmt-b-v2",
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
    const slope = reg.slope != null ? Math.abs(reg.slope) : null;
    const isManual = segments.load1.source === "manual";
    out.final.push(
      line(
        40,
        `pmt_b_load1_${axis.keySuffix}`,
        isManual
          ? `G_L1 modul (manual) prima încărcare: |Δp/Δ${axis.label}|`
          : `G_L1 modul (proxy 30–70%) prima încărcare: |Δp/Δ${axis.label}|`,
        slope,
        `kPa/${axis.unit}`,
        3,
      ),
      line(45, "pmt_b_load1_r2", "G_L1 regresie: R²", reg.r2, "—", 3, false),
      line(48, "pmt_b_load1_n", "G_L1 regresie: N puncte", reg.n, "—", 0, false),
    );
  } else if (manual?.mode === "manual" && manual.load1) {
    out.warnings.push("G_L1 (manual): interval invalid sau prea puține puncte pentru regresie.");
  }

  if (loops.length === 0) {
    out.warnings.push("Nu am detectat bucle (încărcare–descărcare–reîncărcare); G_UR pe bucle nu se calculează.");
    return out;
  }

  let order = 100;
  loops.slice(0, 10).forEach((_, idx) => {
    const row = segments.loops[idx];
    if (!row) return;
    const reg = row.gUr?.regression ?? { slope: null, intercept: null, r2: null, n: 0 };
    const k = reg.slope != null ? Math.abs(reg.slope) : null;
    const i = idx + 1;
    const manLoop = manual?.mode === "manual" ? manual.loops?.[idx] : undefined;
    const isMan = row.gUr?.source === "manual";
    out.final.push(
      line(
        order,
        `pmt_b_loop${i}_gur_${axis.keySuffix}`,
        `Bucla ${i}: G_UR ${isMan ? "(manual)" : "(mijloc buclă)"} |Δp/Δ${axis.label}|`,
        k,
        `kPa/${axis.unit}`,
        3,
      ),
      line(order + 10, `pmt_b_loop${i}_gur_r2`, `Bucla ${i}: G_UR R²`, reg.r2, "—", 3, false),
      line(order + 20, `pmt_b_loop${i}_gur_n`, `Bucla ${i}: G_UR N puncte`, reg.n, "—", 0, false),
    );
    order += 40;
    if (manual?.mode === "manual" && manLoop && row.gUr == null && (manLoop.gur || manLoop.unload || manLoop.reload)) {
      out.warnings.push(`Bucla ${i} (manual): interval G_UR invalid sau prea puține puncte.`);
    }
    if (manual?.mode !== "manual" && row.gUr == null) {
      out.warnings.push(`Bucla ${i}: nu am putut extrage puncte pentru G_UR (mijloc buclă).`);
    }
  });

  return out;
};
