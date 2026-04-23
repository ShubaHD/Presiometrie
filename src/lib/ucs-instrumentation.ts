import type { UcsTestMode } from "@/types/lab";

/** Punct pe curba σ–ε (ε_axial pozitiv = compresiune convențională în aplicație). */
export interface UcsCurvePoint {
  t_s?: number | null;
  stress_mpa: number;
  strain_axial: number;
  strain_radial?: number | null;
  /** Canale brute mărci (după `strainScale`, cu aceeași convenție de semn ca `strain_axial`). */
  strain_ch6?: number | null;
  strain_ch7?: number | null;
  strain_ch8?: number | null;
  /** Sarcină brută Load ch 1 (kN), dacă există în export; altfel poate fi derivată din σ și diametru la afișare. */
  load_kn?: number | null;
}

export interface UcsCurvePayload {
  version?: number;
  points: UcsCurvePoint[];
}

/** Metodă pentru modul Young / tangentă / secantă. */
export type UcsEModMethod = "loading_linear" | "unloading" | "secant" | "tangent";

/** Ce serie se desenează pe graficul σ–ε (nu modifică calculele până la „Rulează calcule”). */
export type UcsSigmaEpsilonDisplayMode = "full" | "brush_range" | "modulus_interval";

export interface UcsModulusSettings {
  method: UcsEModMethod;
  /** Dacă true, calculele ignoră index_from/to și folosesc auto-detect (unde se aplică). */
  auto_interval: boolean;
  /** Indici înclusivi în `points` (0-based). */
  index_from?: number;
  index_to?: number;
  /** Interval Poisson (0-based, inclusiv). Dacă lipsește, se folosește intervalul modulului E. */
  poisson_index_from?: number;
  poisson_index_to?: number;
  /** Dacă true, aplică auto-cutoff pentru Ch8 “blocat/rupt” peste intervalul ales. */
  poisson_auto_cutoff?: boolean;
  /** Centru pentru tangentă (indice). */
  index_center?: number;
  /** Jumătate fereastră (în puncte) pentru tangentă / regresie locală. */
  window_half?: number;
  /** Segment de descărcare (0 = primul după vârf). */
  unloading_segment_index?: number;
  /**
   * full: toată curba + Brush.
   * brush_range: doar punctele din intervalul Brush (ascunde coada / întoarceri).
   * modulus_interval: doar segmentul folosit acum pentru estimarea lui E (previzualizare).
   */
  sigma_epsilon_display?: UcsSigmaEpsilonDisplayMode;
  /** Ultima rezolvare la „Rulează calcule” (audit). */
  last_resolution?: {
    at: string;
    method: UcsEModMethod;
    index_from: number;
    index_to: number;
    r2: number | null;
    auto: boolean;
  };
}

export const UCS_MODULUS_DEFAULTS: UcsModulusSettings = {
  method: "loading_linear",
  auto_interval: true,
  window_half: 10,
  unloading_segment_index: 0,
  sigma_epsilon_display: "full",
  poisson_auto_cutoff: true,
};

export function normalizeUcsMode(v: unknown): UcsTestMode {
  return v === "instrumented" ? "instrumented" : "basic";
}

export function parseUcsCurvePayload(raw: unknown): UcsCurvePayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const pts = o.points;
  if (!Array.isArray(pts) || pts.length === 0) return null;
  const points: UcsCurvePoint[] = [];
  for (const p of pts) {
    if (!p || typeof p !== "object") continue;
    const r = p as Record<string, unknown>;
    const stress = Number(r.stress_mpa);
    const strain = Number(r.strain_axial);
    if (!Number.isFinite(stress) || !Number.isFinite(strain)) continue;
    const tRaw = r.t_s;
    const tr = tRaw === null || tRaw === undefined ? null : Number(tRaw);
    const srRaw = r.strain_radial;
    const sr =
      srRaw === null || srRaw === undefined || srRaw === ""
        ? null
        : Number(srRaw);
    const ch = (k: string) => {
      const v = r[k];
      if (v === null || v === undefined || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const c6 = ch("strain_ch6");
    const c7 = ch("strain_ch7");
    const c8 = ch("strain_ch8");
    const lkRaw = r.load_kn;
    const lk =
      lkRaw === null || lkRaw === undefined || lkRaw === "" ? null : Number(lkRaw);
    points.push({
      t_s: tr !== null && Number.isFinite(tr) ? tr : null,
      stress_mpa: stress,
      strain_axial: strain,
      strain_radial: sr !== null && Number.isFinite(sr) ? sr : null,
      strain_ch6: c6,
      strain_ch7: c7,
      strain_ch8: c8,
      load_kn: lk !== null && Number.isFinite(lk) ? lk : null,
    });
  }
  return points.length > 0 ? { version: typeof o.version === "number" ? o.version : 1, points } : null;
}

export function parseUcsModulusSettings(raw: unknown): UcsModulusSettings {
  if (!raw || typeof raw !== "object") return { ...UCS_MODULUS_DEFAULTS };
  const o = raw as Record<string, unknown>;
  const method = o.method;
  const m: UcsEModMethod =
    method === "unloading" || method === "secant" || method === "tangent" || method === "loading_linear"
      ? method
      : "loading_linear";
  const auto = o.auto_interval !== false;
  const idx = (k: string) => {
    const v = o[k];
    if (v === null || v === undefined || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? Math.floor(n) : undefined;
  };
  const wh = idx("window_half");
  const usi = idx("unloading_segment_index");
  const pi0 = idx("poisson_index_from");
  const pi1 = idx("poisson_index_to");
  const poisson_auto_cutoff = o.poisson_auto_cutoff !== false;
  const rawDisplay = o.sigma_epsilon_display;
  const sigma_epsilon_display: UcsSigmaEpsilonDisplayMode =
    rawDisplay === "brush_range" || rawDisplay === "modulus_interval" ? rawDisplay : "full";
  const last = o.last_resolution;
  let last_resolution: UcsModulusSettings["last_resolution"];
  if (last && typeof last === "object") {
    const L = last as Record<string, unknown>;
    const i0 = Number(L.index_from);
    const i1 = Number(L.index_to);
    const r2v = L.r2;
    const r2 = r2v === null || r2v === undefined ? null : Number(r2v);
    const lm = L.method;
    const methOk: UcsEModMethod =
      lm === "unloading" || lm === "secant" || lm === "tangent" || lm === "loading_linear" ? lm : m;
    last_resolution = {
      at: String(L.at ?? new Date().toISOString()),
      method: methOk,
      index_from: Number.isFinite(i0) ? Math.floor(i0) : 0,
      index_to: Number.isFinite(i1) ? Math.floor(i1) : 0,
      r2: r2 !== null && Number.isFinite(r2) ? r2 : null,
      auto: L.auto !== false,
    };
  }
  return {
    ...UCS_MODULUS_DEFAULTS,
    method: m,
    auto_interval: auto,
    index_from: idx("index_from"),
    index_to: idx("index_to"),
    poisson_index_from: pi0,
    poisson_index_to: pi1,
    poisson_auto_cutoff,
    index_center: idx("index_center"),
    window_half: wh !== undefined ? Math.max(2, wh) : UCS_MODULUS_DEFAULTS.window_half,
    unloading_segment_index: usi !== undefined ? Math.max(0, usi) : 0,
    sigma_epsilon_display,
    last_resolution,
  };
}

export function clampCurveForStorage(payload: UcsCurvePayload, maxPoints = 25000): UcsCurvePayload {
  if (payload.points.length <= maxPoints) return payload;
  return {
    ...payload,
    points: payload.points.slice(0, maxPoints),
  };
}
