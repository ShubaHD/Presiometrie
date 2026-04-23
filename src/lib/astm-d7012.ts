import type { TestType } from "@/types/lab";

/** Referință standard (nu înlocuiește documentul oficial). */
export const ASTM_D7012_REFERENCE = "ASTM D7012 — Compressive Strength and Elastic Moduli of Intact Rock Core Specimens";

export type D7012MethodLetter = "A" | "B" | "C" | "D";

export interface D7012MethodMeta {
  letter: D7012MethodLetter;
  /** Titlu scurt în română */
  titleRo: string;
  /** Tipul de înregistrare în app (A și B împart triaxial_rock) */
  internalTestType: TestType;
  /** Scop / date necesare (rezumat din standard) */
  summaryRo: string;
  /** Ce grafice recomandă standardul pentru raportare */
  graphsRo: string[];
  /** Calcule / mărimi caracteristice */
  calculationsRo: string[];
}

/**
 * Metodele A–D din ASTM D7012 (structură logică pentru UI și documentație).
 * Metoda A/C: fără curbă σ–ε în mod tipic; B/D: măsurători de deformație până la vârf / rupere.
 */
export const ASTM_D7012_METHODS: D7012MethodMeta[] = [
  {
    letter: "A",
    titleRo: "Metoda A — Rezistență triaxială (fără măsurători de deformație în mod obișnuit)",
    internalTestType: "triaxial_rock",
    summaryRo:
      "Forță axială de vârf la eșec, presiune de închidere σ₃ constantă. Pentru parametri de forfecare (c, φ) se folosesc mai multe probe la σ₃ diferite și cercuri Mohr.",
    graphsRo: [
      "Cercuri Mohr în plan τ–σ (tensiune normală vs tensiune tangențială) pentru set de încercări",
      "Eventual învelitoarea Mohr–Coulomb (dreaptă sau curbă) tangentă la cercuri",
    ],
    calculationsRo: [
      "σ₁ la eșec din sarcină și arie (conform procedurii aparatului)",
      "Tensiune diferențială de eșec: σ_d = σ₁ − σ₃ (notație uzuală în standard)",
      "Centru cerc Mohr: (σ₁ + σ₃) / 2; rază: (σ₁ − σ₃) / 2",
      "Din mai multe încercări: regresie pentru c și unghiul φ al învelitoarei",
    ],
  },
  {
    letter: "B",
    titleRo: "Metoda B — Module elastice în compresiune triaxială",
    internalTestType: "triaxial_rock",
    summaryRo:
      "Ca la triaxial, dar cu înregistrare deformație axială și laterală vs tensiune (curbe σ–ε_a, σ–ε_l). Modulul lui Young E: tangent, mediu (porțiune liniară) sau secant (ex. până la un procent din rezistență). Raportul lui Poisson ν din pantele curbelor.",
    graphsRo: [
      "Tensiune axială σ vs deformație axială ε_a (Fig. 1 / Fig. 2 din standard)",
      "Tensiune axială σ vs deformație laterală ε_l",
    ],
    calculationsRo: [
      "ε_a = ΔL / L, ε_l = ΔD / D (L lungime etalon, D diametru)",
      "E = Δσ / Δε_a (metodă tangentă / medie / secantă — specificată în raport)",
      "ν = − (panta σ–ε_l) / (panta σ–ε_a) (conform definițiilor din standard)",
      "G = E / (2(1+ν)), K = E / (3(1−2ν)) pentru materiale izotrope",
    ],
  },
  {
    letter: "C",
    titleRo: "Determinarea rezistenței la compresiune uniaxială (UCS) — Metoda C",
    internalTestType: "ucs",
    summaryRo:
      "Conform cu SR EN 1926:2007.\n\nÎncercare uniaxială fără presiune laterală; în mod tipic fără curbă completă σ–ε. Rezistența σ_u = P/A la sarcina de vârf.",
    graphsRo: ["Opțional: bară sau indicator numeric pentru σ_u (raportare)"],
    calculationsRo: ["σ_u = P / A (P în N, A în mm² → MPa)"],
  },
  {
    letter: "D",
    titleRo: "Metoda D — Module elastice în compresiune uniaxială",
    internalTestType: "young",
    summaryRo:
      "UCS cu măsurători de deformație; aceleași tipuri de curbe și calcule ca la Metoda B, dar fără σ₃.",
    graphsRo: ["σ vs ε_a și σ vs ε_l (format tip Fig. 1 din standard)"],
    calculationsRo: [
      "E din porțiunea liniară / tangentă / secantă",
      "ν din raportul pantelor curbelor σ–ε",
      "G și K din formulele izotrope",
    ],
  },
];

export function getD7012MetaForTestType(tt: TestType): D7012MethodMeta | undefined {
  if (tt === "triaxial_rock") return undefined;
  return ASTM_D7012_METHODS.find((m) => m.internalTestType === tt);
}

/** Rezumat combinat A+B pentru același tip `triaxial_rock`. */
export function getD7012TriaxialCombinedHelp(): Pick<D7012MethodMeta, "graphsRo" | "calculationsRo" | "summaryRo"> {
  const a = ASTM_D7012_METHODS.find((m) => m.letter === "A")!;
  const b = ASTM_D7012_METHODS.find((m) => m.letter === "B")!;
  return {
    summaryRo: `${a.summaryRo}\n\n${b.summaryRo}`,
    graphsRo: [...a.graphsRo, ...b.graphsRo],
    calculationsRo: [...a.calculationsRo, ...b.calculationsRo],
  };
}

export function d7012PanelForTestType(
  tt: TestType,
): { title: string; graphs: string[]; calculations: string[]; summary: string } | null {
  if (tt === "ucs") {
    const m = ASTM_D7012_METHODS.find((x) => x.letter === "C")!;
    return {
      title: m.titleRo,
      graphs: m.graphsRo,
      calculations: m.calculationsRo,
      summary: m.summaryRo,
    };
  }
  if (tt === "young") {
    const m = ASTM_D7012_METHODS.find((x) => x.letter === "D")!;
    return {
      title: m.titleRo,
      graphs: m.graphsRo,
      calculations: m.calculationsRo,
      summary: m.summaryRo,
    };
  }
  if (tt === "triaxial_rock") {
    const h = getD7012TriaxialCombinedHelp();
    return {
      title: "ASTM D7012 — Metode A și B (triaxial)",
      graphs: h.graphsRo,
      calculations: h.calculationsRo,
      summary: h.summaryRo,
    };
  }
  return null;
}
