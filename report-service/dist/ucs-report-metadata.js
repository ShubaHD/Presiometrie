/** Parsare `ucs_report_metadata_json` (oglindă minimă față de web). */
function trimStr(v) {
    if (v === null || v === undefined)
        return null;
    const s = String(v).trim();
    return s.length ? s : null;
}
export function parseUcsReportMetadata(raw) {
    if (!raw || typeof raw !== "object")
        return {};
    const o = raw;
    const manual = o.manual_dry_unit_weight_kn_m3;
    let manualNum = null;
    if (manual !== null && manual !== undefined && manual !== "") {
        const n = typeof manual === "number" ? manual : Number(manual);
        if (Number.isFinite(n) && n > 0)
            manualNum = n;
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
