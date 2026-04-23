"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { jsonLabHeaders } from "@/lib/lab-client-user";
import {
  parseUcsCurvePayload,
  parseUcsModulusSettings,
  type UcsEModMethod,
  type UcsModulusSettings,
  type UcsSigmaEpsilonDisplayMode,
  UCS_MODULUS_DEFAULTS,
} from "@/lib/ucs-instrumentation";
import { solveYoungModulusMpa } from "@/modules/calculations/ucs-modulus";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function stressMpaToLoadKn(stressMpa: number, diameterMm: number): number {
  const rMm = diameterMm / 2;
  return (stressMpa * Math.PI * rMm * rMm) / 1000;
}

const MAX_TIME_LOAD_PREVIEW_POINTS = 2500;

function decimateForPreview<T>(rows: T[], max: number): T[] {
  if (rows.length <= max) return rows;
  const step = Math.ceil(rows.length / max);
  return rows.filter((_, i) => i % step === 0);
}

function methodLabelRo(m: UcsEModMethod): string {
  switch (m) {
    case "loading_linear":
      return "Încărcare — porțiune liniară";
    case "unloading":
      return "Descărcare — pantă";
    case "secant":
      return "Secantă (două puncte)";
    case "tangent":
      return "Tangentă (fereastră locală)";
    default:
      return m;
  }
}

export function UcsInstrumentSection(props: {
  testId: string;
  ucsCurveJson: unknown;
  ucsModulusSettingsJson: unknown;
  /** Pentru preview t–F când `load_kn` lipsește din JSON vechi: F ≈ σ × A / 1000. */
  diameterMm?: number;
  /** Ca la calcule: gol/true = F netă (scade așezarea); false = F brută. */
  timeLoadNetOfSeating?: boolean;
  /** Înlocuiește F din primul punct ca baseline (kN). */
  ucsSeatingLoadKn?: number;
  disabled: boolean;
  onUpdated: () => void | Promise<void>;
}) {
  const {
    testId,
    ucsCurveJson,
    ucsModulusSettingsJson,
    diameterMm,
    timeLoadNetOfSeating = true,
    ucsSeatingLoadKn,
    disabled,
    onUpdated,
  } = props;
  const curve = useMemo(() => parseUcsCurvePayload(ucsCurveJson), [ucsCurveJson]);
  const points = curve?.points ?? [];

  const [settings, setSettings] = useState<UcsModulusSettings>(() =>
    parseUcsModulusSettings(ucsModulusSettingsJson),
  );
  useEffect(() => {
    setSettings(parseUcsModulusSettings(ucsModulusSettingsJson));
  }, [ucsModulusSettingsJson]);

  const [brushStart, setBrushStart] = useState(0);
  const [brushEnd, setBrushEnd] = useState(0);
  useEffect(() => {
    if (points.length === 0) return;
    const hiBrush = points.length - 1;
    if (
      settings.index_from != null &&
      settings.index_to != null &&
      !settings.auto_interval
    ) {
      setBrushStart(Math.max(0, Math.min(hiBrush, settings.index_from)));
      setBrushEnd(Math.max(0, Math.min(hiBrush, settings.index_to)));
    } else {
      setBrushStart(0);
      setBrushEnd(hiBrush);
    }
  }, [points.length, settings.index_from, settings.index_to, settings.auto_interval]);

  const fullSigmaRows = useMemo(
    () => points.map((p, i) => ({ i, strain: p.strain_axial, stress: p.stress_mpa })),
    [points],
  );

  const modulusPreview = useMemo(
    () => (points.length >= 3 ? solveYoungModulusMpa(points, settings) : null),
    [points, settings],
  );

  const sigmaDisplayMode: UcsSigmaEpsilonDisplayMode = settings.sigma_epsilon_display ?? "full";

  const sigmaChartData = useMemo(() => {
    if (sigmaDisplayMode === "full") return fullSigmaRows;
    if (sigmaDisplayMode === "brush_range") {
      const a = Math.min(brushStart, brushEnd);
      const b = Math.max(brushStart, brushEnd);
      return fullSigmaRows.slice(a, b + 1);
    }
    if (sigmaDisplayMode === "modulus_interval" && modulusPreview) {
      return fullSigmaRows.slice(modulusPreview.i0, modulusPreview.i1 + 1);
    }
    return fullSigmaRows;
  }, [fullSigmaRows, sigmaDisplayMode, brushStart, brushEnd, modulusPreview]);

  const timeLoadBaselineKn = useMemo(() => {
    if (!timeLoadNetOfSeating || points.length === 0) return 0;
    if (ucsSeatingLoadKn != null && ucsSeatingLoadKn > 0 && Number.isFinite(ucsSeatingLoadKn)) {
      return ucsSeatingLoadKn;
    }
    const p0 = points[0]!;
    if (p0.load_kn != null && Number.isFinite(p0.load_kn) && p0.load_kn >= 0) {
      return p0.load_kn;
    }
    if (diameterMm != null && diameterMm > 0) {
      return stressMpaToLoadKn(p0.stress_mpa, diameterMm);
    }
    return 0;
  }, [timeLoadNetOfSeating, points, ucsSeatingLoadKn, diameterMm]);

  const timeLoadRowsFull = useMemo(() => {
    const out: { t: number; load: number }[] = [];
    for (const p of points) {
      if (p.t_s == null || !Number.isFinite(p.t_s)) continue;
      let load = p.load_kn;
      if (load == null || !Number.isFinite(load)) {
        if (diameterMm != null && diameterMm > 0) {
          load = stressMpaToLoadKn(p.stress_mpa, diameterMm);
        } else {
          continue;
        }
      }
      const loadPlot = timeLoadNetOfSeating ? load - timeLoadBaselineKn : load;
      out.push({ t: p.t_s, load: loadPlot });
    }
    return out;
  }, [points, diameterMm, timeLoadNetOfSeating, timeLoadBaselineKn]);

  const timeLoadChartRows = useMemo(
    () => decimateForPreview(timeLoadRowsFull, MAX_TIME_LOAD_PREVIEW_POINTS),
    [timeLoadRowsFull],
  );

  const canPreviewTimeLoad = timeLoadRowsFull.length >= 2;

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const saveSettings = useCallback(
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
        setMsg("Setări modul salvate.");
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
    if (!curve?.points.length) return;
    const lo = Math.min(brushStart, brushEnd);
    const hiIdx = Math.max(brushStart, brushEnd);
    if (hiIdx <= lo) {
      setMsg("Selectați un interval Brush valid (cel puțin 2 puncte).");
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
      const newPayload = {
        version: typeof curve.version === "number" ? curve.version : 1,
        points: curve.points.slice(lo, hiIdx + 1),
      };
      const res = await fetch(`/api/tests/${testId}`, {
        method: "PATCH",
        headers: jsonLabHeaders(),
        body: JSON.stringify({ ucs_curve_json: newPayload }),
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
  }, [curve, brushStart, brushEnd, testId, onUpdated]);

  const lr = settings.last_resolution;

  if (points.length === 0) {
    return (
      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">UCS+Young</CardTitle>
          <CardDescription>
            Importați un fișier tabular de la presă (Time, Load ch 1, Strain ch 6–8…). Setați diametrul în
            măsurători sau folosiți d84 în numele fișierului.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const hi = Math.max(0, points.length - 1);
  const rawShade0 = modulusPreview
    ? modulusPreview.i0
    : (lr?.index_from ?? settings.index_from ?? brushStart);
  const rawShade1 = modulusPreview
    ? modulusPreview.i1
    : (lr?.index_to ?? settings.index_to ?? brushEnd);
  const shadeI0 = Math.max(0, Math.min(hi, Math.min(rawShade0, rawShade1)));
  const shadeI1 = Math.max(0, Math.min(hi, Math.max(rawShade0, rawShade1)));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Curbă σ–ε și modul Young</CardTitle>
        <CardDescription>
          {points.length} puncte. σ–ε: σ din export (coloana Stress MPa sau din Load/A); ε_axial =
          medie(Strain ch 6–7) × factor marcă (implicit 1e-6 pentru µε). Timp–F: implicit forță netă
          (F − F la primul punct), aliniată cu calculele. Zona violet pe grafic = interval previzualizat
          pentru E (se actualizează la schimbarea metodei). La „Rulează calcule”, intervalul oficial se
          salvează în setări.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs defaultValue="sigma-eps" className="w-full">
          <TabsList className="mb-2 flex h-auto w-full flex-wrap justify-start gap-1">
            <TabsTrigger value="sigma-eps">σ – ε_axial</TabsTrigger>
            <TabsTrigger value="time-load">Timp – sarcină (ch 1)</TabsTrigger>
          </TabsList>
          <TabsContent value="sigma-eps" className="mt-0 overflow-visible">
            <p className="text-muted-foreground mb-2 text-xs">
              Fiecare punct: abscisa ε_axial, ordonata σ (MPa). Punctele sunt unite în ordinea din curbă
              (timp); nu este reordonat după ε. Pentru a ascunde o coadă urâtă: treceți la „Doar zonă
              Brush” sau decupați definitiv curbă (butonul de mai jos).
            </p>
            <div className="w-full" style={{ minHeight: 280 }}>
              {sigmaChartData.length >= 2 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={sigmaChartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="strain"
                      type="number"
                      tick={{ fontSize: 11 }}
                      label={{ value: "ε_axial", position: "insideBottom", offset: -2, style: { fontSize: 11 } }}
                    />
                    <YAxis
                      dataKey="stress"
                      type="number"
                      tick={{ fontSize: 11 }}
                      label={{ value: "σ MPa", angle: -90, position: "insideLeft", style: { fontSize: 11 } }}
                    />
                    <Tooltip
                      formatter={(v: unknown, name) => {
                        const n = typeof v === "number" ? v : Number(v);
                        const s = Number.isFinite(n) ? n.toFixed(4) : "—";
                        const nm = name === "stress" ? "σ (MPa)" : "ε";
                        return [s, nm];
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
                    {sigmaDisplayMode === "full" && shadeI1 >= shadeI0 && (
                      <ReferenceArea
                        x1={points[shadeI0]!.strain_axial}
                        x2={points[shadeI1]!.strain_axial}
                        strokeOpacity={0}
                        fill="oklch(0.55 0.12 260)"
                        fillOpacity={0.12}
                      />
                    )}
                    {sigmaDisplayMode === "full" ? (
                      <Brush
                        height={22}
                        stroke="oklch(0.5 0 0)"
                        startIndex={Math.min(brushStart, hi)}
                        endIndex={Math.min(brushEnd, hi)}
                        onChange={(range: { startIndex?: number; endIndex?: number }) => {
                          const a = range.startIndex ?? 0;
                          const b = range.endIndex ?? hi;
                          setBrushStart(a);
                          setBrushEnd(b);
                        }}
                      />
                    ) : null}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground flex min-h-[200px] items-center text-sm">
                  Intervalul afișat are prea puține puncte — lărgiți Brush sau reveniți la „Curbă completă”.
                </p>
              )}
            </div>
            {points.length >= 3 && modulusPreview ? (
              <p className="text-muted-foreground mt-1 text-xs">
                Previzualizare E: {methodLabelRo(modulusPreview.method)}, indici {modulusPreview.i0}–
                {modulusPreview.i1}
                {modulusPreview.r2 != null ? `, R² = ${modulusPreview.r2.toFixed(4)}` : ""}, E ≈{" "}
                {modulusPreview.eMpa.toFixed(0)} MPa — confirmați cu „Salvează setări modul” și „Rulează
                calcule”.
              </p>
            ) : null}
            {points.length >= 3 && !modulusPreview ? (
              <p className="text-muted-foreground mt-1 text-xs">
                Nu s-a putut previzualiza modulul E cu setările curente (date insuficiente sau interval
                invalid).
              </p>
            ) : null}
            {sigmaDisplayMode === "modulus_interval" && !modulusPreview ? (
              <p className="text-amber-800 dark:text-amber-200 mt-1 text-xs">
                „Doar interval modul E” necesită o previzualizare validă — se afișează curbă completă.
              </p>
            ) : null}
            {sigmaDisplayMode !== "full" ? (
              <p className="text-muted-foreground mt-1 text-xs">
                Reveniți la „Curbă completă” ca să reglați zona Brush.
              </p>
            ) : null}
          </TabsContent>
          <TabsContent value="time-load" className="mt-0 overflow-visible">
            {canPreviewTimeLoad ? (
              <div className="space-y-2">
                <div className="w-full" style={{ minHeight: 280 }}>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={timeLoadChartRows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis
                        dataKey="t"
                        type="number"
                        tick={{ fontSize: 11 }}
                        label={{
                          value: "t (s)",
                          position: "insideBottom",
                          offset: -2,
                          style: { fontSize: 11 },
                        }}
                      />
                      <YAxis
                        dataKey="load"
                        type="number"
                        tick={{ fontSize: 11 }}
                        label={{
                          value: timeLoadNetOfSeating && timeLoadBaselineKn > 0 ? "F netă (kN)" : "F (kN)",
                          angle: -90,
                          position: "insideLeft",
                          style: { fontSize: 11 },
                        }}
                      />
                      <Tooltip
                        formatter={(v: unknown, name) => {
                          const n = typeof v === "number" ? v : Number(v);
                          const s = Number.isFinite(n) ? n.toFixed(4) : "—";
                          const loadLabel =
                            timeLoadNetOfSeating && timeLoadBaselineKn > 0 ? "F netă (kN)" : "F (kN)";
                          const nm = name === "load" ? loadLabel : "t (s)";
                          return [s, nm];
                        }}
                      />
                      <Line
                        type="linear"
                        dataKey="load"
                        stroke="oklch(0.42 0.14 145)"
                        dot={false}
                        strokeWidth={2}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-muted-foreground text-xs">
                  {timeLoadChartRows.length < timeLoadRowsFull.length
                    ? `Preview: ${timeLoadChartRows.length} din ${timeLoadRowsFull.length} puncte (eșantionare pentru viteză). `
                    : null}
                  {timeLoadNetOfSeating && timeLoadBaselineKn > 0
                    ? `Forță netă: din fiecare F se scade așezarea ≈ ${timeLoadBaselineKn.toFixed(3)} kN (ca la „Rulează calcule”). `
                    : "Forță brută (fără scădere): setați măsurătorile „0” la câmpul de mod brut sau echivalent. "}
                  Sursa F: Load ch 1/2 la import sau σ×A/1000 dacă lipsește load_kn (cu diametru la măsurători).
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                Nu se poate desena t–F: lipsește coloana Time în serie sau sarcina (setați diametrul probă la
                măsurători ca să putem deriva F din σ când lipsește Load ch 1 în JSON).
              </p>
            )}
          </TabsContent>
        </Tabs>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Metodă modul E</Label>
            <Select
              disabled={disabled || busy}
              value={settings.method}
              onValueChange={(v) =>
                setSettings((s) => ({ ...s, method: v as UcsEModMethod }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  ["loading_linear", "unloading", "secant", "tangent"] as const
                ).map((m) => (
                  <SelectItem key={m} value={m}>
                    {methodLabelRo(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Afișaj grafic σ–ε</Label>
            <Select
              disabled={disabled || busy}
              value={sigmaDisplayMode}
              onValueChange={(v) =>
                setSettings((s) => ({
                  ...s,
                  sigma_epsilon_display: v as UcsSigmaEpsilonDisplayMode,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full">Curbă completă + Brush</SelectItem>
                <SelectItem value="brush_range">Doar zonă Brush (ascunde restul)</SelectItem>
                <SelectItem value="modulus_interval">Doar interval previzualizat pentru E</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              Modul afișaj nu schimbă datele; „Decupează curbă” elimină puncte în mod permanent.
            </p>
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 sm:col-span-2">
            <input
              type="checkbox"
              className="mt-1 size-4"
              checked={settings.auto_interval}
              disabled={disabled || busy}
              onChange={(e) => setSettings((s) => ({ ...s, auto_interval: e.target.checked }))}
            />
            <div>
              <p className="text-sm font-medium">Interval automat</p>
              <p className="text-muted-foreground text-xs">
                Dacă e debifat, se folosesc indicii de mai jos sau din zona Brush.
              </p>
            </div>
          </label>
        </div>

        {!settings.auto_interval && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="ucs-i0">Indice start</Label>
              <Input
                id="ucs-i0"
                type="number"
                disabled={disabled || busy}
                value={settings.index_from ?? ""}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    index_from: e.target.value === "" ? undefined : Number(e.target.value),
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ucs-i1">Indice sfârșit</Label>
              <Input
                id="ucs-i1"
                type="number"
                disabled={disabled || busy}
                value={settings.index_to ?? ""}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    index_to: e.target.value === "" ? undefined : Number(e.target.value),
                  }))
                }
              />
            </div>
            {settings.method === "tangent" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="ucs-ic">Centru tangentă</Label>
                  <Input
                    id="ucs-ic"
                    type="number"
                    disabled={disabled || busy}
                    value={settings.index_center ?? ""}
                    placeholder="implicit ~35% din vârf"
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        index_center: e.target.value === "" ? undefined : Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ucs-wh">Jumătate fereastră</Label>
                  <Input
                    id="ucs-wh"
                    type="number"
                    disabled={disabled || busy}
                    value={settings.window_half ?? UCS_MODULUS_DEFAULTS.window_half}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        window_half: e.target.value === "" ? undefined : Number(e.target.value),
                      }))
                    }
                  />
                </div>
              </>
            )}
            {settings.method === "unloading" && (
              <div className="space-y-1.5">
                <Label htmlFor="ucs-us">Segment descărcare</Label>
                <Input
                  id="ucs-us"
                  type="number"
                  min={0}
                  disabled={disabled || busy}
                  value={settings.unloading_segment_index ?? 0}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      unloading_segment_index: Number(e.target.value) || 0,
                    }))
                  }
                />
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || busy}
            onClick={() =>
              setSettings((s) => ({
                ...s,
                auto_interval: false,
                index_from: Math.min(brushStart, brushEnd),
                index_to: Math.max(brushStart, brushEnd),
              }))
            }
          >
            Aplică interval din zonă (Brush)
          </Button>
          <Button type="button" disabled={disabled || busy} onClick={() => void saveSettings(settings)}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Salvează setări modul
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={disabled || busy || sigmaDisplayMode !== "full"}
            title={
              sigmaDisplayMode !== "full"
                ? "Reveniți la „Curbă completă” ca să reglați Brush înainte de decupare."
                : undefined
            }
            onClick={() => void trimCurveToBrush()}
          >
            Decupează curbă (păstrează zona Brush)
          </Button>
        </div>

        {lr && (
          <p className="text-muted-foreground text-xs">
            Ultimul calcul: {methodLabelRo(lr.method)}, puncte {lr.index_from}–{lr.index_to}
            {lr.r2 != null ? `, R² = ${lr.r2.toFixed(4)}` : ""}, {lr.auto ? "automat" : "manual"} (
            {new Date(lr.at).toLocaleString("ro-RO")})
          </p>
        )}

        {msg && <p className="text-sm">{msg}</p>}
      </CardContent>
    </Card>
  );
}
