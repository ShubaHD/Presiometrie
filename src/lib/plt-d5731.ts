/**
 * ASTM D5731-16 — Point Load Strength Index (formule de bază).
 * P în N, dimensiuni în mm → Is în MPa (Is = P / De²).
 */

export const PLT_DE_REF_MM = 50;
export const PLT_SIZE_EXPONENT = 0.45;

/** K implicit pentru σ_uc ≈ K·Is(50) când nu e introdus în măsurători (domeniu uzual literatură ~15–25). */
export const PLT_DEFAULT_UCS_CORRELATION_K = 20;

export type PltDeResolution =
  | { ok: true; deMm: number; de2Mm2: number; mode: "from_d_w" | "direct" }
  | { ok: false; reason: string };

export type ResolveEquivalentDiameterOptions = {
  /** Cod ASTM Fig. 3 (1 = diametral, …). Pentru 1: De = D dacă nu e dat De explicit. */
  pltTestKind?: number | null;
};

/** De² = 4A/π cu A = W·D (bloc / bulgă); De direct; sau la diametral (1): De = D. */
export function resolveEquivalentDiameterMm(
  pltDmm: number | null,
  pltWmm: number | null,
  deDirectMm: number | null,
  opts?: ResolveEquivalentDiameterOptions,
): PltDeResolution {
  const d = pltDmm != null && Number.isFinite(pltDmm) ? pltDmm : null;
  const w = pltWmm != null && Number.isFinite(pltWmm) ? pltWmm : null;
  const deDir = deDirectMm != null && Number.isFinite(deDirectMm) ? deDirectMm : null;
  const kind = opts?.pltTestKind != null && Number.isFinite(opts.pltTestKind) ? Math.floor(opts.pltTestKind) : null;

  const hasDW = d != null && w != null && d > 0 && w > 0;
  const hasDe = deDir != null && deDir > 0;

  if (hasDe) {
    const deMm = deDir!;
    return { ok: true, deMm, de2Mm2: deMm * deMm, mode: "direct" };
  }
  if (kind === 1 && d != null && d > 0) {
    const deMm = d;
    return { ok: true, deMm, de2Mm2: deMm * deMm, mode: "direct" };
  }
  if (hasDW) {
    const A = w! * d!;
    const de2 = (4 * A) / Math.PI;
    const deMm = Math.sqrt(de2);
    return { ok: true, deMm, de2Mm2: de2, mode: "from_d_w" };
  }
  if ((d != null && d > 0) !== (w != null && w > 0)) {
    return {
      ok: false,
      reason:
        "Completați ambele D și W (mm), introduceți De (mm), sau setați tip probă diametral (1) și D = diametrul carotei.",
    };
  }
  return {
    ok: false,
    reason: "Lipsește De: D și W (mm), De (mm), sau tip diametral (1) cu D (mm).",
  };
}

/** Factor de corecție la diametrul de referință 50 mm: (De/50)^0.45. */
export function pltSizeCorrectionFactor(deMm: number): number {
  if (!(deMm > 0)) return NaN;
  return Math.pow(deMm / PLT_DE_REF_MM, PLT_SIZE_EXPONENT);
}

/** Is = P_N / De² (MPa). */
export function pltIsUncorrectedMpa(loadN: number, de2Mm2: number): number {
  if (!(loadN > 0) || !(de2Mm2 > 0)) return NaN;
  return loadN / de2Mm2;
}

export interface PltGeometryChecks {
  warnings: string[];
}

/** Verificări orientative conform D5731 (domenii uzuale); nu blochează calculul. */
export function pltGeometryWarnings(
  deMm: number,
  mode: "from_d_w" | "direct",
  pltDmm: number | null,
  pltWmm: number | null,
  pltLmm: number | null,
): PltGeometryChecks {
  const warnings: string[] = [];

  if (deMm < 30 || deMm > 85) {
    warnings.push(
      `De = ${deMm.toFixed(2)} mm este în afara domeniului uzual 30–85 mm (§1.2 D5731). Verificați probă / notarea dimensiunilor.`,
    );
  }

  if (mode === "from_d_w" && pltDmm != null && pltWmm != null && pltDmm > 0 && pltWmm > 0) {
    const ratio = pltDmm / pltWmm;
    if (ratio < 0.3 || ratio > 1) {
      warnings.push(
        `Raport D/W = ${ratio.toFixed(3)} — în afara condiției 0,3 < D/W < 1 pentru bloc/bulgă (Fig. 3 / §9.4).`,
      );
    }
  }

  if (pltLmm != null && Number.isFinite(pltLmm) && pltDmm != null && pltDmm > 0) {
    if (pltLmm <= 0.5 * pltDmm) {
      warnings.push(
        `L (${pltLmm} mm) nu îndeplinește condiția L > 0,5·D (D = ${pltDmm} mm). Verificați poziționarea față de fața liberă.`,
      );
    }
  }

  return { warnings };
}
