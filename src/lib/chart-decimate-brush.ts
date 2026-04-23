/**
 * Decimate rows for LineChart performance while keeping Brush indices valid:
 * Recharts Brush `startIndex` / `endIndex` refer to the `data[]` passed to LineChart,
 * not the original full series — so we expose `mapToRaw[]` to convert both ways.
 */
export function decimateRowsForLineChart<T>(rows: T[], max: number): { data: T[]; mapToRaw: number[] } {
  if (rows.length <= max) {
    return { data: rows, mapToRaw: rows.map((_, i) => i) };
  }
  const step = Math.ceil(rows.length / max);
  const data: T[] = [];
  const mapToRaw: number[] = [];
  for (let i = 0; i < rows.length; i += step) {
    data.push(rows[i]!);
    mapToRaw.push(i);
  }
  return { data, mapToRaw };
}

/** Largest chart index j with mapToRaw[j] <= rawIndex (monotone mapToRaw). */
export function rawIndexToChartIndex(mapToRaw: number[], rawIndex: number): number {
  if (mapToRaw.length === 0) return 0;
  const r = Math.max(0, rawIndex);
  let lo = 0;
  let hi = mapToRaw.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (mapToRaw[mid]! <= r) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}
