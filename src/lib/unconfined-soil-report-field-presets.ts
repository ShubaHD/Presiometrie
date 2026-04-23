/** Preseturi text raport ISO 17892-7 — valori pentru selectoare (id stabil → text salvat). */

export type PresetLine = { id: string; text: string; label?: string };

const none = (id: string): PresetLine => ({ id, text: "", label: "— Text manual (dedesubt) —" });
const custom = (): PresetLine => ({
  id: "__custom__",
  text: "",
  label: "— Text personalizat (editare în casetă) —",
});

/** Particule > 1/10 D (§8.1 b) */
export const PRESET_COARSE_1_10: PresetLine[] = [
  none("__none__"),
  {
    id: "c110_absent",
    text: "Nu sunt observate particule grosiere > 1/10 D în probă.",
  },
  {
    id: "c110_pietris_5_10",
    text: "Prezente particule de pietriș cu dimensiuni de aproximativ 5–10 mm.",
  },
  {
    id: "c110_pietris_10_20",
    text: "Prezente particule de pietriș cu dimensiuni de aproximativ 10–20 mm.",
  },
  {
    id: "c110_pietris_estim",
    text: "Prezente particule de pietriș; dimensiuni estimate raportate la diametrul probei.",
  },
  {
    id: "c110_bolovan",
    text: "Prezente incluziuni grosiere (pietriș / fragmente); dimensiuni maxime estimate în raport cu D.",
  },
  custom(),
];

/** Particule > 1/6 D (§8.1 b) */
export const PRESET_COARSE_1_6: PresetLine[] = [
  none("__none__"),
  {
    id: "c16_absent",
    text: "Nu sunt prezente particule > 1/6 din diametrul probei.",
  },
  {
    id: "c16_influence",
    text: "Prezența unor particule mari poate influența rezultatul încercării.",
  },
  custom(),
];

/** Tip probă / procedură preparare */
export const PRESET_SPECIMEN_PROCEDURE: PresetLine[] = [
  none("__none__"),
  {
    id: "sp_nedist_teren",
    text: "Probă nedisturbată extrasă din teren.",
  },
  {
    id: "sp_remold_lab",
    text: "Probă remoldată, refăcută în laborator.",
  },
  {
    id: "sp_remold_compact",
    text: "Probă remoldată, compactată manual la umiditate controlată.",
  },
  {
    id: "sp_proctor",
    text: "Probă compactată (Proctor / îndesare standardizată în laborator).",
  },
  {
    id: "sp_bloc",
    text: "Probă tăiată din bloc.",
  },
  {
    id: "sp_nedist_tub",
    text: "Probă nedisturbată extrasă din tub; suprafețe fin rectificate în laborator.",
  },
  custom(),
];

/** Mod eșec / observații */
export const PRESET_FAILURE_MODE: PresetLine[] = [
  none("__none__"),
  {
    id: "fm_forfecare_45",
    text: "Eșec prin forfecare pe plan înclinat (~45°).",
  },
  {
    id: "fm_forfecare_oblica",
    text: "Eșec prin forfecare oblică (forfecare pe plan înclinat).",
  },
  {
    id: "fm_fisura_vert",
    text: "Fisurare verticală la încărcare.",
  },
  {
    id: "fm_plastic",
    text: "Deformare plastică fără rupere bruscă.",
  },
  {
    id: "fm_colaps",
    text: "Colaps / tasare marcată la compresiune.",
  },
  custom(),
];

/** Documentare eșec (§8.1 k) */
export const PRESET_FAILURE_DOC: PresetLine[] = [
  none("__none__"),
  {
    id: "fd_foto",
    text: "Documentare prin fotografii înainte/după încercare (încărcate în tabul POZE).",
  },
  {
    id: "fd_fara_schita",
    text: "Fără schiță suplimentară; observații consemnate la modul de eșec.",
  },
  {
    id: "fd_schita_foto",
    text: "Schiță schematică a modului de rupere inclusă ca imagine după încercare.",
  },
  custom(),
];

/** Abateri de la procedură */
export const PRESET_DEVIATIONS: PresetLine[] = [
  none("__none__"),
  {
    id: "dv_none",
    text: "Nu s-au înregistrat abateri de la procedură.",
  },
  {
    id: "dv_viteza",
    text: "Viteză de încărcare diferită de cea recomandată în standard (menționată la condiții de încercare).",
  },
  {
    id: "dv_imperfect",
    text: "Probă imperfectă / imperfecțiuni la capete.",
  },
  {
    id: "dv_dim",
    text: "Dimensiuni ale probei în afara toleranțelor recomandate.",
  },
  {
    id: "dv_capete",
    text: "Proba prezenta mici imperfecțiuni la capete.",
  },
  custom(),
];

export function presetIdForText(presets: PresetLine[], currentText: string): string {
  const t = currentText.trim();
  if (!t) return "__none__";
  const hit = presets.find((p) => p.id !== "__none__" && p.id !== "__custom__" && p.text === t);
  if (hit) return hit.id;
  return "__custom__";
}

export function presetTextById(presets: PresetLine[], id: string): string {
  const p = presets.find((x) => x.id === id);
  return p?.text ?? "";
}

export function presetLabel(p: PresetLine): string {
  if (p.label) return p.label;
  if (!p.text) return p.id === "__none__" ? "— Gol —" : p.id;
  return p.text.length > 110 ? `${p.text.slice(0, 107)}…` : p.text;
}
