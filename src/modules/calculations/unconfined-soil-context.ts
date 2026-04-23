import type { UnconfinedSoilCurvePayload } from "@/lib/unconfined-soil-curve";
import type { UnconfinedSoilTestMode } from "@/types/lab";

export interface UnconfinedSoilCalculationContext {
  mode: UnconfinedSoilTestMode;
  curve: UnconfinedSoilCurvePayload | null;
}
