/**
 * Modul Menard Eₘ din faza pseudoelastică GL1 (ISO 22476-4 / practică Menard).
 * - axă volum (V în cm³): Eₘ = 2(1+ν) · V̄ · |dp/dV|, cu dp/dV în kPa/cm³ → Eₘ în MPa
 * - axă rază (R în mm): Eₘ = (1+ν) · R̄ · |dp/dR|, cu dp/dR în kPa/mm → Eₘ în MPa
 *
 * V̄ / R̄ = media absciselor punctelor folosite la regresia GL1.
 * ν implicit 0,33 (încercare drenată, uzual pentru interpretare Menard).
 */
export const PMT_MENARD_NU = 0.33;

export function menardEmMpaFromGl1Volume(meanV_cm3: number, slopeKpaPerCm3: number | null, nu = PMT_MENARD_NU): number | null {
  if (slopeKpaPerCm3 == null || !Number.isFinite(slopeKpaPerCm3)) return null;
  if (!Number.isFinite(meanV_cm3) || meanV_cm3 <= 0) return null;
  const s = Math.abs(slopeKpaPerCm3);
  const em = (2 * (1 + nu) * meanV_cm3 * s) / 1000;
  return Number.isFinite(em) ? em : null;
}

export function menardEmMpaFromGl1Radius(meanR_mm: number, slopeKpaPerMm: number | null, nu = PMT_MENARD_NU): number | null {
  if (slopeKpaPerMm == null || !Number.isFinite(slopeKpaPerMm)) return null;
  if (!Number.isFinite(meanR_mm) || meanR_mm <= 0) return null;
  const s = Math.abs(slopeKpaPerMm);
  const em = ((1 + nu) * meanR_mm * s) / 1000;
  return Number.isFinite(em) ? em : null;
}

export function meanAbscissaGl1(xs: number[]): number | null {
  if (!xs.length) return null;
  let s = 0;
  for (const x of xs) {
    if (!Number.isFinite(x)) return null;
    s += x;
  }
  const m = s / xs.length;
  return Number.isFinite(m) && m > 0 ? m : null;
}
