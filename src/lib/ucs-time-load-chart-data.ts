import type { UcsCurvePoint } from "@/lib/ucs-instrumentation";

function stressMpaToLoadKn(stressMpa: number, diameterMm: number): number {
  const rMm = diameterMm / 2;
  return (stressMpa * Math.PI * rMm * rMm) / 1000;
}

/** Folosit și pe server (centralizator API); nu în fișier cu „use client”. */
export function buildUcsTimeLoadChartData(
  points: UcsCurvePoint[],
  diameterMm: number | undefined,
  opts: { subtractSeating: boolean; seatingLoadKn?: number },
): { series: { t: number; load: number }[]; baselineKn: number } {
  const out: { t: number; load: number }[] = [];
  const net = opts.subtractSeating;
  let baselineKn = 0;
  if (net && points.length > 0) {
    if (opts.seatingLoadKn != null && opts.seatingLoadKn > 0 && Number.isFinite(opts.seatingLoadKn)) {
      baselineKn = opts.seatingLoadKn;
    } else {
      const p0 = points[0]!;
      if (p0.load_kn != null && Number.isFinite(p0.load_kn) && p0.load_kn >= 0) {
        baselineKn = p0.load_kn;
      } else if (diameterMm != null && diameterMm > 0) {
        baselineKn = stressMpaToLoadKn(p0.stress_mpa, diameterMm);
      }
    }
  }
  const d = diameterMm;
  for (const p of points) {
    if (p.t_s == null || !Number.isFinite(p.t_s)) continue;
    let load = p.load_kn;
    if (load == null || !Number.isFinite(load)) {
      if (d == null || d <= 0) continue;
      load = stressMpaToLoadKn(p.stress_mpa, d);
    }
    const loadPlot = net ? load - baselineKn : load;
    out.push({ t: p.t_s, load: loadPlot });
  }
  return { series: out, baselineKn };
}
