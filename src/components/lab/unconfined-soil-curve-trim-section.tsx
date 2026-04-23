"use client";

import { Button } from "@/components/ui/button";
import { jsonLabHeaders } from "@/lib/lab-client-user";
import {
  clampUnconfinedSoilCurveForStorage,
  parseUnconfinedSoilCurvePayload,
  type UnconfinedSoilCurvePayload,
} from "@/lib/unconfined-soil-curve";
import { buildUnconfinedSoilLoadRateChartData, buildUnconfinedSoilTimeLoadChartData } from "@/lib/unconfined-soil-time-load-chart-data";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { UnconfinedSoilLoadRateChart, UnconfinedSoilTimeLoadChart } from "./unconfined-soil-time-load-chart";

export function UnconfinedSoilCurveTrimSection(props: {
  testId: string;
  unconfinedSoilCurveJson: unknown;
  subtractSeating: boolean;
  seatingLoadKn?: number;
  disabled: boolean;
  onUpdated: () => void | Promise<void>;
}) {
  const { testId, unconfinedSoilCurveJson, subtractSeating, seatingLoadKn, disabled, onUpdated } = props;

  const curve = useMemo(() => parseUnconfinedSoilCurvePayload(unconfinedSoilCurveJson), [unconfinedSoilCurveJson]);
  const points = curve?.points ?? [];

  const { series, baselineKn } = useMemo(
    () =>
      buildUnconfinedSoilTimeLoadChartData(points, {
        subtractSeating,
        seatingLoadKn,
      }),
    [points, subtractSeating, seatingLoadKn],
  );

  const loadRate = useMemo(() => {
    if (series.length < 2) return [];
    return buildUnconfinedSoilLoadRateChartData(series.map(({ t, load }) => ({ t, load })));
  }, [series]);

  const [brushRange, setBrushRange] = useState<{ from: number; to: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setBrushRange(null);
    setMsg(null);
  }, [unconfinedSoilCurveJson, points.length, subtractSeating, seatingLoadKn]);

  const trimCurveToBrush = useCallback(async () => {
    if (!curve || points.length < 2 || series.length < 2) return;
    const lo = brushRange != null ? Math.min(brushRange.from, brushRange.to) : 0;
    const hi = brushRange != null ? Math.max(brushRange.from, brushRange.to) : series.length - 1;
    if (hi <= lo) {
      setMsg("Selectați un interval Brush valid (cel puțin 2 puncte pe graficul t–F).");
      return;
    }
    const rowLo = series[Math.max(0, Math.min(series.length - 1, lo))]!;
    const rowHi = series[Math.max(0, Math.min(series.length - 1, hi))]!;
    const pi0 = Math.min(rowLo.sourceIndex, rowHi.sourceIndex);
    const pi1 = Math.max(rowLo.sourceIndex, rowHi.sourceIndex);
    if (pi1 <= pi0) {
      setMsg("Interval invalid.");
      return;
    }
    if (
      !window.confirm(
        "Elimină definitiv din curbă toate punctele din afara zonei Brush? Se salvează în baza de date; «Rulează calcule» și raportul PDF vor folosi curba decupată.",
      )
    ) {
      return;
    }

    setBusy(true);
    setMsg(null);
    try {
      const newPayload: UnconfinedSoilCurvePayload = {
        version: typeof curve.version === "number" ? curve.version : 1,
        points: points.slice(pi0, pi1 + 1),
      };
      const res = await fetch(`/api/tests/${testId}`, {
        method: "PATCH",
        headers: jsonLabHeaders(),
        body: JSON.stringify({ unconfined_soil_curve_json: clampUnconfinedSoilCurveForStorage(newPayload) }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Salvare eșuată");
      setMsg("Curbă decupată și salvată. Rulați din nou calculele pentru rezultate actualizate.");
      await onUpdated();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(false);
    }
  }, [brushRange, curve, points, series, testId, onUpdated]);

  if (series.length < 2) {
    return (
      <p className="text-muted-foreground text-sm">
        Pentru decupare: importul trebuie să conțină Time (s) și sarcină pe cel puțin două puncte consecutive.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        Timp – forță (F) din curbă Uniframe; reglați <strong>Brush</strong> pe porțiunea de păstrat, apoi salvați
        decuparea. Graficele din «Calcule» și PDF-ul folosesc aceeași curbă stocată.
      </p>
      <UnconfinedSoilTimeLoadChart
        data={series.map(({ t, load }) => ({ t, load }))}
        netForce={subtractSeating}
        baselineKn={baselineKn}
        brushRange={brushRange}
        onBrushChange={setBrushRange}
      />
      {loadRate.length >= 2 ? (
        <div>
          <p className="text-muted-foreground mb-2 text-sm">Sarcină/timp (dF/dt) — aceeași zonă Brush ca mai sus</p>
          <UnconfinedSoilLoadRateChart data={loadRate} brushRange={brushRange} />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" disabled={disabled || busy} onClick={() => void trimCurveToBrush()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Decupează curbă (păstrează zona Brush)
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || busy}
          onClick={() => {
            setBrushRange(null);
            setMsg("Brush resetat la întreaga serie afișată.");
          }}
        >
          Reset Brush
        </Button>
      </div>
      {msg ? <p className="text-muted-foreground text-xs">{msg}</p> : null}
    </div>
  );
}
