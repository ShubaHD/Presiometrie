/** Date opționale pentru raportul UCS (JSON pe `tests.ucs_report_metadata_json`). */

export interface UcsReportMetadata {
  loading_rate?: string | null;
  time_to_failure?: string | null;
  failure_mode_description?: string | null;
  sample_moisture?: string | null;
  direction_vs_structure?: string | null;
  dimensional_compliance?: string | null;
  /** Dacă e setat, raportul afișează această γ; dacă e gol, se folosește valoarea din calcule. */
  manual_dry_unit_weight_kn_m3?: number | null;
}

function trimStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

export function parseUcsReportMetadata(raw: unknown): UcsReportMetadata {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const manual = o.manual_dry_unit_weight_kn_m3;
  let manualNum: number | null = null;
  if (manual !== null && manual !== undefined && manual !== "") {
    const n = typeof manual === "number" ? manual : Number(manual);
    if (Number.isFinite(n) && n > 0) manualNum = n;
  }
  return {
    loading_rate: trimStr(o.loading_rate),
    time_to_failure: trimStr(o.time_to_failure),
    failure_mode_description: trimStr(o.failure_mode_description),
    sample_moisture: trimStr(o.sample_moisture),
    direction_vs_structure: trimStr(o.direction_vs_structure),
    dimensional_compliance: trimStr(o.dimensional_compliance),
    manual_dry_unit_weight_kn_m3: manualNum,
  };
}

/** Pentru PATCH: obiect JSON stocabil (fără chei goale inutile). */
export function clampUcsReportMetadataForStorage(raw: unknown): UcsReportMetadata {
  const p = parseUcsReportMetadata(raw);
  const out: UcsReportMetadata = {};
  if (p.loading_rate != null) out.loading_rate = p.loading_rate;
  if (p.time_to_failure != null) out.time_to_failure = p.time_to_failure;
  if (p.failure_mode_description != null) out.failure_mode_description = p.failure_mode_description;
  if (p.sample_moisture != null) out.sample_moisture = p.sample_moisture;
  if (p.direction_vs_structure != null) out.direction_vs_structure = p.direction_vs_structure;
  if (p.dimensional_compliance != null) out.dimensional_compliance = p.dimensional_compliance;
  if (p.manual_dry_unit_weight_kn_m3 != null) out.manual_dry_unit_weight_kn_m3 = p.manual_dry_unit_weight_kn_m3;
  return out;
}
