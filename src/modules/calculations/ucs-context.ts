import type { UcsCurvePayload, UcsModulusSettings } from "@/lib/ucs-instrumentation";
import type { UcsTestMode } from "@/types/lab";

export interface UcsCalculationContext {
  mode: UcsTestMode;
  curve: UcsCurvePayload | null;
  modulusSettings: UcsModulusSettings;
}
