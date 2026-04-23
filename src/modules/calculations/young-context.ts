import type { YoungCurvePayload } from "@/lib/young-curve-parse";
import type { YoungTestMode } from "@/types/lab";

export type YoungSettings = {
  /** Manual trim (inclusive indices) applied before cycle detection. */
  trim_from?: number | null;
  trim_to?: number | null;
  /** Interval manual pentru ν pe curbă (după trim); dacă lipsește, se folosește intervalul standard. */
  poisson_index_from?: number | null;
  poisson_index_to?: number | null;
  /** Exclude automat porțiunea „platou/blocare” a Ch8 pe intervalul ν. */
  poisson_auto_cutoff?: boolean | null;
  /** Selectare manuală mărci axiale (pentru ε_axial în mod gauges). */
  axial_gauges?: { ch6: boolean; ch7: boolean } | null;
  /** Percent bounds for σu/σo relative to σmax of cycle 3. */
  sigma_u_pct?: number | null;
  sigma_o_pct?: number | null;
  /**
   * For no-gauges mode: displacement scaling factor (mm per unit in file).
   * If null/undefined, we will auto-detect (commonly file is µm -> 0.001 mm).
   */
  displacement_scale_mm?: number | null;
  /**
   * Metodă pentru E în calcule (dacă există curbă SR EN 14580).
   * - eb: panta pe porțiunea liniară a încărcării (ciclu 3), conform SR EN 14580.
   * - loading: același ca eb (compat UI), dar păstrat ca opțiune explicită.
   * - unloading: panta pe descărcare (ciclu 3, auxiliar).
   * - delta: fallback Δσ/Δε_a din măsurători (delta_*).
   * - isrm: ISRM Suggested Method (uniaxial) — Etan/Esec/Eavg la 50% din σmax.
   */
  e_method?: "eb" | "loading" | "unloading" | "delta" | "isrm" | null;
};

export interface YoungCalculationContext {
  mode: YoungTestMode;
  curve: YoungCurvePayload | null;
  settings: YoungSettings;
}

