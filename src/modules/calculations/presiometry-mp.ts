/** Conversie afișare / rezultate: presiunea în serie rămâne stocată în kPa în `p_kpa`. */
export const KPA_PER_MPA = 1000;

export function kpaToMpa(p: number | null | undefined): number | null {
  if (p == null || !Number.isFinite(p)) return null;
  return p / KPA_PER_MPA;
}

/** Pantă Δp/Δx când p e în kPa → aceeași pantă exprimată în MPa pe unitatea lui x. */
export function slopeKpaPerUnitToMpaPerUnit(slopeKpaPerUnit: number | null | undefined): number | null {
  if (slopeKpaPerUnit == null || !Number.isFinite(slopeKpaPerUnit)) return null;
  return slopeKpaPerUnit / KPA_PER_MPA;
}
