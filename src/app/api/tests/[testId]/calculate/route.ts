import { requireAuth } from "@/lib/auth/session";
import { getLabActorFromRequest } from "@/lib/lab-actor";
import { toErrorMessage } from "@/lib/to-error-message";
import {
  moistureGravimetricHasAnyInput,
  parseUnitWeightSubmergedPayload,
  unitWeightCylinderHasAnyInput,
  unitWeightSubmergedHasAnyMassInput,
} from "@/lib/unit-weight-submerged";
import { parseYoungSettings } from "@/lib/young-settings";
import type { YoungCurvePayload } from "@/lib/young-curve-parse";
import { parseAbsorptionPorosityRockPayload } from "@/lib/absorption-porosity-rock";
import {
  normalizeUnconfinedSoilMode,
  parseUnconfinedSoilCurvePayload,
} from "@/lib/unconfined-soil-curve";
import { normalizeUcsMode, parseUcsCurvePayload, parseUcsModulusSettings } from "@/lib/ucs-instrumentation";
import type { CalculationContext, CalculationOutput } from "@/modules/calculations";
import { measurementsRowsToMap, runCalculationForTestType } from "@/modules/calculations";
import { calculateMoistureGravimetric } from "@/modules/calculations/moistureGravimetric";
import { unconfinedSoilInstrumentedPeakTimeS } from "@/modules/calculations/unconfinedSoil";
import { calculateUnitWeight } from "@/modules/calculations/unitWeight";
import { MEASUREMENT_PRESETS } from "@/lib/measurement-presets";
import { classifyIs50MpaStrengthRo } from "@/lib/plt-is50-strength-class";
import {
  clampPointLoadReportMetadataForStorage,
} from "@/lib/point-load-report-metadata";
import {
  clampUnconfinedSoilReportMetadataForStorage,
  parseUnconfinedSoilReportMetadata,
} from "@/lib/unconfined-soil-report-metadata";
import { clampUcsReportMetadataForStorage, parseUcsReportMetadata } from "@/lib/ucs-report-metadata";
import { timeSecondsAtPeakStressFromPoints } from "@/lib/ucs-curve-parse";
import { isLockedByOther } from "@/lib/test-lock";
import type { TestType } from "@/types/lab";
import { NextResponse } from "next/server";
import { fitMohrCoulomb } from "@/lib/triaxial/compute";
import { fitHbIntactMi } from "@/lib/triaxial/hb-intact";
import { parsePresiometryCurvePayload } from "@/lib/presiometry-curve";

type Params = { params: Promise<{ testId: string }> };

const TYPES_WITH_OPTIONAL_SUBMERGED_GAMMA: TestType[] = [
  "ucs",
  "young",
  "triaxial_rock",
  "unconfined_soil",
  "point_load",
];

const TYPES_WITH_BULK_UW_JSON: TestType[] = [
  "ucs",
  "young",
  "triaxial_rock",
  "unit_weight",
  "unconfined_soil",
  "point_load",
];

function mergeCalculationOutputs(base: CalculationOutput, add: CalculationOutput): CalculationOutput {
  const baseMax = Math.max(
    0,
    ...base.intermediate.map((r) => r.display_order),
    ...base.final.map((r) => r.display_order),
  );
  let order = baseMax + 10;
  const bump = (lines: CalculationOutput["intermediate"]) =>
    [...lines].sort((a, b) => a.display_order - b.display_order).map((l) => {
      order += 1;
      return { ...l, display_order: order };
    });
  return {
    intermediate: [...base.intermediate, ...bump(add.intermediate)],
    final: [...base.final, ...bump(add.final)],
    warnings: [...base.warnings, ...add.warnings],
    errors: [...base.errors, ...add.errors],
    formulaVersion: base.formulaVersion,
    ucsModulusSettingsUpdate: base.ucsModulusSettingsUpdate ?? add.ucsModulusSettingsUpdate,
  };
}

function areaMm2(diameterMm: number): number | null {
  if (!Number.isFinite(diameterMm) || diameterMm <= 0) return null;
  return Math.PI * (diameterMm / 2) ** 2;
}

function finiteNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { testId } = await params;
    const actor = getLabActorFromRequest(req);

    const { data: test, error: tErr } = await supabase
      .from("tests")
      .select(
        "id, test_type, locked_by_user_id, lock_expires_at, ucs_mode, ucs_curve_json, ucs_modulus_settings_json, unit_weight_submerged_json, ucs_report_metadata_json, point_load_report_metadata_json, young_mode, young_curve_json, young_settings_json, unconfined_soil_mode, unconfined_soil_curve_json, unconfined_soil_report_metadata_json, absorption_porosity_rock_json, presiometry_curve_json",
      )
      .eq("id", testId)
      .single();
    if (tErr) throw tErr;

    // Backward-compatible: this column may not exist on older DBs.
    // Only fetch it when actually needed for triaxial rock calculations.
    let triaxialHbIntactJson: unknown | null = null;
    if ((test.test_type as TestType) === "triaxial_rock") {
      const { data: hbRow, error: hbErr } = await supabase
        .from("tests")
        .select("triaxial_hb_intact_json")
        .eq("id", testId)
        .single();
      if (hbErr) throw hbErr;
      triaxialHbIntactJson = (hbRow as { triaxial_hb_intact_json?: unknown } | null)?.triaxial_hb_intact_json ?? null;
    }

    if (isLockedByOther(test, actor.userId)) {
      return NextResponse.json({ error: "Test blocat de alt post." }, { status: 423 });
    }

    const { data: mRows, error: mErr } = await supabase
      .from("test_measurements")
      .select("key, value")
      .eq("test_id", testId);
    if (mErr) throw mErr;

    const map = measurementsRowsToMap(mRows ?? []);
    let mcFitCandidate: { phiDeg: number | null; cMpa: number | null; notes: string[] } | null = null;

    // Triaxial rock (Hoek): allow "Run calculations" to work with imported runs list by
    // auto-filling missing Method A inputs from the most recent imported run.
    if (test.test_type === "triaxial_rock") {
      const { data: runs, error: runsErr } = await supabase
        .from("triaxial_rock_runs")
        .select("id, created_at, sigma1_mpa, sigma3_mpa, peak_q_mpa")
        .eq("test_id", testId)
        .order("created_at", { ascending: false })
        .limit(25);
      if (runsErr) throw runsErr;

      const parsedRuns =
        (runs ?? [])
          .map((r) => ({
            id: String((r as { id?: unknown }).id ?? ""),
            createdAt: String((r as { created_at?: unknown }).created_at ?? ""),
            sigma1: finiteNumberOrNull((r as { sigma1_mpa?: unknown }).sigma1_mpa),
            sigma3: finiteNumberOrNull((r as { sigma3_mpa?: unknown }).sigma3_mpa),
            q: finiteNumberOrNull((r as { peak_q_mpa?: unknown }).peak_q_mpa),
          }))
          .filter((r) => r.id && r.sigma3 != null && r.sigma3 >= 0) ?? [];

      const latest = parsedRuns[0] ?? null;
      if (latest) {
        const existingSigma3 = finiteNumberOrNull((map as Record<string, unknown>).confining_stress_mpa);
        if (!(existingSigma3 != null && existingSigma3 >= 0)) {
          map.confining_stress_mpa = latest.sigma3;
        }

        const existingPeak = finiteNumberOrNull((map as Record<string, unknown>).peak_axial_load_kn);
        const hasPeak = existingPeak != null && existingPeak > 0;
        const diam = finiteNumberOrNull((map as Record<string, unknown>).diameter_mm) ?? NaN;
        const a = areaMm2(diam);
        const qMpa =
          latest.q != null
            ? latest.q
            : latest.sigma1 != null && latest.sigma3 != null
              ? latest.sigma1 - latest.sigma3
              : NaN;

        // peak_axial_load_kn = q(MPa) * area(mm²) / 1000
        if (!hasPeak && a != null && Number.isFinite(qMpa) && qMpa > 0) {
          map.peak_axial_load_kn = (qMpa * a) / 1000;
        }
      }

      // If we have >=2 valid (σ1, σ3) points from runs, compute Mohr–Coulomb envelope and store in results.
      const mcPoints = parsedRuns
        .filter((r) => r.sigma1 != null && r.sigma3 != null && r.sigma1 >= r.sigma3)
        .map((r) => ({
          sampleId: r.id,
          sigma3Mpa: r.sigma3!,
          sigma1PeakMpa: r.sigma1!,
          peakIndex: 0,
        }));

      // We'll merge into `out` after the main calculation, but keep the candidate fit now.
      mcFitCandidate = mcPoints.length >= 2 ? fitMohrCoulomb(mcPoints) : null;
    }

    // Optional calculation overrides from client (used to avoid requiring a separate "save settings" click).
    let body: Record<string, unknown> | null = null;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = null;
    }

    const submergedAll = parseUnitWeightSubmergedPayload(
      (test as { unit_weight_submerged_json?: unknown }).unit_weight_submerged_json,
    );

    let ctx: CalculationContext | undefined;
    if (test.test_type === "ucs") {
      ctx = {
        ucs: {
          mode: normalizeUcsMode(test.ucs_mode),
          curve: parseUcsCurvePayload(test.ucs_curve_json),
          modulusSettings: parseUcsModulusSettings(test.ucs_modulus_settings_json),
        },
      };
    }
    if (test.test_type === "young") {
      const ymRaw = (test as { young_mode?: unknown }).young_mode;
      const mode = ymRaw === "gauges" ? "gauges" : "no_gauges";
      const settingsRaw =
        body && typeof body === "object" && body.young_settings_override && typeof body.young_settings_override === "object"
          ? (body.young_settings_override as Record<string, unknown>)
          : ((test as { young_settings_json?: unknown }).young_settings_json as unknown);
      ctx = {
        ...ctx,
        young: {
          mode,
          curve:
            (test as { young_curve_json?: unknown }).young_curve_json != null
              ? ((test as { young_curve_json?: unknown }).young_curve_json as YoungCurvePayload)
              : null,
          settings: parseYoungSettings(settingsRaw),
        },
      };
    }
    if (test.test_type === "unit_weight" && submergedAll) {
      ctx = { ...ctx, unitWeightSubmerged: submergedAll };
    }
    if (test.test_type === "unconfined_soil") {
      const usCurve = parseUnconfinedSoilCurvePayload(
        (test as { unconfined_soil_curve_json?: unknown }).unconfined_soil_curve_json,
      );
      ctx = {
        ...ctx,
        unconfinedSoil: {
          mode: normalizeUnconfinedSoilMode((test as { unconfined_soil_mode?: unknown }).unconfined_soil_mode),
          curve: usCurve,
        },
      };
    }
    if (test.test_type === "absorption_porosity_rock") {
      const payload = parseAbsorptionPorosityRockPayload(
        (test as { absorption_porosity_rock_json?: unknown }).absorption_porosity_rock_json,
      );
      ctx = {
        ...ctx,
        absorptionPorosityRock: {
          specimens: payload.specimens.map((s) => ({
            label: s.label,
            mass_dry_g: s.mass_dry_g,
            mass_sat_ssd_g: s.mass_sat_ssd_g,
            mass_submerged_g: s.mass_submerged_g,
          })),
        },
      };
    }

    if (test.test_type === "presiometry") {
      const curve = parsePresiometryCurvePayload(
        (test as { presiometry_curve_json?: unknown }).presiometry_curve_json,
      );
      ctx = { ...ctx, presiometry: { curve } };
    }

    let out = runCalculationForTestType(test.test_type as TestType, map, ctx);

    if (test.test_type === "triaxial_rock") {
      const mcFit = mcFitCandidate;
      if (mcFit && out.errors.length === 0 && mcFit.phiDeg != null && mcFit.cMpa != null) {
        out = mergeCalculationOutputs(out, {
          intermediate: [],
          final: [
            {
              key: "mohr_c_mpa",
              label: "Mohr–Coulomb: coeziune c (din rulări importate)",
              value: mcFit.cMpa,
              unit: "MPa",
              decimals: 3,
              reportable: true,
              display_order: 200,
            },
            {
              key: "mohr_phi_deg",
              label: "Mohr–Coulomb: unghi frecare internă φ (din rulări importate)",
              value: mcFit.phiDeg,
              unit: "°",
              decimals: 2,
              reportable: true,
              display_order: 210,
            },
          ],
          warnings: mcFit.notes ?? [],
          errors: [],
          formulaVersion: out.formulaVersion,
        });

        // The base triaxial calculation always warns that a single test isn't enough for c/φ.
        // When we successfully fit c/φ from multiple imported runs, that warning becomes misleading.
        out = {
          ...out,
          warnings: (out.warnings ?? []).filter(
            (w) =>
              !/Un singur test dă un cerc Mohr; pentru c și φ sunt necesare mai multe încercări la σ₃ diferite\./i.test(
                String(w),
              ),
          ),
        };
      }
    }

    // Hoek–Brown intact fit (mi) from multi-run triaxial points + σci (UCS)
    if (test.test_type === "triaxial_rock" && out.errors.length === 0) {
      const overrideSigmaCi =
        body && typeof body === "object" && body.triaxial_hb_sigma_ci_mpa != null
          ? finiteNumberOrNull(body.triaxial_hb_sigma_ci_mpa)
          : null;
      const storedSigmaCi =
        triaxialHbIntactJson && typeof triaxialHbIntactJson === "object"
          ? finiteNumberOrNull(
              (triaxialHbIntactJson as Record<string, unknown>).sigma_ci_mpa,
            )
          : null;

      const sigmaCiMpa = overrideSigmaCi ?? storedSigmaCi;

      if (sigmaCiMpa != null && sigmaCiMpa > 0) {
        const { data: runsForHb, error: hbRunsErr } = await supabase
          .from("triaxial_rock_runs")
          .select("id, sigma1_mpa, sigma3_mpa")
          .eq("test_id", testId)
          .order("created_at", { ascending: false })
          .limit(50);
        if (hbRunsErr) throw hbRunsErr;

        const pts =
          (runsForHb ?? [])
            .map((r) => ({
              sigma3Mpa: finiteNumberOrNull((r as { sigma3_mpa?: unknown }).sigma3_mpa),
              sigma1Mpa: finiteNumberOrNull((r as { sigma1_mpa?: unknown }).sigma1_mpa),
            }))
            .filter((p): p is { sigma3Mpa: number; sigma1Mpa: number } => p.sigma3Mpa != null && p.sigma1Mpa != null)
            .map((p) => ({ sigma3Mpa: p.sigma3Mpa, sigma1Mpa: p.sigma1Mpa }));

        const hb = fitHbIntactMi({ sigmaCiMpa, points: pts });
        if (hb.mi != null) {
          out = mergeCalculationOutputs(out, {
            intermediate: [],
            final: [
              {
                key: "hb_sigma_ci_mpa",
                label: "Hoek–Brown (intact): σci (UCS)",
                value: sigmaCiMpa,
                unit: "MPa",
                decimals: 2,
                reportable: true,
                display_order: 230,
              },
              {
                key: "hb_mi",
                label: "Hoek–Brown (intact): mi",
                value: hb.mi,
                unit: "—",
                decimals: 2,
                reportable: true,
                display_order: 240,
              },
              {
                key: "hb_rmse_mpa",
                label: "Hoek–Brown (intact): RMSE fit",
                value: hb.rmseMpa,
                unit: "MPa",
                decimals: 2,
                reportable: false,
                display_order: 250,
              },
            ],
            warnings: hb.notes,
            errors: [],
            formulaVersion: out.formulaVersion,
          });

          const fittedAt = new Date().toISOString();
          const hbJson = { version: 1, sigma_ci_mpa: sigmaCiMpa, mi: hb.mi, rmse_mpa: hb.rmseMpa, fitted_at: fittedAt };
          await supabase.from("tests").update({ triaxial_hb_intact_json: hbJson }).eq("id", testId);
        } else if (hb.notes.length > 0) {
          out = { ...out, warnings: [...out.warnings, ...hb.notes] };
        }
      }
    }

    const mergeGamma =
      test.test_type !== "unit_weight" &&
      submergedAll &&
      (unitWeightSubmergedHasAnyMassInput(submergedAll) || unitWeightCylinderHasAnyInput(submergedAll.cylinder)) &&
      TYPES_WITH_OPTIONAL_SUBMERGED_GAMMA.includes(test.test_type as TestType) &&
      out.errors.length === 0;

    if (mergeGamma) {
      const uwOut = calculateUnitWeight(map, { unitWeightSubmerged: submergedAll });
      if (uwOut.errors.length > 0) {
        // For non-unit_weight tests, submerged γ/ρ is optional. If the payload is incomplete,
        // don't block the main test calculation—surface the issue as warnings instead.
        out = {
          ...out,
          warnings: [...out.warnings, ...uwOut.warnings, ...uwOut.errors],
        };
      } else {
        out = mergeCalculationOutputs(out, uwOut);
      }
    }

    const mergeMoisture =
      submergedAll?.moisture_gravimetric &&
      moistureGravimetricHasAnyInput(submergedAll.moisture_gravimetric) &&
      TYPES_WITH_BULK_UW_JSON.includes(test.test_type as TestType) &&
      out.errors.length === 0;

    if (mergeMoisture) {
      const moOut = calculateMoistureGravimetric(submergedAll!.moisture_gravimetric!);
      if (moOut.errors.length > 0) {
        out = {
          ...out,
          errors: [...out.errors, ...moOut.errors],
          warnings: [...out.warnings, ...moOut.warnings],
        };
      } else {
        out = mergeCalculationOutputs(out, moOut);
      }
    }

    if (out.errors.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          errors: out.errors,
          warnings: out.warnings,
          formulaVersion: out.formulaVersion,
        },
        { status: 422 },
      );
    }

    const { error: delErr } = await supabase.from("test_results").delete().eq("test_id", testId);
    if (delErr) throw delErr;

    const toInsert = [...out.intermediate, ...out.final].map((r) => ({
      test_id: testId,
      key: r.key,
      label: r.label,
      value: r.value,
      unit: r.unit,
      decimals: r.decimals,
      reportable: r.reportable,
      display_order: r.display_order,
    }));

    if (toInsert.length > 0) {
      const { error: insErr } = await supabase.from("test_results").insert(toInsert);
      if (insErr) throw insErr;
    }

    const testUpdate: Record<string, unknown> = {
      formula_version: out.formulaVersion,
      updated_by: actor.displayName,
      updated_by_user_id: actor.userId,
    };
    if (test.test_type === "ucs" && out.ucsModulusSettingsUpdate) {
      testUpdate.ucs_modulus_settings_json = out.ucsModulusSettingsUpdate;
    }

    if (test.test_type === "ucs") {
      const gravLine = out.final.find((r) => r.key === "gravimetric_moisture_percent");
      const w =
        gravLine?.value != null && Number.isFinite(Number(gravLine.value)) ? Number(gravLine.value) : NaN;
      const prevMeta = parseUcsReportMetadata(
        (test as { ucs_report_metadata_json?: unknown }).ucs_report_metadata_json,
      );
      const prevS = (prevMeta.sample_moisture ?? "").trim();
      /** Gol sau valoare pusă automat la calcule anterioare — poate fi rescrisă/ștearsă la recalcul. */
      const moistureFromCalcSlot =
        prevS.length === 0 || /\(\s*gravimetric\s*\)\s*$/i.test(prevS);
      const raw: Record<string, unknown> =
        test.ucs_report_metadata_json != null && typeof test.ucs_report_metadata_json === "object"
          ? { ...(test.ucs_report_metadata_json as Record<string, unknown>) }
          : {};

      if (Number.isFinite(w) && moistureFromCalcSlot) {
        raw.sample_moisture = `${w.toFixed(2)} % (gravimetric)`;
        testUpdate.ucs_report_metadata_json = clampUcsReportMetadataForStorage(raw);
      } else if (!Number.isFinite(w) && moistureFromCalcSlot && prevS.length > 0) {
        delete raw.sample_moisture;
        testUpdate.ucs_report_metadata_json = clampUcsReportMetadataForStorage(raw);
      }
    }

    if (test.test_type === "young") {
      const prevMetaY = parseUcsReportMetadata(
        (test as { ucs_report_metadata_json?: unknown }).ucs_report_metadata_json,
      );
      const tfY = (prevMetaY.time_to_failure ?? "").trim();
      if (tfY.length === 0) {
        const yj = (test as { young_curve_json?: unknown }).young_curve_json;
        const ptsRaw =
          yj != null && typeof yj === "object" && Array.isArray((yj as { points?: unknown }).points)
            ? ((yj as { points: Array<{ t_s?: unknown; stress_mpa?: unknown }> }).points ?? [])
            : [];
        const tPeakY = timeSecondsAtPeakStressFromPoints(
          ptsRaw.map((p) => ({
            t_s: p.t_s == null || p.t_s === "" ? null : Number(p.t_s),
            stress_mpa: Number(p.stress_mpa),
          })),
        );
        if (tPeakY != null) {
          const rawY: Record<string, unknown> =
            test.ucs_report_metadata_json != null && typeof test.ucs_report_metadata_json === "object"
              ? { ...(test.ucs_report_metadata_json as Record<string, unknown>) }
              : {};
          const sY =
            Number.isInteger(tPeakY) || Math.abs(tPeakY - Math.round(tPeakY)) < 1e-6
              ? String(Math.round(tPeakY))
              : String(Math.round(tPeakY * 1000) / 1000);
          rawY.time_to_failure = `${sY} s`;
          testUpdate.ucs_report_metadata_json = clampUcsReportMetadataForStorage(rawY);
        }
      }
    }

    if (test.test_type === "unconfined_soil") {
      const gravUs = out.final.find((r) => r.key === "gravimetric_moisture_percent");
      const wUs =
        gravUs?.value != null && Number.isFinite(Number(gravUs.value)) ? Number(gravUs.value) : NaN;
      const prevUs = parseUnconfinedSoilReportMetadata(
        (test as { unconfined_soil_report_metadata_json?: unknown }).unconfined_soil_report_metadata_json,
      );
      const prevM = (prevUs.sample_moisture ?? "").trim();
      const moistureFromCalcSlotUs =
        prevM.length === 0 || /\(\s*gravimetric\s*\)\s*$/i.test(prevM);
      const rawUs: Record<string, unknown> =
        (test as { unconfined_soil_report_metadata_json?: unknown }).unconfined_soil_report_metadata_json !=
          null &&
        typeof (test as { unconfined_soil_report_metadata_json?: unknown }).unconfined_soil_report_metadata_json ===
          "object"
          ? {
              ...((test as { unconfined_soil_report_metadata_json?: unknown })
                .unconfined_soil_report_metadata_json as Record<string, unknown>),
            }
          : {};
      let metaDirty = false;

      if (Number.isFinite(wUs) && moistureFromCalcSlotUs) {
        rawUs.sample_moisture = `${wUs.toFixed(2)} % (gravimetric)`;
        metaDirty = true;
      } else if (!Number.isFinite(wUs) && moistureFromCalcSlotUs && prevM.length > 0) {
        delete rawUs.sample_moisture;
        metaDirty = true;
      }

      const usMode = normalizeUnconfinedSoilMode(
        (test as { unconfined_soil_mode?: unknown }).unconfined_soil_mode,
      );
      const tfPrev = (prevUs.time_to_failure ?? "").trim();
      if (usMode === "instrumented" && tfPrev.length === 0) {
        const c = parseUnconfinedSoilCurvePayload(
          (test as { unconfined_soil_curve_json?: unknown }).unconfined_soil_curve_json,
        );
        const tPeak = unconfinedSoilInstrumentedPeakTimeS(map, c);
        if (tPeak != null) {
          const sT =
            Number.isInteger(tPeak) || Math.abs(tPeak - Math.round(tPeak)) < 1e-6
              ? String(Math.round(tPeak))
              : String(Math.round(tPeak * 1000) / 1000);
          rawUs.time_to_failure = `${sT} s`;
          metaDirty = true;
        }
      }

      const gammaDryLine = out.final.find((r) => r.key === "gamma_dry_from_submerged_kn_m3");
      const gammaDryVal =
        gammaDryLine?.value != null && Number.isFinite(Number(gammaDryLine.value))
          ? Number(gammaDryLine.value)
          : NaN;
      const prevManualG =
        prevUs.manual_dry_unit_weight_kn_m3 != null &&
        Number.isFinite(Number(prevUs.manual_dry_unit_weight_kn_m3))
          ? Number(prevUs.manual_dry_unit_weight_kn_m3)
          : NaN;
      if (Number.isFinite(gammaDryVal) && !Number.isFinite(prevManualG)) {
        rawUs.manual_dry_unit_weight_kn_m3 = Math.round(gammaDryVal * 100) / 100;
        metaDirty = true;
      }

      if (metaDirty) {
        testUpdate.unconfined_soil_report_metadata_json =
          clampUnconfinedSoilReportMetadataForStorage(rawUs);
      }

      // Auto-fill optional measurement fields from "Greutate volumică" (without overwriting manual inputs):
      // - w (%): from gravimetric moisture result
      // - ρ (Mg/m³): from bulk density (g/cm³)
      // - ρ_d (Mg/m³): ρ / (1+w)
      const wKey = "water_content_percent";
      const rhoKey = "bulk_density_mg_m3";
      const rhoDryKey = "dry_density_mg_m3";
      const wMeas = map[wKey];
      const rhoMeas = map[rhoKey];
      const rhoDryMeas = map[rhoDryKey];

      const wResLine = out.final.find((r) => r.key === "gravimetric_moisture_percent");
      const wPct =
        wResLine?.value != null && Number.isFinite(Number(wResLine.value)) ? Number(wResLine.value) : NaN;
      const rhoResLine = out.final.find((r) => r.key === "bulk_density_g_cm3");
      const rhoMgM3 =
        rhoResLine?.value != null && Number.isFinite(Number(rhoResLine.value)) ? Number(rhoResLine.value) : NaN;
      const rhoDryMgM3 =
        Number.isFinite(rhoMgM3) && Number.isFinite(wPct) ? rhoMgM3 / (1 + wPct / 100) : NaN;

      const upserts: Array<{
        test_id: string;
        key: string;
        label: string;
        value: number | null;
        unit: string | null;
        display_order: number;
        source: "manual" | "imported";
      }> = [];

      const basePreset = MEASUREMENT_PRESETS.unconfined_soil;
      const orderOf = (key: string) => {
        const idx = basePreset.findIndex((r) => r.key === key);
        return idx >= 0 ? (idx + 1) * 10 : 990;
      };
      const defOf = (key: string) => {
        const r = basePreset.find((x) => x.key === key);
        return {
          label: r?.label ?? key,
          unit: r?.unit ?? null,
          display_order: orderOf(key),
        };
      };

      if (!(wMeas != null && Number.isFinite(Number(wMeas))) && Number.isFinite(wPct) && wPct >= 0) {
        const d = defOf(wKey);
        upserts.push({
          test_id: testId,
          key: wKey,
          label: d.label,
          value: wPct,
          unit: d.unit,
          display_order: d.display_order,
          source: "imported",
        });
      }
      if (!(rhoMeas != null && Number.isFinite(Number(rhoMeas))) && Number.isFinite(rhoMgM3) && rhoMgM3 > 0) {
        const d = defOf(rhoKey);
        upserts.push({
          test_id: testId,
          key: rhoKey,
          label: d.label,
          value: rhoMgM3,
          unit: d.unit,
          display_order: d.display_order,
          source: "imported",
        });
      }
      if (
        !(rhoDryMeas != null && Number.isFinite(Number(rhoDryMeas))) &&
        Number.isFinite(rhoDryMgM3) &&
        rhoDryMgM3 > 0
      ) {
        const d = defOf(rhoDryKey);
        upserts.push({
          test_id: testId,
          key: rhoDryKey,
          label: d.label,
          value: rhoDryMgM3,
          unit: d.unit,
          display_order: d.display_order,
          source: "imported",
        });
      }

      if (upserts.length > 0) {
        const { error: upMErr } = await supabase
          .from("test_measurements")
          .upsert(upserts, { onConflict: "test_id,key" });
        if (upMErr) throw upMErr;
      }
    }

    if (test.test_type === "point_load") {
      const wLine = out.final.find((r) => r.key === "gravimetric_moisture_percent");
      const wPct =
        wLine?.value != null && Number.isFinite(Number(wLine.value)) ? Number(wLine.value) : NaN;
      const is50Line = out.final.find((r) => r.key === "is50_mpa");
      const is50 =
        is50Line?.value != null && Number.isFinite(Number(is50Line.value))
          ? Number(is50Line.value)
          : NaN;
      const plMeta = (test as { point_load_report_metadata_json?: unknown }).point_load_report_metadata_json;
      const rawPl: Record<string, unknown> =
        plMeta != null && typeof plMeta === "object" ? { ...(plMeta as Record<string, unknown>) } : {};
      if (Number.isFinite(wPct)) {
        rawPl.water_content_percent = wPct;
      }
      if (Number.isFinite(is50)) {
        rawPl.rock_strength_class = classifyIs50MpaStrengthRo(is50);
      } else {
        delete rawPl.rock_strength_class;
      }
      testUpdate.point_load_report_metadata_json = clampPointLoadReportMetadataForStorage(rawPl);
    }

    const { error: upErr } = await supabase.from("tests").update(testUpdate).eq("id", testId);
    if (upErr) throw upErr;

    const { data: results, error: rErr } = await supabase
      .from("test_results")
      .select("*")
      .eq("test_id", testId)
      .order("display_order", { ascending: true });
    if (rErr) throw rErr;

    return NextResponse.json({
      ok: true,
      warnings: out.warnings,
      formulaVersion: out.formulaVersion,
      results: results ?? [],
    });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
