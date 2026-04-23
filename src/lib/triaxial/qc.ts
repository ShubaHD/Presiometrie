import type { QcChannelResult, RawTable } from "@/lib/triaxial/types";
import { isFiniteNumber } from "@/lib/triaxial/math";

function extractNumericColumn(table: RawTable, col: string): Array<number | null> {
  return table.rows.map((r) => {
    const v = r[col];
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v === "string") {
      const n = Number(v.replace(",", "."));
      return Number.isFinite(n) ? n : null;
    }
    return null;
  });
}

type QcInputs = {
  table: RawTable;
  channel: string;
  loadChannel: string;
  minLoadIncreaseKn?: number;
};

export function qcStrainChannel({ table, channel, loadChannel, minLoadIncreaseKn = 0.1 }: QcInputs): QcChannelResult {
  const eps = extractNumericColumn(table, channel);
  const load = extractNumericColumn(table, loadChannel);

  const reasons: string[] = [];
  let firstBadIndex: number | null = null;

  const validIdx: number[] = [];
  for (let i = 0; i < eps.length; i++) if (isFiniteNumber(eps[i])) validIdx.push(i);
  if (validIdx.length < Math.max(10, Math.floor(eps.length * 0.05))) {
    return {
      channel,
      flag: "invalid",
      reasons: ["Prea puține valori numerice (canal lipsă sau export incomplet)."],
      firstBadIndex: 0,
    };
  }

  // Stuck detection: long plateau in ε while Load increases.
  const window = Math.max(20, Math.floor(eps.length * 0.05));
  let stuckRuns = 0;
  for (let start = 0; start + window < eps.length; start += Math.floor(window / 2)) {
    const end = start + window;
    const epsWin = eps.slice(start, end).filter(isFiniteNumber);
    const loadWin = load.slice(start, end).filter(isFiniteNumber);
    if (epsWin.length < window * 0.6 || loadWin.length < window * 0.6) continue;
    const epsMin = Math.min(...epsWin);
    const epsMax = Math.max(...epsWin);
    const loadMin = Math.min(...loadWin);
    const loadMax = Math.max(...loadWin);
    const epsRange = Math.abs(epsMax - epsMin);
    const loadInc = loadMax - loadMin;

    if (loadInc >= minLoadIncreaseKn && epsRange <= 1) {
      // 1 µε over a meaningful load change is essentially flat.
      stuckRuns++;
      if (firstBadIndex === null) firstBadIndex = start;
    }
  }
  if (stuckRuns >= 2) reasons.push("Semnal aproape constant (posibil blocat) în timp ce încărcarea crește.");

  // Detach/break detection: step changes.
  let bigSteps = 0;
  for (let i = 1; i < eps.length; i++) {
    const a = eps[i - 1];
    const b = eps[i];
    if (!isFiniteNumber(a) || !isFiniteNumber(b)) continue;
    const step = Math.abs(b - a);
    if (step >= 20000) {
      bigSteps++;
      if (firstBadIndex === null) firstBadIndex = i;
    }
  }
  if (bigSteps > 0) reasons.push("Salturi bruște foarte mari (posibil dezlipit/rupt).");

  // Basic sanity: too noisy.
  let spikes = 0;
  for (let i = 2; i < eps.length; i++) {
    const a = eps[i - 2];
    const b = eps[i - 1];
    const c = eps[i];
    if (!isFiniteNumber(a) || !isFiniteNumber(b) || !isFiniteNumber(c)) continue;
    const d1 = b - a;
    const d2 = c - b;
    if (Math.abs(d2 - d1) > 50000) spikes++;
  }
  if (spikes > 0) reasons.push("Zgomot/spike-uri foarte mari (verifică lipirea și cablarea).");

  const flag: QcChannelResult["flag"] =
    reasons.length === 0 ? "valid" : reasons.some((r) => r.includes("Salturi")) ? "invalid" : "suspect";

  return { channel, flag, reasons, firstBadIndex };
}

