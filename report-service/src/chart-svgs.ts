/** Grafice simple SVG pentru PDF (fără dependențe externe). */

const W = 520;
const H = 238;
const PAD_L = 64;
const PAD_R = 20;
const PAD_T = 30;
const PAD_B = 58;
/** Fonturi explicite — Puppeteer/Chrome le rende corect în PDF. */
const SVG_FONT =
  'font-family="Arial, Helvetica, DejaVu Sans, Liberation Sans, sans-serif"';

function decimate<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = Math.ceil(arr.length / max);
  return arr.filter((_, i) => i % step === 0);
}

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function niceNum(range: number, round: boolean): number {
  if (!Number.isFinite(range) || range <= 0) return 0.001;
  const exp = Math.floor(Math.log10(range));
  const f = range / 10 ** exp;
  let nf: number;
  if (round) {
    if (f < 1.5) nf = 1;
    else if (f < 3) nf = 2;
    else if (f < 7) nf = 5;
    else nf = 10;
  } else {
    if (f <= 1) nf = 1;
    else if (f <= 2) nf = 2;
    else if (f <= 5) nf = 5;
    else nf = 10;
  }
  return nf * 10 ** exp;
}

function axisRange(min: number, max: number, padRatio = 0.06): { lo: number; hi: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { lo: 0, hi: 1 };
  if (min === max) {
    const d = Math.abs(min) > 1e-9 ? Math.abs(min) * 0.1 : 0.01;
    return { lo: min - d, hi: max + d };
  }
  const span = max - min;
  const pad = span * padRatio;
  let lo = min - pad;
  let hi = max + pad;
  if (hi <= 0 && max >= 0) hi = max + span * 0.05;
  if (lo > 0 && min >= 0) lo = Math.max(0, min - span * 0.02);
  return { lo, hi };
}

function axisDomainFromZero(min: number, max: number, padRatio = 0.06): { lo: number; hi: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { lo: 0, hi: 1 };
  if (min >= 0) {
    const span = Math.max(max - min, max * 0.02, 1e-9);
    return { lo: 0, hi: max + span * padRatio };
  }
  return axisRange(min, max, padRatio);
}

function buildTickValues(lo: number, hi: number): number[] {
  const span = hi - lo;
  if (!Number.isFinite(span) || span <= 0) {
    return Number.isFinite(lo) ? [lo] : [0];
  }
  // Vrem ~6 tick-uri vizibile (incluzând capetele) ca să nu rămână doar min/max.
  // Folosim un pas "nice" pornind de la span/(N-1), apoi completăm cu capete dacă lipsesc.
  const targetTicks = 6;
  const tick = niceNum(span / Math.max(1, targetTicks - 1), true);
  const ticks: number[] = [];
  const start = Math.ceil((lo - 1e-12) / tick) * tick;
  for (let v = start; v <= hi + tick * 0.01; v += tick) {
    if (v >= lo - 1e-9) ticks.push(v);
    if (ticks.length > 16) break;
  }
  if (ticks.length === 0) return [lo, hi];
  if (ticks.length === 1) {
    const t0 = ticks[0]!;
    if (Math.abs(hi - lo) < 1e-12) return [t0];
    return lo < t0 ? [lo, t0] : [t0, hi];
  }
  if (ticks[0]! > lo + span * 0.03) ticks.unshift(lo);
  const last = ticks[ticks.length - 1]!;
  if (last < hi - span * 0.03) ticks.push(hi);
  return ticks;
}

function fmtTickTime(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1000 || (a > 0 && a < 1e-6)) return v.toExponential(1);
  if (a < 10) return v.toFixed(2);
  if (a < 100) return v.toFixed(1);
  return v.toFixed(0);
}

function fmtTickStrain(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1000 || (a > 0 && a < 1e-5)) return v.toExponential(1);
  if (a < 0.1) return v.toFixed(4);
  return v.toFixed(3);
}

function fmtTickLoad(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1000 || (a > 0 && a < 1e-4)) return v.toExponential(1);
  if (a < 10) return v.toFixed(2);
  if (a < 100) return v.toFixed(1);
  return v.toFixed(0);
}

function fmtTickStress(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1000 || (a > 0 && a < 1e-4)) return v.toExponential(1);
  if (a < 10) return v.toFixed(2);
  return v.toFixed(1);
}

function svgAxesAndTicks(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  fmtX: (v: number) => string,
  fmtY: (v: number) => string,
): {
  grid: string;
  xLbl: string;
  yLbl: string;
  rangeLine: string;
  X: (x: number) => number;
  Y: (y: number) => number;
  innerH: number;
} {
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const sx = innerW / (maxX - minX || 1e-12);
  const sy = innerH / (maxY - minY || 1e-12);
  const X = (x: number) => PAD_L + (x - minX) * sx;
  const Y = (y: number) => PAD_T + (maxY - y) * sy;

  const xTicks = buildTickValues(minX, maxX);
  const yTicks = buildTickValues(minY, maxY);

  let grid = "";
  for (const x of xTicks) {
    const px = X(x);
    grid += `<line x1="${px}" y1="${PAD_T}" x2="${px}" y2="${H - PAD_B}" stroke="#c8c8c8" stroke-width="0.65"/>`;
  }
  for (const y of yTicks) {
    const py = Y(y);
    grid += `<line x1="${PAD_L}" y1="${py}" x2="${W - PAD_R}" y2="${py}" stroke="#c8c8c8" stroke-width="0.65"/>`;
  }

  const yTickX = PAD_L - 6;
  const xTickY = H - 36;

  let xLbl = "";
  for (const x of xTicks) {
    const px = X(x);
    xLbl += `<text x="${px}" y="${xTickY}" text-anchor="middle" font-size="9" fill="#111" ${SVG_FONT}>${escXml(fmtX(x))}</text>`;
  }
  let yLbl = "";
  for (const y of yTicks) {
    const py = Y(y);
    yLbl += `<text x="${yTickX}" y="${py + 3.5}" text-anchor="end" font-size="9" fill="#111" ${SVG_FONT}>${escXml(fmtY(y))}</text>`;
  }

  const cx = (PAD_L + W - PAD_R) / 2;
  const rangeLine = `<text x="${cx}" y="${H - 20}" text-anchor="middle" font-size="8" fill="#333" ${SVG_FONT}>${escXml(
    `Plajă: ${fmtX(minX)} … ${fmtX(maxX)} (abscisă) · ${fmtY(minY)} … ${fmtY(maxY)} (ordonată)`,
  )}</text>`;

  return { grid, xLbl, yLbl, rangeLine, X, Y, innerH };
}

function svgOpen(title: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escXml(title)}" ${SVG_FONT}>`;
}

export function stressStrainSvg(
  points: { strain: number; stress: number }[],
  title = "σ – ε_axial",
): string | null {
  if (points.length < 2) return null;
  const dec = decimate(points, 800);
  const xs = dec.map((p) => p.strain);
  const ys = dec.map((p) => p.stress);
  const minX0 = Math.min(...xs);
  const maxX0 = Math.max(...xs);
  const minY0 = Math.min(...ys);
  const maxY0 = Math.max(...ys);
  const rx = axisDomainFromZero(minX0, maxX0);
  const ry = axisDomainFromZero(minY0, maxY0);
  const { grid, xLbl, yLbl, rangeLine, X, Y, innerH } = svgAxesAndTicks(
    rx.lo,
    rx.hi,
    ry.lo,
    ry.hi,
    fmtTickStrain,
    fmtTickStress,
  );
  const poly = dec.map((p) => `${X(p.strain).toFixed(2)},${Y(p.stress).toFixed(2)}`).join(" ");

  return `${svgOpen(title)}
  <rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>
  <text x="${W / 2}" y="17" text-anchor="middle" font-size="11" font-weight="600" fill="#0f3d3e">${escXml(title)}</text>
  ${grid}
  <line x1="${PAD_L}" y1="${PAD_T}" x2="${PAD_L}" y2="${H - PAD_B}" stroke="#222" stroke-width="1.1"/>
  <line x1="${PAD_L}" y1="${H - PAD_B}" x2="${W - PAD_R}" y2="${H - PAD_B}" stroke="#222" stroke-width="1.1"/>
  <polyline fill="none" stroke="#1a4d6d" stroke-width="1.35" points="${poly}"/>
  ${xLbl}
  ${yLbl}
  ${rangeLine}
  <text x="${(PAD_L + W - PAD_R) / 2}" y="${H - 5}" text-anchor="middle" font-size="9" fill="#222">ε_axial (—)</text>
  <text transform="translate(14,${PAD_T + innerH / 2}) rotate(-90)" text-anchor="middle" font-size="9" fill="#222">σ (MPa)</text>
</svg>`;
}

export function loadStrainSvg(
  points: { strain: number; load: number }[],
  title = "Sarcină – ε_axial",
  yLabel = "F (kN)",
): string | null {
  if (points.length < 2) return null;
  const dec = decimate(points, 800);
  const xs = dec.map((p) => p.strain);
  const ys = dec.map((p) => p.load);
  const rx = axisDomainFromZero(Math.min(...xs), Math.max(...xs));
  const ry = axisDomainFromZero(Math.min(...ys), Math.max(...ys));
  const { grid, xLbl, yLbl, rangeLine, X, Y, innerH } = svgAxesAndTicks(
    rx.lo,
    rx.hi,
    ry.lo,
    ry.hi,
    fmtTickStrain,
    fmtTickLoad,
  );
  const poly = dec.map((p) => `${X(p.strain).toFixed(2)},${Y(p.load).toFixed(2)}`).join(" ");

  return `${svgOpen(title)}
  <rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>
  <text x="${W / 2}" y="17" text-anchor="middle" font-size="11" font-weight="600" fill="#0f3d3e">${escXml(title)}</text>
  ${grid}
  <line x1="${PAD_L}" y1="${PAD_T}" x2="${PAD_L}" y2="${H - PAD_B}" stroke="#222" stroke-width="1.1"/>
  <line x1="${PAD_L}" y1="${H - PAD_B}" x2="${W - PAD_R}" y2="${H - PAD_B}" stroke="#222" stroke-width="1.1"/>
  <polyline fill="none" stroke="#2d6a4f" stroke-width="1.35" points="${poly}"/>
  ${xLbl}
  ${yLbl}
  ${rangeLine}
  <text x="${(PAD_L + W - PAD_R) / 2}" y="${H - 5}" text-anchor="middle" font-size="9" fill="#222">ε_axial (—)</text>
  <text transform="translate(14,${PAD_T + innerH / 2}) rotate(-90)" text-anchor="middle" font-size="9" fill="#222">${escXml(yLabel)}</text>
</svg>`;
}

export function loadStrainChannelsSvg(
  points: Array<{ load: number; ch6: number | null; ch7: number | null; ch8: number | null }>,
  title = "Sarcină – mărci tensiometrice (Ch6/Ch7/Ch8)",
): string | null {
  if (!points || points.length < 2) return null;
  const dec = decimate(points, 900);
  const loads = dec.map((p) => p.load).filter((x) => Number.isFinite(x));
  if (loads.length < 2) return null;

  const ys: number[] = [];
  for (const p of dec) {
    for (const v of [p.ch6, p.ch7, p.ch8]) {
      if (v != null && Number.isFinite(v)) ys.push(v);
    }
  }
  if (ys.length < 2) return null;

  const rx = axisDomainFromZero(Math.min(...loads), Math.max(...loads));
  const ry = axisRange(Math.min(...ys), Math.max(...ys));
  const { grid, xLbl, yLbl, rangeLine, X, Y, innerH } = svgAxesAndTicks(
    rx.lo,
    rx.hi,
    ry.lo,
    ry.hi,
    fmtTickLoad,
    fmtTickStrain,
  );

  const polyFor = (key: "ch6" | "ch7" | "ch8") => {
    const pts: string[] = [];
    for (const p of dec) {
      const v = p[key];
      if (v == null || !Number.isFinite(v)) continue;
      pts.push(`${X(p.load).toFixed(2)},${Y(v).toFixed(2)}`);
    }
    return pts.length >= 2 ? pts.join(" ") : "";
  };
  const p6 = polyFor("ch6");
  const p7 = polyFor("ch7");
  const p8 = polyFor("ch8");
  if (!p6 && !p7 && !p8) return null;

  // Legend must not overlap the title (title is at y=17).
  const lx = PAD_L + 6;
  const ly = PAD_T + 12;
  const l1 = lx + 16;
  const l2 = lx + 118;
  const l3 = lx + 220;
  const legend = `
    <g>
      <rect x="${lx - 4}" y="${ly - 10}" width="318" height="16" fill="#fff" opacity="0.75" />
      <line x1="${lx}" y1="${ly}" x2="${lx + 12}" y2="${ly}" stroke="#1a4d6d" stroke-width="2"/>
      <text x="${l1}" y="${ly + 3}" font-size="8.5" fill="#111" ${SVG_FONT}>Ch6 — vertical</text>
      <line x1="${lx + 102}" y1="${ly}" x2="${lx + 114}" y2="${ly}" stroke="#2d6a4f" stroke-width="2"/>
      <text x="${l2}" y="${ly + 3}" font-size="8.5" fill="#111" ${SVG_FONT}>Ch7 — vertical</text>
      <line x1="${lx + 204}" y1="${ly}" x2="${lx + 216}" y2="${ly}" stroke="#b45309" stroke-width="2"/>
      <text x="${l3}" y="${ly + 3}" font-size="8.5" fill="#111" ${SVG_FONT}>Ch8 — orizontal</text>
    </g>`;

  return `${svgOpen(title)}
  <rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>
  <text x="${W / 2}" y="16" text-anchor="middle" font-size="10.5" font-weight="600" fill="#0f3d3e">${escXml(title)}</text>
  ${grid}
  <line x1="${PAD_L}" y1="${PAD_T}" x2="${PAD_L}" y2="${H - PAD_B}" stroke="#222" stroke-width="1.1"/>
  <line x1="${PAD_L}" y1="${H - PAD_B}" x2="${W - PAD_R}" y2="${H - PAD_B}" stroke="#222" stroke-width="1.1"/>
  ${p6 ? `<polyline fill="none" stroke="#1a4d6d" stroke-width="1.25" points="${p6}"/>` : ""}
  ${p7 ? `<polyline fill="none" stroke="#2d6a4f" stroke-width="1.25" points="${p7}"/>` : ""}
  ${p8 ? `<polyline fill="none" stroke="#b45309" stroke-width="1.25" points="${p8}"/>` : ""}
  ${legend}
  ${xLbl}
  ${yLbl}
  ${rangeLine}
  <text x="${(PAD_L + W - PAD_R) / 2}" y="${H - 5}" text-anchor="middle" font-size="9" fill="#222">F (kN)</text>
  <text transform="translate(14,${PAD_T + innerH / 2}) rotate(-90)" text-anchor="middle" font-size="9" fill="#222">ε (—)</text>
</svg>`;
}

function fmtTickStrainPercent(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1000 || (a > 0 && a < 1e-4)) return v.toExponential(1);
  if (a < 10) return v.toFixed(2);
  return v.toFixed(1);
}

/** σ (kPa) vs ε (%) — grafic principal compresiune monoaxială pământ. */
export function soilStressStrainSvg(
  points: { strainPct: number; stressKpa: number }[],
  title = "σ – ε (principal)",
): string | null {
  if (points.length < 2) return null;
  const dec = decimate(points, 800);
  const xs = dec.map((p) => p.strainPct);
  const ys = dec.map((p) => p.stressKpa);
  const rx = axisDomainFromZero(Math.min(...xs), Math.max(...xs));
  const ry = axisDomainFromZero(Math.min(...ys), Math.max(...ys));
  const { grid, xLbl, yLbl, rangeLine, X, Y, innerH } = svgAxesAndTicks(
    rx.lo,
    rx.hi,
    ry.lo,
    ry.hi,
    fmtTickStrainPercent,
    fmtTickLoad,
  );
  const poly = dec.map((p) => `${X(p.strainPct).toFixed(2)},${Y(p.stressKpa).toFixed(2)}`).join(" ");

  return `${svgOpen(title)}
  <rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>
  <text x="${W / 2}" y="17" text-anchor="middle" font-size="11" font-weight="600" fill="#0f3d3e">${escXml(title)}</text>
  ${grid}
  <line x1="${PAD_L}" y1="${PAD_T}" x2="${PAD_L}" y2="${H - PAD_B}" stroke="#222" stroke-width="1.1"/>
  <line x1="${PAD_L}" y1="${H - PAD_B}" x2="${W - PAD_R}" y2="${H - PAD_B}" stroke="#222" stroke-width="1.1"/>
  <polyline fill="none" stroke="#2d6a4f" stroke-width="1.35" points="${poly}"/>
  ${xLbl}
  ${yLbl}
  ${rangeLine}
  <text x="${(PAD_L + W - PAD_R) / 2}" y="${H - 5}" text-anchor="middle" font-size="9" fill="#222">ε (%)</text>
  <text transform="translate(14,${PAD_T + innerH / 2}) rotate(-90)" text-anchor="middle" font-size="9" fill="#222">σ (kPa)</text>
</svg>`;
}

function fmtTickMm(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1000) return v.toFixed(0);
  if (a < 0.1) return v.toFixed(4);
  if (a < 10) return v.toFixed(2);
  return v.toFixed(1);
}

/** σ (kPa) vs ε_V,aprox (%) — ε_V ≈ ε_ax(1−2ν), ν ≈ 0,35 (fără deformații radiale măsurate). */
export function soilStressVolStrainSvg(
  points: { strainVolPct: number; stressKpa: number }[],
  title = "σ – ε_V (aprox.)",
): string | null {
  if (points.length < 2) return null;
  const dec = decimate(points, 800);
  const xs = dec.map((p) => p.strainVolPct);
  const ys = dec.map((p) => p.stressKpa);
  const rx = axisDomainFromZero(Math.min(...xs), Math.max(...xs));
  const ry = axisDomainFromZero(Math.min(...ys), Math.max(...ys));
  const { grid, xLbl, yLbl, rangeLine, X, Y, innerH } = svgAxesAndTicks(
    rx.lo,
    rx.hi,
    ry.lo,
    ry.hi,
    fmtTickStrainPercent,
    fmtTickLoad,
  );
  const poly = dec.map((p) => `${X(p.strainVolPct).toFixed(2)},${Y(p.stressKpa).toFixed(2)}`).join(" ");

  return `${svgOpen(title)}
  <rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>
  <text x="${W / 2}" y="17" text-anchor="middle" font-size="11" font-weight="600" fill="#0f3d3e">${escXml(title)}</text>
  <text x="${W / 2}" y="29" text-anchor="middle" font-size="8" fill="#555" ${SVG_FONT}>ε_V ≈ ε_ax(1−2ν), ν ≈ 0,35</text>
  ${grid}
  <line x1="${PAD_L}" y1="${PAD_T}" x2="${PAD_L}" y2="${H - PAD_B}" stroke="#222" stroke-width="1.1"/>
  <line x1="${PAD_L}" y1="${H - PAD_B}" x2="${W - PAD_R}" y2="${H - PAD_B}" stroke="#222" stroke-width="1.1"/>
  <polyline fill="none" stroke="#7c3aed" stroke-width="1.35" points="${poly}"/>
  ${xLbl}
  ${yLbl}
  ${rangeLine}
  <text x="${(PAD_L + W - PAD_R) / 2}" y="${H - 5}" text-anchor="middle" font-size="9" fill="#222">ε_V,aprox (%)</text>
  <text transform="translate(14,${PAD_T + innerH / 2}) rotate(-90)" text-anchor="middle" font-size="9" fill="#222">σ (kPa)</text>
</svg>`;
}

const SOIL_DUAL_PAD_R = 64;

/** ε (%) și deplasare ΔH (mm) vs timp t (s) — două ordonate. */
export function soilEpsilonDispTimeDualSvg(
  points: { t: number; strainPct: number; dispMm: number }[],
  title = "ε și ΔH – timp",
): string | null {
  if (points.length < 2) return null;
  const dec = decimate(points, 800);
  const ts = dec.map((p) => p.t);
  const es = dec.map((p) => p.strainPct);
  const ds = dec.map((p) => p.dispMm);
  const rt = axisDomainFromZero(Math.min(...ts), Math.max(...ts));
  const re = axisDomainFromZero(Math.min(...es), Math.max(...es));
  const rd = axisDomainFromZero(Math.min(...ds), Math.max(...ds));

  const innerW = W - PAD_L - SOIL_DUAL_PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const sx = innerW / (rt.hi - rt.lo || 1e-12);
  const sye = innerH / (re.hi - re.lo || 1e-12);
  const syd = innerH / (rd.hi - rd.lo || 1e-12);
  const X = (t: number) => PAD_L + (t - rt.lo) * sx;
  const Ye = (e: number) => PAD_T + (re.hi - e) * sye;
  const Yd = (d: number) => PAD_T + (rd.hi - d) * syd;
  const xAxisRight = PAD_L + innerW;

  const xTicks = buildTickValues(rt.lo, rt.hi);
  const eTicks = buildTickValues(re.lo, re.hi);
  const dTicks = buildTickValues(rd.lo, rd.hi);

  let grid = "";
  for (const x of xTicks) {
    const px = X(x);
    grid += `<line x1="${px}" y1="${PAD_T}" x2="${px}" y2="${H - PAD_B}" stroke="#c8c8c8" stroke-width="0.65"/>`;
  }
  for (const e of eTicks) {
    const py = Ye(e);
    grid += `<line x1="${PAD_L}" y1="${py}" x2="${xAxisRight}" y2="${py}" stroke="#c8c8c8" stroke-width="0.65"/>`;
  }

  let xLbl = "";
  const xTickY = H - 36;
  for (const x of xTicks) {
    const px = X(x);
    xLbl += `<text x="${px}" y="${xTickY}" text-anchor="middle" font-size="9" fill="#111" ${SVG_FONT}>${escXml(fmtTickTime(x))}</text>`;
  }
  let yLblL = "";
  for (const e of eTicks) {
    const py = Ye(e);
    yLblL += `<text x="${PAD_L - 6}" y="${py + 3.5}" text-anchor="end" font-size="9" fill="#111" ${SVG_FONT}>${escXml(fmtTickStrainPercent(e))}</text>`;
  }
  let yLblR = "";
  for (const d of dTicks) {
    const py = Yd(d);
    yLblR += `<text x="${xAxisRight + 8}" y="${py + 3.5}" text-anchor="start" font-size="9" fill="#111" ${SVG_FONT}>${escXml(fmtTickMm(d))}</text>`;
  }

  const polyE = dec.map((p) => `${X(p.t).toFixed(2)},${Ye(p.strainPct).toFixed(2)}`).join(" ");
  const polyD = dec.map((p) => `${X(p.t).toFixed(2)},${Yd(p.dispMm).toFixed(2)}`).join(" ");

  const lx = PAD_L + 6;
  const ly = PAD_T + 10;
  const legend = `
    <g>
      <rect x="${lx - 4}" y="${ly - 10}" width="220" height="16" fill="#fff" opacity="0.82" />
      <line x1="${lx}" y1="${ly}" x2="${lx + 12}" y2="${ly}" stroke="#2d6a4f" stroke-width="2"/>
      <text x="${lx + 16}" y="${ly + 3}" font-size="8.5" fill="#111" ${SVG_FONT}>ε (%)</text>
      <line x1="${lx + 72}" y1="${ly}" x2="${lx + 84}" y2="${ly}" stroke="#6a3d9a" stroke-width="2"/>
      <text x="${lx + 88}" y="${ly + 3}" font-size="8.5" fill="#111" ${SVG_FONT}>ΔH (mm)</text>
    </g>`;

  const cx = (PAD_L + xAxisRight) / 2;
  const rangeLine = `<text x="${cx}" y="${H - 20}" text-anchor="middle" font-size="8" fill="#333" ${SVG_FONT}>${escXml(
    `t: ${fmtTickTime(rt.lo)} … ${fmtTickTime(rt.hi)} · ε: ${fmtTickStrainPercent(re.lo)} … ${fmtTickStrainPercent(re.hi)} · ΔH: ${fmtTickMm(rd.lo)} … ${fmtTickMm(rd.hi)}`,
  )}</text>`;

  return `${svgOpen(title)}
  <rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>
  <text x="${W / 2}" y="17" text-anchor="middle" font-size="11" font-weight="600" fill="#0f3d3e">${escXml(title)}</text>
  ${legend}
  ${grid}
  <line x1="${PAD_L}" y1="${PAD_T}" x2="${PAD_L}" y2="${H - PAD_B}" stroke="#222" stroke-width="1.1"/>
  <line x1="${xAxisRight}" y1="${PAD_T}" x2="${xAxisRight}" y2="${H - PAD_B}" stroke="#222" stroke-width="1.1"/>
  <line x1="${PAD_L}" y1="${H - PAD_B}" x2="${xAxisRight}" y2="${H - PAD_B}" stroke="#222" stroke-width="1.1"/>
  <polyline fill="none" stroke="#2d6a4f" stroke-width="1.35" points="${polyE}"/>
  <polyline fill="none" stroke="#6a3d9a" stroke-width="1.35" points="${polyD}"/>
  ${xLbl}
  ${yLblL}
  ${yLblR}
  ${rangeLine}
  <text x="${cx}" y="${H - 5}" text-anchor="middle" font-size="9" fill="#222">t (s)</text>
  <text transform="translate(14,${PAD_T + innerH / 2}) rotate(-90)" text-anchor="middle" font-size="9" fill="#222">ε (%)</text>
  <text transform="translate(${W - 18},${PAD_T + innerH / 2}) rotate(-90)" text-anchor="middle" font-size="9" fill="#222">ΔH (mm)</text>
</svg>`;
}

/** Cerc Mohr τ–σ pentru monoaxială: σ₁ = q_u, σ₃ = 0 (kPa); opțional dreaptă τ = c_u. */
export function soilMohrQuCuSvg(
  quKpa: number,
  cuKpa: number | null,
  title = "Cerc Mohr (q_u, c_u)",
): string | null {
  if (!Number.isFinite(quKpa) || quKpa <= 0) return null;
  const sigma1 = quKpa;
  const sigma3 = 0;
  const center = (sigma1 + sigma3) / 2;
  const r = Math.max((sigma1 - sigma3) / 2, 0);
  const steps = 48;
  const arc: { sigma: number; tau: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (Math.PI * i) / steps;
    arc.push({
      sigma: center + r * Math.cos(t),
      tau: r * Math.sin(t),
    });
  }

  const minS = Math.min(sigma3, center - r) - Math.max(r * 0.12, quKpa * 0.02);
  const maxS = Math.max(sigma1, center + r) + Math.max(r * 0.12, quKpa * 0.02);
  const cuOk = cuKpa != null && Number.isFinite(cuKpa) && cuKpa > 0;
  const maxT = Math.max(r * 1.12, cuOk ? (cuKpa as number) * 1.08 : 0, 1);

  const rx = axisRange(minS, maxS);
  const ry = axisDomainFromZero(0, maxT);
  const { grid, xLbl, yLbl, rangeLine, X, Y, innerH } = svgAxesAndTicks(
    rx.lo,
    rx.hi,
    ry.lo,
    ry.hi,
    fmtTickLoad,
    fmtTickLoad,
  );
  const poly = arc.map((p) => `${X(p.sigma).toFixed(2)},${Y(p.tau).toFixed(2)}`).join(" ");

  let cuLine = "";
  if (cuOk && (cuKpa as number) <= maxT * 1.02) {
    const yc = Y(cuKpa as number);
    cuLine = `<line x1="${X(rx.lo).toFixed(2)}" y1="${yc.toFixed(2)}" x2="${X(rx.hi).toFixed(2)}" y2="${yc.toFixed(2)}" stroke="#b45309" stroke-width="1.2" stroke-dasharray="5 4"/>
    <text x="${X(rx.hi) - 4}" y="${(yc - 6).toFixed(2)}" text-anchor="end" font-size="8.5" fill="#7c2d12" ${SVG_FONT}>τ = c_u</text>`;
  }

  return `${svgOpen(title)}
  <rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>
  <text x="${W / 2}" y="17" text-anchor="middle" font-size="11" font-weight="600" fill="#0f3d3e">${escXml(title)}</text>
  <text x="${W / 2}" y="29" text-anchor="middle" font-size="8" fill="#444" ${SVG_FONT}>σ₃ = 0, σ₁ = q_u = ${escXml(`${quKpa.toFixed(0)} kPa`)}</text>
  ${grid}
  <line x1="${PAD_L}" y1="${PAD_T}" x2="${PAD_L}" y2="${H - PAD_B}" stroke="#222" stroke-width="1.1"/>
  <line x1="${PAD_L}" y1="${H - PAD_B}" x2="${W - PAD_R}" y2="${H - PAD_B}" stroke="#222" stroke-width="1.1"/>
  ${cuLine}
  <polyline fill="none" stroke="#1a4d6d" stroke-width="1.35" points="${poly}"/>
  ${xLbl}
  ${yLbl}
  ${rangeLine}
  <text x="${(PAD_L + W - PAD_R) / 2}" y="${H - 5}" text-anchor="middle" font-size="9" fill="#222">σ (kPa)</text>
  <text transform="translate(14,${PAD_T + innerH / 2}) rotate(-90)" text-anchor="middle" font-size="9" fill="#222">τ (kPa)</text>
</svg>`;
}

export type TriaxialMohrCircle = {
  id: string;
  label: string;
  sigma1Mpa: number;
  sigma3Mpa: number;
};

/** Cercuri Mohr (τ–σ) pentru triaxial rocă, cu opțională envelopă Mohr–Coulomb. */
export function triaxialMohrMultiSvg(
  circles: TriaxialMohrCircle[],
  envelope: { cMpa: number; phiDeg: number } | null,
  title = "Cercuri Mohr (τ–σ) — Triaxial",
): string | null {
  const valid = (circles ?? []).filter(
    (c) =>
      Number.isFinite(c.sigma1Mpa) &&
      Number.isFinite(c.sigma3Mpa) &&
      c.sigma1Mpa >= c.sigma3Mpa &&
      c.sigma3Mpa >= 0,
  );
  if (valid.length < 2) return null;

  const palette = ["#2563eb", "#16a34a", "#dc2626", "#7c3aed", "#ea580c", "#0891b2"];
  const steps = 48;

  const arcs = valid.map((c) => {
    const center = (c.sigma1Mpa + c.sigma3Mpa) / 2;
    const r = (c.sigma1Mpa - c.sigma3Mpa) / 2;
    const arc: { sigma: number; tau: number }[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = (Math.PI * i) / steps;
      arc.push({ sigma: center + r * Math.cos(t), tau: r * Math.sin(t) });
    }
    return { c, center, r, arc };
  });

  const minS0 = Math.min(...arcs.flatMap((a) => [a.c.sigma3Mpa, a.center - a.r]));
  const maxS0 = Math.max(...arcs.flatMap((a) => [a.c.sigma1Mpa, a.center + a.r]));
  const maxT0 = Math.max(...arcs.map((a) => a.r)) * 1.15 || 1;

  const rx = axisDomainFromZero(minS0, maxS0);
  const ry = axisDomainFromZero(0, maxT0);
  const { grid, xLbl, yLbl, rangeLine, X, Y, innerH } = svgAxesAndTicks(
    rx.lo,
    rx.hi,
    ry.lo,
    ry.hi,
    fmtTickStress,
    fmtTickStress,
  );

  const envOk =
    envelope != null &&
    Number.isFinite(envelope.cMpa) &&
    Number.isFinite(envelope.phiDeg) &&
    envelope.phiDeg >= 0 &&
    envelope.phiDeg < 89.9;

  let envLine = "";
  if (envOk) {
    const m = Math.tan((envelope!.phiDeg * Math.PI) / 180);
    const t1 = envelope!.cMpa + rx.lo * m;
    const t2 = envelope!.cMpa + rx.hi * m;
    envLine = `<line x1="${X(rx.lo).toFixed(2)}" y1="${Y(t1).toFixed(2)}" x2="${X(rx.hi).toFixed(2)}" y2="${Y(t2).toFixed(2)}" stroke="#111" stroke-width="1.25" stroke-dasharray="6 5"/>`;
  }

  // Simple legend (cap at 5 to avoid overlap).
  const lx = PAD_L + 6;
  const ly = PAD_T + 12;
  const maxLegend = Math.min(arcs.length, 5);
  let legend = `<g><rect x="${lx - 4}" y="${ly - 11}" width="420" height="${16 + maxLegend * 12}" fill="#fff" opacity="0.78"/></g>`;
  if (envOk) {
    legend += `<g>
      <line x1="${lx}" y1="${ly}" x2="${lx + 12}" y2="${ly}" stroke="#111" stroke-width="2" stroke-dasharray="6 5"/>
      <text x="${lx + 16}" y="${ly + 3}" font-size="8.5" fill="#111" ${SVG_FONT}>Envelopă (c=${escXml(envelope!.cMpa.toFixed(2))} MPa, φ=${escXml(envelope!.phiDeg.toFixed(1))}°)</text>
    </g>`;
  }
  for (let i = 0; i < maxLegend; i++) {
    const a = arcs[i]!;
    const y = ly + 12 + (envOk ? 12 : 0) + i * 12;
    const col = palette[i % palette.length]!;
    const lbl = `${a.c.label} (σ3=${a.c.sigma3Mpa.toFixed(2)} MPa)`;
    legend += `<g>
      <line x1="${lx}" y1="${y}" x2="${lx + 12}" y2="${y}" stroke="${col}" stroke-width="2"/>
      <text x="${lx + 16}" y="${y + 3}" font-size="8.5" fill="#111" ${SVG_FONT}>${escXml(lbl)}</text>
    </g>`;
  }

  const circlesSvg = arcs
    .map((a, idx) => {
      const poly = a.arc.map((p) => `${X(p.sigma).toFixed(2)},${Y(p.tau).toFixed(2)}`).join(" ");
      const col = palette[idx % palette.length]!;
      return `<polyline fill="none" stroke="${col}" stroke-width="1.25" points="${poly}"/>`;
    })
    .join("");

  return `${svgOpen(title)}
  <rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>
  <text x="${W / 2}" y="17" text-anchor="middle" font-size="11" font-weight="600" fill="#0f3d3e">${escXml(title)}</text>
  ${legend}
  ${grid}
  <line x1="${PAD_L}" y1="${PAD_T}" x2="${PAD_L}" y2="${H - PAD_B}" stroke="#222" stroke-width="1.1"/>
  <line x1="${PAD_L}" y1="${H - PAD_B}" x2="${W - PAD_R}" y2="${H - PAD_B}" stroke="#222" stroke-width="1.1"/>
  ${envLine}
  ${circlesSvg}
  ${xLbl}
  ${yLbl}
  ${rangeLine}
  <text x="${(PAD_L + W - PAD_R) / 2}" y="${H - 5}" text-anchor="middle" font-size="9" fill="#222">σ (MPa)</text>
  <text transform="translate(14,${PAD_T + innerH / 2}) rotate(-90)" text-anchor="middle" font-size="9" fill="#222">τ (MPa)</text>
</svg>`;
}

export function timeLoadSvg(
  points: { t: number; load: number }[],
  title = "Timp – sarcină",
  yAxisLabel = "F (kN)",
): string | null {
  if (points.length < 2) return null;
  const dec = decimate(points, 800);
  const xs = dec.map((p) => p.t);
  const ys = dec.map((p) => p.load);
  const rx = axisDomainFromZero(Math.min(...xs), Math.max(...xs));
  const ry = axisDomainFromZero(Math.min(...ys), Math.max(...ys));
  const { grid, xLbl, yLbl, rangeLine, X, Y, innerH } = svgAxesAndTicks(
    rx.lo,
    rx.hi,
    ry.lo,
    ry.hi,
    fmtTickTime,
    fmtTickLoad,
  );
  const poly = dec.map((p) => `${X(p.t).toFixed(2)},${Y(p.load).toFixed(2)}`).join(" ");

  return `${svgOpen(title)}
  <rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>
  <text x="${W / 2}" y="17" text-anchor="middle" font-size="11" font-weight="600" fill="#0f3d3e">${escXml(title)}</text>
  ${grid}
  <line x1="${PAD_L}" y1="${PAD_T}" x2="${PAD_L}" y2="${H - PAD_B}" stroke="#222" stroke-width="1.1"/>
  <line x1="${PAD_L}" y1="${H - PAD_B}" x2="${W - PAD_R}" y2="${H - PAD_B}" stroke="#222" stroke-width="1.1"/>
  <polyline fill="none" stroke="#6a3d9a" stroke-width="1.35" points="${poly}"/>
  ${xLbl}
  ${yLbl}
  ${rangeLine}
  <text x="${(PAD_L + W - PAD_R) / 2}" y="${H - 5}" text-anchor="middle" font-size="9" fill="#222">t (s)</text>
  <text transform="translate(14,${PAD_T + innerH / 2}) rotate(-90)" text-anchor="middle" font-size="9" fill="#222">${escXml(yAxisLabel)}</text>
</svg>`;
}

export function stressTimeSvg(
  points: { t: number; stress: number }[],
  title = "Efort – timp",
  yAxisLabel = "σ (MPa)",
): string | null {
  if (points.length < 2) return null;
  const dec = decimate(points, 800);
  const xs = dec.map((p) => p.t);
  const ys = dec.map((p) => p.stress);
  const rx = axisDomainFromZero(Math.min(...xs), Math.max(...xs));
  const ry = axisDomainFromZero(Math.min(...ys), Math.max(...ys));
  const { grid, xLbl, yLbl, rangeLine, X, Y, innerH } = svgAxesAndTicks(
    rx.lo,
    rx.hi,
    ry.lo,
    ry.hi,
    fmtTickTime,
    fmtTickStress,
  );
  const poly = dec.map((p) => `${X(p.t).toFixed(2)},${Y(p.stress).toFixed(2)}`).join(" ");

  return `${svgOpen(title)}
  <rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>
  <text x="${W / 2}" y="17" text-anchor="middle" font-size="11" font-weight="600" fill="#0f3d3e">${escXml(title)}</text>
  ${grid}
  <line x1="${PAD_L}" y1="${PAD_T}" x2="${PAD_L}" y2="${H - PAD_B}" stroke="#222" stroke-width="1.1"/>
  <line x1="${PAD_L}" y1="${H - PAD_B}" x2="${W - PAD_R}" y2="${H - PAD_B}" stroke="#222" stroke-width="1.1"/>
  <polyline fill="none" stroke="#1a4d6d" stroke-width="1.35" points="${poly}"/>
  ${xLbl}
  ${yLbl}
  ${rangeLine}
  <text x="${(PAD_L + W - PAD_R) / 2}" y="${H - 5}" text-anchor="middle" font-size="9" fill="#222">t (s)</text>
  <text transform="translate(14,${PAD_T + innerH / 2}) rotate(-90)" text-anchor="middle" font-size="9" fill="#222">${escXml(yAxisLabel)}</text>
</svg>`;
}

export function ucsBarSvg(valueMpa: number, title = "Rezistență la compresiune uniaxială (UCS)"): string | null {
  if (!Number.isFinite(valueMpa) || valueMpa < 0) return null;
  const bw = W - PAD_L - PAD_R;
  const bh = 72;
  const bx = PAD_L;
  const by = PAD_T + 24;
  const maxVal = Math.max(valueMpa * 1.15, valueMpa + 1, 5);
  const wFill = (valueMpa / maxVal) * bw;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escXml(title)}" ${SVG_FONT}>
  <rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>
  <text x="${W / 2}" y="18" text-anchor="middle" font-size="11" font-weight="600" fill="#0f3d3e">${escXml(title)}</text>
  <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="#f0f0f0" stroke="#999" stroke-width="0.75"/>
  <rect x="${bx}" y="${by}" width="${Math.max(0, wFill)}" height="${bh}" fill="#1a4d6d"/>
  <text x="${bx + bw / 2}" y="${by + bh + 20}" text-anchor="middle" font-size="12" font-weight="600" fill="#0f3d3e">${escXml(`${valueMpa.toFixed(3)} MPa`)}</text>
  <text x="${bx}" y="${by + bh + 36}" font-size="8" fill="#666">0</text>
  <text x="${bx + bw}" y="${by + bh + 36}" text-anchor="end" font-size="8" fill="#666">${escXml(maxVal.toFixed(1))} MPa</text>
</svg>`;
}

export function stressMpaToLoadKn(stressMpa: number, diameterMm: number): number {
  const rMm = diameterMm / 2;
  return (stressMpa * Math.PI * rMm * rMm) / 1000;
}
