/** Opțiuni pentru generare rapidă descriere vizuală (ISO 14688-1) — text raport. */

export type VisualMaterialKey = "argila" | "nisip" | "praf" | "mixt";

export type VisualGender = "f" | "m";

export const US_VISUAL_MATERIAL_OPTIONS: { value: VisualMaterialKey; label: string; noun: string; gender: VisualGender }[] =
  [
    { value: "argila", label: "Argilă", noun: "Argilă", gender: "f" },
    { value: "nisip", label: "Nisip", noun: "Nisip", gender: "m" },
    { value: "praf", label: "Praf", noun: "Praf", gender: "m" },
    { value: "mixt", label: "Mixt (praf-nisip / argilos)", noun: "Amestec", gender: "m" },
  ];

function genderOfMaterial(v: string): VisualGender | null {
  const row = US_VISUAL_MATERIAL_OPTIONS.find((o) => o.value === v);
  return row?.gender ?? null;
}

function nounOfMaterial(v: string): string | null {
  const row = US_VISUAL_MATERIAL_OPTIONS.find((o) => o.value === v);
  return row?.noun ?? null;
}

/** Culoare — forme f / m */
export const US_VISUAL_COLOR_OPTIONS: { value: string; f: string; m: string }[] = [
  { value: "brun", f: "brună", m: "brun" },
  { value: "gri", f: "gri", m: "gri" },
  { value: "galben", f: "galbenă", m: "galben" },
  { value: "ros", f: "roșcată", m: "roșcat" },
  { value: "deschis", f: "deschisă la culoare", m: "deschis la culoare" },
];

export const US_VISUAL_STRUCTURE_OPTIONS: { value: string; f: string; m: string }[] = [
  { value: "omogen", f: "omogenă", m: "omogen" },
  { value: "stratificat", f: "stratificată", m: "stratificat" },
  { value: "anizotrop", f: "anizotropă", m: "anizotrop" },
];

export const US_VISUAL_CONSISTENCY_OPTIONS: { value: string; f: string; m: string }[] = [
  { value: "moale", f: "moale", m: "moale" },
  { value: "medie", f: "de consistență medie", m: "de consistență medie" },
  { value: "tare", f: "tare", m: "tare" },
  { value: "plastic", f: "plastică", m: "plastic" },
  { value: "foarte_plastic", f: "foarte plastică", m: "foarte plastic" },
  { value: "dens", f: "densă", m: "dens" },
];

export const US_VISUAL_MOISTURE_OPTIONS: { value: string; f: string; m: string }[] = [
  { value: "uscat", f: "uscată", m: "uscat" },
  { value: "umed", f: "umedă", m: "umed" },
  { value: "foarte_umed", f: "foarte umedă", m: "foarte umed" },
  { value: "saturat", f: "saturată", m: "saturat" },
];

/** Fragment final (după virgulă, fără punct inițial). */
export const US_VISUAL_INCLUSIONS_OPTIONS: { value: string; label: string }[] = [
  { value: "none", label: "— Fără mențiune incluziuni —" },
  { value: "rare_nisip", label: "cu rare particule fine de nisip" },
  { value: "piestris", label: "cu pietriș fin" },
  { value: "vegetal", label: "cu resturi vegetale fine" },
  { value: "radacini", label: "cu rădăcini fine" },
  { value: "calc", label: "cu incluziuni calcaroase fine" },
  { value: "roca", label: "cu fragmente de rocă alterată" },
];

export type VisualDescriptionPicks = {
  material: VisualMaterialKey | "";
  color: string;
  structure: string;
  consistency: string;
  moisture: string;
  inclusions: string;
};

function pickAdj(
  options: { value: string; f: string; m: string }[],
  value: string,
  g: VisualGender,
): string | null {
  if (!value) return null;
  const o = options.find((x) => x.value === value);
  if (!o) return null;
  return g === "f" ? o.f : o.m;
}

/**
 * Construiește o propoziție tip: „Argilă brună, plastică, umedă, omogenă, cu rare particule fine de nisip.”
 */
export function buildIso14688VisualDescription(p: VisualDescriptionPicks): string | null {
  if (!p.material) return null;
  const g = genderOfMaterial(p.material);
  const noun = nounOfMaterial(p.material);
  if (!g || !noun) return null;

  const parts: string[] = [];
  const colorAdj = pickAdj(US_VISUAL_COLOR_OPTIONS, p.color, g);
  if (colorAdj) parts.push(`${noun} ${colorAdj}`);
  else parts.push(noun);

  const cons = pickAdj(US_VISUAL_CONSISTENCY_OPTIONS, p.consistency, g);
  if (cons) parts.push(cons);

  const moist = pickAdj(US_VISUAL_MOISTURE_OPTIONS, p.moisture, g);
  if (moist) parts.push(moist);

  const struct = pickAdj(US_VISUAL_STRUCTURE_OPTIONS, p.structure, g);
  if (struct) parts.push(struct);

  const inc = US_VISUAL_INCLUSIONS_OPTIONS.find((x) => x.value === p.inclusions);
  if (inc && inc.value !== "none" && inc.label && !inc.label.startsWith("—")) {
    parts.push(inc.label);
  }

  if (parts.length === 0) return null;
  const body = parts.join(", ");
  const first = body.charAt(0).toUpperCase() + body.slice(1);
  return first.endsWith(".") ? first : `${first}.`;
}

export function emptyVisualDescriptionPicks(): VisualDescriptionPicks {
  return {
    material: "",
    color: "",
    structure: "",
    consistency: "",
    moisture: "",
    inclusions: "none",
  };
}
