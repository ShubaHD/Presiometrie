import {
  pltGeometryWarnings,
  pltIsUncorrectedMpa,
  pltSizeCorrectionFactor,
  resolveEquivalentDiameterMm,
} from "@/lib/plt-d5731";
import type { CalculationContext, CalculationOutput, MeasurementMap } from "./types";

const FORMULA_VERSION = "2.2.0-astm-d5731-16-neregulat-w123";

function num(m: MeasurementMap, key: string): number | null {
  const v = m[key];
  if (v === undefined || v === null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * ASTM D5731-16: Is = P/De² (P în N, De în mm → MPa); Is(50) = Is·(De/50)^0.45;
 * σ_uc ≈ K·Is(50); K explicit din măsurători sau implicit (constanta din `plt-d5731`).
 * De: D+W, De direct, sau la tip diametral (1): De = D.
 */
export function calculatePointLoad(
  measurements: MeasurementMap,
  _ctx?: CalculationContext,
): CalculationOutput {
  const warnings: string[] = [];
  const errors: string[] = [];

  const loadKn = num(measurements, "peak_load_kn");
  const deDirect = num(measurements, "equivalent_diameter_mm");
  const pltD = num(measurements, "plt_d_mm");
  const pltW = num(measurements, "plt_w_mm");
  const pltL = num(measurements, "plt_l_mm");
  const pltTestKind = num(measurements, "plt_test_kind");
  const w1 = num(measurements, "plt_w1_mm");
  const w2 = num(measurements, "plt_w2_mm");
  const w3 = num(measurements, "plt_w3_mm");
  const kExplicit = num(measurements, "plt_ucs_correlation_k");

  if (loadKn === null || !(loadKn > 0)) {
    errors.push("Lipsește sarcina de rupere P (kN).");
  }

  let pltWForDe = pltW;
  const kindInt = pltTestKind != null && Number.isFinite(pltTestKind) ? Math.floor(pltTestKind) : null;
  const tripleOk =
    kindInt === 4 &&
    w1 != null &&
    w2 != null &&
    w3 != null &&
    w1 > 0 &&
    w2 > 0 &&
    w3 > 0;
  const hasDeDirect = deDirect != null && deDirect > 0;
  const hasLegacyDw = pltD != null && pltD > 0 && pltW != null && pltW > 0;
  if (kindInt === 4 && !hasDeDirect && !tripleOk && !hasLegacyDw) {
    errors.push(
      "Tip neregulat (4): completează D (mm) și W1, W2, W3 (mm) (medie), sau (date vechi) D+W, sau De direct (mm).",
    );
  }
  if (tripleOk) {
    pltWForDe = (w1! + w2! + w3!) / 3;
  } else if (kindInt === 4 && pltW != null && pltW > 0 && pltD != null && pltD > 0) {
    warnings.push(
      "Tip neregulat (4): se folosește W unic din măsurători. Recomandat: trei măsurători W1, W2, W3 (medie aritmetică).",
    );
  }

  const resolved = resolveEquivalentDiameterMm(pltD, pltWForDe, deDirect, {
    pltTestKind: pltTestKind,
  });
  if (!resolved.ok) {
    errors.push(resolved.reason);
  }

  if (errors.length > 0) {
    return { intermediate: [], final: [], warnings, errors, formulaVersion: FORMULA_VERSION };
  }
  if (!resolved.ok) {
    return {
      intermediate: [],
      final: [],
      warnings,
      errors: [resolved.reason],
      formulaVersion: FORMULA_VERSION,
    };
  }

  const { deMm, de2Mm2, mode } = resolved;
  const loadN = loadKn! * 1000;
  const isMpa = pltIsUncorrectedMpa(loadN, de2Mm2);
  const f = pltSizeCorrectionFactor(deMm);
  const is50 = isMpa * f;

  const geo = pltGeometryWarnings(deMm, mode, pltD, pltWForDe, pltL);
  warnings.push(...geo.warnings);

  const hasKExplicit = kExplicit != null && Number.isFinite(kExplicit) && kExplicit > 0;
  const ucsEst = hasKExplicit ? kExplicit! * is50 : null;

  const intermediate: CalculationOutput["intermediate"] = [];

  if (mode === "from_d_w" && pltD != null && pltWForDe != null) {
    intermediate.push({
      key: "plt_area_mm2",
      label: "A = W·D",
      value: pltWForDe * pltD,
      unit: "mm²",
      decimals: 2,
      reportable: false,
      display_order: 3,
    });
  }

  if (tripleOk) {
    intermediate.push({
      key: "plt_w_mean_mm",
      label: "W mediu — (W1+W2+W3)/3 (neregulat)",
      value: pltWForDe!,
      unit: "mm",
      decimals: 3,
      reportable: true,
      display_order: 4,
    });
  }

  intermediate.push(
    {
      key: "plt_de_mm",
      label: "De — diametru echivalent core",
      value: deMm,
      unit: "mm",
      decimals: 3,
      reportable: true,
      display_order: 6,
    },
    {
      key: "plt_de_squared_mm2",
      label: "De²",
      value: de2Mm2,
      unit: "mm²",
      decimals: 2,
      reportable: true,
      display_order: 9,
    },
    {
      key: "plt_load_n",
      label: "P (încărcare de rupere)",
      value: loadN,
      unit: "N",
      decimals: 2,
      reportable: false,
      display_order: 11,
    },
    {
      key: "plt_size_factor_f",
      label: "K — factor corecție (De/50)^0,45",
      value: f,
      unit: "—",
      decimals: 4,
      reportable: true,
      display_order: 26,
    },
  );

  if (hasKExplicit) {
    intermediate.push({
      key: "plt_k_applied",
      label: "K — factor corelație UCS (aplicat)",
      value: kExplicit!,
      unit: "—",
      decimals: 2,
      reportable: true,
      display_order: 29,
    });
  }

  const final = [
    {
      key: "is_mpa",
      label: "Is — indice point load (necorectat)",
      value: isMpa,
      unit: "MPa",
      decimals: 3,
      reportable: true,
      display_order: 30,
    },
    {
      key: "is50_mpa",
      label: "Is(50) — indice corectat la De = 50 mm",
      value: is50,
      unit: "MPa",
      decimals: 3,
      reportable: true,
      display_order: 40,
    },
  ];

  if (ucsEst != null) {
    final.push({
      key: "plt_ucs_estimated_mpa",
      label: "σ_uc estimat (K·Is(50))",
      value: ucsEst,
      unit: "MPa",
      decimals: 2,
      reportable: true,
      display_order: 50,
    });
  }

  return { intermediate, final, warnings, errors, formulaVersion: FORMULA_VERSION };
}
