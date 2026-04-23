/**
 * Opțiuni pentru includerea graficelor în raportul PDF (UCS).
 * `undefined` / lipsă cheie = implicit inclus dacă există date.
 */
export interface UcsReportChartsOptions {
  /** @deprecated folosiți sarcina_axial; păstrat pentru JSON vechi */
  stress_strain?: boolean;
  /** Sarcină F – ε_axial în raport (mod UCS+Young). */
  sarcina_axial?: boolean;
  /** Grafic timp – sarcină (opțional / vechi). */
  time_load?: boolean;
  /** Efort σ – timp în raport. */
  stress_time?: boolean;
  /** Diagramă bare UCS (vechi). */
  result_bar?: boolean;
}

export interface SpecimenPhotosReportOptions {
  /** false = nu include pozele în PDF chiar dacă există fișiere. */
  include?: boolean;
}

/** Fig. 3 ASTM D5731-16 în PDF — point load. */
export interface PltAstmFiguresReportOptions {
  include?: boolean;
}

/** Grafic σ_v–ε_v opțional ISO 17892-7 §8.2. */
export interface UnconfinedSoilReportChartsOptions {
  stress_strain?: boolean;
}

/** Rezultate opționale ISO 17892-7 §8.2. */
export interface UnconfinedSoilReportResultsOptions {
  /** include/exclude c_u (0,5·q_u). */
  include_cu_kpa?: boolean;
}

export interface TestReportOptions {
  ucs_charts?: UcsReportChartsOptions;
  specimen_photos?: SpecimenPhotosReportOptions;
  plt_astm_figures?: PltAstmFiguresReportOptions;
  unconfined_soil_charts?: UnconfinedSoilReportChartsOptions;
  unconfined_soil_results?: UnconfinedSoilReportResultsOptions;
}

export function parseTestReportOptions(raw: unknown): TestReportOptions {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const out: TestReportOptions = {};
  const ucs = o.ucs_charts;
  if (ucs && typeof ucs === "object") {
    const u = ucs as Record<string, unknown>;
    const tri = (k: string): boolean | undefined => {
      if (!(k in u)) return undefined;
      return Boolean(u[k]);
    };
    out.ucs_charts = {
      stress_strain: tri("stress_strain"),
      sarcina_axial: tri("sarcina_axial"),
      time_load: tri("time_load"),
      stress_time: tri("stress_time"),
      result_bar: tri("result_bar"),
    };
  }
  const sp = o.specimen_photos;
  if (sp && typeof sp === "object") {
    const s = sp as Record<string, unknown>;
    if ("include" in s) {
      out.specimen_photos = { include: Boolean(s.include) };
    }
  }
  const pl = o.plt_astm_figures;
  if (pl && typeof pl === "object") {
    const x = pl as Record<string, unknown>;
    if ("include" in x) {
      out.plt_astm_figures = { include: Boolean(x.include) };
    }
  }
  const us = o.unconfined_soil_charts;
  if (us && typeof us === "object") {
    const u = us as Record<string, unknown>;
    if ("stress_strain" in u) {
      out.unconfined_soil_charts = { stress_strain: Boolean(u.stress_strain) };
    }
  }
  const usr = o.unconfined_soil_results;
  if (usr && typeof usr === "object") {
    const u = usr as Record<string, unknown>;
    if ("include_cu_kpa" in u) {
      out.unconfined_soil_results = { include_cu_kpa: Boolean(u.include_cu_kpa) };
    }
  }
  return out;
}

/** Valori efective: explicit false exclude; lipsă = `defaultOn`. */
export function effectiveChartFlag(
  stored: boolean | undefined,
  defaultOn: boolean,
): boolean {
  if (stored === false) return false;
  if (stored === true) return true;
  return defaultOn;
}
