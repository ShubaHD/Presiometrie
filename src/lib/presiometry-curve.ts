export type PresiometryPoint = {
  /** Presiune (kPa). */
  p_kpa: number;
  /** Volum (cm³) sau volum echivalent, conform exportului. */
  v_cm3: number;
  /** Timp (secunde), opțional. */
  t_s?: number;
};

export type PresiometryCurvePayload = {
  points: PresiometryPoint[];
};

function finiteNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function parsePresiometryCurvePayload(raw: unknown): PresiometryCurvePayload | null {
  if (!raw || typeof raw !== "object") return null;
  const pts = (raw as Record<string, unknown>).points;
  if (!Array.isArray(pts)) return null;
  const out: PresiometryPoint[] = [];
  for (const p of pts) {
    if (!p || typeof p !== "object") continue;
    const pk = finiteNumber((p as Record<string, unknown>).p_kpa);
    const vc = finiteNumber((p as Record<string, unknown>).v_cm3);
    if (pk == null || vc == null) continue;
    const ts = finiteNumber((p as Record<string, unknown>).t_s);
    out.push({ p_kpa: pk, v_cm3: vc, ...(ts != null ? { t_s: ts } : null) });
  }
  return out.length ? { points: out } : null;
}

export function clampPresiometryCurveForStorage(payload: PresiometryCurvePayload): PresiometryCurvePayload {
  const points = payload.points
    .map((p) => ({
      p_kpa: Number(p.p_kpa),
      v_cm3: Number(p.v_cm3),
      t_s: p.t_s == null ? undefined : Number(p.t_s),
    }))
    .filter((p) => Number.isFinite(p.p_kpa) && Number.isFinite(p.v_cm3));
  return { points };
}

export function parsePresiometryDelimited(text: string): PresiometryCurvePayload | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return null;

  const points: PresiometryPoint[] = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes("pressure") || lower.includes("presi") || lower.includes("p_kpa")) continue;
    const parts = (line.includes("\t") ? line.split("\t") : line.split(/[;,]/)).map((s) => s.trim());
    if (parts.length < 2) continue;
    const p = finiteNumber(parts[0]);
    const v = finiteNumber(parts[1]);
    if (p == null || v == null) continue;
    const t = parts.length >= 3 ? finiteNumber(parts[2]) : null;
    points.push({ p_kpa: p, v_cm3: v, ...(t != null ? { t_s: t } : null) });
  }

  return points.length >= 2 ? { points } : null;
}

