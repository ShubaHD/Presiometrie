export const YOUNG_DEFAULT_STRAIN_SCALE = 1e-6;

export type YoungCurvePoint = {
  t_s: number | null;
  /** Axial stress in MPa (preferred for SR EN 14580). */
  stress_mpa: number;
  /** Axial load in kN (optional; kept for debugging/UI). */
  load_kn: number | null;
  /** Axial displacement in mm (for no-gauges mode). */
  disp_mm: number | null;
  /** Axial strain (dimensionless), if present in file (gauges mode). */
  strain_axial: number | null;
  /** Lateral strain (dimensionless), optional. */
  strain_lateral: number | null;
  /** Raw gauge channels (scaled by `strainScale`) kept for plotting/debugging. */
  strain_ch6?: number | null;
  strain_ch7?: number | null;
  strain_ch8?: number | null;
};

export type YoungCurvePayload = { version: 1 | 2; points: YoungCurvePoint[] };

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

function pickLoadColumnIndex(headers: string[]): number {
  let i = findCol(headers, ["load ch 1", "load ch1"]);
  if (i >= 0) return i;
  i = findCol(headers, ["load ch 2", "load ch2"]);
  if (i >= 0) return i;
  return findCol(headers, ["load kn"]);
}

/** Heuristic: fișier tab cu header tip „Time” + „Load ch …”. */
export function looksLikeYoungMachineTab(firstLine: string): boolean {
  const h = normHeader(firstLine);
  const hasTime = h.includes("time");
  const hasLoad =
    h.includes("load") &&
    (h.includes("ch 1") || h.includes("ch1") || h.includes("ch 2") || h.includes("ch2"));
  return hasTime && hasLoad && firstLine.includes("\t");
}

export interface ParseYoungTabOptions {
  diameterMm?: number;
  /** Înmulțitor pentru citiri marcă (ex. 1e-6 pentru microstrain). */
  strainScale?: number;
  /** mm per unitate brută coloană deplasare (implicit 1 = mm). */
  displacementScaleMm?: number;
}

function stressMpaFromLoadKn(loadKn: number, diameterMm: number): number {
  const rMm = diameterMm / 2;
  const areaMm2 = Math.PI * rMm * rMm;
  return (loadKn * 1000) / areaMm2;
}

/**
 * Parsează export tabular tip presă pentru Young (SR EN 14580).
 * Păstrează atât `Stress MPa` (dacă există) cât și `Load … kN` + `Displacement ch 5`.
 * Nu deduce automat „cu mărci” vs „fără mărci” — asta se decide în UI (`young_mode`).
 */
export function parseYoungMachineTabExport(
  text: string,
  opts: ParseYoungTabOptions,
): { payload: YoungCurvePayload; warnings: string[] } {
  const warnings: string[] = [];
  const strainScale = opts.strainScale ?? YOUNG_DEFAULT_STRAIN_SCALE;
  const dispScale = opts.displacementScaleMm ?? 1;

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { payload: { version: 1, points: [] }, warnings: ["Fișier gol sau fără date."] };
  }

  const headers = splitLine(lines[0]!);
  const iTime = findCol(headers, ["time s", "time", "timp"]);
  const iLoad = pickLoadColumnIndex(headers);
  const iStress = findCol(headers, ["stress mpa", "stress"]);
  const iDisp = findCol(headers, ["displacement ch 5", "displacement ch5", "displacement"]);
  const iS6 = findCol(headers, ["strain ch 6", "strain ch6"]);
  const iS7 = findCol(headers, ["strain ch 7", "strain ch7"]);
  const iS8 = findCol(headers, ["strain ch 8", "strain ch8"]);

  if (iStress < 0 && iLoad < 0) {
    warnings.push("Nu s-a găsit coloană Stress MPa sau Load … kN.");
    return { payload: { version: 1, points: [] }, warnings };
  }
  if (iStress < 0 && (opts.diameterMm == null || !(opts.diameterMm > 0))) {
    warnings.push("Lipsește Stress MPa; pentru calcul din Load setați diameter_mm.");
  }

  const points: YoungCurvePoint[] = [];

  for (let li = 1; li < lines.length; li++) {
    const parts = splitLine(lines[li]!);
    const num = (idx: number) => {
      if (idx < 0 || idx >= parts.length) return NaN;
      return Number(String(parts[idx]).replace(",", "."));
    };

    const tVal = iTime >= 0 ? num(iTime) : NaN;
    const t_s = Number.isFinite(tVal) ? tVal : null;

    let load_kn: number | null = null;
    if (iLoad >= 0) {
      const kn = num(iLoad);
      if (Number.isFinite(kn)) load_kn = kn;
    }

    let stress_mpa: number;
    if (iStress >= 0) {
      stress_mpa = num(iStress);
      if (!Number.isFinite(stress_mpa) && load_kn != null && opts.diameterMm && opts.diameterMm > 0) {
        stress_mpa = stressMpaFromLoadKn(load_kn, opts.diameterMm);
      }
    } else if (load_kn != null && opts.diameterMm && opts.diameterMm > 0) {
      stress_mpa = stressMpaFromLoadKn(load_kn, opts.diameterMm);
    } else {
      continue;
    }
    if (!Number.isFinite(stress_mpa)) continue;

    let disp_mm: number | null = null;
    if (iDisp >= 0) {
      const d = num(iDisp);
      if (Number.isFinite(d)) disp_mm = d * dispScale;
    }

    const strain_ch6 = iS6 >= 0 ? (Number.isFinite(num(iS6)) ? num(iS6) * strainScale : null) : null;
    const strain_ch7 = iS7 >= 0 ? (Number.isFinite(num(iS7)) ? num(iS7) * strainScale : null) : null;
    const strain_ch8 = iS8 >= 0 ? (Number.isFinite(num(iS8)) ? num(iS8) * strainScale : null) : null;

    let strain_axial: number | null = null;
    if (iS6 >= 0 && iS7 >= 0) {
      const a = num(iS6);
      const b = num(iS7);
      if (Number.isFinite(a) && Number.isFinite(b)) strain_axial = ((a + b) / 2) * strainScale;
    } else if (iS6 >= 0) {
      const a = num(iS6);
      if (Number.isFinite(a)) strain_axial = a * strainScale;
    }

    let strain_lateral: number | null = null;
    if (iS8 >= 0) {
      const c = num(iS8);
      if (Number.isFinite(c)) strain_lateral = c * strainScale;
    }

    points.push({
      t_s,
      stress_mpa,
      load_kn,
      disp_mm,
      strain_axial,
      strain_lateral,
      strain_ch6,
      strain_ch7,
      strain_ch8,
    });
  }

  return { payload: { version: 2, points }, warnings };
}

export function clampYoungCurveForStorage(payload: YoungCurvePayload): YoungCurvePayload {
  const pts = payload.points ?? [];
  const max = 12_000;
  const step = pts.length > max ? Math.ceil(pts.length / max) : 1;
  const out: YoungCurvePoint[] = [];
  for (let i = 0; i < pts.length; i += step) {
    const p = pts[i]!;
    out.push({
      t_s: p.t_s != null && Number.isFinite(p.t_s) ? p.t_s : null,
      stress_mpa: Number.isFinite(p.stress_mpa) ? p.stress_mpa : 0,
      load_kn: p.load_kn != null && Number.isFinite(p.load_kn) ? p.load_kn : null,
      disp_mm: p.disp_mm != null && Number.isFinite(p.disp_mm) ? p.disp_mm : null,
      strain_axial: p.strain_axial != null && Number.isFinite(p.strain_axial) ? p.strain_axial : null,
      strain_lateral: p.strain_lateral != null && Number.isFinite(p.strain_lateral) ? p.strain_lateral : null,
      strain_ch6: p.strain_ch6 != null && Number.isFinite(p.strain_ch6) ? p.strain_ch6 : null,
      strain_ch7: p.strain_ch7 != null && Number.isFinite(p.strain_ch7) ? p.strain_ch7 : null,
      strain_ch8: p.strain_ch8 != null && Number.isFinite(p.strain_ch8) ? p.strain_ch8 : null,
    });
  }
  return { version: payload.version === 2 ? 2 : 1, points: out };
}

