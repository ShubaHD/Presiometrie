import type { UnconfinedSoilCurvePoint } from "@/lib/unconfined-soil-curve";

/** Punct serie t–F; `sourceIndex` = indice în `UnconfinedSoilCurvePayload.points` (pentru decupare Brush). */
export type UnconfinedSoilTimeLoadSeriesPoint = { t: number; load: number; sourceIndex: number };

export function buildUnconfinedSoilTimeLoadChartData(
  points: UnconfinedSoilCurvePoint[],
  opts: { subtractSeating: boolean; seatingLoadKn?: number },
): { series: UnconfinedSoilTimeLoadSeriesPoint[]; baselineKn: number } {
  const out: UnconfinedSoilTimeLoadSeriesPoint[] = [];
  const net = opts.subtractSeating;
  let baselineKn = 0;

  if (net && points.length > 0) {
    if (opts.seatingLoadKn != null && opts.seatingLoadKn > 0 && Number.isFinite(opts.seatingLoadKn)) {
      baselineKn = opts.seatingLoadKn;
    } else {
      const p0 = points[0]!;
      baselineKn = Number.isFinite(p0.load_kn) && p0.load_kn >= 0 ? p0.load_kn : 0;
    }
  }

  for (let pi = 0; pi < points.length; pi++) {
    const p = points[pi]!;
    if (p.t_s == null || !Number.isFinite(p.t_s)) continue;
    const load = Number(p.load_kn);
    if (!Number.isFinite(load)) continue;
    const loadPlot = net ? load - baselineKn : load;
    out.push({ t: p.t_s, load: loadPlot, sourceIndex: pi });
  }

  return { series: out, baselineKn };
}

export function buildUnconfinedSoilLoadRateChartData(series: { t: number; load: number }[]): { t: number; rate: number }[] {
  const out: { t: number; rate: number }[] = [];
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1]!;
    const b = series[i]!;
    const dt = b.t - a.t;
    if (!Number.isFinite(dt) || dt <= 0) continue;
    const dF = b.load - a.load;
    const r = dF / dt;
    if (!Number.isFinite(r)) continue;
    out.push({ t: b.t, rate: r });
  }
  return out;
}

