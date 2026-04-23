import type { CalculationContext, CalculationOutput, MeasurementMap, ResultLine } from "./types";

/**
 * SR EN 1926:2007 — Metode de încercare pentru piatră naturală.
 * - Secțiunea 9: R = F / A (F în N, A în mm² → MPa); în practică F din încercare adesea în kN.
 * - Anexa C (evaluare statistică): medie, abatere standard, coef. variație, valoare minimă așteptată E.
 * - Anexa B (informativă): UCS estimată ≈ 22 × indice sarcină concentrată (aceeași unitate ca indicele).
 *
 * Factorii k_s (Anexa C, Tabelul 1): valorile de mai jos trebuie verificate cu exemplarul oficial SR EN 1926.
 * Exemplul din standard (n=10): k_s = 2,1.
 */
const FORMULA_VERSION = "1.0.0-sr-en-1926";

/** Tabel k_s în funcție de n — înlocuiți cu Tabelul 1 oficial dacă diferă. */
const KS_TABLE: Record<number, number> = {
  3: 3.37,
  4: 2.63,
  5: 2.33,
  6: 2.18,
  7: 2.08,
  8: 2.01,
  9: 1.96,
  10: 2.1,
  11: 2.05,
  12: 2.01,
  15: 1.93,
  20: 1.83,
};

function num(m: MeasurementMap, key: string): number | null {
  const v = m[key];
  if (v === undefined || v === null || Number.isNaN(v)) return null;
  return v;
}

function crossSectionAreaMm2(isCylinder: boolean, aMm: number): number {
  if (aMm <= 0) return NaN;
  if (isCylinder) return Math.PI * (aMm / 2) ** 2;
  return aMm * aMm;
}

/** R = F/A, F în kN → N, A în mm² → MPa */
function strengthMpaFromFkN(fKn: number, areaMm2: number): number {
  if (areaMm2 <= 0) return NaN;
  return (fKn * 1000) / areaMm2;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function sampleStdev(xs: number[], xBar: number): number {
  if (xs.length < 2) return NaN;
  const sumSq = xs.reduce((s, x) => s + (x - xBar) ** 2, 0);
  return Math.sqrt(sumSq / (xs.length - 1));
}

function getKs(n: number): number | null {
  if (KS_TABLE[n] !== undefined) return KS_TABLE[n];
  return null;
}

function roundTo1Mpa(x: number): number {
  return Math.round(x);
}

export function calculateSrEn1926(
  measurements: MeasurementMap,
  _ctx?: CalculationContext,
): CalculationOutput {
  const warnings: string[] = [];
  const errors: string[] = [];

  const isCylinderRaw = num(measurements, "en1926_is_cylinder");
  if (isCylinderRaw === null || (isCylinderRaw !== 0 && isCylinderRaw !== 1)) {
    errors.push('Setați „en1926_is_cylinder”: 0 = cub, 1 = cilindru.');
    return { intermediate: [], final: [], warnings, errors, formulaVersion: FORMULA_VERSION };
  }

  const isCylinder = isCylinderRaw === 1;

  const rValues: number[] = [];
  const intermediate: ResultLine[] = [];
  let order = 10;

  for (let i = 1; i <= 20; i++) {
    const id = String(i).padStart(2, "0");
    const a = num(measurements, `en1926_s${id}_a_mm`);
    const h = num(measurements, `en1926_s${id}_h_mm`);
    const fKn = num(measurements, `en1926_s${id}_f_kn`);

    if (a === null && h === null && fKn === null) continue;
    if (a === null || h === null || fKn === null) {
      warnings.push(`Epruveta ${i}: completați a (l̄ sau d̄), h și F (kN) sau lăsați toate goale.`);
      continue;
    }
    if (a <= 0 || h <= 0 || fKn <= 0) {
      warnings.push(`Epruveta ${i}: dimensiuni și sarcină trebuie să fie > 0.`);
      continue;
    }

    const area = crossSectionAreaMm2(isCylinder, a);
    const r = strengthMpaFromFkN(fKn, area);
    if (!Number.isFinite(r)) {
      warnings.push(`Epruveta ${i}: calcul R invalid.`);
      continue;
    }
    rValues.push(r);
    intermediate.push({
      key: `en1926_R_${id}`,
      label: `R epruveta ${i}`,
      value: r,
      unit: "MPa",
      decimals: 2,
      reportable: true,
      display_order: order,
    });
    order += 1;
  }

  if (rValues.length === 0) {
    errors.push("Introduceți cel puțin o epruvetă completă (a, h, F).");
    return { intermediate: [], final: [], warnings, errors, formulaVersion: FORMULA_VERSION };
  }

  if (rValues.length < 10) {
    warnings.push(
      "SR EN 1926 (corp principal) prevede de obicei minimum 10 epruvete — verificați comanda de încercare.",
    );
  }

  const xBar = mean(rValues);
  const s = sampleStdev(rValues, xBar);
  const v = xBar !== 0 && Number.isFinite(s) ? s / xBar : NaN;

  const lnVals = rValues.map((x) => Math.log(x));
  const xBarLn = mean(lnVals);
  const sLn = sampleStdev(lnVals, xBarLn);

  const n = rValues.length;
  const ks = getKs(n);
  let eLow: number | null = null;
  if (ks !== null && Number.isFinite(sLn) && n >= 2) {
    eLow = Math.exp(xBarLn - ks * sLn);
  } else {
    warnings.push(
      n < 2
        ? "Valoarea minimă așteptată E necesită n ≥ 2."
        : `Factorul k_s pentru n=${n} lipsește din tabelul integrat — adăugați-l în KS_TABLE (Anexa C, Tabelul 1).`,
    );
  }

  const pli = num(measurements, "en1926_point_load_index");
  const annexB: ResultLine[] = [];
  if (pli !== null && pli > 0) {
    const est = 22 * pli;
    annexB.push({
      key: "en1926_ucs_from_pli_mpa",
      label: "UCS estimată (Anexa B: 22 × indice sarcină concentrată)",
      value: est,
      unit: "MPa",
      decimals: 2,
      reportable: true,
      display_order: 200,
    });
    warnings.push("Anexa B este informativă; corelația 22×Is nu înlocuiește încercarea directă.");
  }

  const final: ResultLine[] = [
    {
      key: "en1926_R_mean_mpa",
      label: "Valoare medie R̄ (rotunjită 1 MPa pentru raport)",
      value: roundTo1Mpa(xBar),
      unit: "MPa",
      decimals: 0,
      reportable: true,
      display_order: 100,
    },
    {
      key: "en1926_R_mean_raw_mpa",
      label: "Valoare medie R̄ (necalculată pentru rotunjire raport)",
      value: xBar,
      unit: "MPa",
      decimals: 3,
      reportable: false,
      display_order: 101,
    },
    {
      key: "en1926_s_mpa",
      label: "Abatere standard s (rotunjită 1 MPa)",
      value: Number.isFinite(s) ? roundTo1Mpa(s) : null,
      unit: "MPa",
      decimals: 0,
      reportable: true,
      display_order: 102,
    },
    {
      key: "en1926_v",
      label: "Coeficient de variație v",
      value: Number.isFinite(v) ? v : null,
      unit: "—",
      decimals: 4,
      reportable: true,
      display_order: 103,
    },
    {
      key: "en1926_x_ln",
      label: "Medie logaritmică x̄_ln",
      value: Number.isFinite(xBarLn) ? xBarLn : null,
      unit: "—",
      decimals: 4,
      reportable: false,
      display_order: 104,
    },
    {
      key: "en1926_s_ln",
      label: "Abatere standard logaritmică s_ln",
      value: Number.isFinite(sLn) ? sLn : null,
      unit: "—",
      decimals: 4,
      reportable: false,
      display_order: 105,
    },
    {
      key: "en1926_ks",
      label: "Factor k_s (Anexa C)",
      value: ks,
      unit: "—",
      decimals: 2,
      reportable: true,
      display_order: 106,
    },
    {
      key: "en1926_E_low_mpa",
      label: "Valoare minimă așteptată E (exp(x̄_ln − k_s·s_ln))",
      value: eLow,
      unit: "MPa",
      decimals: 2,
      reportable: true,
      display_order: 107,
    },
    ...annexB,
  ];

  return {
    intermediate,
    final,
    warnings,
    errors,
    formulaVersion: FORMULA_VERSION,
  };
}
