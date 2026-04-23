import type { CalculationFn, CalculationOutput, MeasurementMap, ResultLine } from "./types";
import type { PresiometryCurvePayload } from "@/lib/presiometry-curve";

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

export const calculatePresiometry: CalculationFn = (m: MeasurementMap, ctx) => {
  const out: CalculationOutput = {
    intermediate: [],
    final: [],
    warnings: [],
    errors: [],
    formulaVersion: "pmt-v0",
  };

  const curve = (ctx as { presiometry?: { curve: PresiometryCurvePayload | null } } | undefined)?.presiometry?.curve ?? null;
  if (!curve || !Array.isArray(curve.points) || curve.points.length < 2) {
    out.errors.push("Lipsește curba de presiometrie (minim 2 puncte p–V). Importați seria în «Măsurători/Serie».");
    return out;
  }

  const pts = curve.points
    .map((p) => ({ p: n(p.p_kpa), v: n(p.v_cm3) }))
    .filter((p) => p.p != null && p.v != null)
    .map((p) => ({ p: p.p!, v: p.v! }));

  if (pts.length < 2) {
    out.errors.push("Curba de presiometrie nu conține suficiente puncte valide.");
    return out;
  }

  // Simple derived values (placeholder). These keep the pipeline working while we refine SR EN ISO 22476-5 specifics.
  let pMax = -Infinity;
  let vAtPmax: number | null = null;
  for (const p of pts) {
    if (p.p > pMax) {
      pMax = p.p;
      vAtPmax = p.v;
    }
  }
  if (!Number.isFinite(pMax)) pMax = NaN;

  const v0 = pts[0]!.v;
  const p0 = pts[0]!.p;
  const v1 = pts[Math.min(pts.length - 1, 1)]!.v;
  const p1 = pts[Math.min(pts.length - 1, 1)]!.p;
  const dv = v1 - v0;
  const dp = p1 - p0;

  const secantStiffnessKpaPerCm3 = dv !== 0 ? dp / dv : null;
  if (secantStiffnessKpaPerCm3 != null && !Number.isFinite(secantStiffnessKpaPerCm3)) {
    out.warnings.push("Nu se poate calcula panta inițială (ΔV=0 sau date invalide).");
  }

  const depthM = n(m.pmt_depth_m);

  out.intermediate.push(
    line(10, "pmt_depth_m", "Adâncime z", depthM, "m", 2, false),
    line(20, "pmt_p0_kpa", "Primul punct: p₀", p0, "kPa", 0),
    line(30, "pmt_v0_cm3", "Primul punct: V₀", v0, "cm³", 2),
    line(40, "pmt_secant_kpa_per_cm3", "Panta inițială Δp/ΔV (secant)", secantStiffnessKpaPerCm3, "kPa/cm³", 3),
  );

  out.final.push(
    line(100, "pmt_pmax_kpa", "Presiune maximă p_max", Number.isFinite(pMax) ? pMax : null, "kPa", 0),
    line(110, "pmt_v_at_pmax_cm3", "Volum la p_max", vAtPmax, "cm³", 2),
  );

  return out;
};

