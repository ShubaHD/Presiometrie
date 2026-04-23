import {
  parseUnconfinedSoilCurvePayload,
  stressStrainSeriesKpa,
  UNCONFINED_SOIL_STRAIN_LIMIT,
  type UnconfinedSoilCurvePayload,
} from "@/lib/unconfined-soil-curve";
import type { CalculationContext, CalculationOutput, MeasurementMap } from "./types";

const FORMULA_VERSION = "1.0.0-unconfined-soil-iso17892-7";

function num(m: MeasurementMap, key: string): number | null {
  const v = m[key];
  if (v === undefined || v === null || Number.isNaN(v)) return null;
  return v;
}

function initialAreaMm2(m: MeasurementMap): { area: number; errors: string[] } {
  const errors: string[] = [];
  const isSqRaw = num(m, "unconfined_is_square");
  const isSquare = isSqRaw === 1;
  if (isSqRaw !== 0 && isSqRaw !== 1 && isSqRaw !== null) {
    errors.push('„unconfined_is_square”: 0 = cilindru, 1 = pătrat.');
    return { area: NaN, errors };
  }
  if (isSquare) {
    const side = num(m, "side_mm");
    if (side === null || side <= 0) {
      errors.push("Latură probă (side_mm) invalidă.");
      return { area: NaN, errors };
    }
    return { area: side * side, errors };
  }
  const d = num(m, "diameter_mm");
  if (d === null || d <= 0) {
    errors.push("Diametru probă (diameter_mm) invalid.");
    return { area: NaN, errors };
  }
  return { area: Math.PI * (d / 2) ** 2, errors };
}

function baselineKnFromCurveAndMeasurements(
  points: Array<{ load_kn: number }>,
  m: MeasurementMap,
): number {
  const manual = num(m, "unconfined_seating_load_kn");
  if (manual != null && Number.isFinite(manual) && manual > 0) return manual;
  if (num(m, "unconfined_subtract_initial_seating") === 0) return 0;
  if (points.length === 0) return 0;
  const p0 = points[0]!;
  if (Number.isFinite(p0.load_kn) && p0.load_kn >= 0) return p0.load_kn;
  return 0;
}

function roundQuKpa(x: number): number {
  return Math.round(x);
}

function roundStrainPercent(eps: number): number {
  return Math.round(eps * 1000) / 10;
}

export function calculateUnconfinedSoil(
  measurements: MeasurementMap,
  ctx?: CalculationContext,
): CalculationOutput {
  const warnings: string[] = [];
  const errors: string[] = [];

  const u = ctx?.unconfinedSoil;
  const mode = u?.mode ?? "basic";
  const curvePayload = u?.curve ? parseUnconfinedSoilCurvePayload(u.curve as unknown) : null;

  const { area: areaMm2, errors: areaErr } = initialAreaMm2(measurements);
  errors.push(...areaErr);

  const heightMm = num(measurements, "height_mm");
  if (heightMm === null || heightMm <= 0) {
    errors.push("Înălțime inițială H_i (height_mm) invalidă.");
  }

  if (!errors.length && heightMm != null && areaMm2 > 0) {
    const d = num(measurements, "diameter_mm");
    const side = num(measurements, "side_mm");
    const isSq = num(measurements, "unconfined_is_square") === 1;
    if (!isSq && d != null && d > 0) {
      const ratio = heightMm / d;
      if (ratio < 1.8 || ratio > 2.5) {
        warnings.push(
          `Raport H/D = ${ratio.toFixed(2)} în afara intervalului 1,8–2,5 (ISO 17892-7, probă cilindrică).`,
        );
      }
      if (d < 34 && areaMm2 < 1000) {
        warnings.push("Aria / diametrul pot fi sub minimele uzual (≥34 mm sau ≥1000 mm²).");
      }
    }
    if (isSq && side != null && side > 0) {
      const ratio = heightMm / side;
      if (ratio < 2.0 || ratio > 2.8) {
        warnings.push(
          `Raport H/l = ${ratio.toFixed(2)} în afara intervalului 2,0–2,8 (probă pătrată, ISO 17892-7).`,
        );
      }
    }
  }

  if (mode === "basic") {
    const peakKn = num(measurements, "peak_load_kn");
    const strainPct = num(measurements, "strain_at_failure_percent");
    if (peakKn === null || peakKn <= 0) {
      errors.push("Lipsește sarcina de vârf (peak_load_kn).");
    }
    if (strainPct === null || strainPct < 0 || !Number.isFinite(strainPct)) {
      errors.push("Lipsește torsiunea la eșec (strain_at_failure_percent, %).");
    }
    if (errors.length > 0) {
      return { intermediate: [], final: [], warnings, errors, formulaVersion: FORMULA_VERSION };
    }
    const eps = strainPct! / 100;
    if (eps >= 1 - 1e-9) {
      errors.push("Torsiunea la eșec trebuie să fie < 100%.");
      return { intermediate: [], final: [], warnings, errors, formulaVersion: FORMULA_VERSION };
    }
    const aiM2 = areaMm2 * 1e-6;
    const denom = aiM2 / (1 - eps);
    const sigmaKpa = peakKn! / denom;
    const qu = roundQuKpa(sigmaKpa);
    const cu = roundQuKpa(qu / 2);

    return {
      intermediate: [
        {
          key: "specimen_area_mm2",
          label: "Arie secțiune inițială A_i",
          value: areaMm2,
          unit: "mm²",
          decimals: 2,
          reportable: true,
          display_order: 10,
        },
        {
          key: "vertical_strain_at_failure",
          label: "Deformația specifică axială ε_v la momentul ruperii probei",
          value: eps,
          unit: "—",
          decimals: 5,
          reportable: false,
          display_order: 12,
        },
      ],
      final: [
        {
          key: "qu_kpa",
          label: "Rezistenta la compresiune monoaxiala",
          value: qu,
          unit: "kPa",
          decimals: 0,
          reportable: true,
          display_order: 20,
        },
        {
          key: "strain_at_failure_percent",
          label: "Deformația specifică axială la momentul ruperii probei",
          value: roundStrainPercent(eps),
          unit: "%",
          decimals: 1,
          reportable: true,
          display_order: 25,
        },
        {
          key: "cu_kpa",
          label: "Rezistența la forfecare nedrenată c_u (0,5·q_u)",
          value: cu,
          unit: "kPa",
          decimals: 0,
          reportable: true,
          display_order: 30,
        },
      ],
      warnings,
      errors: [],
      formulaVersion: FORMULA_VERSION,
    };
  }

  // instrumented
  if (!curvePayload || curvePayload.points.length < 5) {
    errors.push("Mod instrumentat: încărcați o curbă (minim 5 puncte) sau comutați la mod basic.");
  }
  if (errors.length > 0) {
    return { intermediate: [], final: [], warnings, errors, formulaVersion: FORMULA_VERSION };
  }

  const pts = curvePayload!.points;
  const baselineKn = baselineKnFromCurveAndMeasurements(pts, measurements);
  const series = stressStrainSeriesKpa(heightMm!, areaMm2, pts, baselineKn);
  if (series.length < 3) {
    errors.push("Seria σ–ε este prea scurtă după filtrare.");
    return { intermediate: [], final: [], warnings, errors, formulaVersion: FORMULA_VERSION };
  }

  const within = series.filter((s) => s.strain <= UNCONFINED_SOIL_STRAIN_LIMIT + 1e-12);
  const usable = within.length > 0 ? within : series;
  if (within.length === 0) {
    warnings.push(`Nu există puncte până la ε_v = ${(UNCONFINED_SOIL_STRAIN_LIMIT * 100).toFixed(0)}%; folosită întreaga serie disponibilă.`);
  }

  let peakIdx = 0;
  for (let i = 1; i < usable.length; i++) {
    if (usable[i]!.stress_kpa > usable[peakIdx]!.stress_kpa) peakIdx = i;
  }
  const quRaw = usable[peakIdx]!.stress_kpa;
  const epsAtPeak = usable[peakIdx]!.strain;
  const qu = roundQuKpa(quRaw);
  const cu = roundQuKpa(qu / 2);

  if (baselineKn > 0) {
    warnings.push(
      `Sarcină de referință (așezare) scăzută ≈ ${baselineKn.toFixed(3)} kN din curbă sau din câmpul manual.`,
    );
  }

  const maxStrain = Math.max(...usable.map((s) => s.strain));
  if (maxStrain < UNCONFINED_SOIL_STRAIN_LIMIT - 1e-4) {
    warnings.push(
      `Curbă incompletă: ε_v max ≈ ${(maxStrain * 100).toFixed(1)}% < ${(UNCONFINED_SOIL_STRAIN_LIMIT * 100).toFixed(0)}%.`,
    );
  }

  return {
    intermediate: [
      {
        key: "specimen_area_mm2",
        label: "Arie secțiune inițială A_i",
        value: areaMm2,
        unit: "mm²",
        decimals: 2,
        reportable: true,
        display_order: 10,
      },
      ...(baselineKn > 0
        ? [
            {
              key: "unconfined_seating_load_used_kn",
              label: "Sarcina inițială",
              value: baselineKn,
              unit: "kN",
              decimals: 3,
              reportable: false,
              display_order: 11,
            } as const,
          ]
        : []),
    ],
    final: [
      {
        key: "qu_kpa",
        label: "Rezistenta la compresiune monoaxiala",
        value: qu,
        unit: "kPa",
        decimals: 0,
        reportable: true,
        display_order: 20,
      },
      {
        key: "strain_at_failure_percent",
        label: "Deformația specifică axială la momentul ruperii probei",
        value: roundStrainPercent(epsAtPeak),
        unit: "%",
        decimals: 1,
        reportable: true,
        display_order: 25,
      },
      {
        key: "cu_kpa",
        label: "Rezistența la forfecare nedrenată c_u (0,5·q_u)",
        value: cu,
        unit: "kPa",
        decimals: 0,
        reportable: true,
        display_order: 30,
      },
    ],
    warnings,
    errors: [],
    formulaVersion: FORMULA_VERSION,
  };
}

/** Timp (s) la punctul de q_u pe curbă (mod instrumentat), pentru raport. */
export function unconfinedSoilInstrumentedPeakTimeS(
  measurements: MeasurementMap,
  curve: UnconfinedSoilCurvePayload | null,
): number | null {
  if (!curve || curve.points.length < 3) return null;
  const { area: areaMm2 } = initialAreaMm2(measurements);
  const heightMm = num(measurements, "height_mm");
  if (heightMm === null || heightMm <= 0 || !Number.isFinite(areaMm2) || areaMm2 <= 0) return null;
  const baselineKn = baselineKnFromCurveAndMeasurements(curve.points, measurements);
  const series = stressStrainSeriesKpa(heightMm, areaMm2, curve.points, baselineKn);
  const within = series.filter((s) => s.strain <= UNCONFINED_SOIL_STRAIN_LIMIT + 1e-12);
  const usable = within.length > 0 ? within : series;
  if (usable.length === 0) return null;
  let peakIdx = 0;
  for (let i = 1; i < usable.length; i++) {
    if (usable[i]!.stress_kpa > usable[peakIdx]!.stress_kpa) peakIdx = i;
  }
  const t = usable[peakIdx]!.t_s;
  return t != null && Number.isFinite(t) ? t : null;
}
