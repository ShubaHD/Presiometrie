export type AbsPorRockSpecimen = {
  /** Label shown in UI/PDF (e.g., S1/S2/S3). */
  label: string;
  mass_dry_g: number | null;
  mass_sat_ssd_g: number | null;
  mass_submerged_g: number | null;
  // Optional dimensions (ISO report may require specimen dimensions).
  length_mm?: number | null;
  diameter_mm?: number | null;
  width_mm?: number | null;
  height_mm?: number | null;
};

export type AbsorptionPorosityRockPayload = {
  version: 1;
  specimens: AbsPorRockSpecimen[];
};

export type AbsorptionPorosityRockReportMetadata = {
  version: 1;
  report_number?: string;
  standard_number?: string; // SR EN ISO 13755
  standard_title?: string;
  standard_issue_date?: string;
  test_location?: string;
  client_name_address?: string;
  stone_petrographic_name?: string;
  stone_commercial_name?: string;
  extraction_country_region?: string;
  supplier_name?: string;
  anisotropy_direction?: string;
  surface_finish?: string;
  sampling_by?: string;
  delivery_date?: string;
  preparation_date?: string;
  deviations?: string;
  remarks?: string;
};

export const ABS_POR_ROCK_DEFAULT: AbsorptionPorosityRockPayload = {
  version: 1,
  specimens: [
    { label: "Epr. 1", mass_dry_g: null, mass_sat_ssd_g: null, mass_submerged_g: null },
    { label: "Epr. 2", mass_dry_g: null, mass_sat_ssd_g: null, mass_submerged_g: null },
    { label: "Epr. 3", mass_dry_g: null, mass_sat_ssd_g: null, mass_submerged_g: null },
  ],
};

export const ABS_POR_ROCK_META_DEFAULT: AbsorptionPorosityRockReportMetadata = {
  version: 1,
  standard_number: "SR EN ISO 13755",
  standard_title: "Natural stone — Determination of water absorption at atmospheric pressure",
};

function clampNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function clampText(v: unknown, max = 500): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  return s.length > max ? s.slice(0, max) : s;
}

export function parseAbsorptionPorosityRockPayload(raw: unknown): AbsorptionPorosityRockPayload {
  if (!raw || typeof raw !== "object") return { ...ABS_POR_ROCK_DEFAULT };
  const o = raw as Record<string, unknown>;
  const specRaw = o.specimens;
  const specimensIn = Array.isArray(specRaw) ? specRaw : [];
  const specimens: AbsPorRockSpecimen[] = [];
  for (let i = 0; i < Math.min(3, specimensIn.length); i++) {
    const r = specimensIn[i];
    const rec = r && typeof r === "object" ? (r as Record<string, unknown>) : {};
    specimens.push({
      label: clampText(rec.label, 50) ?? ABS_POR_ROCK_DEFAULT.specimens[i]!.label,
      mass_dry_g: clampNum(rec.mass_dry_g),
      mass_sat_ssd_g: clampNum(rec.mass_sat_ssd_g),
      mass_submerged_g: clampNum(rec.mass_submerged_g),
      length_mm: clampNum(rec.length_mm),
      diameter_mm: clampNum(rec.diameter_mm),
      width_mm: clampNum(rec.width_mm),
      height_mm: clampNum(rec.height_mm),
    });
  }
  while (specimens.length < 3) {
    const d = ABS_POR_ROCK_DEFAULT.specimens[specimens.length]!;
    specimens.push({ ...d });
  }
  return { version: 1, specimens };
}

export function clampAbsorptionPorosityRockPayloadForStorage(raw: unknown): AbsorptionPorosityRockPayload {
  return parseAbsorptionPorosityRockPayload(raw);
}

export function parseAbsorptionPorosityRockReportMetadata(raw: unknown): AbsorptionPorosityRockReportMetadata {
  if (!raw || typeof raw !== "object") return { ...ABS_POR_ROCK_META_DEFAULT };
  const o = raw as Record<string, unknown>;
  return {
    version: 1,
    report_number: clampText(o.report_number, 80),
    standard_number: clampText(o.standard_number, 80) ?? ABS_POR_ROCK_META_DEFAULT.standard_number,
    standard_title: clampText(o.standard_title, 200) ?? ABS_POR_ROCK_META_DEFAULT.standard_title,
    standard_issue_date: clampText(o.standard_issue_date, 40),
    test_location: clampText(o.test_location, 200),
    client_name_address: clampText(o.client_name_address, 300),
    stone_petrographic_name: clampText(o.stone_petrographic_name, 160),
    stone_commercial_name: clampText(o.stone_commercial_name, 160),
    extraction_country_region: clampText(o.extraction_country_region, 200),
    supplier_name: clampText(o.supplier_name, 200),
    anisotropy_direction: clampText(o.anisotropy_direction, 200),
    surface_finish: clampText(o.surface_finish, 200),
    sampling_by: clampText(o.sampling_by, 200),
    delivery_date: clampText(o.delivery_date, 40),
    preparation_date: clampText(o.preparation_date, 40),
    deviations: clampText(o.deviations, 800),
    remarks: clampText(o.remarks, 800),
  };
}

export function clampAbsorptionPorosityRockReportMetadataForStorage(
  raw: unknown,
): AbsorptionPorosityRockReportMetadata {
  return parseAbsorptionPorosityRockReportMetadata(raw);
}

