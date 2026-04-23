import type { TestType } from "@/types/lab";
import { calculatePointLoad } from "./pointLoad";
import { calculateTriaxial } from "./triaxial";
import { calculateUcs } from "./ucs";
import type { CalculationContext, CalculationFn, CalculationOutput, MeasurementMap } from "./types";
import { calculateUnitWeight } from "./unitWeight";
import { calculateYoung } from "./young";
import { calculateSrEn1926 } from "./srEn1926";
import { calculateUnconfinedSoil } from "./unconfinedSoil";
import { calculateAbsorptionPorosityRock } from "./absorptionPorosityRock";
import { calculatePresiometry } from "./presiometry";

const registry: Record<TestType, CalculationFn> = {
  ucs: calculateUcs,
  point_load: calculatePointLoad,
  unit_weight: calculateUnitWeight,
  young: calculateYoung,
  triaxial_rock: calculateTriaxial,
  sr_en_1926: calculateSrEn1926,
  unconfined_soil: calculateUnconfinedSoil,
  absorption_porosity_rock: calculateAbsorptionPorosityRock,
  presiometry: calculatePresiometry,
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
