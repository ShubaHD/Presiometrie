import type { PresiometryCurvePayload } from "@/lib/presiometry-curve";
import type { CalculationFn, CalculationOutput, MeasurementMap, ResultLine } from "./types";
import { parsePresiometryManualSettings } from "./presiometry-manual";
import { buildProgramARegressionSegments } from "./presiometry-regression-segments";
import { detectLoopsByPressure, extractPvPoints, pWindow3070, xAxisLabel } from "./presiometry-utils";

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

  const firstPeak = loops[0]?.peakIndex ?? Math.max(1, Math.floor(pts.length / 3));
  const p0 = pts[0]!.p_kpa;
  const pPk = pts[Math.min(firstPeak, pts.length - 1)]!.p_kpa;
  const wLoad = pWindow3070(p0, pPk);

  const segments = buildProgramARegressionSegments(pts, manual, loops);

  if (segments.load1) {
    const reg = segments.load1.regression;
    const slope = reg.slope != null ? Math.abs(reg.slope) : null;
    const isManual = segments.load1.source === "manual";
    out.final.push(
      line(
        100,
        `pmt_a_load1_${axis.keySuffix}`,
        isManual
          ? `Modul (manual) prima încărcare: |Δp/Δ${axis.label}|`
          : `Modul (proxy) prima încărcare 30–70%: |Δp/Δ${axis.label}|`,
        slope,
        `kPa/${axis.unit}`,
        3,
      ),
      line(110, "pmt_a_load1_r2", "Regresie prima încărcare: R²", reg.r2, "—", 3, false),
      line(120, "pmt_a_load1_n", "Regresie prima încărcare: N puncte", reg.n, "—", 0, false),
    );
  } else if (manual?.mode === "manual" && manual.load1) {
    out.warnings.push("Prima încărcare (manual): interval invalid sau prea puține puncte pentru regresie.");
  } else if (!wLoad) {
    out.warnings.push("Nu pot calcula fereastra 30–70% pentru prima încărcare (Δp≤0).");
  }

  let order = 200;
  loops.slice(0, 10).forEach((_, idx) => {
    const pair = segments.loops[idx];
    if (!pair) return;

    const regUn = pair.unload?.regression ?? { slope: null, intercept: null, r2: null, n: 0 };
    const regRe = pair.reload?.regression ?? { slope: null, intercept: null, r2: null, n: 0 };
    const kUn = regUn.slope != null ? Math.abs(regUn.slope) : null;
    const kRe = regRe.slope != null ? Math.abs(regRe.slope) : null;

    const i = idx + 1;
    const manLoop = manual?.mode === "manual" ? manual.loops?.[idx] : undefined;
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
