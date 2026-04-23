import type { TestType } from "@/types/lab";
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
}

/** Valori din DB pot fi text (ex. note teren); calculele folosesc `n()` pentru câmpuri numerice. */
export type MeasurementMap = Record<string, number | string | null | undefined>;

export interface CalculationContext {
  /** SR EN ISO 22476-5 — presiometrie. */
  presiometry?: {
    curve: PresiometryCurvePayload | null;
    settings?: unknown | null;
  };
}

export type CalculationFn = (m: MeasurementMap, ctx?: CalculationContext) => CalculationOutput;

export interface CalculationModule {
  testType: TestType;
  run: CalculationFn;
}
