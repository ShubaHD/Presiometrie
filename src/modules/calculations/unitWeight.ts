import type { UnitWeightCylinderPayload, UnitWeightSubmergedPayload } from "@/lib/unit-weight-submerged";
import { moistureGravimetricHasAnyInput, sampleVolumeCm3 } from "@/lib/unit-weight-submerged";
import type { CalculationContext, CalculationOutput, MeasurementMap } from "./types";
import { calculateMoistureGravimetric } from "./moistureGravimetric";

const FORMULA_VERSION_LEGACY = "1.0.0";
const FORMULA_VERSION_SUBMERGED = "2.0.0";
const FORMULA_VERSION_CYLINDER = "3.0.0-cylinder-geom";
const G = 9.80665;

function num(m: MeasurementMap, key: string): number | null {
  const v = m[key];
  if (v === undefined || v === null || Number.isNaN(v)) return null;
  return v;
}

function rowComplete(
  method: UnitWeightSubmergedPayload["method"],
  r: UnitWeightSubmergedPayload["rows"][0],
): r is typeof r & { m0_g: number; m2_g: number; m1_g: number | null } {
  if (r.m0_g == null || r.m0_g <= 0 || r.m2_g == null || !Number.isFinite(r.m2_g)) return false;
  if (method === "paraffin_submerged") {
    return r.m1_g != null && r.m1_g > 0 && r.m1_g > r.m0_g;
  }
  return true;
}

function calculateFromSubmergedPayload(payload: UnitWeightSubmergedPayload): CalculationOutput {
  const warnings: string[] = [];
  const errors: string[] = [];
  const intermediate: CalculationOutput["intermediate"] = [];
  const final: CalculationOutput["final"] = [];
  const { method, water_density_g_cm3: rw, paraffin_density_g_cm3: rp, rows } = payload;

  const gammas: number[] = [];
  const densitiesGcm3: number[] = [];
  const dryGammas: number[] = [];
  let order = 0;

  let wPercent: number | null = null;
  if (payload.moisture_gravimetric && moistureGravimetricHasAnyInput(payload.moisture_gravimetric)) {
    const mo = calculateMoistureGravimetric(payload.moisture_gravimetric);
    const wLine = mo.final.find((f) => f.key === "gravimetric_moisture_percent");
    if (
      mo.errors.length === 0 &&
      wLine?.value != null &&
      Number.isFinite(Number(wLine.value)) &&
      Number(wLine.value) >= 0
    ) {
      wPercent = Number(wLine.value);
    }
  }

  for (const r of rows) {
    const labelProba = `Probă ${r.proba_index}`;
    if (!rowComplete(method, r)) {
      warnings.push(`${labelProba}: rând incomplet — omis la calcul.`);
      continue;
    }
    const m0 = r.m0_g!;
    const m2 = r.m2_g!;
    const m1 = method === "paraffin_submerged" ? r.m1_g! : m0;
    const { volumeCm3, error } = sampleVolumeCm3(method, m0, m1, m2, rw, rp);
    if (error || !Number.isFinite(volumeCm3) || volumeCm3 <= 0) {
      warnings.push(`${labelProba}: ${error ?? "volum invalid"}`);
      continue;
    }
    const densityKgM3 = (m0 / 1000) / (volumeCm3 / 1_000_000);
    const densityGcm3 = densityKgM3 / 1000;
    const gammaKnM3 = (densityKgM3 * G) / 1000;
    gammas.push(gammaKnM3);
    densitiesGcm3.push(densityGcm3);

    order += 1;
    intermediate.push({
      key: `uw_subm_${r.proba_index}_volume_cm3`,
      label: `${labelProba} — volum probă`,
      value: volumeCm3,
      unit: "cm³",
      decimals: 2,
      reportable: true,
      display_order: 100 + order,
    });
    intermediate.push({
      key: `uw_subm_${r.proba_index}_density_kg_m3`,
      label: `${labelProba} — densitate`,
      value: densityKgM3,
      unit: "kg/m³",
      decimals: 2,
      reportable: true,
      display_order: 150 + order,
    });
    intermediate.push({
      key: `uw_subm_${r.proba_index}_bulk_density_g_cm3`,
      label: `${labelProba} — densitate aparentă ρ`,
      value: densityGcm3,
      unit: "g/cm³",
      decimals: 3,
      reportable: true,
      display_order: 170 + order,
    });
    final.push({
      key: `uw_subm_${r.proba_index}_gamma_knm3`,
      label: `${labelProba} — γ aparentă (greutate volumică aparentă)`,
      value: gammaKnM3,
      unit: "kN/m³",
      decimals: 2,
      reportable: true,
      display_order: 200 + order,
    });
    if (wPercent != null && Number.isFinite(wPercent) && wPercent >= 0) {
      const denom = 1 + wPercent / 100;
      if (denom > 0) {
        const gammaDry = gammaKnM3 / denom;
        dryGammas.push(gammaDry);
        final.push({
          key: `uw_subm_${r.proba_index}_dry_gamma_knm3`,
          label: `${labelProba} — γ uscată (γ/(1+w))`,
          value: gammaDry,
          unit: "kN/m³",
          decimals: 2,
          reportable: true,
          display_order: 240 + order,
        });
      }
    }
  }

  if (gammas.length === 0) {
    errors.push(
      "Nu există rânduri complete pentru cântărirea submersă. Completați masele în tabul „Greutate volumică”.",
    );
    return {
      intermediate: [],
      final: [],
      warnings,
      errors,
      formulaVersion: FORMULA_VERSION_SUBMERGED,
    };
  }

  if (densitiesGcm3.length > 0) {
    const meanRho = densitiesGcm3.reduce((a, b) => a + b, 0) / densitiesGcm3.length;
    final.push({
      key: "bulk_density_g_cm3",
      label: densitiesGcm3.length > 1 ? "Densitate aparentă ρ (medie probă)" : "Densitate aparentă ρ",
      value: meanRho,
      unit: "g/cm³",
      decimals: 3,
      reportable: true,
      display_order: 285,
    });
  }

  if (gammas.length > 1) {
    const mean = gammas.reduce((a, b) => a + b, 0) / gammas.length;
    final.push({
      key: "dry_unit_weight_kn_m3",
      label: "γ aparentă — medie (submersă)",
      value: mean,
      unit: "kN/m³",
      decimals: 2,
      reportable: true,
      display_order: 290,
    });
  } else {
    final.push({
      key: "dry_unit_weight_kn_m3",
      label: "γ aparentă (submersă)",
      value: gammas[0]!,
      unit: "kN/m³",
      decimals: 2,
      reportable: true,
      display_order: 290,
    });
  }

  if (dryGammas.length > 0) {
    const meanDry = dryGammas.reduce((a, b) => a + b, 0) / dryGammas.length;
    final.push({
      key: "gamma_dry_from_submerged_kn_m3",
      label:
        dryGammas.length > 1
          ? "Greutate volumică uscată γ_d — medie (γ aparentă / (1+w))"
          : "Greutate volumică uscată γ_d (γ aparentă / (1+w))",
      value: meanDry,
      unit: "kN/m³",
      decimals: 2,
      reportable: true,
      display_order: 295,
    });
  }

  return {
    intermediate,
    final,
    warnings,
    errors,
    formulaVersion: FORMULA_VERSION_SUBMERGED,
  };
}

type UnitWeightCylinderComplete = {
  diameter_mm: number;
  length_mm: number;
  mass_natural_g: number;
  mass_dry_g: number;
};

function cylinderComplete(c: UnitWeightCylinderPayload): c is UnitWeightCylinderComplete {
  return (
    c.diameter_mm != null &&
    Number.isFinite(c.diameter_mm) &&
    c.diameter_mm > 0 &&
    c.length_mm != null &&
    Number.isFinite(c.length_mm) &&
    c.length_mm > 0 &&
    c.mass_natural_g != null &&
    Number.isFinite(c.mass_natural_g) &&
    c.mass_natural_g > 0 &&
    c.mass_dry_g != null &&
    Number.isFinite(c.mass_dry_g) &&
    c.mass_dry_g > 0
  );
}

function calculateFromCylinderPayload(c: UnitWeightCylinderPayload): CalculationOutput {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!cylinderComplete(c)) {
    errors.push("Metodă cilindru: completați D, L și masele (natural/uscat).");
    return { intermediate: [], final: [], warnings, errors, formulaVersion: FORMULA_VERSION_CYLINDER };
  }
  const dMm = c.diameter_mm;
  const lMm = c.length_mm;
  const mNatG = c.mass_natural_g;
  const mDryG = c.mass_dry_g;

  if (mDryG > mNatG + 1e-9) {
    warnings.push("Masă uscată > masă naturală; verificați cântărirea.");
  }

  const dM = dMm / 1000;
  const lM = lMm / 1000;
  const volM3 = (Math.PI * (dM / 2) ** 2) * lM;
  if (!Number.isFinite(volM3) || volM3 <= 0) {
    errors.push("Volum cilindru invalid.");
    return { intermediate: [], final: [], warnings, errors, formulaVersion: FORMULA_VERSION_CYLINDER };
  }

  const rhoNat = (mNatG / 1000) / volM3;
  const rhoDry = (mDryG / 1000) / volM3;
  const gammaNat = (rhoNat * G) / 1000;
  const gammaDry = (rhoDry * G) / 1000;
  const wPercent = (mNatG - mDryG) / mDryG * 100;
  if (Number.isFinite(wPercent) && wPercent < 0) {
    warnings.push("Umiditate gravimetrică w < 0% (masă uscată > masă naturală).");
  }

  const final: CalculationOutput["final"] = [
    {
      key: "bulk_unit_weight_natural_kn_m3",
      label: "Greutate volumică la umiditate naturală γ",
      value: gammaNat,
      unit: "kN/m³",
      decimals: 2,
      reportable: true,
      display_order: 292,
    },
    {
      key: "bulk_unit_weight_dry_kn_m3",
      label: "Greutate volumică uscată γ_d",
      value: gammaDry,
      unit: "kN/m³",
      decimals: 2,
      reportable: true,
      display_order: 293,
    },
    {
      key: "bulk_density_natural_kg_m3",
      label: "Densitatea la umiditate naturală ρ",
      value: rhoNat,
      unit: "kg/m³",
      decimals: 0,
      reportable: true,
      display_order: 294,
    },
    {
      key: "bulk_density_dry_kg_m3",
      label: "Densitatea uscată ρ_d",
      value: rhoDry,
      unit: "kg/m³",
      decimals: 0,
      reportable: true,
      display_order: 295,
    },
    {
      key: "gravimetric_moisture_percent",
      label: "Umiditate gravimetrică w",
      value: Number.isFinite(wPercent) ? wPercent : null,
      unit: "%",
      decimals: 2,
      reportable: true,
      display_order: 296,
    },
  ];

  return { intermediate: [], final, warnings, errors, formulaVersion: FORMULA_VERSION_CYLINDER };
}

/**
 * Greutate volumică: prioritar date din tab submers (JSON); altfel masă uscată + volum aparent.
 */
export function calculateUnitWeight(
  measurements: MeasurementMap,
  ctx?: CalculationContext,
): CalculationOutput {
  const cyl = ctx?.unitWeightSubmerged?.cylinder;
  if (cyl && (cyl.diameter_mm != null || cyl.length_mm != null || cyl.mass_natural_g != null || cyl.mass_dry_g != null)) {
    // Dacă utilizatorul a început metoda „cilindru”, returnăm aceste rezultate.
    const out = calculateFromCylinderPayload(cyl);
    if (out.errors.length === 0 && out.final.length > 0) return out;
    // Dacă nu e complet, nu blocăm total: lăsăm utilizatorul să folosească și submersă / legacy.
  }

  if (ctx?.unitWeightSubmerged && ctx.unitWeightSubmerged.rows.length > 0) {
    const hasAnyMass = ctx.unitWeightSubmerged.rows.some(
      (r) =>
        (r.m0_g != null && r.m0_g > 0) ||
        (r.m1_g != null && r.m1_g > 0) ||
        (r.m2_g != null && Number.isFinite(r.m2_g)),
    );
    if (hasAnyMass) {
      return calculateFromSubmergedPayload(ctx.unitWeightSubmerged);
    }
  }

  const warnings: string[] = [];
  const errors: string[] = [];

  const dryMassG = num(measurements, "dry_mass_g");
  const bulkVolumeCm3 = num(measurements, "bulk_volume_cm3");

  if (dryMassG === null || dryMassG <= 0) errors.push("Masă uscată invalidă (dry_mass_g).");
  if (bulkVolumeCm3 === null || bulkVolumeCm3 <= 0) errors.push("Volum aparent invalid (bulk_volume_cm3).");

  if (errors.length > 0) {
    errors.push(
      "Sau folosiți tabul „Greutate volumică” pentru cântărire submersă (cu / fără parafină).",
    );
    return {
      intermediate: [],
      final: [],
      warnings,
      errors,
      formulaVersion: FORMULA_VERSION_LEGACY,
    };
  }

  const massKg = dryMassG! / 1000;
  const volM3 = bulkVolumeCm3! / 1_000_000;
  const densityKgM3 = massKg / volM3;
  const gammaKnM3 = (densityKgM3 * G) / 1000;

  const intermediate = [
    {
      key: "dry_density_kg_m3",
      label: "Densitate uscată",
      value: densityKgM3,
      unit: "kg/m³",
      decimals: 2,
      reportable: true,
      display_order: 10,
    },
  ];

  const final = [
    {
      key: "dry_unit_weight_kn_m3",
      label: "Greutate volumică uscată",
      value: gammaKnM3,
      unit: "kN/m³",
      decimals: 2,
      reportable: true,
      display_order: 20,
    },
  ];

  return { intermediate, final, warnings, errors, formulaVersion: FORMULA_VERSION_LEGACY };
}
