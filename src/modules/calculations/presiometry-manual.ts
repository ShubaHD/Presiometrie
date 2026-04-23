import type { PresiometryXKind } from "@/lib/presiometry-curve";

/** Numărul de rânduri «Buclă 1…6» din UI; trebuie să coincidă cu reîncărcarea din `presiometry_settings_json`. */
export const PRESIOMETRY_MANUAL_LOOP_UI_SLOTS = 6;

export type PresiometryManualRange = { from: number; to: number };

export type PresiometryManualSettings = {
  mode: "auto" | "manual";
  x_kind?: PresiometryXKind;
  load1?: PresiometryManualRange | null;
  loops?: Array<{
    unload?: PresiometryManualRange | null;
    reload?: PresiometryManualRange | null;
    /** Program B: interval unic pentru G_UR (mijloc buclă), opțional în mod manual. */
    gur?: PresiometryManualRange | null;
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
  const a = finiteInt(r.from);
  const b = finiteInt(r.to);
  if (a == null || b == null) return null;
  const from = Math.min(a, b);
  const to = Math.max(a, b);
  if (to <= from) return null;
  return { from, to };
}

function emptyLoopRow(): NonNullable<PresiometryManualSettings["loops"]>[number] {
  return { unload: null, reload: null, gur: null };
}

/** Convertește `loops` din JSON (array, lipsă sau obiect cu chei numerice) la exact `PRESIOMETRY_MANUAL_LOOP_UI_SLOTS` intrări, păstrând indicii. */
function normalizeLoopsRawToSlots(loopsRaw: unknown): unknown[] {
  let arr: unknown[] = [];
  if (Array.isArray(loopsRaw)) {
    arr = loopsRaw;
  } else if (loopsRaw && typeof loopsRaw === "object") {
    const rec = loopsRaw as Record<string, unknown>;
    const keys = Object.keys(rec)
      .filter((k) => /^\d+$/.test(k))
      .sort((a, b) => Number(a) - Number(b));
    arr = keys.map((k) => rec[k]);
  }
  const slots: unknown[] = [];
  for (let i = 0; i < PRESIOMETRY_MANUAL_LOOP_UI_SLOTS; i++) {
    slots.push(arr[i] ?? null);
  }
  return slots;
}

export function parsePresiometryManualSettings(raw: unknown): PresiometryManualSettings | null {
  let doc: unknown = raw;
  if (typeof doc === "string") {
    const s = doc.trim();
    if (!s) return null;
    try {
      doc = JSON.parse(s) as unknown;
    } catch {
      return null;
    }
  }
  if (!doc || typeof doc !== "object") return null;
  const o = doc as Record<string, unknown>;
  const mode = o.mode === "manual" ? "manual" : o.mode === "auto" ? "auto" : null;
  if (!mode) return null;
  const x_kind: PresiometryXKind | undefined = o.x_kind === "radius_mm" || o.x_kind === "volume_cm3" ? (o.x_kind as PresiometryXKind) : undefined;
  const load1 = parseRange(o.load1);
  const slots = normalizeLoopsRawToSlots(o.loops);
  const loops: NonNullable<PresiometryManualSettings["loops"]> = slots.map((lr) => {
    if (!lr || typeof lr !== "object") return emptyLoopRow();
    const r = lr as Record<string, unknown>;
    const uo = r.unload;
    const nestedUnload =
      uo && typeof uo === "object"
        ? parseRange(uo)
        : parseRange(
            r.unload_from != null || r.unload_to != null || r["unloadFrom"] != null || r["unloadTo"] != null
              ? { from: r.unload_from ?? r["unloadFrom"], to: r.unload_to ?? r["unloadTo"] }
              : null,
          ) ?? parseRange(r.Unload);
    const ro = r.reload;
    const nestedReload =
      ro && typeof ro === "object"
        ? parseRange(ro)
        : parseRange(
            r.reload_from != null || r.reload_to != null || r["reloadFrom"] != null || r["reloadTo"] != null
              ? { from: r.reload_from ?? r["reloadFrom"], to: r.reload_to ?? r["reloadTo"] }
              : null,
          ) ?? parseRange(r.Reload);
    const go = r.gur;
    const nestedGur =
      go && typeof go === "object"
        ? parseRange(go)
        : parseRange(
            r.gur_from != null || r.gur_to != null || r["gurFrom"] != null || r["gurTo"] != null
              ? { from: r.gur_from ?? r["gurFrom"], to: r.gur_to ?? r["gurTo"] }
              : null,
          ) ?? parseRange(r.Gur);
    return { unload: nestedUnload, reload: nestedReload, gur: nestedGur };
  });

  return { mode, x_kind, load1, loops };
}

