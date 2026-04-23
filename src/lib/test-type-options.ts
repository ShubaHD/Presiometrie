import type { TestType } from "@/types/lab";
import { ASTM_D7012_REFERENCE, getD7012TriaxialCombinedHelp } from "@/lib/astm-d7012";

export interface NewTestOption {
  value: TestType;
  label: string;
  description: string;
  group: "astm_d7012" | "other";
}

const tri = getD7012TriaxialCombinedHelp();

/** Opțiuni pentru dialogul „Test nou” (fără duplicate de `value` în Select). */
export const NEW_TEST_OPTIONS: NewTestOption[] = [
  {
    value: "triaxial_rock",
    label: "D7012 Metode A și B — Triaxial (rezistență / module elastice)",
    description: `${tri.summaryRo}\n\nGrafice: ${tri.graphsRo.join("; ")}.`,
    group: "astm_d7012",
  },
  {
    value: "ucs",
    label: "D7012 Metoda C — Determinarea rezistenței la compresiune uniaxială (UCS), SR EN 1926:2007",
    description:
      "Rezistență la compresiune fără σ₃; σ_u = P/A. În mod tipic fără curbă σ–ε completă în raport.",
    group: "astm_d7012",
  },
  {
    value: "young",
    label: "D7012 Metoda D — Module elastice (uniaxial)",
    description:
      "Curbe σ–ε_a și σ–ε_l; E (tangent / mediu / secant), ν, apoi G și K pentru izotropie.",
    group: "astm_d7012",
  },
  {
    value: "point_load",
    label: "ASTM D5731-16 — Point load (Is, Is(50), opțional σ_uc)",
    description:
      "Indice de rezistență point load: Is = P/De² (P în N), corecție la 50 mm Is(50) = Is·(De/50)^0,45; geometrie bloc/bulgă din D și W (De² = 4WD/π) sau De direct.",
    group: "other",
  },
  {
    value: "unit_weight",
    label: "Greutate volumică (γ, opțional γ′)",
    description: "Determinare masă volumică naturală / uscată / submersă pe probă.",
    group: "other",
  },
  {
    value: "unconfined_soil",
    label: "Compresiune monoaxială — SR EN ISO 17892-7 (pământ, unconfined)",
    description:
      "Încercare de compresiune neînconjurată pentru pământ. Mod instrumentat: import curbă P–ΔH (Uniframe/Controls .txt) și calcul automat q_u, ε la eșec, c_u. Opțional: γ și w din tab „Greutate volumică”.",
    group: "other",
  },
  {
    value: "absorption_porosity_rock",
    label: "Absorbție apă / Porozitate (rocă)",
    description:
      "m_uscată, m_saturată (SSD) și m_submersă → Absorbție apă (%), Porozitate aparentă (%), densitate aparentă.",
    group: "other",
  },
  {
    value: "presiometry",
    label: "Presiometrie — SR EN ISO 22476-5",
    description:
      "Încercare in-situ cu presiometru: serie presiune–volum (sau presiune–deformație) → determinări specifice normei (moduluri, presiuni caracteristice) și raport PDF.",
    group: "other",
  },
];

export { ASTM_D7012_REFERENCE };

/** Etichete scurte în arbore. */
export const TEST_TYPE_SHORT_LABEL: Record<TestType, string> = {
  ucs: "UCS rocă",
  young: "Young rocă",
  triaxial_rock: "Triaxial Hoek",
  point_load: "Point load test",
  unit_weight: "γ volumică",
  sr_en_1926: "SR EN 1926",
  unconfined_soil: "Compresiune monoaxială",
  absorption_porosity_rock: "Absorbție/Porozitate",
  presiometry: "Presiometrie",
};

export function newTestOptionLabel(tt: TestType): string {
  return TEST_TYPE_SHORT_LABEL[tt] ?? tt;
}
