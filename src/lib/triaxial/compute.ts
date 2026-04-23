import type {
  ChannelMapping,
  ElasticFit,
  McFit,
  RawTable,
  StrengthPoint,
  TriaxialDerivedPoint,
  TriaxialResult,
  TriaxialSampleMeta,
} from "@/lib/triaxial/types";
import { argMax, clamp, isFiniteNumber, linearRegression } from "@/lib/triaxial/math";
import { qcStrainChannel } from "@/lib/triaxial/qc";

function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function col(table: RawTable, name: string): Array<number | null> {
  return table.rows.map((r) => toNumber(r[name]));
}

function areaMm2(diameterMm: number) {
  return (Math.PI * diameterMm * diameterMm) / 4;
}

function knToN(kN: number) {
  return kN * 1000;
}

function mpaFromForceN(forceN: number, areaMm2_: number) {
  // 1 MPa = 1 N/mm²
  return forceN / areaMm2_;
}

function microstrainToStrain(mue: number) {
  return mue * 1e-6;
}

function chooseAxialStrainSource(opts: {
  qc6?: "valid" | "suspect" | "invalid";
  qc7?: "valid" | "suspect" | "invalid";
  has6: boolean;
  has7: boolean;
}) {
  const { qc6, qc7, has6, has7 } = opts;
  const ok6 = has6 && qc6 === "valid";
  const ok7 = has7 && qc7 === "valid";
  if (ok6 || ok7) return "gauges" as const;
  return "lvdta" as const;
}

function chooseRadialStrainSource(opts: { qc8?: "valid" | "suspect" | "invalid"; has8: boolean }) {
  const { qc8, has8 } = opts;
  if (has8 && qc8 === "valid") return "hoop8" as const;
  return "none" as const;
}

export function computeTriaxialResult(args: {
  meta: TriaxialSampleMeta;
  table: RawTable;
  mapping: ChannelMapping;
}): TriaxialResult {
  const { meta, table, mapping } = args;
  const a0 = areaMm2(meta.diameterMm);

  const t = mapping.time ? col(table, mapping.time) : null;
  const loadKn = col(table, mapping.load);
  const lvdtaMm = col(table, mapping.lvdta);
  const pressure = mapping.pressure ? col(table, mapping.pressure) : null;

  const eps6 = mapping.strainAxial6 ? col(table, mapping.strainAxial6) : null;
  const eps7 = mapping.strainAxial7 ? col(table, mapping.strainAxial7) : null;
  const eps8 = mapping.strainHoop8 ? col(table, mapping.strainHoop8) : null;

  const qc: TriaxialResult["qc"] = {
    channels: [],
    chosenAxial: "lvdta",
    chosenRadial: "none",
    notes: [],
  };

  const qc6 = mapping.strainAxial6 ? qcStrainChannel({ table, channel: mapping.strainAxial6, loadChannel: mapping.load }) : null;
  const qc7 = mapping.strainAxial7 ? qcStrainChannel({ table, channel: mapping.strainAxial7, loadChannel: mapping.load }) : null;
  const qc8 = mapping.strainHoop8 ? qcStrainChannel({ table, channel: mapping.strainHoop8, loadChannel: mapping.load }) : null;
  if (qc6) qc.channels.push(qc6);
  if (qc7) qc.channels.push(qc7);
  if (qc8) qc.channels.push(qc8);

  qc.chosenAxial = chooseAxialStrainSource({
    qc6: qc6?.flag,
    qc7: qc7?.flag,
    has6: Boolean(mapping.strainAxial6),
    has7: Boolean(mapping.strainAxial7),
  });
  qc.chosenRadial = chooseRadialStrainSource({ qc8: qc8?.flag, has8: Boolean(mapping.strainHoop8) });

  if (qc.chosenAxial === "lvdta") qc.notes.push("εz din LVDT (Ch5) folosit ca sursă principală pentru zona elastică.");
  if (qc.chosenRadial === "none") qc.notes.push("ν nu poate fi calculat fără canal radial valid (Ch8).");

  const series: TriaxialDerivedPoint[] = [];
  const h0 = meta.heightMm;
  const sigma3 = meta.sigma3Mpa;

  // Set initial displacement offset to the first finite value.
  const l0 = lvdtaMm.find(isFiniteNumber);

  for (let i = 0; i < table.rows.length; i++) {
    const load = loadKn[i];
    const disp = lvdtaMm[i];
    if (!isFiniteNumber(load) || !isFiniteNumber(disp)) continue;

    const sigma3Here = pressure?.[i];
    const sigma3Mpa = isFiniteNumber(sigma3Here) ? sigma3Here : sigma3;

    const forceN = knToN(load);
    const sigma1 = mpaFromForceN(forceN, a0);
    const q = sigma1 - sigma3Mpa;

    const epsAxialFromLvdta =
      isFiniteNumber(l0) && isFiniteNumber(disp) ? ((disp - l0) / h0) * -1 : undefined; // compression positive

    const e6 = eps6?.[i];
    const e7 = eps7?.[i];
    const gVals = [e6, e7].filter(isFiniteNumber);
    const epsAxialFromGauges = gVals.length > 0 ? microstrainToStrain(gVals.reduce((a, b) => a + b, 0) / gVals.length) : undefined;

    const e8 = eps8?.[i];
    const epsHoop = isFiniteNumber(e8) ? microstrainToStrain(e8) : undefined;

    series.push({
      i,
      t: t?.[i] ?? undefined,
      loadKn: load,
      lvdtaMm: disp,
      sigma3Mpa,
      sigma1Mpa: sigma1,
      qMpa: q,
      epsAxialFromLvdta,
      epsAxialFromGauges,
      epsHoop,
    });
  }

  // Strength point: peak σ1.
  const sigma1Arr = series.map((p) => p.sigma1Mpa);
  const peakIdxInSeries = argMax(sigma1Arr);
  const strength: StrengthPoint | null =
    peakIdxInSeries === null
      ? null
      : {
          sampleId: meta.id,
          sigma3Mpa: series[peakIdxInSeries].sigma3Mpa,
          sigma1PeakMpa: series[peakIdxInSeries].sigma1Mpa,
          peakIndex: series[peakIdxInSeries].i,
        };

  const elastic: ElasticFit | null = computeElasticFit({ meta, qc, series });

  return { meta, mapping, qc, series, strength, elastic };
}

function computeElasticFit(args: {
  meta: TriaxialSampleMeta;
  qc: TriaxialResult["qc"];
  series: TriaxialDerivedPoint[];
}): ElasticFit | null {
  const { qc, series } = args;
  if (series.length < 20) return null;

  const sigma1Peak = Math.max(...series.map((p) => p.sigma1Mpa));
  if (!Number.isFinite(sigma1Peak) || sigma1Peak <= 0) return null;

  const lo = 0.1 * sigma1Peak;
  const hi = 0.3 * sigma1Peak;

  const xEpsZ: number[] = [];
  const ySigma1: number[] = [];
  const xEpsZForNu: number[] = [];
  const yEpsR: number[] = [];

  let startIndex = -1;
  let endIndex = -1;

  for (let k = 0; k < series.length; k++) {
    const p = series[k];
    if (p.sigma1Mpa < lo || p.sigma1Mpa > hi) continue;
    const epsZ = qc.chosenAxial === "gauges" ? p.epsAxialFromGauges : p.epsAxialFromLvdta;
    if (!isFiniteNumber(epsZ)) continue;

    if (startIndex === -1) startIndex = p.i;
    endIndex = p.i;

    xEpsZ.push(epsZ);
    ySigma1.push(p.sigma1Mpa);

    if (qc.chosenRadial === "hoop8" && isFiniteNumber(p.epsHoop)) {
      xEpsZForNu.push(epsZ);
      yEpsR.push(p.epsHoop);
    }
  }

  if (xEpsZ.length < 8) {
    return {
      startIndex: 0,
      endIndex: 0,
      eGpa: null,
      nu: null,
      source: { axial: qc.chosenAxial, radial: qc.chosenRadial },
      notes: ["Nu am suficiente puncte în intervalul elastic (10–30% din σ1,peak)."],
    };
  }

  const regE = linearRegression(xEpsZ, ySigma1);
  let xEpsZAdj = xEpsZ;
  let xEpsZForNuAdj = xEpsZForNu;
  if (regE && regE.m < 0) {
    // Many gauges export compression as negative strain; normalize to compression-positive.
    xEpsZAdj = xEpsZ.map((v) => -v);
    xEpsZForNuAdj = xEpsZForNu.map((v) => -v);
  }

  const regE2 = linearRegression(xEpsZAdj, ySigma1);
  const eGpa = regE2 ? regE2.m / 1000 : null; // MPa per strain => MPa; convert to GPa

  let nu: number | null = null;
  const notes: string[] = [];
  if (qc.chosenRadial === "hoop8") {
    const regNu = linearRegression(xEpsZForNuAdj, yEpsR);
    if (regNu) nu = clamp(-regNu.m, 0, 0.49);
    else notes.push("Nu s-a putut ajusta ν (date insuficiente pe Ch8 în intervalul elastic).");
  }

  return {
    startIndex: startIndex === -1 ? 0 : startIndex,
    endIndex: endIndex === -1 ? 0 : endIndex,
    eGpa: isFiniteNumber(eGpa) ? eGpa : null,
    nu,
    source: { axial: qc.chosenAxial, radial: qc.chosenRadial },
    notes,
  };
}

export function fitMohrCoulomb(points: StrengthPoint[]): McFit {
  const notes: string[] = [];
  if (points.length < 2) {
    return { phiDeg: null, cMpa: null, m: null, bMpa: null, notes: ["Sunt necesare minim 2 puncte."] };
  }
  const x = points.map((p) => p.sigma3Mpa);
  const y = points.map((p) => p.sigma1PeakMpa);
  const reg = linearRegression(x, y);
  if (!reg) return { phiDeg: null, cMpa: null, m: null, bMpa: null, notes: ["Nu s-a putut face regresia."] };

  const m = reg.m;
  const b = reg.b;

  // sinφ = (m-1)/(m+1)
  if (!(m > 1)) notes.push("Panta m <= 1; rezultă φ neplauzibil (verifică unitățile și σ1/σ3).");
  const sinPhi = (m - 1) / (m + 1);
  if (!Number.isFinite(sinPhi) || sinPhi <= 0 || sinPhi >= 1) {
    return { phiDeg: null, cMpa: null, m, bMpa: b, notes: [...notes, "sinφ în afara (0,1)."] };
  }

  const phi = Math.asin(sinPhi);
  const cosPhi = Math.cos(phi);
  if (cosPhi <= 0) return { phiDeg: null, cMpa: null, m, bMpa: b, notes: [...notes, "cosφ <= 0."] };

  const c = (b * (1 - sinPhi)) / (2 * cosPhi);
  return {
    phiDeg: (phi * 180) / Math.PI,
    cMpa: Number.isFinite(c) ? c : null,
    m,
    bMpa: b,
    notes,
  };
}

