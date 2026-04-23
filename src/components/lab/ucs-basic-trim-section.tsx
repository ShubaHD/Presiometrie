"use client";

import { Button } from "@/components/ui/button";
import type { UcsCurvePayload } from "@/lib/ucs-instrumentation";
import { jsonLabHeaders } from "@/lib/lab-client-user";
import {
  clampCurveForStorage,
  parseUcsCurvePayload,
  parseUcsModulusSettings,
  type UcsModulusSettings,
} from "@/lib/ucs-instrumentation";
import { suggestPoissonFlatCutoffIndex } from "@/modules/calculations/ucs-modulus";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  buildUcsForceStrainChannelsRows,
  UcsForceStrainChannelsChart,
} from "./ucs-force-strain-channels-chart";

function stressMpaToLoadKn(stressMpa: number, diameterMm: number): number {
  const rMm = diameterMm / 2;
  return (stressMpa * Math.PI * rMm * rMm) / 1000;
}

const MAX_PREVIEW_POINTS = 2500;

function decimate<T>(rows: T[], max: number): T[] {
  if (rows.length <= max) return rows;
  const step = Math.ceil(rows.length / max);
  return rows.filter((_, i) => i % step === 0);
}

type Row = { i: number; pi: number; t: number; load: number | null; stress: number };

export function UcsBasicTrimSection(props: {
  testId: string;
  ucsCurveJson: unknown;
  ucsModulusSettingsJson?: unknown;
  diameterMm?: number;
  /** Ca în calcule: true = scade așezarea (F netă / σ netă). */
  subtractSeating: boolean;
  seatingLoadKn?: number;
  /** σ baseline (MPa) deja calculat în workspace; 0/undefined = brut. */
  stressBaselineMpa?: number;
  disabled: boolean;
  /** Dacă true: doar preview (fără buton de decupare). */
  readOnly?: boolean;
  onUpdated: () => void | Promise<void>;
}) {
  const {
    testId,
    ucsCurveJson,
    ucsModulusSettingsJson,
    diameterMm,
    subtractSeating,
    seatingLoadKn,
    stressBaselineMpa,
    disabled,
    readOnly = false,
    onUpdated,
  } = props;

  const curve = useMemo(() => parseUcsCurvePayload(ucsCurveJson), [ucsCurveJson]);
  const points = curve?.points ?? [];

  const [modSettings, setModSettings] = useState<UcsModulusSettings>(() =>
    parseUcsModulusSettings(ucsModulusSettingsJson),
  );
  useEffect(() => {
    setModSettings(parseUcsModulusSettings(ucsModulusSettingsJson));
  }, [ucsModulusSettingsJson]);

  const baselineKn = useMemo(() => {
    if (!subtractSeating || points.length === 0) return 0;
    if (seatingLoadKn != null && seatingLoadKn > 0 && Number.isFinite(seatingLoadKn)) return seatingLoadKn;
    const p0 = points[0]!;
    if (p0.load_kn != null && Number.isFinite(p0.load_kn) && p0.load_kn >= 0) return p0.load_kn;
    if (diameterMm != null && diameterMm > 0) return stressMpaToLoadKn(p0.stress_mpa, diameterMm);
    return 0;
  }, [subtractSeating, points, seatingLoadKn, diameterMm]);

  const baselineMpa = useMemo(() => {
    const bl = stressBaselineMpa != null && stressBaselineMpa > 0 && Number.isFinite(stressBaselineMpa)
      ? stressBaselineMpa
      : 0;
    return bl;
  }, [stressBaselineMpa]);

  const rowsFull = useMemo((): Row[] => {
    const out: Row[] = [];
    const d = diameterMm;
    let i = 0;
    for (let pi = 0; pi < points.length; pi++) {
      const p = points[pi]!;
      if (p.t_s == null || !Number.isFinite(p.t_s)) continue;
      let load: number | null = null;
      if (p.load_kn != null && Number.isFinite(p.load_kn)) {
        load = p.load_kn;
      } else if (d != null && d > 0 && Number.isFinite(p.stress_mpa)) {
        load = stressMpaToLoadKn(p.stress_mpa, d);
      }
      const loadPlot = load != null ? (subtractSeating ? load - baselineKn : load) : null;
      const stressPlot = Number.isFinite(p.stress_mpa) ? p.stress_mpa - baselineMpa : NaN;
      if (!Number.isFinite(stressPlot)) continue;
      out.push({ i, pi, t: p.t_s, load: loadPlot, stress: stressPlot });
      i++;
    }
    return out;
  }, [points, diameterMm, subtractSeating, baselineKn, baselineMpa]);

  const canStress = rowsFull.filter((r) => Number.isFinite(r.t) && Number.isFinite(r.stress)).length >= 2;
  const canLoad = rowsFull.filter((r) => r.load != null && Number.isFinite(r.load)).length >= 2;

  const [brushStart, setBrushStart] = useState(0);
  const [brushEnd, setBrushEnd] = useState(0);
  const hi = Math.max(0, rowsFull.length - 1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // init brush to full range when data first appears
  useMemo(() => {
    if (rowsFull.length < 2) return;
    if (brushStart === 0 && brushEnd === 0) {
      setBrushStart(0);
      setBrushEnd(rowsFull.length - 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsFull.length]);

  const previewRows = useMemo(() => decimate(rowsFull, MAX_PREVIEW_POINTS), [rowsFull]);

  const forceStrain = useMemo(() => {
    return buildUcsForceStrainChannelsRows(points, diameterMm, {
      subtractSeating,
      seatingLoadKn,
    });
  }, [points, diameterMm, subtractSeating, seatingLoadKn]);

  const suggestedCutoff = useMemo(() => {
    const lo = modSettings.poisson_index_from ?? 0;
    const hi = modSettings.poisson_index_to ?? Math.max(0, points.length - 1);
    if (points.length < 30) return null;
    return suggestPoissonFlatCutoffIndex(points, lo, hi);
  }, [points, modSettings.poisson_index_from, modSettings.poisson_index_to]);

  const poissonRange = useMemo(() => {
    if (forceStrain.rows.length < 2) return null;
    const lo = modSettings.poisson_index_from ?? 0;
    const hi = modSettings.poisson_index_to ?? (forceStrain.rows.length - 1);
    return { from: Math.max(0, Math.min(lo, hi)), to: Math.min(forceStrain.rows.length - 1, Math.max(lo, hi)) };
  }, [forceStrain.rows.length, modSettings.poisson_index_from, modSettings.poisson_index_to]);

  const savePoissonSettings = useCallback(
    async (next: UcsModulusSettings) => {
      setBusy(true);
      setMsg(null);
      try {
        const res = await fetch(`/api/tests/${testId}`, {
          method: "PATCH",
          headers: jsonLabHeaders(),
          body: JSON.stringify({ ucs_modulus_settings_json: next }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Salvare eșuată");
        setMsg("Setări ν salvate.");
        await onUpdated();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Eroare");
      } finally {
        setBusy(false);
      }
    },
    [onUpdated, testId],
  );

  const trimCurveToBrush = useCallback(async () => {
    if (!curve?.points.length || rowsFull.length < 2) return;
    const lo = Math.max(0, Math.min(brushStart, brushEnd));
    const hiRow = Math.max(0, Math.max(brushStart, brushEnd));
    if (hiRow <= lo) {
      setMsg("Selectați un interval Brush valid (cel puțin 2 puncte).");
      return;
    }
    const rowLo = rowsFull[Math.min(lo, rowsFull.length - 1)]!;
    const rowHi = rowsFull[Math.min(hiRow, rowsFull.length - 1)]!;
    const pi0 = Math.min(rowLo.pi, rowHi.pi);
    const pi1 = Math.max(rowLo.pi, rowHi.pi);
    if (pi1 <= pi0) {
      setMsg("Interval invalid (nu s-au găsit puncte consecutive).");
      return;
    }
    if (
      !window.confirm(
        "Elimină definitiv din curbă toate punctele din afara zonei Brush? Se salvează în baza de date; nu există anulare automată.",
      )
    ) {
      return;
    }

    setBusy(true);
    setMsg(null);
    try {
      const newPayload: UcsCurvePayload = {
        version: typeof curve.version === "number" ? curve.version : 1,
        points: curve.points.slice(pi0, pi1 + 1),
      };
      const res = await fetch(`/api/tests/${testId}`, {
        method: "PATCH",
        headers: jsonLabHeaders(),
        body: JSON.stringify({ ucs_curve_json: clampCurveForStorage(newPayload) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Salvare eșuată");
      setMsg("Curbă decupată și salvată.");
      await onUpdated();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(false);
    }
  }, [curve, rowsFull, brushStart, brushEnd, testId, onUpdated]);

  if (!curve || points.length === 0 || (!canStress && !canLoad)) {
    return (
      <p className="text-muted-foreground text-sm">
        Nu există date suficiente pentru grafice (necesar Time + Stress sau Time + Load/diametru).
      </p>
    );
  }

  const loadLabel = subtractSeating && baselineKn > 0 ? "F netă (kN)" : "F (kN)";
  const stressLabel = baselineMpa > 0 ? "σ netă (MPa)" : "σ (MPa)";

  return (
    <div className="space-y-4">
      {forceStrain.rows.filter((r) => r.ch6 != null || r.ch7 != null || r.ch8 != null).length >= 2 ? (
        <div>
          <p className="text-muted-foreground mb-2 text-sm">Forță – deformații (Ch6 / Ch7 / Ch8)</p>
          <UcsForceStrainChannelsChart
            rows={forceStrain.rows}
            poissonRange={poissonRange}
            suggestedCutoffIndex={modSettings.poisson_auto_cutoff !== false ? suggestedCutoff : null}
            onBrushChange={
              readOnly
                ? undefined
                : (range) => {
                    setModSettings((s) => ({
                      ...s,
                      poisson_index_from: range.from,
                      poisson_index_to: range.to,
                    }));
                  }
            }
          />
          {!readOnly ? (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={modSettings.poisson_auto_cutoff !== false}
                  disabled={disabled || busy}
                  onChange={(e) => setModSettings((s) => ({ ...s, poisson_auto_cutoff: e.target.checked }))}
                />
                Auto-cutoff Ch8 (exclude platou/blocare)
              </label>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={disabled || busy}
                onClick={() => void savePoissonSettings(modSettings)}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Salvează setări ν
              </Button>
              {suggestedCutoff != null ? (
                <span className="text-muted-foreground text-xs">
                  Cutoff sugerat: index {suggestedCutoff}
                </span>
              ) : null}
            </div>
          ) : null}
          <p className="text-muted-foreground mt-1 text-xs">
            Brush setează intervalul pentru ν (salvat în setări). Dacă Ch8 se rupe și devine plat, activați
            auto-cutoff ca să fie exclusă porțiunea blocată.
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Nu există date suficiente pentru Ch6/Ch7/Ch8 în curba importată (fișier fără coloane Strain ch 6–8 sau
          import vechi).
        </p>
      )}

      {canLoad ? (
        <div>
          <p className="text-muted-foreground mb-2 text-sm">Timp – sarcină (t – F)</p>
          <div className="w-full" style={{ minHeight: 260 }}>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={previewRows} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="t"
                  type="number"
                  tick={{ fontSize: 11 }}
                  label={{ value: "t (s)", position: "insideBottom", offset: -2, style: { fontSize: 11 } }}
                />
                <YAxis
                  dataKey="load"
                  type="number"
                  tick={{ fontSize: 11 }}
                  label={{ value: loadLabel, angle: -90, position: "insideLeft", style: { fontSize: 11 } }}
                />
                <Tooltip
                  formatter={(v: unknown, name) => {
                    const n = typeof v === "number" ? v : Number(v);
                    const s = Number.isFinite(n) ? n.toFixed(4) : "—";
                    return [s, name === "load" ? loadLabel : "t (s)"];
                  }}
                />
                <Line
                  type="linear"
                  dataKey="load"
                  stroke="oklch(0.42 0.14 145)"
                  dot={false}
                  strokeWidth={2}
                  isAnimationActive={false}
                  connectNulls={false}
                />
                {!readOnly ? (
                  <Brush
                    height={22}
                    stroke="oklch(0.5 0 0)"
                    startIndex={Math.min(brushStart, hi)}
                    endIndex={Math.min(brushEnd, hi)}
                    onChange={(range: { startIndex?: number; endIndex?: number }) => {
                      setBrushStart(range.startIndex ?? 0);
                      setBrushEnd(range.endIndex ?? hi);
                    }}
                  />
                ) : null}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      {canStress ? (
        <div>
          <p className="text-muted-foreground mb-2 text-sm">Efort – timp (σ – t)</p>
          <div className="w-full" style={{ minHeight: 260 }}>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={previewRows} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="t"
                  type="number"
                  tick={{ fontSize: 11 }}
                  label={{ value: "t (s)", position: "insideBottom", offset: -2, style: { fontSize: 11 } }}
                />
                <YAxis
                  dataKey="stress"
                  type="number"
                  tick={{ fontSize: 11 }}
                  label={{ value: stressLabel, angle: -90, position: "insideLeft", style: { fontSize: 11 } }}
                />
                <Tooltip
                  formatter={(v: unknown, name) => {
                    const n = typeof v === "number" ? v : Number(v);
                    const s = Number.isFinite(n) ? n.toFixed(4) : "—";
                    return [s, name === "stress" ? stressLabel : "t (s)"];
                  }}
                />
                <Line
                  type="linear"
                  dataKey="stress"
                  stroke="oklch(0.35 0.05 260)"
                  dot={false}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      {!readOnly ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="destructive"
            disabled={disabled || busy || rowsFull.length < 2}
            onClick={() => void trimCurveToBrush()}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Decupează curbă (păstrează zona Brush)
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || busy}
            onClick={() => {
              setBrushStart(0);
              setBrushEnd(hi);
              setMsg("Brush resetat la interval complet.");
            }}
          >
            Reset Brush
          </Button>
        </div>
      ) : null}

      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}

