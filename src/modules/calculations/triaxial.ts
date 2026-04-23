import type { CalculationContext, CalculationOutput, MeasurementMap } from "./types";

const FORMULA_VERSION = "1.0.0-astm-d7012";

function num(m: MeasurementMap, key: string): number | null {
  const v = m[key];
  if (v === undefined || v === null || Number.isNaN(v)) return null;
  return v;
}

/** Ramură Metoda B: E, ν, G, K din intervale liniare (triaxial, σ₃ constant). */
function moduliFromDeltas(m: MeasurementMap, warnings: string[]): CalculationOutput | null {
  const ds = num(m, "delta_sigma_mpa");
  const ea = num(m, "delta_epsilon_axial");
  const el = num(m, "delta_epsilon_lateral");

  if (ds === null || ea === null || el === null) return null;
  if (ea === 0) {
    return {
      intermediate: [],
      final: [],
      warnings,
      errors: ["Δε_axial trebuie să fie nenul pentru calculul lui E."],
      formulaVersion: FORMULA_VERSION,
    };
  }

  const eMpa = ds / ea;
  const nu = -el / ea;
  const eGpa = eMpa / 1000;

  if (nu <= -1 || nu > 0.55) {
    warnings.push(`ν = ${nu.toFixed(4)} este atipic; verificați semnele deformațiilor (convenție ε).`);
  }

  const denomG = 2 * (1 + nu);
  const denomK = 3 * (1 - 2 * nu);
  if (Math.abs(denomK) < 1e-6) {
    return {
      intermediate: [],
      final: [],
      warnings,
      errors: ["ν aproape de 0,5 — modulul volumetric K nu poate fi calculat (denominator ~0)."],
      formulaVersion: FORMULA_VERSION,
    };
  }

  const gGpa = eGpa / denomG;
  const kGpa = eGpa / denomK;

  return {
    intermediate: [
      {
        key: "young_modulus_mpa",
        label: "Modul Young E (din Δσ/Δε_a)",
        value: eMpa,
        unit: "MPa",
        decimals: 2,
        reportable: true,
        display_order: 10,
      },
    ],
    final: [
      {
        key: "young_modulus_gpa",
        label: "Modul Young E",
        value: eGpa,
        unit: "GPa",
        decimals: 3,
        reportable: true,
        display_order: 20,
      },
      {
        key: "poisson_ratio",
        label: "Coeficient Poisson ν (−Δε_l/Δε_a)",
        value: nu,
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

/**
 * ASTM D7012 — Metoda A (rezistență): σ₁ = σ₃ + q, q = F/A.
 * Metoda B: dacă sunt completate Δσ și Δε, se calculează E, ν, G, K.
 */
export function calculateTriaxial(
  measurements: MeasurementMap,
  _ctx?: CalculationContext,
): CalculationOutput {
  const warnings: string[] = [];

  const ds0 = num(measurements, "delta_sigma_mpa");
  const ea0 = num(measurements, "delta_epsilon_axial");
  const el0 = num(measurements, "delta_epsilon_lateral");
  const partialB = ds0 !== null || ea0 !== null || el0 !== null;
  const fullB = ds0 !== null && ea0 !== null && el0 !== null;

  if (partialB && !fullB) {
    return {
      intermediate: [],
      final: [],
      warnings,
      errors: [
        "Metoda B: completați toate câmpurile Δσ, Δε_axial și Δε_lateral, sau lăsați-le goale pentru Metoda A.",
      ],
      formulaVersion: FORMULA_VERSION,
    };
  }

  if (fullB) {
    const moduli = moduliFromDeltas(measurements, warnings);
    if (moduli) {
      if (moduli.errors.length > 0) return moduli;
      return {
        ...moduli,
        warnings: [
          ...moduli.warnings,
          "Interpretare Metoda B: E și ν din intervale liniare pe curbele σ–ε.",
        ],
      };
    }
  }

  const diameterMm = num(measurements, "diameter_mm");
  const heightMm = num(measurements, "height_mm");
  const sigma3 = num(measurements, "confining_stress_mpa");
  const peakKn = num(measurements, "peak_axial_load_kn");

  const errors: string[] = [];
  if (peakKn === null) errors.push("Lipsește sarcina axială de vârf (peak_axial_load_kn).");
  if (sigma3 === null || sigma3 < 0) errors.push("σ₃ (confining_stress_mpa) invalidă.");
  if (diameterMm === null || diameterMm <= 0) errors.push("Diametru invalid.");

  if (heightMm !== null && diameterMm !== null && diameterMm > 0) {
    const ratio = heightMm / diameterMm;
    if (ratio < 2 || ratio > 2.5) {
      warnings.push(
        `Raport H/D = ${ratio.toFixed(2)} — standardul recomandă 2,0–2,5:1 pentru probă cilindrică.`,
      );
    }
  }

  if (errors.length > 0) {
    return {
      intermediate: [],
      final: [],
      warnings,
      errors,
      formulaVersion: FORMULA_VERSION,
    };
  }

  const radiusMm = diameterMm! / 2;
  const areaMm2 = Math.PI * radiusMm * radiusMm;
  const qMpa = (peakKn! * 1000) / areaMm2;
  const sigma1 = sigma3! + qMpa;
  const center = (sigma1 + sigma3!) / 2;
  const radiusMohr = (sigma1 - sigma3!) / 2;

  return {
    intermediate: [
      {
        key: "specimen_area_mm2",
        label: "Arie secțiune A",
        value: areaMm2,
        unit: "mm²",
        decimals: 2,
        reportable: true,
        display_order: 5,
      },
      {
        key: "deviator_stress_mpa",
        label: "Tensiune deviatorică q = F/A",
        value: qMpa,
        unit: "MPa",
        decimals: 3,
        reportable: true,
        display_order: 8,
      },
    ],
    final: [
      {
        key: "sigma1_mpa",
        label: "σ₁ la eșec (model σ₁ = σ₃ + F/A)",
        value: sigma1,
        unit: "MPa",
        decimals: 3,
        reportable: true,
        display_order: 10,
      },
      {
        key: "sigma3_mpa",
        label: "σ₃ (presiune de închidere)",
        value: sigma3,
        unit: "MPa",
        decimals: 3,
        reportable: true,
        display_order: 15,
      },
      {
        key: "mohr_center_mpa",
        label: "Centru cerc Mohr (σ₁+σ₃)/2",
        value: center,
        unit: "MPa",
        decimals: 3,
        reportable: true,
        display_order: 20,
      },
      {
        key: "mohr_radius_mpa",
        label: "Rază cerc Mohr (σ₁−σ₃)/2",
        value: radiusMohr,
        unit: "MPa",
        decimals: 3,
        reportable: true,
        display_order: 25,
      },
    ],
    warnings: [
      ...warnings,
      "Un singur test dă un cerc Mohr; pentru c și φ sunt necesare mai multe încercări la σ₃ diferite.",
    ],
    errors: [],
    formulaVersion: FORMULA_VERSION,
  };
}
