import type { TestType } from "@/types/lab";
import type { CalculationContext, CalculationFn, CalculationOutput, MeasurementMap } from "./types";
import { calculatePresiometry } from "./presiometry";
import { calculatePresiometryProgramA } from "./presiometry-program-a";
import { calculatePresiometryProgramB } from "./presiometry-program-b";

const registry: Record<TestType, CalculationFn> = {
  presiometry_program_a: calculatePresiometryProgramA,
  presiometry_program_b: calculatePresiometryProgramB,
  presiometry_program_c: calculatePresiometry,
};

export function runCalculationForTestType(
  testType: TestType,
  measurements: MeasurementMap,
  ctx?: CalculationContext,
): CalculationOutput {
  const fn = registry[testType];
  return fn(measurements, ctx);
}

export function measurementsRowsToMap(
  rows: Array<{ key: string; value: number | null }>,
): MeasurementMap {
  const m: MeasurementMap = {};
  for (const r of rows) {
    m[r.key] = r.value;
  }
  return m;
}

export type { CalculationContext, CalculationOutput, MeasurementMap, ResultLine } from "./types";
