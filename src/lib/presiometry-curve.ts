export type PresiometryXKind = "volume_cm3" | "radius_mm";

export type PresiometryPoint = {
  /** Presiune (kPa). */
  p_kpa: number;
  /**
   * Compat: axa X (implicit volum echivalent, cm³).
   * Pentru Elast Logger (p–R), `v_cm3` rămâne completat (cu R) doar pentru compatibilitate,
   * dar sursa de adevăr este `r_mm` + `x_kind="radius_mm"`.
   */
  v_cm3: number;
  /** Radius (mm) — Elast Logger p–R. */
  r_mm?: number;
  /** ΔRi (mm) — Elast Logger (opțional). */
  dri_mm?: number;
  /** Timp (secunde), opțional. */
  t_s?: number;
};

export type PresiometryCurvePayload = {
  x_kind?: PresiometryXKind;
  points: PresiometryPoint[];
};

function finiteNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function parsePresiometryCurvePayload(raw: unknown): PresiometryCurvePayload | null {
  if (!raw || typeof raw !== "object") return null;
  const xKindRaw = (raw as Record<string, unknown>).x_kind;
  const x_kind: PresiometryXKind | undefined =
    xKindRaw === "radius_mm" || xKindRaw === "volume_cm3" ? xKindRaw : undefined;
  const pts = (raw as Record<string, unknown>).points;
  if (!Array.isArray(pts)) return null;
  const out: PresiometryPoint[] = [];
  for (const p of pts) {
    if (!p || typeof p !== "object") continue;
    const pk = finiteNumber((p as Record<string, unknown>).p_kpa);
    const vc = finiteNumber((p as Record<string, unknown>).v_cm3);
    if (pk == null || vc == null) continue;
    const ts = finiteNumber((p as Record<string, unknown>).t_s);
    const rmm = finiteNumber((p as Record<string, unknown>).r_mm);
    const drimm = finiteNumber((p as Record<string, unknown>).dri_mm);
    out.push({
      p_kpa: pk,
      v_cm3: vc,
      ...(rmm != null ? { r_mm: rmm } : null),
      ...(drimm != null ? { dri_mm: drimm } : null),
      ...(ts != null ? { t_s: ts } : null),
    });
  }
  return out.length ? { points: out, ...(x_kind ? { x_kind } : null) } : null;
}

export function clampPresiometryCurveForStorage(payload: PresiometryCurvePayload): PresiometryCurvePayload {
  const x_kind: PresiometryXKind | undefined =
    payload.x_kind === "radius_mm" || payload.x_kind === "volume_cm3" ? payload.x_kind : undefined;
  const points = payload.points
    .map((p) => ({
      p_kpa: Number(p.p_kpa),
      v_cm3: Number(p.v_cm3),
      r_mm: p.r_mm == null ? undefined : Number(p.r_mm),
      dri_mm: p.dri_mm == null ? undefined : Number(p.dri_mm),
      t_s: p.t_s == null ? undefined : Number(p.t_s),
    }))
    .filter((p) => Number.isFinite(p.p_kpa) && Number.isFinite(p.v_cm3));
  return { points, ...(x_kind ? { x_kind } : null) };
}

export function parsePresiometryDelimited(text: string): PresiometryCurvePayload | null {
  const rawLines = text.split(/\r?\n/);
  const lines = rawLines
    .map((l) => l.replace(/^\uFEFF/, "").trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return null;

  const detectDelimiter = (line: string): string => {
    const counts: Array<{ d: string; c: number }> = [
      { d: "\t", c: (line.match(/\t/g) ?? []).length },
      { d: ";", c: (line.match(/;/g) ?? []).length },
      { d: ",", c: (line.match(/,/g) ?? []).length },
    ];
    counts.sort((a, b) => b.c - a.c);
    return counts[0]!.c > 0 ? counts[0]!.d : ";";
  };

  const norm = (s: string) =>
    s
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[()]/g, " ")
      .replace(/[^\p{L}\p{N}_%./+\- ]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();

  const looksLikeHeader = (cells: string[]) => {
    const joined = norm(cells.join(" "));
    const hasP =
      (joined.includes("p") &&
        (joined.includes("kpa") ||
          joined.includes("mpa") ||
          joined.includes("bar") ||
          joined.includes("pressure") ||
          joined.includes("presi"))) ||
      joined.includes("stress") ||
      joined.includes("pression");
    const hasV =
      joined.includes("v") &&
      (joined.includes("cm3") ||
        joined.includes("cm^3") ||
        joined.includes("ml") ||
        joined.includes("mm3") ||
        joined.includes("volume") ||
        joined.includes("volum"));
    // Avoid false positives from words like "Pressure" containing "r".
    const hasR =
      joined.includes("radius") ||
      joined.includes("caliper") ||
      joined.includes("dri") ||
      joined.includes("delta r") ||
      /\br\s*mm\b/.test(joined) ||
      joined.includes("r mm") ||
      joined.includes("r[mm]");
    const hasD =
      joined.includes("diameter") ||
      joined.includes("diametru") ||
      /\bd\s*mm\b/.test(joined) ||
      joined.includes("d mm") ||
      joined.includes("d[mm]");
    return hasP && (hasV || hasR || hasD);
  };

  const headerMatchers = {
    p: (h: string) => {
      const s = norm(h);
      return (
        s === "p" ||
        s.includes("p ") ||
        s.includes(" pressure") ||
        s.includes("presi") ||
        s.includes("p_kpa") ||
        s.includes("p kpa") ||
        s.includes("kpa")
      );
    },
    v: (h: string) => {
      const s = norm(h);
      return (
        s === "v" ||
        s.includes("volum") ||
        s.includes("volume") ||
        s.includes("v_cm3") ||
        s.includes("v cm3") ||
        s.includes("cm3") ||
        s.includes("ml") ||
        s.includes("mm3") ||
        // Elast Logger exports
        s === "r mm" ||
        s.includes("r mm") ||
        s.includes("radius") ||
        s.includes("caliper") ||
        s.includes("diameter") ||
        s.includes("diametru") ||
        // common: "D[mm]" or "D mm"
        (s === "d mm" || (s.includes("d") && s.includes("mm")))
      );
    },
    t: (h: string) => {
      const s = norm(h);
      return (
        s === "t" ||
        s.includes("time") ||
        s.includes("t_s") ||
        s.includes("sec") ||
        s.includes("s ") ||
        s.includes("seconds") ||
        // Elast Logger
        s.includes("pass time")
      );
    },
  } as const;

  let headerIndex = -1;
  let delim = ";";
  let headerCells: string[] | null = null;
  for (let i = 0; i < Math.min(lines.length, 200); i++) {
    const line = lines[i]!;
    if (line.startsWith("#") || line.startsWith("//")) continue;
    const d = detectDelimiter(line);
    const cells = line.split(d).map((c) => c.trim());
    if (cells.length < 2) continue;
    if (looksLikeHeader(cells)) {
      headerIndex = i;
      delim = d;
      headerCells = cells;
      break;
    }
  }

  const pickIndex = (cells: string[], match: (h: string) => boolean): number => {
    for (let i = 0; i < cells.length; i++) if (match(cells[i]!)) return i;
    return -1;
  };

  let pIdx = 0;
  let vIdx = 1; // V or R
  let tIdx = -1;
  let driIdx = -1;
  let pFactor = 1; // → kPa
  let vFactor = 1; // → cm³
  let xScale = 1; // raw X -> stored x (for diameter->radius)
  let x_kind: PresiometryXKind | undefined = undefined;

  if (headerCells) {
    pIdx = pickIndex(headerCells, headerMatchers.p);
    tIdx = pickIndex(headerCells, headerMatchers.t);
    if (pIdx < 0) return null;

    const rIdx = pickIndex(headerCells, (h) => {
      const s = norm(h);
      return s === "r mm" || (s.includes("r") && s.includes("mm") && !s.includes("dri"));
    });
    const dIdx = pickIndex(headerCells, (h) => {
      const s = norm(h);
      const isDri = s.includes("dri");
      return (
        !isDri &&
        (s.includes("diameter") ||
          s.includes("diametru") ||
          s === "d mm" ||
          (s.includes("d") && s.includes("mm") && !s.includes("pressure") && !s.includes("pres")))
      );
    });
    const volIdx = pickIndex(headerCells, (h) => {
      const s = norm(h);
      return (
        s.includes("cm3") ||
        s.includes("cm^3") ||
        s.includes("ml") ||
        s.includes("mm3") ||
        s.includes("volume") ||
        s.includes("volum") ||
        s.includes("v_cm3") ||
        s.includes("v cm3")
      );
    });
    driIdx = pickIndex(headerCells, (h) => {
      const s = norm(h);
      return s.includes("dri") && s.includes("mm");
    });

    // Prefer R (caliper), then diameter, then volume; only fall back to dRi if nothing else matches.
    if (rIdx >= 0) vIdx = rIdx;
    else if (dIdx >= 0) vIdx = dIdx;
    else if (volIdx >= 0) vIdx = volIdx;
    else if (driIdx >= 0) vIdx = driIdx;
    else return null;

    const pHeader = norm(headerCells[pIdx] ?? "");
    if (pHeader.includes("mpa")) pFactor = 1000;
    else if (pHeader.includes("bar")) pFactor = 100;

    const vHeader = norm(headerCells[vIdx] ?? "");
    if (vHeader.includes("mm3")) vFactor = 1 / 1000;
    // ml ~ cm3

    if ((vHeader.includes("r") && vHeader.includes("mm")) || vHeader.includes("radius") || vHeader.includes("caliper")) {
      x_kind = "radius_mm";
    }
    // If the device exports diameter, store radius_mm = D/2.
    if (
      vHeader.includes("diameter") ||
      vHeader.includes("diametru") ||
      // patterns like "d mm" or "d[mm]"
      (vHeader.includes("d") && vHeader.includes("mm") && !vHeader.includes("dri"))
    ) {
      x_kind = "radius_mm";
      xScale = 0.5;
    }
    if (volIdx >= 0 && vIdx === volIdx) {
      x_kind = undefined;
      xScale = 1;
    }
  }

  const parseHmsToSeconds = (raw: string): number | null => {
    const s = String(raw ?? "").trim();
    const m = /^(\d{1,2})\s*:\s*(\d{2})\s*:\s*(\d{2})(?:\.(\d+))?$/.exec(s);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    const ss = Number(m[3]);
    const frac = m[4] ? Number(`0.${m[4]}`) : 0;
    if (![hh, mm, ss, frac].every((x) => Number.isFinite(x))) return null;
    return hh * 3600 + mm * 60 + ss + frac;
  };

  const points: PresiometryPoint[] = [];
  const start = headerIndex >= 0 ? headerIndex + 1 : 0;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith("#") || line.startsWith("//")) continue;
    const parts = line.split(delim).map((s) => s.trim());
    if (parts.length < 2) continue;
    const pRaw = parts[pIdx];
    const vRaw = parts[vIdx];
    const p = finiteNumber(pRaw);
    const v = finiteNumber(vRaw);
    if (p == null || v == null) continue;
    const xStored = x_kind === "radius_mm" ? v * xScale : v;
    const t =
      tIdx >= 0 && tIdx < parts.length
        ? // Elast Logger: "Pass time[hh:mm:ss]"
          (parseHmsToSeconds(parts[tIdx] ?? "") ?? finiteNumber(parts[tIdx]))
        : null;
    const dri = driIdx >= 0 && driIdx < parts.length ? finiteNumber(parts[driIdx]) : null;
    points.push({
      p_kpa: p * pFactor,
      v_cm3: x_kind === "radius_mm" ? xStored : v * vFactor,
      ...(x_kind === "radius_mm" ? { r_mm: xStored } : null),
      ...(dri != null ? { dri_mm: dri } : null),
      ...(t != null ? { t_s: t } : null),
    });
  }

  // If we couldn't infer x_kind but have an Elast Logger header, default to radius.
  const inferredXKind = x_kind ?? undefined;
  return points.length >= 2 ? { points, ...(inferredXKind ? { x_kind: inferredXKind } : null) } : null;
}

