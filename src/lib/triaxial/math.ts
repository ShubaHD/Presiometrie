export function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function mean(xs: number[]) {
  if (xs.length === 0) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function linearRegression(x: number[], y: number[]) {
  if (x.length !== y.length || x.length < 2) return null;
  const n = x.length;
  const xBar = mean(x);
  const yBar = mean(y);
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - xBar;
    sxx += dx * dx;
    sxy += dx * (y[i] - yBar);
  }
  if (sxx === 0) return null;
  const m = sxy / sxx;
  const b = yBar - m * xBar;
  return { m, b };
}

export function argMax(xs: number[]) {
  if (xs.length === 0) return null;
  let idx = 0;
  for (let i = 1; i < xs.length; i++) if (xs[i] > xs[idx]) idx = i;
  return idx;
}

