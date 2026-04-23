import type { MoistureGravimetricPayload } from "@/lib/unit-weight-submerged";
import type { CalculationOutput } from "./types";

const FORMULA_VERSION = "1.0.0";

/**
 * w = m_apă / m_uscat × 100
 * Cu farfurie: m_apă = m_wet − m_dry, m_uscat = m_dry − m_dish.
 * Fără farfurie: m_apă = m_wet − m_dry, m_uscat = m_dry.
 */
export function calculateMoistureGravimetric(m: MoistureGravimetricPayload): CalculationOutput {
  const errors: string[] = [];
  const warnings: string[] = [];

  const { with_dish, m_dish_g, m_wet_g, m_dry_g } = m;

  if (m_wet_g == null || !Number.isFinite(m_wet_g) || m_wet_g <= 0) {
    errors.push("Introduceți masa probei umede (m₁).");
  }
  if (m_dry_g == null || !Number.isFinite(m_dry_g) || m_dry_g <= 0) {
    errors.push("Introduceți masa probei uscate după uscare (m₂).");
  }
  if (with_dish) {
    if (m_dish_g == null || !Number.isFinite(m_dish_g) || m_dish_g < 0) {
      errors.push("Cu farfurie: introduceți masa farfuriei goale (m₀).");
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

  const mw = m_wet_g!;
  const md = m_dry_g!;

  if (!(mw > md)) {
    errors.push("Masa umedă trebuie să fie mai mare decât masa uscată (m₁ > m₂).");
    return { intermediate: [], final: [], warnings, errors, formulaVersion: FORMULA_VERSION };
  }

  const mWater = mw - md;
  let mDrySoil: number;

  if (with_dish) {
    const mdish = m_dish_g!;
    if (!(md > mdish)) {
      errors.push("Cu farfurie: masa uscată (farfurie + probă) trebuie > masa farfuriei (m₂ > m₀).");
      return { intermediate: [], final: [], warnings, errors, formulaVersion: FORMULA_VERSION };
    }
    mDrySoil = md - mdish;
  } else {
    mDrySoil = md;
  }

  if (!(mDrySoil > 0)) {
    errors.push("Masa uscată a probei (fără farfurie) trebuie > 0.");
    return { intermediate: [], final: [], warnings, errors, formulaVersion: FORMULA_VERSION };
  }

  const wPercent = (mWater / mDrySoil) * 100;

  if (!Number.isFinite(wPercent) || wPercent < 0 || wPercent > 500) {
    errors.push("Umiditatea calculată este nefezabilă — verificați masele.");
    return { intermediate: [], final: [], warnings, errors, formulaVersion: FORMULA_VERSION };
  }

  const intermediate: CalculationOutput["intermediate"] = [
    {
      key: "gravimetric_m_water_g",
      label: "Masă apă eliminată la uscare (m₁ − m₂)",
      value: mWater,
      unit: "g",
      decimals: 3,
      reportable: true,
      display_order: 310,
    },
    {
      key: "gravimetric_m_dry_soil_g",
      label: with_dish ? "Masă probă uscată (m₂ − m₀)" : "Masă probă uscată m₂",
      value: mDrySoil,
      unit: "g",
      decimals: 3,
      reportable: true,
      display_order: 320,
    },
  ];

  const final: CalculationOutput["final"] = [
    {
      key: "gravimetric_moisture_percent",
      label: "Umiditate gravimetrică w",
      value: wPercent,
      unit: "%",
      decimals: 2,
      reportable: true,
      display_order: 330,
    },
  ];

  return { intermediate, final, warnings, errors, formulaVersion: FORMULA_VERSION };
}
