import type { TestType, UcsTestMode, UnconfinedSoilTestMode } from "@/types/lab";

export interface MeasurementPresetRow {
  key: string;
  label: string;
  unit: string;
  /** Explicație scurtă sub câmp (ex. Point load D5731). */
  hint?: string;
}

function srEn1926PresetRows(): MeasurementPresetRow[] {
  const rows: MeasurementPresetRow[] = [
    {
      key: "en1926_is_cylinder",
      label: "Formă epruvetă (0 = cub, 1 = cilindru)",
      unit: "—",
    },
    {
      key: "en1926_load_parallel_anisotropy",
      label: "Sarcină față de anizotropie (0 = perpendiculară, 1 = paralelă) — notă raport",
      unit: "—",
    },
    {
      key: "en1926_point_load_index",
      label: "Indice sarcină concentrată Is (opțional, Anexa B)",
      unit: "—",
    },
  ];
  for (let i = 1; i <= 15; i++) {
    const id = String(i).padStart(2, "0");
    rows.push(
      {
        key: `en1926_s${id}_a_mm`,
        label: `Epr. ${i}: l̄ medie (cub) sau d̄ mediu (cilindru)`,
        unit: "mm",
      },
      { key: `en1926_s${id}_h_mm`, label: `Epr. ${i}: înălțime h`, unit: "mm" },
      { key: `en1926_s${id}_f_kn`, label: `Epr. ${i}: sarcină de rupere F`, unit: "kN" },
    );
  }
  return rows;
}

export const MEASUREMENT_PRESETS: Record<TestType, MeasurementPresetRow[]> = {
  ucs: [
    { key: "diameter_mm", label: "Diametru probă", unit: "mm" },
    { key: "height_mm", label: "Înălțime probă", unit: "mm" },
    { key: "peak_load_kn", label: "Sarcină de vârf", unit: "kN" },
  ],
  point_load: [
    {
      key: "plt_test_kind",
      label: "Tip probă",
      unit: "—",
      hint: "Conform geometriei din Fig. 3 ASTM D5731 (coduri 1–4 în calcule). Diametral = 1, axial = 2, bloc = 3, neregulat = 4.",
    },
    {
      key: "plt_anisotropy",
      label: "Încărcare față de anizotropie",
      unit: "0 / 1",
      hint: "Doar dacă există foliație / șistozitate (sau stratificație): 0 = sarcină perpendiculară pe aceste planuri (echivalent notației T în rapoarte tipărite). 1 = sarcină aproximativ paralelă cu planurile (echivalent //). Lăsați gol dacă rocă izotropă sau nu se aplică.",
    },
    {
      key: "plt_l_mm",
      label: "L",
      unit: "mm",
      hint: "Distanța de la punctul de contact (sau axul de încărcare) până la cea mai apropiată față liberă a probei — capăt de carotă, muchie de bloc etc. Condiție uzuală: L > 0,5·D (Fig. 3a, c, d). La diametral: L la ambele capete trebuie să respecte cerința.",
    },
    {
      key: "plt_d_mm",
      label: "D",
      unit: "mm",
      hint: "Distanța între punctele de contact. La test diametral (tip 1), D = diametrul carotei → De se calculează automat ca D. La axial/bloc/neregulat: fie D+W pentru De² = 4WD/π, fie completați opțional De în import.",
    },
    {
      key: "plt_w_mm",
      label: "W",
      unit: "mm",
      hint: "Lățime ⊥ direcția sarcinii (Fig. 3). Pentru tip 2–3 (axial, bloc) împreună cu D, dacă nu folosiți De direct. La diametral (1) lăsați gol. La neregulat (4) folosiți W1–W3 (medie); acest câmp este ascuns pentru tip 4.",
    },
    {
      key: "plt_w1_mm",
      label: "W1 — neregulat (tip 4)",
      unit: "mm",
      hint: "Prima măsurătoare W în plan ⊥ pe direcția de sarcină (neregulat). Împreună cu W2 și W3 formează W mediu = (W1+W2+W3)/3.",
    },
    {
      key: "plt_w2_mm",
      label: "W2 — neregulat (tip 4)",
      unit: "mm",
      hint: "A doua măsurătoare W (același plan ca W1, W3).",
    },
    {
      key: "plt_w3_mm",
      label: "W3 — neregulat (tip 4)",
      unit: "mm",
      hint: "A treia măsurătoare W.",
    },
    {
      key: "peak_load_kn",
      label: "P — sarcină la rupere",
      unit: "kN",
      hint: "Sarcina maximă la eșec. Is(50) se calculează cu K (factor corecție) în funcție de De. Pentru estimarea UCS (σ_uc ≈ k·Is(50)), introduceți k (uzual 15–25) dacă doriți acest rezultat.",
    },
    {
      key: "plt_ucs_correlation_k",
      label: "k — factor corelație UCS (opțional)",
      unit: "—",
      hint: "Folosit doar pentru estimare orientativă: σ_uc ≈ k·Is(50). Dacă nu completați, σ_uc estimat nu se calculează.",
    },
  ],
  unit_weight: [
    { key: "dry_mass_g", label: "Masă uscată (metodă clasică, opțional)", unit: "g" },
    { key: "bulk_volume_cm3", label: "Volum aparent (metodă clasică, opțional)", unit: "cm³" },
  ],
  young: [
    { key: "diameter_mm", label: "Diametru probă", unit: "mm" },
    { key: "height_mm", label: "Înălțime probă", unit: "mm" },
  ],
  triaxial_rock: [
    { key: "diameter_mm", label: "Diametru probă", unit: "mm" },
    { key: "height_mm", label: "Înălțime probă", unit: "mm" },
    { key: "confining_stress_mpa", label: "Presiune de închidere σ₃", unit: "MPa" },
    { key: "peak_axial_load_kn", label: "Sarcină axială de vârf (deviator)", unit: "kN" },
    {
      key: "triaxial_strain_scale",
      label: "Import Triaxial — factor strain (µε → —)",
      unit: "—",
      hint: "Pentru export Controls cu Strain în µε: setați 0.000001 (1e-6). Dacă fișierul are deja strain în —, lăsați gol.",
    },
    {
      key: "triaxial_displacement_scale_mm",
      label: "Import Triaxial — factor deplasare (unități brute → mm)",
      unit: "mm/mm",
      hint: "Dacă Displacement ch5 este în µm: setați 0.001 (µm → mm). Dacă este deja în mm: setați 1 sau lăsați gol.",
    },
    {
      key: "delta_sigma_mpa",
      label: "Metoda B — Δσ (interval liniar, opțional)",
      unit: "MPa",
    },
    {
      key: "delta_epsilon_axial",
      label: "Metoda B — Δε_axial (opțional)",
      unit: "—",
    },
    {
      key: "delta_epsilon_lateral",
      label: "Metoda B — Δε_lateral (opțional)",
      unit: "—",
    },
  ],
  absorption_porosity_rock: [
    {
      key: "mass_dry_g",
      label: "Masă uscată m_d (după uscare)",
      unit: "g",
    },
    {
      key: "mass_sat_ssd_g",
      label: "Masă saturată (SSD) m_s (după ștergere suprafață)",
      unit: "g",
    },
    {
      key: "mass_submerged_g",
      label: "Masă submersă m_sub (în apă)",
      unit: "g",
    },
  ],
  sr_en_1926: srEn1926PresetRows(),
  unconfined_soil: [
    {
      key: "unconfined_is_square",
      label: "Secțiune (0 = cilindru, 1 = pătrat)",
      unit: "—",
    },
    { key: "diameter_mm", label: "Diametru probă (cilindru)", unit: "mm" },
    { key: "side_mm", label: "Latură probă (pătrat)", unit: "mm" },
    { key: "height_mm", label: "Înălțime inițială H_i", unit: "mm" },
    { key: "peak_load_kn", label: "Sarcină de vârf P (mod basic)", unit: "kN" },
    {
      key: "strain_at_failure_percent",
      label: "Deformația specifică axială la momentul ruperii probei ε_v (mod basic), %",
      unit: "%",
    },
    {
      key: "unconfined_seating_load_kn",
      label: "Sarcina inițială (opțional, mod instrumentat)",
      unit: "kN",
    },
    {
      key: "unconfined_subtract_initial_seating",
      label: "Scade sarcina inițială din primul punct (0 = nu, 1 = da)",
      unit: "0/1",
    },
    {
      key: "unconfined_disp_source",
      label: "Import Uniframe: deplasare (0 = primul canal mm, 1 = Crosshead)",
      unit: "0/1",
    },
    {
      key: "water_content_percent",
      label: "Umiditate w (opțional, raport)",
      unit: "%",
    },
    {
      key: "bulk_density_mg_m3",
      label: "Densitate volumică umedă ρ (opțional)",
      unit: "Mg/m³",
    },
    {
      key: "dry_density_mg_m3",
      label: "Densitate uscată ρ_d (opțional)",
      unit: "Mg/m³",
    },
    {
      key: "compression_rate_mm_min",
      label: "Rată compresie medie (opțional, raport)",
      unit: "mm/min",
    },
  ],
  presiometry: [
    { key: "pmt_probe_type", label: "Tip presiometru / sondă (opțional)", unit: "—" },
    { key: "pmt_depth_m", label: "Adâncime test (z)", unit: "m" },
    { key: "pmt_borehole_diameter_mm", label: "Diametru gaură foraj (opțional)", unit: "mm" },
    { key: "pmt_probe_diameter_mm", label: "Diametru sondă / cameră (opțional)", unit: "mm" },
    { key: "pmt_initial_volume_cm3", label: "Volum inițial V₀ (opțional)", unit: "cm³" },
    {
      key: "pmt_temperature_c",
      label: "Temperatura (opțional, pentru note raport)",
      unit: "°C",
    },
    {
      key: "pmt_notes_field",
      label: "Observații teren (opțional)",
      unit: "—",
    },
  ],
};

/** Preset UCS în funcție de mod (basic: sarcină manuală; instrumentat: curbă + factor marcă). */
export function ucsPresetForMode(mode: UcsTestMode | null | undefined): MeasurementPresetRow[] {
  if (mode === "instrumented") {
    return [
      { key: "diameter_mm", label: "Diametru probă", unit: "mm" },
      { key: "height_mm", label: "Înălțime probă", unit: "mm" },
      {
        key: "ucs_strain_scale",
        label: "Factor marcă µε → ε (implicit 1e-6)",
        unit: "—",
      },
    ];
  }
  return MEASUREMENT_PRESETS.ucs;
}

export function unconfinedSoilPresetForMode(
  mode: UnconfinedSoilTestMode | null | undefined,
): MeasurementPresetRow[] {
  const base = MEASUREMENT_PRESETS.unconfined_soil;
  if (mode === "instrumented") {
    return base.filter((r) => r.key !== "peak_load_kn" && r.key !== "strain_at_failure_percent");
  }
  return base.filter(
    (r) => r.key !== "unconfined_seating_load_kn" && r.key !== "unconfined_subtract_initial_seating",
  );
}
