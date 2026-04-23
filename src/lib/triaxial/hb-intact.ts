export type HbIntactPoint = { sigma3Mpa: number; sigma1Mpa: number };

export type HbIntactFit = {
  mi: number | null;
  rmseMpa: number | null;
  notes: string[];
};

function isFinitePos(n: number) {
  return Number.isFinite(n) && n > 0;
}

function predictSigma1(args: { sigma3Mpa: number; sigmaCiMpa: number; mi: number }): number | null {
  const { sigma3Mpa, sigmaCiMpa, mi } = args;
  if (!Number.isFinite(sigma3Mpa) || !isFinitePos(sigmaCiMpa) || !isFinitePos(mi)) return null;
  const inside = mi * (sigma3Mpa / sigmaCiMpa) + 1;
  if (!(inside > 0) || !Number.isFinite(inside)) return null;
  return sigma3Mpa + sigmaCiMpa * Math.sqrt(inside);
}

function sse(points: HbIntactPoint[], sigmaCiMpa: number, mi: number): number {
  let sum = 0;
  for (const p of points) {
    const y = predictSigma1({ sigma3Mpa: p.sigma3Mpa, sigmaCiMpa, mi });
    if (y == null) return Number.POSITIVE_INFINITY;
    const e = y - p.sigma1Mpa;
    sum += e * e;
  }
  return sum;
}

function logspace(lo: number, hi: number, n: number): number[] {
  const a = Math.log(lo);
  const b = Math.log(hi);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    out.push(Math.exp(a + (b - a) * t));
  }
  return out;
}

export function fitHbIntactMi(args: { sigmaCiMpa: number; points: HbIntactPoint[] }): HbIntactFit {
  const notes: string[] = [];
  const sigmaCiMpa = args.sigmaCiMpa;
  const points = (args.points ?? []).filter(
    (p) =>
      Number.isFinite(p.sigma3Mpa) &&
      p.sigma3Mpa >= 0 &&
      Number.isFinite(p.sigma1Mpa) &&
      p.sigma1Mpa >= p.sigma3Mpa,
  );

  if (!isFinitePos(sigmaCiMpa)) {
    return { mi: null, rmseMpa: null, notes: ["Lipsește σci (UCS) validă."] };
  }
  if (points.length < 2) {
    return { mi: null, rmseMpa: null, notes: ["Sunt necesare minim 2 puncte (σ₃ diferite)."] };
  }

  // Coarse search on log(mi)
  const grid = logspace(0.05, 80, 220);
  let bestMi = grid[0]!;
  let best = Number.POSITIVE_INFINITY;
  for (const mi of grid) {
    const v = sse(points, sigmaCiMpa, mi);
    if (v < best) {
      best = v;
      bestMi = mi;
    }
  }

  // Local refinement around the best (still 1D, robust)
  const refineLo = Math.max(bestMi / 2.5, 0.001);
  const refineHi = bestMi * 2.5;
  const refine = logspace(refineLo, refineHi, 140);
  for (const mi of refine) {
    const v = sse(points, sigmaCiMpa, mi);
    if (v < best) {
      best = v;
      bestMi = mi;
    }
  }

  if (!Number.isFinite(best) || !Number.isFinite(bestMi)) {
    return { mi: null, rmseMpa: null, notes: ["Nu s-a putut face fit-ul pentru mi."] };
  }

  const rmse = Math.sqrt(best / points.length);
  if (!Number.isFinite(rmse)) notes.push("RMSE nu a putut fi calculat.");

  return {
    mi: bestMi,
    rmseMpa: Number.isFinite(rmse) ? rmse : null,
    notes,
  };
}

