/** Parsare `ucs_report_metadata_json` (oglindă minimă față de web). */

export interface UcsReportMetadata {
  loading_rate?: string | null;
  time_to_failure?: string | null;
  failure_mode_description?: string | null;
  sample_moisture?: string | null;
  direction_vs_structure?: string | null;
  dimensional_compliance?: string | null;
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
