/**
 * Greutate volumică prin cântărire submersă (cu parafină sau imersare directă).
 * Mase în gram; densități în g/cm³.
 */

export type UnitWeightSubmergedMethod = "paraffin_submerged" | "water_immersion";

export interface UnitWeightSubmergedRow {
  /** Număr probă afișat (1, 2, …). */
  proba_index: number;
  m0_g: number | null;
  /** Doar mod parafină: masă probă + parafină în aer. */
  m1_g: number | null;
  /** Parafină: masă imersată (citire cântar). Imersare directă: masă echivalentă imersată vs m0. */
  m2_g: number | null;
}

/**
 * Umiditate gravimetrică (separat de m₀/m₁/m₂ pentru submersă).
 * Cu farfurie: m_dish = farfurie goală; m_wet = farfurie + probă umedă; m_dry = farfurie + probă uscată după uscare.
 * Fără farfurie: m_wet / m_dry = mase directe probă umedă / uscată.
 */
export interface MoistureGravimetricPayload {
  with_dish: boolean;
  m_dish_g: number | null;
  m_wet_g: number | null;
  m_dry_g: number | null;
}

/**
 * Metodă geometrică (sol, probă cilindrică): volum din D și L,
 * mase în stare naturală și uscată.
 *
 * D și L în mm; mase în g.
 */
export interface UnitWeightCylinderPayload {
  diameter_mm: number | null;
  length_mm: number | null;
  mass_natural_g: number | null;
  mass_dry_g: number | null;
}

export interface UnitWeightSubmergedPayload {
  method: UnitWeightSubmergedMethod;
  /** Densitate apă, g/cm³ (implicit 1). */
  water_density_g_cm3: number;
  /** Densitate parafină, g/cm³ (implicit 0,9). */
  paraffin_density_g_cm3: number;
  rows: UnitWeightSubmergedRow[];
  /** Opțional: umiditate din cântăriri umed/uscat (nu folosește aceleași câmpuri ca tabelul submersă). */
  moisture_gravimetric?: MoistureGravimetricPayload | null;
  /** Opțional: metodă geometrică pentru cilindru (D, L, mase). */
  cylinder?: UnitWeightCylinderPayload | null;
}

const DEFAULT_WATER = 1;
const DEFAULT_PARAFFIN = 0.9;

export function defaultMoistureGravimetricPayload(): MoistureGravimetricPayload {
  return { with_dish: true, m_dish_g: null, m_wet_g: null, m_dry_g: null };
}

export function defaultUnitWeightSubmergedPayload(): UnitWeightSubmergedPayload {
  return {
    method: "paraffin_submerged",
    water_density_g_cm3: DEFAULT_WATER,
    paraffin_density_g_cm3: DEFAULT_PARAFFIN,
    rows: [
      { proba_index: 1, m0_g: null, m1_g: null, m2_g: null },
      { proba_index: 2, m0_g: null, m1_g: null, m2_g: null },
      { proba_index: 3, m0_g: null, m1_g: null, m2_g: null },
    ],
    moisture_gravimetric: defaultMoistureGravimetricPayload(),
    cylinder: { diameter_mm: null, length_mm: null, mass_natural_g: null, mass_dry_g: null },
  };
}

function nullableMassG(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function nullablePos(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseUnitWeightCylinderPayload(raw: unknown): UnitWeightCylinderPayload | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    diameter_mm: nullablePos(o.diameter_mm),
    length_mm: nullablePos(o.length_mm),
    mass_natural_g: nullableMassG(o.mass_natural_g),
    mass_dry_g: nullableMassG(o.mass_dry_g),
  };
}

export function parseMoistureGravimetricPayload(raw: unknown): MoistureGravimetricPayload | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    with_dish: o.with_dish === true,
    m_dish_g: nullableMassG(o.m_dish_g),
    m_wet_g: nullableMassG(o.m_wet_g),
    m_dry_g: nullableMassG(o.m_dry_g),
  };
}

function isFinitePos(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

export function parseUnitWeightSubmergedPayload(raw: unknown): UnitWeightSubmergedPayload | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const method =
    o.method === "water_immersion" ? "water_immersion" : "paraffin_submerged";
  const water = Number(o.water_density_g_cm3);
  const paraffin = Number(o.paraffin_density_g_cm3);
  const rowsRaw = o.rows;
  if (!Array.isArray(rowsRaw) || rowsRaw.length === 0) return null;
  const rows: UnitWeightSubmergedRow[] = [];
  for (const r of rowsRaw) {
    if (!r || typeof r !== "object") continue;
    const x = r as Record<string, unknown>;
    const pi = Math.round(Number(x.proba_index));
    const m0 = x.m0_g === null || x.m0_g === undefined || x.m0_g === "" ? null : Number(x.m0_g);
    const m1 = x.m1_g === null || x.m1_g === undefined || x.m1_g === "" ? null : Number(x.m1_g);
    const m2 = x.m2_g === null || x.m2_g === undefined || x.m2_g === "" ? null : Number(x.m2_g);
    rows.push({
      proba_index: Number.isFinite(pi) && pi > 0 ? pi : rows.length + 1,
      m0_g: m0 != null && Number.isFinite(m0) ? m0 : null,
      m1_g: m1 != null && Number.isFinite(m1) ? m1 : null,
      m2_g: m2 != null && Number.isFinite(m2) ? m2 : null,
    });
  }
  if (rows.length === 0) return null;
  const moisture = parseMoistureGravimetricPayload(o.moisture_gravimetric);
  const cylinder = parseUnitWeightCylinderPayload(o.cylinder);
  return {
    method,
    water_density_g_cm3: isFinitePos(water) ? water : DEFAULT_WATER,
    paraffin_density_g_cm3: isFinitePos(paraffin) ? paraffin : DEFAULT_PARAFFIN,
    rows,
    ...(moisture ? { moisture_gravimetric: moisture } : {}),
    ...(cylinder ? { cylinder } : {}),
  };
}

/** True dacă utilizatorul a început să completeze masele submersă (evită calcule γ goale). */
export function unitWeightSubmergedHasAnyMassInput(p: UnitWeightSubmergedPayload): boolean {
  return p.rows.some(
    (r) =>
      (r.m0_g != null && r.m0_g > 0) ||
      (r.m1_g != null && r.m1_g > 0) ||
      (r.m2_g != null && Number.isFinite(r.m2_g)),
  );
}

/** True dacă utilizatorul a început metoda geometrică (cilindru). */
export function unitWeightCylinderHasAnyInput(p: UnitWeightCylinderPayload | null | undefined): boolean {
  if (!p) return false;
  return (
    (p.diameter_mm != null && p.diameter_mm > 0) ||
    (p.length_mm != null && p.length_mm > 0) ||
    (p.mass_natural_g != null && p.mass_natural_g > 0) ||
    (p.mass_dry_g != null && p.mass_dry_g > 0)
  );
}

export function clampUnitWeightSubmergedPayload(raw: unknown): UnitWeightSubmergedPayload {
  const parsed = parseUnitWeightSubmergedPayload(raw);
  if (parsed) {
    if (!parsed.moisture_gravimetric) {
      return { ...parsed, moisture_gravimetric: defaultMoistureGravimetricPayload() };
    }
    return parsed;
  }
  return defaultUnitWeightSubmergedPayload();
}

/** Există cel puțin o masă introdusă pentru umiditate (pentru a nu rula calcule goale). */
export function moistureGravimetricHasAnyInput(m: MoistureGravimetricPayload | null | undefined): boolean {
  if (!m) return false;
  return (
    (m.m_dish_g != null && m.m_dish_g > 0) ||
    (m.m_wet_g != null && m.m_wet_g > 0) ||
    (m.m_dry_g != null && m.m_dry_g > 0)
  );
}

/** Volum probă solidă (cm³). */
export function sampleVolumeCm3(
  method: UnitWeightSubmergedMethod,
  m0_g: number,
  m1_g: number,
  m2_g: number,
  rhoW_g_cm3: number,
  rhoP_g_cm3: number,
): { volumeCm3: number; error: string | null } {
  if (!(rhoW_g_cm3 > 0) || !(rhoP_g_cm3 > 0)) {
    return { volumeCm3: NaN, error: "Densitățile trebuie să fie > 0." };
  }
  if (method === "water_immersion") {
    const v = (m0_g - m2_g) / rhoW_g_cm3;
    if (!Number.isFinite(v) || v <= 0) {
      return { volumeCm3: NaN, error: "Volum invalid (imersare directă: m0 trebuie > m2)." };
    }
    return { volumeCm3: v, error: null };
  }
  if (!(m1_g > m0_g) || !(m1_g > m2_g)) {
    return {
      volumeCm3: NaN,
      error: "Mase inconsistente (parafină: m1 > m0 și m1 > m2).",
    };
  }
  const vSp = (m1_g - m2_g) / rhoW_g_cm3;
  const vP = (m1_g - m0_g) / rhoP_g_cm3;
  const vS = vSp - vP;
  if (!Number.isFinite(vS) || vS <= 0) {
    return {
      volumeCm3: NaN,
      error: "Volum probă invalid (verificați mase și densități).",
    };
  }
  return { volumeCm3: vS, error: null };
}
