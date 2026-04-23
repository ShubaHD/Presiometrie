import { parseUcsCurvePayload, UCS_MODULUS_DEFAULTS } from "@/lib/ucs-instrumentation";
import type { CalculationOutput, CalculationContext, MeasurementMap } from "./types";
import {
  poissonFromInterval,
  suggestPoissonFlatCutoffIndex,
  solveYoungModulusMpa,
} from "./ucs-modulus";

const FORMULA_VERSION = "2.2.1-ucs-report-labels";

function num(m: MeasurementMap, key: string): number | null {
  const v = m[key];
  if (v === undefined || v === null || Number.isNaN(v)) return null;
  return v;
}

/**
 * UCS — mod basic: σ_max = F_max / A.
 * Mod instrumentat: curbă σ–ε, UCS = max σ, E și ν din setări modul.
 */
export function calculateUcs(
  measurements: MeasurementMap,
  ctx?: CalculationContext,
): CalculationOutput {
  const warnings: string[] = [];
  const errors: string[] = [];

  const u = ctx?.ucs;
  const mode = u?.mode ?? "basic";
  const curvePayload = u?.curve ? parseUcsCurvePayload(u.curve) : null;
  const settings = u?.modulusSettings ?? { ...UCS_MODULUS_DEFAULTS };

  const diameterMm = num(measurements, "diameter_mm");
  const heightMm = num(measurements, "height_mm");
  let peakKn = num(measurements, "peak_load_kn");
  const peakN = num(measurements, "peak_load_n");

  if (peakKn === null && peakN !== null) peakKn = peakN / 1000;

  if (diameterMm === null || diameterMm <= 0) {
    errors.push("Diametru invalid (diameter_mm).");
  }

  if (heightMm !== null && diameterMm !== null && diameterMm > 0) {
    const ratio = heightMm / diameterMm;
    if (ratio < 2 || ratio > 3) {
      warnings.push(
        `Raport H/D = ${ratio.toFixed(2)} în afara intervalului 2,0–3,0 (recomandat pentru probă cilindrică).`,
      );
    }
  }

  if (mode === "basic") {
    if (peakKn === null) errors.push("Lipsește sarcina de rupere (peak_load_kn sau peak_load_n).");
    if (errors.length > 0) {
      return { intermediate: [], final: [], warnings, errors, formulaVersion: FORMULA_VERSION };
    }
    return ucsBasicOutput(diameterMm!, peakKn!, warnings, errors);
  }

  // instrumented
  if (!curvePayload || curvePayload.points.length < 8) {
    errors.push("Mod UCS+Young: încărcați o curbă (minim ~8 puncte) sau comutați la mod UCS.");
  }
  if (errors.length > 0) {
    return { intermediate: [], final: [], warnings, errors, formulaVersion: FORMULA_VERSION };
  }

  const pts = curvePayload!.points;
  const stress = pts.map((p) => p.stress_mpa);
  let peakIdx = 0;
  for (let i = 1; i < stress.length; i++) {
    if (stress[i]! > stress[peakIdx]!) peakIdx = i;
  }
  const maxStressMpa = stress[peakIdx]!;
  const radiusMm = diameterMm! / 2;
  const areaMm2 = Math.PI * radiusMm * radiusMm;

  const manualSeatKn = num(measurements, "ucs_seating_load_kn");
  /** 0 = păstrează σ / F max brută; 1 sau lipsă = implicit: scade așezarea din primul punct (forță netă). */
  const seatingGrossOnly = num(measurements, "ucs_subtract_initial_seating") === 0;
  let baselineKn = 0;
  if (manualSeatKn != null && manualSeatKn > 0 && Number.isFinite(manualSeatKn)) {
    baselineKn = manualSeatKn;
  } else if (!seatingGrossOnly) {
    const p0 = pts[0]!;
    if (p0.load_kn != null && Number.isFinite(p0.load_kn) && p0.load_kn >= 0) {
      baselineKn = p0.load_kn;
    } else {
      baselineKn = (p0.stress_mpa * areaMm2) / 1000;
    }
  }
  const baselineMpa = (baselineKn * 1000) / areaMm2;
  const ucsMpa = maxStressMpa - baselineMpa;
  if (baselineKn > 0 && (!Number.isFinite(ucsMpa) || ucsMpa <= 0)) {
    errors.push(
      "UCS netă (după scăderea așezării) este invalidă sau ≤ 0; verificați sarcina așezare sau curba.",
    );
  }
  if (errors.length > 0) {
    return { intermediate: [], final: [], warnings, errors, formulaVersion: FORMULA_VERSION };
  }

  const peakKnFromCurve = (ucsMpa * areaMm2) / 1000;
  if (baselineKn > 0) {
    warnings.push(
      `UCS și sarcina de vârf sunt nete: scăzută așezarea ≈ ${baselineKn.toFixed(3)} kN (${baselineMpa.toFixed(2)} MPa). Vârf brut σ ≈ ${maxStressMpa.toFixed(2)} MPa.`,
    );
  }

  const mod = solveYoungModulusMpa(pts, settings);
  if (!mod) {
    warnings.push("Nu s-a putut estima modulul Young cu metoda / intervalul curent.");
  }

  let nu: number | null = null;
  if (mod) {
    const rawP0 = settings.poisson_index_from ?? mod.i0;
    const rawP1 = settings.poisson_index_to ?? mod.i1;
    const p0 = Math.max(0, Math.min(rawP0, rawP1));
    let p1 = Math.min(pts.length - 1, Math.max(rawP0, rawP1));
    if (settings.poisson_auto_cutoff !== false) {
      const cut = suggestPoissonFlatCutoffIndex(pts, p0, p1);
      if (cut != null && cut > p0 + 2) {
        p1 = Math.min(p1, cut);
      }
    }
    nu = poissonFromInterval(pts, p0, p1);
    if (nu === null) {
      warnings.push("Poisson: lipsă deformație radială pe interval sau date insuficiente.");
    }
  }

  const intermediate: CalculationOutput["intermediate"] = [
    {
      key: "specimen_area_mm2",
      label: "Arie secțiune",
      value: areaMm2,
      unit: "mm²",
      decimals: 2,
      reportable: true,
      display_order: 10,
    },
  ];

  if (baselineKn > 0) {
    intermediate.push({
      key: "ucs_seating_load_used_kn",
      label: "Sarcină așezare (scăzută din vârf)",
      value: baselineKn,
      unit: "kN",
      decimals: 3,
      reportable: false,
      display_order: 12,
    });
    intermediate.push({
      key: "ucs_peak_stress_gross_mpa",
      label: "σ max brută (înainte de scăderea așezării)",
      value: maxStressMpa,
      unit: "MPa",
      decimals: 2,
      reportable: false,
      display_order: 13,
    });
  }

  intermediate.push({
    key: "peak_load_kn",
    label: baselineKn > 0 ? "Sarcină de vârf netă (din curbă)" : "Sarcină de vârf (din curbă)",
    value: peakKnFromCurve,
    unit: "kN",
    decimals: 3,
    reportable: false,
    display_order: 15,
  });

  if (mod) {
    intermediate.push({
      key: "young_modulus_mpa",
      label: `E (${methodLabel(mod.method)}, interval puncte ${mod.i0}–${mod.i1})`,
      value: mod.eMpa,
      unit: "MPa",
      decimals: 2,
      reportable: true,
      display_order: 18,
    });
    if (mod.r2 !== null) {
      intermediate.push({
        key: "ucs_modulus_r2",
        label: "R² regresie (modul)",
        value: mod.r2,
        unit: "—",
        decimals: 4,
        reportable: false,
        display_order: 19,
      });
    }
  }

  const final: CalculationOutput["final"] = [
    {
      key: "ucs_mpa",
      label: "Rezistență la compresiune uniaxială (UCS)",
      value: ucsMpa,
      unit: "MPa",
      decimals: 3,
      reportable: true,
      display_order: 20,
    },
  ];

  if (mod) {
    final.push({
      key: "young_modulus_gpa",
      label: "Modul Young E",
      value: mod.eMpa / 1000,
      unit: "GPa",
      decimals: 3,
      reportable: true,
      display_order: 30,
    });
  }

  let ucsModulusSettingsUpdate: CalculationOutput["ucsModulusSettingsUpdate"];
  if (mod) {
    ucsModulusSettingsUpdate = {
      ...settings,
      index_from: mod.i0,
      index_to: mod.i1,
      last_resolution: {
        at: new Date().toISOString(),
        method: mod.method,
        index_from: mod.i0,
        index_to: mod.i1,
        r2: mod.r2,
        auto: mod.auto,
      },
    };
  }

  if (nu !== null) {
    final.push({
      key: "poisson_ratio",
      label: "Coeficient Poisson ν (axial / radial pe interval modul)",
      value: nu,
      unit: "—",
      decimals: 4,
      reportable: true,
      display_order: 40,
    });
    const eGpa = mod ? mod.eMpa / 1000 : null;
    if (eGpa !== null) {
      const gGpa = eGpa / (2 * (1 + nu));
      const denomK = 3 * (1 - 2 * nu);
      if (Math.abs(denomK) >= 1e-6) {
        const kGpa = eGpa / denomK;
        final.push(
          {
            key: "shear_modulus_gpa",
            label: "Modul forfecare G = E/(2(1+ν))",
            value: gGpa,
            unit: "GPa",
            decimals: 3,
            reportable: true,
            display_order: 50,
          },
          {
            key: "bulk_modulus_gpa",
            label: "Modul volumetric K = E/(3(1−2ν))",
            value: kGpa,
            unit: "GPa",
            decimals: 3,
            reportable: true,
            display_order: 60,
          },
        );
      }
    }
    if (nu <= -0.99 || nu > 0.55) {
      warnings.push(`ν = ${nu.toFixed(4)} este atipic; verificați convenția pentru marcile radiale.`);
    }
  }

  return {
    intermediate,
    final,
    warnings,
    errors: [],
    formulaVersion: FORMULA_VERSION,
    ucsModulusSettingsUpdate,
  };
}

function methodLabel(m: string): string {
  switch (m) {
    case "loading_linear":
      return "încărcare liniară";
    case "unloading":
      return "descărcare";
    case "secant":
      return "secantă";
    case "tangent":
      return "tangentă";
    default:
      return m;
  }
}

function ucsBasicOutput(
  diameterMm: number,
  peakKn: number,
  warnings: string[],
  errors: string[],
): CalculationOutput {
  if (errors.length > 0) {
    return { intermediate: [], final: [], warnings, errors, formulaVersion: FORMULA_VERSION };
  }
  const radiusMm = diameterMm / 2;
  const areaMm2 = Math.PI * radiusMm * radiusMm;
  const stressMpa = (peakKn * 1000) / areaMm2;
  return {
    intermediate: [
      {
        key: "specimen_area_mm2",
        label: "Arie secțiune",
        value: areaMm2,
        unit: "mm²",
        decimals: 2,
        reportable: true,
        display_order: 10,
      },
    ],
    final: [
      {
        key: "ucs_mpa",
        label: "Rezistență la compresiune uniaxială (UCS)",
        value: stressMpa,
        unit: "MPa",
        decimals: 3,
        reportable: true,
        display_order: 20,
      },
    ],
    warnings,
    errors: [],
    formulaVersion: FORMULA_VERSION,
  };
}
