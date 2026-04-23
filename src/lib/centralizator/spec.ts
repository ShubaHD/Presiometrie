import type { TestType } from "@/types/lab";

export type KpiField = {
  /** Cheia din `test_results.key` (sau `test_measurements.key` dacă e cazul). */
  key: string;
  /** Etichetă coloană (fără index de test; indexul se adaugă la export). */
  label: string;
  /** Unități implicite (informativ). */
  unit?: string;
  /** Decimale recomandate. */
  decimals?: number;
};

export type CentralizerSpec = {
  testType: TestType;
  prefix: string;
  fields: KpiField[];
};

/**
 * KPI-uri standardizate pe tip de test.
 * Coloanele sunt generate ca: `${prefix}_${i}_${label}` unde i începe de la 1.
 */
export const CENTRALIZER_SPECS: Record<TestType, CentralizerSpec> = {
  ucs: {
    testType: "ucs",
    prefix: "UCS",
    fields: [
      { key: "ucs_mpa", label: "σc", unit: "MPa", decimals: 2 },
      { key: "young_modulus_gpa", label: "E", unit: "GPa", decimals: 3 },
      { key: "poisson_ratio", label: "ν", decimals: 3 },
      { key: "peak_load_kn", label: "Pmax", unit: "kN", decimals: 2 },
    ],
  },
  point_load: {
    testType: "point_load",
    prefix: "PLT",
    fields: [
      { key: "is50_mpa", label: "Is(50)", unit: "MPa", decimals: 2 },
      { key: "is_mpa", label: "Is", unit: "MPa", decimals: 2 },
      { key: "plt_ucs_estimated_mpa", label: "UCS_est", unit: "MPa", decimals: 1 },
    ],
  },
  young: {
    testType: "young",
    prefix: "YNG",
    fields: [
      { key: "young_modulus_gpa", label: "E", unit: "GPa", decimals: 3 },
      { key: "poisson_ratio", label: "ν", decimals: 3 },
      { key: "shear_modulus_gpa", label: "G", unit: "GPa", decimals: 3 },
      { key: "bulk_modulus_gpa", label: "K", unit: "GPa", decimals: 3 },
      { key: "gravimetric_moisture_percent", label: "w", unit: "%", decimals: 2 },
      { key: "dry_unit_weight_kn_m3", label: "γd", unit: "kN/m³", decimals: 2 },
      { key: "peak_stress_curve_mpa", label: "σc", unit: "MPa", decimals: 2 },
    ],
  },
  unit_weight: {
    testType: "unit_weight",
    prefix: "UW",
    fields: [
      { key: "dry_unit_weight_kn_m3", label: "γd", unit: "kN/m³", decimals: 2 },
      { key: "dry_density_kg_m3", label: "ρd", unit: "kg/m³", decimals: 0 },
    ],
  },
  triaxial_rock: {
    testType: "triaxial_rock",
    prefix: "TRI",
    fields: [
      { key: "young_modulus_gpa", label: "E", unit: "GPa", decimals: 3 },
      { key: "poisson_ratio", label: "ν", decimals: 3 },
      { key: "sigma1_mpa", label: "σ1", unit: "MPa", decimals: 2 },
      { key: "sigma3_mpa", label: "σ3", unit: "MPa", decimals: 2 },
      { key: "deviator_stress_mpa", label: "q", unit: "MPa", decimals: 2 },
    ],
  },
  sr_en_1926: {
    testType: "sr_en_1926",
    prefix: "SR1926",
    fields: [
      { key: "en1926_R_mean_mpa", label: "Rmean", unit: "MPa", decimals: 2 },
      { key: "en1926_s_mpa", label: "s", unit: "MPa", decimals: 2 },
      { key: "en1926_v", label: "v", decimals: 3 },
    ],
  },
  unconfined_soil: {
    testType: "unconfined_soil",
    prefix: "UCO",
    fields: [
      { key: "qu_kpa", label: "qu", unit: "kPa", decimals: 0 },
      { key: "cu_kpa", label: "cu", unit: "kPa", decimals: 0 },
      { key: "strain_at_failure_percent", label: "εf", unit: "%", decimals: 1 },
    ],
  },
  absorption_porosity_rock: {
    testType: "absorption_porosity_rock",
    prefix: "ISO13755",
    fields: [
      { key: "absorption_percent_mean", label: "Amean", unit: "%", decimals: 2 },
      { key: "apparent_porosity_percent_mean", label: "Pmean", unit: "%", decimals: 2 },
      { key: "bulk_density_g_cm3_mean", label: "ρb", unit: "g/cm³", decimals: 3 },
    ],
  },
};

