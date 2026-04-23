import type { TestType } from "@/types/lab";
import type { UcsEModMethod, UcsModulusSettings } from "@/lib/ucs-instrumentation";
import type { UnitWeightSubmergedPayload } from "@/lib/unit-weight-submerged";
import type { UcsCalculationContext } from "./ucs-context";
import type { YoungCalculationContext } from "./young-context";
import type { UnconfinedSoilCalculationContext } from "./unconfined-soil-context";
import type { PresiometryCurvePayload } from "@/lib/presiometry-curve";

export interface ResultLine {
  key: string;
  label: string;
  value: number | null;
  unit: string | null;
  decimals: number;
  reportable: boolean;
  display_order: number;
}

export interface CalculationOutput {
  intermediate: ResultLine[];
  final: ResultLine[];
  warnings: string[];
  errors: string[];
  formulaVersion: string;
  /** UCS instrumentat: actualizare JSON setări (ultima rezolvare). */
  ucsModulusSettingsUpdate?: Partial<UcsModulusSettings> & {
    last_resolution: {
      at: string;
      method: UcsEModMethod;
      index_from: number;
      index_to: number;
      r2: number | null;
      auto: boolean;
    };
  };
}

export type MeasurementMap = Record<string, number | null | undefined>;

export interface CalculationContext {
  ucs?: UcsCalculationContext;
  young?: YoungCalculationContext;
  /** SR EN ISO 17892-7 — pământ. */
  unconfinedSoil?: UnconfinedSoilCalculationContext;
  /** SR EN ISO 22476-5 — presiometrie. */
  presiometry?: {
    curve: PresiometryCurvePayload | null;
  };
  /** Greutate volumică: cântărire submersă (JSON pe test). */
  unitWeightSubmerged?: UnitWeightSubmergedPayload;
  /** ISO 13755 — Absorbție apă / Porozitate (rocă): epruvete (3 buc). */
  absorptionPorosityRock?: {
    specimens: Array<{
      label: string;
      mass_dry_g: number | null;
      mass_sat_ssd_g: number | null;
      mass_submerged_g: number | null;
    }>;
  };
}

export type CalculationFn = (m: MeasurementMap, ctx?: CalculationContext) => CalculationOutput;

export interface CalculationModule {
  testType: TestType;
  run: CalculationFn;
}
