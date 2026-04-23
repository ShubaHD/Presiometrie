export const TRIAXIAL_DEFAULT_DISPLACEMENT_SCALE_MM = 1;

export type TriaxialCurvePoint = {
  t_s: number | null;
  load_ch1_kn: number | null;
  load_ch2_kn: number | null;
  disp_ch5_mm: number | null;
  strain_ch6: number | null;
  strain_ch7: number | null;
  strain_ch8: number | null;
  confining_ch13_mpa: number | null;
  stress_mpa: number | null;
};

export type TriaxialCurvePayload = { version: 1; points: TriaxialCurvePoint[] };

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

function findLoadCh(headers: string[], ch: number): number {
  const h = headers.map(normHeader);
  const re = new RegExp(String.raw`\bload\b.*\bch${ch}(?!\d)\b`);
  return h.findIndex((x) => re.test(x));
}

export function looksLikeTriaxialMachineTab(firstLine: string): boolean {
  const h = normHeader(firstLine);
  const hasTime = h.includes("time");
  const hasLoad = h.includes("load") && (h.includes("ch1") || h.includes("ch 1") || h.includes("ch2") || h.includes("ch 2"));
  return hasTime && hasLoad && firstLine.includes("\t");
}

export interface ParseTriaxialTabOptions {
  /** Înmulțitor pentru citiri marcă (ex. 1e-6 pentru microstrain). */
  strainScale?: number;
  /** mm per unitate brută coloană deplasare (implicit 1 = mm). */
  displacementScaleMm?: number;
  /** Dacă true, cere minim un canal din [ch1,ch2,ch5,ch6,ch7,ch8,ch13] (altfel returnează gol). */
  requireSomeChannels?: boolean;
}

export function parseTriaxialMachineTabExport(
  text: string,
  opts: ParseTriaxialTabOptions,
): { payload: TriaxialCurvePayload; warnings: string[] } {
  const warnings: string[] = [];
  const strainScale = opts.strainScale ?? 1e-6;
  const dispScale = opts.displacementScaleMm ?? TRIAXIAL_DEFAULT_DISPLACEMENT_SCALE_MM;
  const requireSome = opts.requireSomeChannels !== false;

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { payload: { version: 1, points: [] }, warnings: ["Fișier gol sau fără date."] };
  }

  const headers = splitLine(lines[0]!);
  const iTime = findCol(headers, ["time s", "time", "timp"]);
  const iLoad1 = findLoadCh(headers, 1);
  const iLoad2 = findLoadCh(headers, 2);
  const iDisp5 = findCol(headers, ["displacement ch5", "displacement ch 5", "displacement"]);
  const iS6 = findCol(headers, ["strain ch6", "strain ch 6"]);
  const iS7 = findCol(headers, ["strain ch7", "strain ch 7"]);
  const iS8 = findCol(headers, ["strain ch8", "strain ch 8"]);
  const iC13 = findCol(headers, ["pressure ch13", "pressure ch 13", "confining", "sigma3", "σ3"]);
  const iStress = findCol(headers, ["stress mpa", "stress"]);

  if (requireSome && iTime < 0) warnings.push("Nu s-a găsit coloană Time.");
  if (iLoad1 < 0 && iLoad2 < 0) warnings.push("Nu s-a găsit Load ch1 sau Load ch2.");

  const points: TriaxialCurvePoint[] = [];
  for (let li = 1; li < lines.length; li++) {
    const parts = splitLine(lines[li]!);
    const num = (idx: number) => {
      if (idx < 0 || idx >= parts.length) return NaN;
      return Number(String(parts[idx]).replace(",", "."));
    };

    const tVal = iTime >= 0 ? num(iTime) : NaN;
    const t_s = Number.isFinite(tVal) ? tVal : null;

    const l1 = iLoad1 >= 0 ? num(iLoad1) : NaN;
    const l2 = iLoad2 >= 0 ? num(iLoad2) : NaN;
    const load_ch1_kn = Number.isFinite(l1) ? l1 : null;
    const load_ch2_kn = Number.isFinite(l2) ? l2 : null;

    const d5 = iDisp5 >= 0 ? num(iDisp5) : NaN;
    const disp_ch5_mm = Number.isFinite(d5) ? d5 * dispScale : null;

    const s6 = iS6 >= 0 ? num(iS6) : NaN;
    const s7 = iS7 >= 0 ? num(iS7) : NaN;
    const s8 = iS8 >= 0 ? num(iS8) : NaN;
    const strain_ch6 = Number.isFinite(s6) ? s6 * strainScale : null;
    const strain_ch7 = Number.isFinite(s7) ? s7 * strainScale : null;
    const strain_ch8 = Number.isFinite(s8) ? s8 * strainScale : null;

    const c13 = iC13 >= 0 ? num(iC13) : NaN;
    const confining_ch13_mpa = Number.isFinite(c13) ? c13 : null;

    const st = iStress >= 0 ? num(iStress) : NaN;
    const stress_mpa = Number.isFinite(st) ? st : null;

    const hasAny =
      t_s != null ||
      load_ch1_kn != null ||
      load_ch2_kn != null ||
      disp_ch5_mm != null ||
      strain_ch6 != null ||
      strain_ch7 != null ||
      strain_ch8 != null ||
      confining_ch13_mpa != null ||
      stress_mpa != null;
    if (!hasAny) continue;

    points.push({
      t_s,
      load_ch1_kn,
      load_ch2_kn,
      disp_ch5_mm,
      strain_ch6,
      strain_ch7,
      strain_ch8,
      confining_ch13_mpa,
      stress_mpa,
    });
  }

  if (requireSome && points.length < 2) {
    warnings.push("Nu au rezultat puncte suficiente (minim 2) din fișier.");
  }

  return { payload: { version: 1, points }, warnings };
}

export function clampTriaxialCurveForStorage(payload: TriaxialCurvePayload): TriaxialCurvePayload {
  const pts = payload.points ?? [];
  const max = 12_000;
  const step = pts.length > max ? Math.ceil(pts.length / max) : 1;
  const out: TriaxialCurvePoint[] = [];
  for (let i = 0; i < pts.length; i += step) {
    const p = pts[i]!;
    out.push({
      t_s: p.t_s != null && Number.isFinite(p.t_s) ? p.t_s : null,
      load_ch1_kn: p.load_ch1_kn != null && Number.isFinite(p.load_ch1_kn) ? p.load_ch1_kn : null,
      load_ch2_kn: p.load_ch2_kn != null && Number.isFinite(p.load_ch2_kn) ? p.load_ch2_kn : null,
      disp_ch5_mm: p.disp_ch5_mm != null && Number.isFinite(p.disp_ch5_mm) ? p.disp_ch5_mm : null,
      strain_ch6: p.strain_ch6 != null && Number.isFinite(p.strain_ch6) ? p.strain_ch6 : null,
      strain_ch7: p.strain_ch7 != null && Number.isFinite(p.strain_ch7) ? p.strain_ch7 : null,
      strain_ch8: p.strain_ch8 != null && Number.isFinite(p.strain_ch8) ? p.strain_ch8 : null,
      confining_ch13_mpa:
        p.confining_ch13_mpa != null && Number.isFinite(p.confining_ch13_mpa) ? p.confining_ch13_mpa : null,
      stress_mpa: p.stress_mpa != null && Number.isFinite(p.stress_mpa) ? p.stress_mpa : null,
    });
  }
  return { version: 1, points: out };
}

