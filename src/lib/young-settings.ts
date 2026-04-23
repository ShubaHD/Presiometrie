import type { YoungSettings } from "@/modules/calculations/young-context";

export const YOUNG_DEFAULT_SIGMA_U_PCT = 0.02;
export const YOUNG_DEFAULT_SIGMA_O_PCT = 0.33;

export function parseYoungSettings(raw: unknown): YoungSettings {
  const r = raw != null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const num = (k: string) => {
    const v = r[k];
    const n = typeof v === "number" ? v : Number(String(v ?? ""));
    return Number.isFinite(n) ? n : null;
  };
  const int = (k: string) => {
    const v = num(k);
    if (v == null) return null;
    const i = Math.trunc(v);
    return Number.isFinite(i) ? i : null;
  };
  const methodRaw = String(r.e_method ?? "").trim();
  const e_method: YoungSettings["e_method"] =
    methodRaw === "eb" ||
    methodRaw === "loading" ||
    methodRaw === "unloading" ||
    methodRaw === "delta" ||
    methodRaw === "isrm"
      ? (methodRaw as "eb" | "loading" | "unloading" | "delta" | "isrm")
      : null;
  return {
    trim_from: int("trim_from"),
    trim_to: int("trim_to"),
    poisson_index_from: int("poisson_index_from"),
    poisson_index_to: int("poisson_index_to"),
    poisson_auto_cutoff: r.poisson_auto_cutoff !== false,
    axial_gauges:
      r.axial_gauges && typeof r.axial_gauges === "object"
        ? {
            ch6: (r.axial_gauges as Record<string, unknown>).ch6 !== false,
            ch7: (r.axial_gauges as Record<string, unknown>).ch7 !== false,
          }
        : null,
    sigma_u_pct: num("sigma_u_pct"),
    sigma_o_pct: num("sigma_o_pct"),
    displacement_scale_mm: num("displacement_scale_mm"),
    e_method,
  };
}

