/**
 * Duplicat minimal față de web (`src/modules/calculations/*`) pentru SVG PDF,
 * fără dependențe `@/` — păstrați în sync la schimbări de algoritm.
 */
function signEps(x) {
    const eps = 1e-9;
    if (!Number.isFinite(x) || Math.abs(x) <= eps)
        return 0;
    return x > 0 ? 1 : -1;
}
export function detectLoopsByPressure(pts) {
    if (pts.length < 5)
        return [];
    const dir = [];
    for (let i = 1; i < pts.length; i++)
        dir.push(signEps(pts[i].p_kpa - pts[i - 1].p_kpa));
    const runs = [];
    let i = 0;
    while (i < dir.length) {
        while (i < dir.length && dir[i] === 0)
            i++;
        if (i >= dir.length)
            break;
        const d = dir[i];
        const from = i;
        let to = i;
        while (to + 1 < dir.length && (dir[to + 1] === d || dir[to + 1] === 0))
            to++;
        runs.push({ d, from, to });
        i = to + 1;
    }
    const loops = [];
    for (let r = 0; r + 2 < runs.length; r++) {
        const a = runs[r];
        const b = runs[r + 1];
        const c = runs[r + 2];
        if (!(a.d === 1 && b.d === -1 && c.d === 1))
            continue;
        const peakIndex = a.to + 1;
        const valleyIndex = b.to + 1;
        const nextPeakIndex = c.to + 1;
        if (peakIndex <= 0 || valleyIndex <= peakIndex || nextPeakIndex <= valleyIndex || nextPeakIndex >= pts.length)
            continue;
        loops.push({ peakIndex, valleyIndex, nextPeakIndex });
    }
    const out = [];
    for (const w of loops) {
        const prev = out[out.length - 1];
        if (!prev)
            out.push(w);
        else if (w.peakIndex === prev.peakIndex && w.valleyIndex === prev.valleyIndex)
            continue;
        else
            out.push(w);
    }
    return out;
}
export function linearRegressionYonX(xs, ys) {
    const n = Math.min(xs.length, ys.length);
    if (n < 2)
        return { slope: null, intercept: null, r2: null, n };
    let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < n; i++) {
        const x = xs[i];
        const y = ys[i];
        sx += x;
        sy += y;
        sxx += x * x;
        sxy += x * y;
        syy += y * y;
    }
    const den = n * sxx - sx * sx;
    if (Math.abs(den) < 1e-12)
        return { slope: null, intercept: null, r2: null, n };
    const slope = (n * sxy - sx * sy) / den;
    const intercept = (sy - slope * sx) / n;
    const numR = n * sxy - sx * sy;
    const denR = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
    const r = denR > 0 ? numR / denR : 0;
    const r2 = Number.isFinite(r) ? Math.max(0, Math.min(1, r * r)) : null;
    return { slope, intercept, r2, n };
}
export function pickPointsInPressureWindowWithIndices(pts, fromInclusive, toInclusive, pLow, pHigh) {
    const xsV = [];
    const ysP = [];
    let indexFrom = null;
    let indexTo = null;
    const lo = Math.min(pLow, pHigh);
    const hi = Math.max(pLow, pHigh);
    for (let i = fromInclusive; i <= toInclusive && i < pts.length; i++) {
        const p = pts[i].p_kpa;
        const v = pts[i].x;
        if (!Number.isFinite(p) || !Number.isFinite(v))
            continue;
        if (p < lo || p > hi)
            continue;
        if (indexFrom == null)
            indexFrom = i;
        indexTo = i;
        xsV.push(v);
        ysP.push(p);
    }
    return { xsV, ysP, indexFrom, indexTo };
}
export function pWindow3070(pMin, pMax) {
    if (!Number.isFinite(pMin) || !Number.isFinite(pMax))
        return null;
    const lo = Math.min(pMin, pMax);
    const hi = Math.max(pMin, pMax);
    const dp = hi - lo;
    if (!(dp > 0))
        return null;
    return { p30: lo + 0.3 * dp, p70: lo + 0.7 * dp };
}
export function tangentEndpointsRawX(slope, intercept, xMin, xMax, marginRatio = 0.08) {
    if (!Number.isFinite(slope) || !Number.isFinite(intercept) || !Number.isFinite(xMin) || !Number.isFinite(xMax)) {
        return null;
    }
    const span = Math.max(xMax - xMin, 1e-9);
    const marg = span * marginRatio;
    const x1 = xMin - marg;
    const x2 = xMax + marg;
    return { x1, p1: slope * x1 + intercept, x2, p2: slope * x2 + intercept };
}
function manualRangeArrays(pts, from, to) {
    const lo = Math.max(0, Math.min(from, to, pts.length - 1));
    const hi = Math.min(pts.length - 1, Math.max(from, to, 0));
    const xsV = [];
    const ysP = [];
    for (let i = lo; i <= hi; i++) {
        xsV.push(pts[i].x);
        ysP.push(pts[i].p_kpa);
    }
    if (xsV.length < 2)
        return null;
    return { xsV, ysP, indexFrom: lo, indexTo: hi };
}
function segmentFromArrays(symbol, source, xsV, ysP, indexFrom, indexTo) {
    if (xsV.length < 2 || ysP.length < 2)
        return null;
    const regression = linearRegressionYonX(xsV, ysP);
    if (regression.slope == null || regression.intercept == null)
        return null;
    return { symbol, source, regression, xsV, ysP, indexFrom, indexTo };
}
function buildFirstLoadingSegmentProgramA(pts, manual, loops) {
    const firstPeak = loops[0]?.peakIndex ?? Math.max(1, Math.floor(pts.length / 3));
    const p0 = pts[0].p_kpa;
    const pPk = pts[Math.min(firstPeak, pts.length - 1)].p_kpa;
    const wLoad = pWindow3070(p0, pPk);
    if (manual?.mode === "manual" && manual.load1) {
        const arr = manualRangeArrays(pts, manual.load1.from, manual.load1.to);
        if (!arr)
            return null;
        return segmentFromArrays("G_L1", "manual", arr.xsV, arr.ysP, arr.indexFrom, arr.indexTo);
    }
    if (!wLoad)
        return null;
    const picked = pickPointsInPressureWindowWithIndices(pts, 0, Math.min(firstPeak, pts.length - 1), wLoad.p30, wLoad.p70);
    return segmentFromArrays("G_L1", "auto3070", picked.xsV, picked.ysP, picked.indexFrom, picked.indexTo);
}
function buildLoopUnloadReloadSegments(pts, manual, loop, loopIndexZeroBased) {
    const peak = pts[loop.peakIndex];
    const valley = pts[loop.valleyIndex];
    const w = pWindow3070(valley.p_kpa, peak.p_kpa);
    if (!w)
        return { unload: null, reload: null };
    const i = loopIndexZeroBased + 1;
    const manLoop = manual?.mode === "manual" ? manual.loops?.[loopIndexZeroBased] : undefined;
    let un;
    if (manual?.mode === "manual" && manLoop?.unload) {
        const arr = manualRangeArrays(pts, manLoop.unload.from, manLoop.unload.to);
        un = arr
            ? { xsV: arr.xsV, ysP: arr.ysP, indexFrom: arr.indexFrom, indexTo: arr.indexTo }
            : { xsV: [], ysP: [], indexFrom: null, indexTo: null };
    }
    else {
        un = pickPointsInPressureWindowWithIndices(pts, loop.peakIndex, loop.valleyIndex, w.p30, w.p70);
    }
    let re;
    if (manual?.mode === "manual" && manLoop?.reload) {
        const arr = manualRangeArrays(pts, manLoop.reload.from, manLoop.reload.to);
        re = arr
            ? { xsV: arr.xsV, ysP: arr.ysP, indexFrom: arr.indexFrom, indexTo: arr.indexTo }
            : { xsV: [], ysP: [], indexFrom: null, indexTo: null };
    }
    else {
        re = pickPointsInPressureWindowWithIndices(pts, loop.valleyIndex, loop.nextPeakIndex, w.p30, w.p70);
    }
    const unload = segmentFromArrays(`G_U${i}`, manual?.mode === "manual" && manLoop?.unload ? "manual" : "auto3070", un.xsV, un.ysP, un.indexFrom, un.indexTo);
    const reload = segmentFromArrays(`G_R${i}`, manual?.mode === "manual" && manLoop?.reload ? "manual" : "auto3070", re.xsV, re.ysP, re.indexFrom, re.indexTo);
    return { unload, reload };
}
/** Păstrați în sync cu `src/modules/calculations/presiometry-regression-segments.ts` (Program B). */
function buildProgramBMidLoopGurSegmentPdf(pts, manual, loop, loopIndexZeroBased) {
    const i = loopIndexZeroBased + 1;
    const sym = `G_UR${i}`;
    const manLoop = manual?.mode === "manual" ? manual.loops?.[loopIndexZeroBased] : undefined;
    const loI = loop.peakIndex;
    const hiI = loop.nextPeakIndex;
    if (manual?.mode === "manual" && manLoop?.gur) {
        const arr = manualRangeArrays(pts, manLoop.gur.from, manLoop.gur.to);
        if (!arr)
            return null;
        return segmentFromArrays(sym, "manual", arr.xsV, arr.ysP, arr.indexFrom, arr.indexTo);
    }
    if (manual?.mode === "manual" && (manLoop?.unload || manLoop?.reload)) {
        let mergedFrom = Infinity;
        let mergedTo = -Infinity;
        if (manLoop.unload) {
            mergedFrom = Math.min(mergedFrom, manLoop.unload.from, manLoop.unload.to);
            mergedTo = Math.max(mergedTo, manLoop.unload.from, manLoop.unload.to);
        }
        if (manLoop.reload) {
            mergedFrom = Math.min(mergedFrom, manLoop.reload.from, manLoop.reload.to);
            mergedTo = Math.max(mergedTo, manLoop.reload.from, manLoop.reload.to);
        }
        if (mergedFrom !== Infinity && mergedTo > mergedFrom) {
            const from = Math.max(loI, mergedFrom);
            const to = Math.min(hiI, mergedTo);
            if (to > from) {
                const arr = manualRangeArrays(pts, from, to);
                if (arr)
                    return segmentFromArrays(sym, "manual", arr.xsV, arr.ysP, arr.indexFrom, arr.indexTo);
            }
        }
    }
    const peak = pts[loop.peakIndex];
    const valley = pts[loop.valleyIndex];
    const pk = peak.p_kpa;
    const vk = valley.p_kpa;
    const pMax = Math.max(pk, vk);
    const pMin = Math.min(pk, vk);
    const dp = pMax - pMin;
    if (!(dp > 0))
        return null;
    const pMid = (pMax + pMin) / 2;
    let halfBand = 0.12 * dp;
    const maxHalf = 0.48 * dp;
    for (let attempt = 0; attempt < 16 && halfBand <= maxHalf; attempt++) {
        const pLo = pMid - halfBand;
        const pHi = pMid + halfBand;
        const picked = pickPointsInPressureWindowWithIndices(pts, loI, hiI, pLo, pHi);
        if (picked.xsV.length >= 4) {
            return segmentFromArrays(sym, "auto3070", picked.xsV, picked.ysP, picked.indexFrom, picked.indexTo);
        }
        halfBand += 0.03 * dp;
    }
    return null;
}
export function buildProgramARegressionSegmentsPdf(pts, manual, loops) {
    const load1 = buildFirstLoadingSegmentProgramA(pts, manual, loops);
    const loopSegs = loops.slice(0, 10).map((lp, idx) => buildLoopUnloadReloadSegments(pts, manual, lp, idx));
    return { load1, loops: loopSegs };
}
export function buildProgramBRegressionSegmentsPdf(pts, manual, loops) {
    const load1 = buildFirstLoadingSegmentProgramA(pts, manual, loops);
    const loopSegs = loops.slice(0, 10).map((lp, idx) => ({
        gUr: buildProgramBMidLoopGurSegmentPdf(pts, manual, lp, idx),
    }));
    return { load1, loops: loopSegs };
}
export function parsePresiometryManualSettingsPdf(raw) {
    if (!raw || typeof raw !== "object")
        return null;
    const o = raw;
    const mode = o.mode === "manual" ? "manual" : o.mode === "auto" ? "auto" : null;
    if (!mode)
        return null;
    const x_kind = o.x_kind === "radius_mm" || o.x_kind === "volume_cm3" ? o.x_kind : undefined;
    const parseRange = (v) => {
        if (!v || typeof v !== "object")
            return null;
        const r = v;
        const from = typeof r.from === "number" ? Math.floor(r.from) : Number(r.from);
        const to = typeof r.to === "number" ? Math.floor(r.to) : Number(r.to);
        if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from)
            return null;
        return { from: Math.max(0, from), to: Math.max(0, to) };
    };
    const load1 = parseRange(o.load1);
    const loopsRaw = o.loops;
    const loops = Array.isArray(loopsRaw)
        ? loopsRaw
            .map((lr) => {
            if (!lr || typeof lr !== "object")
                return null;
            const r = lr;
            return { unload: parseRange(r.unload), reload: parseRange(r.reload), gur: parseRange(r.gur) };
        })
            .filter(Boolean)
        : undefined;
    return { mode, x_kind, load1, loops };
}
export function extractPvPointsPdf(curve) {
    if (!curve?.points || !Array.isArray(curve.points))
        return [];
    const x_kind = curve.x_kind === "radius_mm" ? "radius_mm" : "volume_cm3";
    const pts = [];
    for (const p of curve.points) {
        if (!p || typeof p !== "object")
            continue;
        const r = p;
        const p_kpa = Number(r.p_kpa);
        const t_s = r.t_s == null ? undefined : Number(r.t_s);
        const x = x_kind === "radius_mm" ? (r.r_mm != null ? Number(r.r_mm) : Number(r.v_cm3)) : Number(r.v_cm3);
        if (!Number.isFinite(p_kpa) || !Number.isFinite(x))
            continue;
        const row = { p_kpa, x, x_kind };
        if (t_s != null && Number.isFinite(t_s))
            row.t_s = t_s;
        pts.push(row);
    }
    const hasTime = pts.some((p) => p.t_s != null && Number.isFinite(p.t_s));
    if (!hasTime)
        return pts;
    return [...pts].sort((a, b) => (a.t_s ?? 0) - (b.t_s ?? 0));
}
function xExtentPdf(pv, seg) {
    if (!seg)
        return null;
    if (seg.indexFrom != null && seg.indexTo != null && pv[seg.indexFrom] && pv[seg.indexTo]) {
        const a = pv[seg.indexFrom].x;
        const b = pv[seg.indexTo].x;
        return [Math.min(a, b), Math.max(a, b)];
    }
    if (seg.xsV.length)
        return [Math.min(...seg.xsV), Math.max(...seg.xsV)];
    return null;
}
export function buildPresiometryPdfOverlays(opts) {
    const empty = { bandsPr: [], bandsPdr: [], linesPr: [], linesPdr: [] };
    const pv = extractPvPointsPdf(opts.curveObj);
    if (pv.length < 2)
        return empty;
    const manual = parsePresiometryManualSettingsPdf(opts.settingsJson);
    const loops = detectLoopsByPressure(pv);
    const r0 = opts.xKind === "radius_mm" ? opts.seatingR0 : pv[0].x;
    let segs;
    if (opts.testType === "presiometry_program_a") {
        segs = buildProgramARegressionSegmentsPdf(pv, manual, loops);
    }
    else if (opts.testType === "presiometry_program_b") {
        segs = buildProgramBRegressionSegmentsPdf(pv, manual, loops);
    }
    else
        return empty;
    const bandsPr = [];
    const bandsPdr = [];
    const linesPr = [];
    const linesPdr = [];
    const fills = ["#2a6fdb22", "#c45c2222", "#1a8f5a22"];
    const strokes = ["#2a6fdb", "#c45c22", "#1a8f5a", "#6b4fb8"];
    let fi = 0;
    let ti = 0;
    const pushBand = (seg, key) => {
        const xr = xExtentPdf(pv, seg);
        if (!xr || !seg)
            return;
        const fill = fills[fi % fills.length];
        fi++;
        bandsPr.push({ x1: xr[0], x2: xr[1], fill, opacity: 0.35 });
        bandsPdr.push({ x1: xr[0] - r0, x2: xr[1] - r0, fill, opacity: 0.35 });
    };
    const pushLine = (seg) => {
        if (!seg)
            return;
        const { slope, intercept } = seg.regression;
        if (slope == null || intercept == null || !seg.xsV.length)
            return;
        const xMin = Math.min(...seg.xsV);
        const xMax = Math.max(...seg.xsV);
        const e = tangentEndpointsRawX(slope, intercept, xMin, xMax, 0.08);
        if (!e)
            return;
        const stroke = strokes[ti % strokes.length];
        ti++;
        linesPr.push({ x1: e.x1, y1: e.p1, x2: e.x2, y2: e.p2, stroke, dash: "5 4" });
        linesPdr.push({ x1: e.x1 - r0, y1: e.p1, x2: e.x2 - r0, y2: e.p2, stroke, dash: "5 4" });
    };
    if (segs.load1) {
        pushBand(segs.load1, "L1");
        pushLine(segs.load1);
    }
    segs.loops.forEach((pair) => {
        if ("gUr" in pair && pair.gUr) {
            pushBand(pair.gUr, "UR");
            pushLine(pair.gUr);
        }
        if ("unload" in pair && pair.unload) {
            pushBand(pair.unload, "U");
            pushLine(pair.unload);
        }
        if ("reload" in pair && pair.reload) {
            pushBand(pair.reload, "R");
            pushLine(pair.reload);
        }
    });
    return { bandsPr, bandsPdr, linesPr, linesPdr };
}
