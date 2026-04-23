import type { TestType, UcsTestMode, UnconfinedSoilTestMode } from "@/types/lab";
import { z } from "zod";

function optionalPositiveNumber(label: string) {
  return z.preprocess((v) => {
    if (v === "" || v === undefined || v === null) return undefined;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  }, z.number().positive(`${label}: introduceți un număr valid > 0`).optional());
}

const ucsMeasurementSchemaBasic = z
  .object({
    diameter_mm: optionalPositiveNumber("Diametru"),
    height_mm: z.preprocess((v) => {
      if (v === "" || v === undefined || v === null) return undefined;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : undefined;
    }, z.number().positive("Înălțime invalidă").optional()),
    peak_load_kn: optionalPositiveNumber("Sarcină"),
  });

const ucsMeasurementSchemaInstrumented = z.object({
  diameter_mm: z.preprocess((v) => {
    if (v === "" || v === undefined || v === null) return undefined;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  }, z.number().positive("Diametru obligatoriu (mm)")),
  height_mm: z.preprocess((v) => {
    if (v === "" || v === undefined || v === null) return undefined;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  }, z.number().positive("Înălțime invalidă").optional()),
  ucs_strain_scale: z.preprocess((v) => {
    if (v === "" || v === undefined || v === null) return undefined;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  }, z.number().positive("Factor marcă invalid").optional()),
  ucs_subtract_initial_seating: z.preprocess((v) => {
    if (v === "" || v === undefined || v === null) return undefined;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return undefined;
    return n >= 1 ? 1 : 0;
  }, z.union([z.literal(0), z.literal(1)]).optional()),
  ucs_seating_load_kn: optionalPositiveNumber("Sarcină așezare"),
});

const pointLoadSchema = z
  .object({
    plt_test_kind: z.preprocess((v) => {
      if (v === "" || v === undefined || v === null) return undefined;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : undefined;
    }, z.number().int().min(1).max(4).optional()),
    plt_anisotropy: z.preprocess((v) => {
      if (v === "" || v === undefined || v === null) return undefined;
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) return undefined;
      return n >= 1 ? 1 : 0;
    }, z.union([z.literal(0), z.literal(1)]).optional()),
    plt_l_mm: optionalPositiveNumber("L"),
    plt_d_mm: optionalPositiveNumber("D"),
    plt_w_mm: optionalPositiveNumber("W"),
    plt_w1_mm: optionalPositiveNumber("W1"),
    plt_w2_mm: optionalPositiveNumber("W2"),
    plt_w3_mm: optionalPositiveNumber("W3"),
    equivalent_diameter_mm: optionalPositiveNumber("De"),
    peak_load_kn: optionalPositiveNumber("Sarcină"),
    plt_ucs_correlation_k: optionalPositiveNumber("K"),
  })
  .superRefine((data, ctx) => {
    const d = data.plt_d_mm;
    const w = data.plt_w_mm;
    const w1 = data.plt_w1_mm;
    const w2 = data.plt_w2_mm;
    const w3 = data.plt_w3_mm;
    const de = data.equivalent_diameter_mm;
    const kind = data.plt_test_kind;
    const hasDw = d != null && w != null && d > 0 && w > 0;
    const hasDe = de != null && de > 0;
    const diametralWithD = kind === 1 && d != null && d > 0;
    const hasTripleW =
      kind === 4 &&
      d != null &&
      d > 0 &&
      w1 != null &&
      w2 != null &&
      w3 != null &&
      w1 > 0 &&
      w2 > 0 &&
      w3 > 0;
    /** Date vechi: tip 4 cu un singur W. Preferăm W1–W3. */
    const neregulatLegacyDw = kind === 4 && hasDw;
    if (kind === 4) {
      if (!hasDe && !hasTripleW && !neregulatLegacyDw) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Tip neregulat (4): introduceți D (mm) și W1, W2, W3 (mm) — medie (W1+W2+W3)/3 — sau D cu W unic (date vechi), sau De direct (mm).",
        });
      }
    } else if (!hasDw && !hasDe && !diametralWithD) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Introduceți D și W (mm), De (mm), sau tip probă diametral (1) cu D = diametrul carotei (De se calculează automat).",
      });
    }
  });

// Used for "save measurements" (draft) where we want to persist partial inputs without enforcing
// cross-field ASTM combinations. Cross-field requirements are enforced by calculations.
const pointLoadSchemaPartial = z.object({
  plt_test_kind: z.preprocess((v) => {
    if (v === "" || v === undefined || v === null) return undefined;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  }, z.number().int().min(1).max(4).optional()),
  plt_anisotropy: z.preprocess((v) => {
    if (v === "" || v === undefined || v === null) return undefined;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return undefined;
    return n >= 1 ? 1 : 0;
  }, z.union([z.literal(0), z.literal(1)]).optional()),
  plt_l_mm: optionalPositiveNumber("L"),
  plt_d_mm: optionalPositiveNumber("D"),
  plt_w_mm: optionalPositiveNumber("W"),
  plt_w1_mm: optionalPositiveNumber("W1"),
  plt_w2_mm: optionalPositiveNumber("W2"),
  plt_w3_mm: optionalPositiveNumber("W3"),
  equivalent_diameter_mm: optionalPositiveNumber("De"),
  peak_load_kn: optionalPositiveNumber("Sarcină"),
  plt_ucs_correlation_k: optionalPositiveNumber("K"),
});

const unitWeightSchema = z.object({
  dry_mass_g: optionalPositiveNumber("Masă uscată"),
  bulk_volume_cm3: optionalPositiveNumber("Volum"),
});

const unconfinedIsSquareSchema = z.preprocess((v) => {
  if (v === "" || v === undefined || v === null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return n >= 1 ? 1 : 0;
}, z.union([z.literal(0), z.literal(1)]));

const unconfinedSoilSchemaBasic = z
  .object({
    unconfined_is_square: unconfinedIsSquareSchema,
    diameter_mm: optionalPositiveNumber("Diametru"),
    side_mm: optionalPositiveNumber("Latură"),
    height_mm: z.preprocess((v) => {
      if (v === "" || v === undefined || v === null) return undefined;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : undefined;
    }, z.number().positive("Înălțime H_i invalidă")),
    peak_load_kn: optionalPositiveNumber("Sarcină de vârf"),
    strain_at_failure_percent: z.preprocess((v) => {
      if (v === "" || v === undefined || v === null) return undefined;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : undefined;
    }, z.number().min(0, "Torsiune la eșec ≥ 0").max(99.99, "Torsiune < 100%")),
  })
  .superRefine((data, ctx) => {
    const sq = data.unconfined_is_square;
    if (sq !== 0 && sq !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Setați „unconfined_is_square”: 0 = cilindru, 1 = pătrat.",
      });
      return;
    }
    if (sq === 1) {
      if (data.side_mm == null || data.side_mm <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Latură probă (side_mm) obligatorie pentru secțiune pătrată." });
      }
    } else {
      if (data.diameter_mm == null || data.diameter_mm <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Diametru probă (diameter_mm) obligatoriu pentru cilindru.",
        });
      }
    }
  });

const unconfinedSoilSchemaInstrumented = z
  .object({
    unconfined_is_square: unconfinedIsSquareSchema,
    diameter_mm: optionalPositiveNumber("Diametru"),
    side_mm: optionalPositiveNumber("Latură"),
    height_mm: z.preprocess((v) => {
      if (v === "" || v === undefined || v === null) return undefined;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : undefined;
    }, z.number().positive("Înălțime H_i invalidă")),
    unconfined_subtract_initial_seating: z.preprocess((v) => {
      if (v === "" || v === undefined || v === null) return undefined;
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) return undefined;
      return n >= 1 ? 1 : 0;
    }, z.union([z.literal(0), z.literal(1)]).optional()),
    unconfined_seating_load_kn: optionalPositiveNumber("Sarcină așezare"),
    unconfined_disp_source: z.preprocess((v) => {
      if (v === "" || v === undefined || v === null) return undefined;
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) return undefined;
      return n >= 1 ? 1 : 0;
    }, z.union([z.literal(0), z.literal(1)]).optional()),
  })
  .superRefine((data, ctx) => {
    const sq = data.unconfined_is_square;
    if (sq !== 0 && sq !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Setați „unconfined_is_square”: 0 = cilindru, 1 = pătrat.",
      });
      return;
    }
    if (sq === 1) {
      if (data.side_mm == null || data.side_mm <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Latură probă (side_mm) obligatorie pentru secțiune pătrată." });
      }
    } else {
      if (data.diameter_mm == null || data.diameter_mm <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Diametru probă (diameter_mm) obligatoriu pentru cilindru.",
        });
      }
    }
  });

const schemas: Partial<Record<TestType, z.ZodType<Record<string, unknown>>>> = {
  ucs: ucsMeasurementSchemaBasic,
  point_load: pointLoadSchema,
  unit_weight: unitWeightSchema,
  unconfined_soil: unconfinedSoilSchemaBasic,
  presiometry: z.object({
    pmt_probe_type: z.preprocess((v) => {
      if (v === "" || v === undefined || v === null) return undefined;
      return String(v);
    }, z.string().max(120).optional()),
    pmt_depth_m: z.preprocess((v) => {
      if (v === "" || v === undefined || v === null) return undefined;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : undefined;
    }, z.number().min(0, "Adâncime invalidă").optional()),
    pmt_borehole_diameter_mm: optionalPositiveNumber("Diametru gaură"),
    pmt_probe_diameter_mm: optionalPositiveNumber("Diametru sondă"),
    pmt_initial_volume_cm3: optionalPositiveNumber("Volum inițial"),
    pmt_temperature_c: z.preprocess((v) => {
      if (v === "" || v === undefined || v === null) return undefined;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : undefined;
    }, z.number().min(-50).max(80).optional()),
    pmt_notes_field: z.preprocess((v) => {
      if (v === "" || v === undefined || v === null) return undefined;
      return String(v);
    }, z.string().max(1000).optional()),
  }),
};

export function validateMeasurementsForTestType(
  testType: TestType,
  values: Record<string, unknown>,
  options?: {
    ucsMode?: UcsTestMode;
    unconfinedSoilMode?: UnconfinedSoilTestMode;
    allowPartialPointLoad?: boolean;
  },
): { ok: true } | { ok: false; message: string } {
  if (testType === "ucs" && options?.ucsMode === "instrumented") {
    const parsed = ucsMeasurementSchemaInstrumented.safeParse(values);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Date invalide" };
    }
    return { ok: true };
  }
  if (testType === "unconfined_soil" && options?.unconfinedSoilMode === "instrumented") {
    const parsed = unconfinedSoilSchemaInstrumented.safeParse(values);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Date invalide" };
    }
    return { ok: true };
  }
  const schema = schemas[testType];
  if (!schema) return { ok: true };
  const parsed =
    testType === "point_load" && (options as { allowPartialPointLoad?: boolean } | undefined)?.allowPartialPointLoad
      ? pointLoadSchemaPartial.safeParse(values)
      : schema.safeParse(values);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Date invalide";
    return { ok: false, message: msg };
  }
  return { ok: true };
}
