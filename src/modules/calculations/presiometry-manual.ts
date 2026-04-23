import type { PresiometryXKind } from "@/lib/presiometry-curve";

export type PresiometryManualRange = { from: number; to: number };

export type PresiometryManualSettings = {
  mode: "auto" | "manual";
  x_kind?: PresiometryXKind;
  load1?: PresiometryManualRange | null;
  loops?: Array<{
    unload?: PresiometryManualRange | null;
    reload?: PresiometryManualRange | null;
  }>;
};

function finiteInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(String(v));
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

function parseRange(raw: unknown): PresiometryManualRange | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const from = finiteInt(r.from);
  const to = finiteInt(r.to);
  if (from == null || to == null) return null;
  if (to <= from) return null;
  return { from, to };
}

export function parsePresiometryManualSettings(raw: unknown): PresiometryManualSettings | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const mode = o.mode === "manual" ? "manual" : o.mode === "auto" ? "auto" : null;
  if (!mode) return null;
  const x_kind: PresiometryXKind | undefined = o.x_kind === "radius_mm" || o.x_kind === "volume_cm3" ? (o.x_kind as PresiometryXKind) : undefined;
  const load1 = parseRange(o.load1);
  const loopsRaw = o.loops;
  const loops = Array.isArray(loopsRaw)
    ? loopsRaw
        .map((lr) => {
          if (!lr || typeof lr !== "object") return null;
          const r = lr as Record<string, unknown>;
          return { unload: parseRange(r.unload), reload: parseRange(r.reload) };
        })
        .filter(Boolean) as PresiometryManualSettings["loops"]
    : undefined;

  return { mode, x_kind, load1, loops };
}

