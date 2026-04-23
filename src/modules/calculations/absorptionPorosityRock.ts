import type { CalculationContext, CalculationOutput, MeasurementMap } from "./types";

const FORMULA_VERSION = "1.0.0-en1936-like";

type Spec = {
  label: string;
  mass_dry_g: number | null;
  mass_sat_ssd_g: number | null;
  mass_submerged_g: number | null;
};

function nOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function num(m: MeasurementMap, key: string): number | null {
  const v = m[key];
  if (v === undefined || v === null || Number.isNaN(v)) return null;
  return v;
}

function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step;
}

function calcOne(s: Spec): {
  errors: string[];
  warnings: string[];
  absorption_pct: number | null;
  porosity_pct: number | null;
  bulk_density_g_cm3: number | null;
  gamma_dry_kn_m3: number | null;
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const md = s.mass_dry_g;
  const ms = s.mass_sat_ssd_g;
  const msub = s.mass_submerged_g;
  if (md == null) errors.push(`${s.label}: lipsește m_d.`);
  if (ms == null) errors.push(`${s.label}: lipsește m_s (SSD).`);
  if (msub == null) errors.push(`${s.label}: lipsește m_sub.`);
  if (errors.length > 0) {
    return { errors, warnings, absorption_pct: null, porosity_pct: null, bulk_density_g_cm3: null, gamma_dry_kn_m3: null };
  }

  if (!(md! > 0)) errors.push(`${s.label}: m_d trebuie să fie > 0.`);
  const denomV = ms! - msub!;
  if (!(denomV > 0)) errors.push(`${s.label}: m_s − m_sub trebuie să fie > 0.`);
  if (ms! < md!) warnings.push(`${s.label}: m_s < m_d (absorbție negativă) — verificați valorile.`);
  if (msub! >= ms!) warnings.push(`${s.label}: m_sub ≥ m_s — posibilă eroare la cântărire submersă.`);
  if (errors.length > 0) {
    return { errors, warnings, absorption_pct: null, porosity_pct: null, bulk_density_g_cm3: null, gamma_dry_kn_m3: null };
  }

  const absorptionPct = ((ms! - md!) / md!) * 100;
  const porosityPct = ((ms! - md!) / denomV) * 100;
  const bulkDensityGcm3 = md! / denomV;
  const gammaDryKnM3 = bulkDensityGcm3 * 9.80665;
  return {
    errors,
    warnings,
    absorption_pct: absorptionPct,
    porosity_pct: porosityPct,
    bulk_density_g_cm3: bulkDensityGcm3,
    gamma_dry_kn_m3: gammaDryKnM3,
  };
}

/**
 * Absorbție apă / Porozitate (rocă).
 *
 * Inputs (g):
 * - m_dry = masă uscată (după uscare)
 * - m_sat = masă saturată, suprafață uscată (SSD)
 * - m_sub = masă submersă (în apă)
 *
 * Outputs:
 * - Absorbție apă (%) = (m_sat - m_dry) / m_dry * 100
 * - Porozitate aparentă (%) = (m_sat - m_dry) / (m_sat - m_sub) * 100
 * - Densitate aparentă (g/cm³) = m_dry / (m_sat - m_sub)   (ρ_w ≈ 1 g/cm³)
 * - γ_d (kN/m³) ≈ ρ(g/cm³) * 9.80665
 */
export function calculateAbsorptionPorosityRock(
  measurements: MeasurementMap,
  ctx?: CalculationContext,
): CalculationOutput {
  const warnings: string[] = [];
  const errors: string[] = [];

  const specsFromCtx = ctx?.absorptionPorosityRock?.specimens;
  const specs: Spec[] =
    Array.isArray(specsFromCtx) && specsFromCtx.length > 0
      ? specsFromCtx.slice(0, 3).map((s, i) => {
          const r = s as Record<string, unknown>;
          return {
            label: String(r.label ?? `Epr. ${i + 1}`),
            mass_dry_g: nOrNull(r.mass_dry_g),
            mass_sat_ssd_g: nOrNull(r.mass_sat_ssd_g),
            mass_submerged_g: nOrNull(r.mass_submerged_g),
          };
        })
      : [
          {
            label: "Epr. 1",
            mass_dry_g: num(measurements, "mass_dry_g"),
            mass_sat_ssd_g: num(measurements, "mass_sat_ssd_g"),
            mass_submerged_g: num(measurements, "mass_submerged_g"),
          },
        ];

  const per = specs.map(calcOne);
  for (const p of per) {
    warnings.push(...p.warnings);
    errors.push(...p.errors);
  }
  if (errors.length > 0) {
    return { intermediate: [], final: [], warnings, errors, formulaVersion: FORMULA_VERSION };
  }

  const valsAbs = per.map((p) => p.absorption_pct).filter((x): x is number => x != null && Number.isFinite(x));
  const valsPor = per.map((p) => p.porosity_pct).filter((x): x is number => x != null && Number.isFinite(x));
  const valsRho = per.map((p) => p.bulk_density_g_cm3).filter((x): x is number => x != null && Number.isFinite(x));
  const valsGamma = per.map((p) => p.gamma_dry_kn_m3).filter((x): x is number => x != null && Number.isFinite(x));

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  const meanAbs = mean(valsAbs);
  const meanPor = mean(valsPor);
  const meanRho = mean(valsRho);
  const meanGamma = mean(valsGamma);

  // ISO excerpt: Ab results expressed to nearest 0.1%.
  const meanAbsRounded01 = Number.isFinite(meanAbs) ? roundTo(meanAbs, 0.1) : NaN;

  return {
    intermediate: [],
    final: [
      ...per.flatMap((p, i) => {
        const label = specs[i]?.label ?? `Epr. ${i + 1}`;
        const absRounded01 =
          p.absorption_pct != null && Number.isFinite(p.absorption_pct) ? roundTo(p.absorption_pct, 0.1) : null;
        return [
          {
            key: `iso13755_s${i + 1}_water_absorption_percent`,
            label: `${label} — Absorbție apă (în masă)`,
            value: absRounded01,
            unit: "%",
            decimals: 1,
            reportable: true,
            display_order: 10 + i,
          },
          {
            key: `iso13755_s${i + 1}_apparent_porosity_percent`,
            label: `${label} — Porozitate aparentă`,
            value: p.porosity_pct,
            unit: "%",
            decimals: 2,
            reportable: true,
            display_order: 20 + i,
          },
          {
            key: `iso13755_s${i + 1}_bulk_density_g_cm3`,
            label: `${label} — Densitate aparentă ρ`,
            value: p.bulk_density_g_cm3,
            unit: "g/cm³",
            decimals: 3,
            reportable: true,
            display_order: 30 + i,
          },
        ];
      }),
      {
        key: "water_absorption_percent_mean",
        label: "Absorbție apă (medie)",
        value: Number.isFinite(meanAbsRounded01) ? meanAbsRounded01 : null,
        unit: "%",
        decimals: 1,
        reportable: true,
        display_order: 90,
      },
      {
        key: "apparent_porosity_percent_mean",
        label: "Porozitate aparentă (medie)",
        value: Number.isFinite(meanPor) ? meanPor : null,
        unit: "%",
        decimals: 2,
        reportable: true,
        display_order: 100,
      },
      {
        key: "bulk_density_g_cm3_mean",
        label: "Densitate aparentă ρ (medie)",
        value: Number.isFinite(meanRho) ? meanRho : null,
        unit: "g/cm³",
        decimals: 3,
        reportable: true,
        display_order: 110,
      },
      {
        key: "dry_unit_weight_kn_m3",
        label: "Greutate volumică uscată γd (din ρ medie)",
        value: Number.isFinite(meanGamma) ? meanGamma : null,
        unit: "kN/m³",
        decimals: 2,
        reportable: true,
        display_order: 120,
      },
    ],
    warnings,
    errors: [],
    formulaVersion: FORMULA_VERSION,
  };
}

