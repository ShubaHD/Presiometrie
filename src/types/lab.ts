export type TestType =
  | "ucs"
  | "point_load"
  | "unit_weight"
  | "young"
  | "triaxial_rock"
  | "sr_en_1926"
  | "unconfined_soil"
  | "absorption_porosity_rock"
  | "presiometry";

export type TestStatus = "draft" | "verified" | "approved" | "reported";

export type MeasurementSource = "manual" | "imported";

export interface Project {
  id: string;
  code: string;
  name: string;
  client_name: string | null;
  location: string | null;
  notes: string | null;
  created_at: string;
}

export interface Borehole {
  id: string;
  project_id: string;
  code: string;
  /** Nume foraj (denumire umană lângă cod). */
  name: string | null;
  depth_total: number | null;
  elevation: number | null;
  notes: string | null;
  /** Ultimul cod numeric alocat automat (după migrarea `next_sample_seq`). */
  next_sample_seq?: number;
}

export interface Sample {
  id: string;
  borehole_id: string;
  /** Număr probă (identificator probă în cadrul forajului). */
  code: string;
  depth_from: number | null;
  depth_to: number | null;
  lithology: string | null;
  notes: string | null;
}

export type UcsTestMode = "basic" | "instrumented";
export type UnconfinedSoilTestMode = "basic" | "instrumented";
export type YoungTestMode = "no_gauges" | "gauges";

export interface TestRow {
  id: string;
  sample_id: string;
  test_type: TestType;
  status: TestStatus;
  operator_name: string | null;
  device_name: string | null;
  /** Semnături raport PDF (per test). */
  prepared_by?: string | null;
  verified_by?: string | null;
  test_date: string | null;
  formula_version: string | null;
  notes: string | null;
  created_at: string;
  /** UCS: mod de lucru (după migrarea ucs_instrumentation). */
  ucs_mode?: UcsTestMode | null;
  /** UCS instrumentat: serie σ–ε (JSON). */
  ucs_curve_json?: unknown | null;
  /** UCS: metodă modul, intervale, rezultat ultimului calcul. */
  ucs_modulus_settings_json?: unknown | null;
  /** Ce grafice includem în PDF (vezi `TestReportOptions` în lib). */
  report_options_json?: unknown | null;
  /** Greutate volumică: rânduri m0/m1/m2, mod submers (vezi `unit-weight-submerged.ts`). */
  unit_weight_submerged_json?: unknown | null;
  /** UCS: câmpuri raport (rată încărcare, γ manuală etc.). */
  ucs_report_metadata_json?: unknown | null;
  /** Point load: text raport PDF structurat (secțiuni structurate în report-service). */
  point_load_report_metadata_json?: unknown | null;
  /** Young SR EN 14580: sursa ε (fără mărci: deplasare; cu mărci: strain). */
  young_mode?: YoungTestMode | null;
  /** Young SR EN 14580: serie puncte pentru cicluri încărcare/descărcare. */
  young_curve_json?: unknown | null;
  /** Young SR EN 14580: setări (σu/σo procente, trim, etc.). */
  young_settings_json?: unknown | null;
  /** ISO 13755 rock: 3 specimens mass inputs (JSON). */
  absorption_porosity_rock_json?: unknown | null;
  /** ISO 13755 rock: report metadata fields (JSON). */
  absorption_porosity_rock_report_metadata_json?: unknown | null;
  /** Triaxial rock Variant B: Hoek–Brown intact fit (σci + mi). */
  triaxial_hb_intact_json?: unknown | null;
  /** ISO 17892-7 pământ: basic sau instrumentat (curbă). */
  unconfined_soil_mode?: UnconfinedSoilTestMode | null;
  unconfined_soil_curve_json?: unknown | null;
  unconfined_soil_report_metadata_json?: unknown | null;
  /** SR EN ISO 22476-5: curba presiometrie (JSON). */
  presiometry_curve_json?: unknown | null;
  /** SR EN ISO 22476-5: setări/alegeri calcul (JSON). */
  presiometry_settings_json?: unknown | null;
  /** SR EN ISO 22476-5: câmpuri raport (JSON). */
  presiometry_report_metadata_json?: unknown | null;
  /** După migrarea SQL; până atunci poate lipsi din răspuns */
  updated_at?: string;
  created_by?: string | null;
  created_by_user_id?: string | null;
  updated_by?: string | null;
  updated_by_user_id?: string | null;
  locked_by_user_id?: string | null;
  locked_by_label?: string | null;
  locked_at?: string | null;
  lock_expires_at?: string | null;
}

export interface TestMeasurement {
  id: string;
  test_id: string;
  key: string;
  label: string;
  value: number | null;
  unit: string | null;
  display_order: number;
  source: MeasurementSource;
}

export interface TestResult {
  id: string;
  test_id: string;
  key: string;
  label: string;
  value: number | null;
  unit: string | null;
  decimals: number;
  reportable: boolean;
  display_order: number;
}

/** Poze probă raport: `specimen_before` | `specimen_after`; null = fișier generic. */
export type TestFileRole = "specimen_before" | "specimen_after";

export interface TestFile {
  id: string;
  test_id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  /** Din migrarea `test_files_role`; poate lipsi în răspunsuri vechi. */
  file_role?: string | null;
  uploaded_at: string;
}

export interface TriaxialRockRun {
  id: string;
  test_id: string;
  file_name: string;
  storage_path: string;
  curve_json: unknown;
  sigma3_mpa: number | null;
  peak_q_mpa: number | null;
  sigma1_mpa: number | null;
  import_warnings: string[] | null;
  is_suspect?: boolean | null;
  observations?: string | null;
  created_at: string;
}

/** Rând unic `lab_profile` (id = 1) — antet rapoarte. */
export interface LabProfile {
  id: number;
  company_name: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  logo_path: string | null;
  updated_at: string;
}

export interface ReportRow {
  id: string;
  test_id: string;
  template_code: string;
  template_version: string;
  report_number: string | null;
  pdf_path: string;
  generated_at: string;
}

export interface BreadcrumbItem {
  label: string;
  href: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TestHierarchyContext {
  project: Pick<Project, "id" | "code" | "name">;
  borehole: Pick<Borehole, "id" | "code" | "name">;
  sample: Pick<Sample, "id" | "code" | "depth_from" | "depth_to">;
  test: Pick<
    TestRow,
    | "id"
    | "test_type"
    | "status"
    | "test_date"
    | "created_at"
    | "updated_at"
    | "created_by"
    | "updated_by"
    | "locked_by_user_id"
    | "locked_by_label"
    | "lock_expires_at"
  >;
}
