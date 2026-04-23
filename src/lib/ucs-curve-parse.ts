import type { UcsCurvePayload, UcsCurvePoint } from "@/lib/ucs-instrumentation";

type PointWithTimeStress = { t_s?: number | null; stress_mpa: number };

/**
 * Timpul (s) la σ maxim pe serie (UCS, Young sau orice puncte cu t_s + stress_mpa).
 */
export function timeSecondsAtPeakStressFromPoints(
  pts: ReadonlyArray<PointWithTimeStress> | null | undefined,
): number | null {
  if (!pts || pts.length === 0) return null;
  let bestI = -1;
  let bestStress = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    if (p.t_s == null || !Number.isFinite(p.t_s)) continue;
    if (!Number.isFinite(p.stress_mpa)) continue;
    if (p.stress_mpa > bestStress) {
      bestStress = p.stress_mpa;
      bestI = i;
    }
  }
  if (bestI < 0) return null;
  const t = pts[bestI]!.t_s;
  return t != null && Number.isFinite(t) ? t : null;
}

/**
 * Timpul (s) la punctul de tensiune maximă, doar dacă există `t_s` valid pe cel puțin un punct.
 * Folosit la import (câmp „Timp până la rupere” în date raport).
 */
export function timeSecondsAtPeakStressFromCurve(payload: UcsCurvePayload | null | undefined): number | null {
  return timeSecondsAtPeakStressFromPoints(payload?.points);
}

function splitLine(line: string): string[] {
  if (line.includes("\t")) return line.split("\t").map((s) => s.trim());
  return line.split(/[;,]/).map((s) => s.trim());
}

function normHeader(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/ch\s*/g, "ch")
    .trim();
}

function findCol(headers: string[], patterns: string[]): number {
  const h = headers.map(normHeader);
  for (const p of patterns) {
    const pn = normHeader(p);
    const i = h.findIndex((x) => x.includes(pn) || pn.includes(x));
    if (i >= 0) return i;
  }
  return -1;
}

/** µε → ε; folosit la import și ca implicit în UI. */
export const UCS_DEFAULT_STRAIN_SCALE = 1e-6;

function findLoadCh(headers: string[], ch: number): number {
  const h = headers.map(normHeader);
  // normHeader produce "load ch10" (fără spațiu) → avem nevoie să evităm match pe prefix (ch1 în ch10).
  const re = new RegExp(String.raw`\bload\b.*\bch${ch}(?!\d)\b`);
  return h.findIndex((x) => re.test(x));
}

/** Sarcina: Load ch 1 sau Load ch 2 (prese diferite); altfel coloană generică „Load … kN”. */
function pickLoadColumnIndex(headers: string[]): number {
  let i = findLoadCh(headers, 1);
  if (i >= 0) return i;
  i = findLoadCh(headers, 2);
  if (i >= 0) return i;
  return findCol(headers, ["load kn"]);
}

/**
 * Pentru varianta Basic (timp+forță): unele prese raportează forța relevantă pe ch2.
 * Aici prioritizăm Load ch2, apoi ch1.
 */
function pickLoadColumnIndexBasic(headers: string[]): number {
  let i = findLoadCh(headers, 2);
  if (i >= 0) return i;
  i = findLoadCh(headers, 1);
  if (i >= 0) return i;
  return findCol(headers, ["load kn"]);
}

export interface ParseUcsTabOptions {
  diameterMm: number;
  /** Înmulțitor pentru citiri marcă (ex. 1e-6 pentru microstrain). */
  strainScale?: number;
  /** Pentru ε din traductor: ε_ax ≈ (deplasare_mm × factor) / h. */
  heightMm?: number;
  /** mm per unitate brută coloană deplasare (implicit 1 = mm). */
  displacementScaleMm?: number;
  /**
   * Dacă false: importă puncte chiar fără ε (ignorați Strain ch6–8).
   * Folosit la varianta Basic (diametru + sarcină) pentru grafice t–F și t–σ.
   */
  requireStrain?: boolean;
}

/**
 * Parsează export tabular tip presă (Time, Load ch 1 sau ch 2 kN, Strain ch 6/7/8, Stress MPa, …).
 */
export function parseUcsMachineTabExport(text: string, opts: ParseUcsTabOptions): {
  payload: UcsCurvePayload;
  warnings: string[];
} {
  const warnings: string[] = [];
  const strainScale = opts.strainScale ?? UCS_DEFAULT_STRAIN_SCALE;
  const dispScale = opts.displacementScaleMm ?? 1;
  const requireStrain = opts.requireStrain !== false;
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { payload: { version: 1, points: [] }, warnings: ["Fișier gol sau fără date."] };
  }

  const headers = splitLine(lines[0]!);
  const iTime = findCol(headers, ["time s", "time", "timp"]);
  const iLoad = requireStrain ? pickLoadColumnIndex(headers) : pickLoadColumnIndexBasic(headers);
  const iStress = findCol(headers, ["stress mpa", "stress"]);
  const iDisp = findCol(headers, ["displacement ch 5", "displacement ch5"]);
  const iS6 = findCol(headers, ["strain ch 6", "strain ch6"]);
  const iS7 = findCol(headers, ["strain ch 7", "strain ch7"]);
  const iS8 = findCol(headers, ["strain ch 8", "strain ch8"]);

  if (iLoad < 0 && iStress < 0) {
    warnings.push("Nu s-a găsit coloană sarcină sau tensiune.");
    return { payload: { version: 1, points: [] }, warnings };
  }

  const rMm = opts.diameterMm / 2;
  const areaMm2 = Math.PI * rMm * rMm;

  const points: UcsCurvePoint[] = [];

  for (let li = 1; li < lines.length; li++) {
    const parts = splitLine(lines[li]!);
    const num = (idx: number) => {
      if (idx < 0 || idx >= parts.length) return NaN;
      return Number(String(parts[idx]).replace(",", "."));
    };

    const tVal = iTime >= 0 ? num(iTime) : NaN;

    let stressMpa: number;
    if (iStress >= 0) {
      stressMpa = num(iStress);
      if (!Number.isFinite(stressMpa) && iLoad >= 0) {
        const kn = num(iLoad);
        stressMpa = Number.isFinite(kn) ? (kn * 1000) / areaMm2 : NaN;
      }
    } else {
      const kn = num(iLoad);
      stressMpa = Number.isFinite(kn) ? (kn * 1000) / areaMm2 : NaN;
    }

    if (!Number.isFinite(stressMpa)) continue;

    // Raw gauge channels (scaled) kept for plotting/debugging; same sign convention as strain_axial.
    let strainCh6: number | null = null;
    let strainCh7: number | null = null;
    let strainCh8: number | null = null;
    if (iS6 >= 0) {
      const a = num(iS6);
      if (Number.isFinite(a)) strainCh6 = a * strainScale;
    }
    if (iS7 >= 0) {
      const b = num(iS7);
      if (Number.isFinite(b)) strainCh7 = b * strainScale;
    }
    if (iS8 >= 0) {
      const c = num(iS8);
      if (Number.isFinite(c)) strainCh8 = c * strainScale;
    }

    let strainAxial: number | null = null;
    if (requireStrain) {
      if (iS6 >= 0 && iS7 >= 0) {
        const a = num(iS6);
        const b = num(iS7);
        if (Number.isFinite(a) && Number.isFinite(b)) {
          strainAxial = ((a + b) / 2) * strainScale;
        }
      } else if (iS6 >= 0) {
        const a = num(iS6);
        if (Number.isFinite(a)) strainAxial = a * strainScale;
      }

      if (
        strainAxial === null &&
        iDisp >= 0 &&
        opts.heightMm != null &&
        opts.heightMm > 0
      ) {
        const dispRaw = num(iDisp);
        if (Number.isFinite(dispRaw)) {
          strainAxial = (dispRaw * dispScale) / opts.heightMm;
        }
      }
    }

    let strainRadial: number | null = null;
    if (requireStrain && iS8 >= 0) {
      const c = num(iS8);
      if (Number.isFinite(c)) strainRadial = c * strainScale;
    }

    let loadKn: number | null = null;
    if (iLoad >= 0) {
      const kn = num(iLoad);
      if (Number.isFinite(kn)) loadKn = kn;
    }
    if (loadKn === null && Number.isFinite(stressMpa)) {
      loadKn = (stressMpa * areaMm2) / 1000;
    }

    if (requireStrain) {
      if (strainAxial === null) continue;
    } else {
      // Basic variant: ε nu este folosită; folosim 0 ca placeholder (payload-ul cere număr finit).
      strainAxial = 0;
    }

    points.push({
      t_s: Number.isFinite(tVal) ? tVal : null,
      stress_mpa: stressMpa,
      strain_axial: strainAxial,
      strain_radial: strainRadial,
      strain_ch6: strainCh6,
      strain_ch7: strainCh7,
      strain_ch8: strainCh8,
      load_kn: loadKn,
    });
  }

  if (points.length === 0) {
    warnings.push(
      requireStrain
        ? "Nu s-au putut construi puncte (verificați coloanele de deformație)."
        : "Nu s-au putut construi puncte (verificați coloanele Time / Load / Stress).",
    );
  }

  if (points.length > 1) {
    const allHaveTime = points.every((p) => p.t_s != null && Number.isFinite(p.t_s));
    if (allHaveTime) {
      points.sort((a, b) => (a.t_s! - b.t_s!) || a.stress_mpa - b.stress_mpa);
    }
  }

  // Convenție aplicație: ε_axial > 0 = compresiune. Multe exporturi au compresiune ca ε negativ.
  if (requireStrain && points.length >= 8) {
    let iPeak = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i]!.stress_mpa > points[iPeak]!.stress_mpa) iPeak = i;
    }
    if (iPeak >= 1) {
      const e0 = points[0]!.strain_axial;
      const ePeak = points[iPeak]!.strain_axial;
      if (ePeak < e0 - 1e-15) {
        for (const p of points) {
          p.strain_axial = -p.strain_axial;
          if (p.strain_radial != null) p.strain_radial = -p.strain_radial;
          if (p.strain_ch6 != null) p.strain_ch6 = -p.strain_ch6;
          if (p.strain_ch7 != null) p.strain_ch7 = -p.strain_ch7;
          if (p.strain_ch8 != null) p.strain_ch8 = -p.strain_ch8;
        }
        warnings.push(
          "Semn ε inversat față de convenția ROCA (compresiune pozitivă); s-a corectat la import.",
        );
      }
    }
  }

  // v2: includes optional raw gauge channels (strain_ch6/7/8)
  return { payload: { version: 2, points }, warnings };
}

/** Heuristic: fișier tab cu header tip „Time” + „Load ch 1” sau „Load ch 2”. */
export function looksLikeUcsMachineTab(firstLine: string): boolean {
  const h = normHeader(firstLine);
  const hasTime = h.includes("time");
  const hasLoad =
    h.includes("load") &&
    (h.includes("ch 1") || h.includes("ch1") || h.includes("ch 2") || h.includes("ch2"));
  return hasTime && hasLoad && firstLine.includes("\t");
}
