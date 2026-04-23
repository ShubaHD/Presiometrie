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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { jsonLabHeaders } from "@/lib/lab-client-user";
import {
  clampUnitWeightSubmergedPayload,
  defaultUnitWeightSubmergedPayload,
  type UnitWeightCylinderPayload,
  type MoistureGravimetricPayload,
  type UnitWeightSubmergedMethod,
  type UnitWeightSubmergedPayload,
  type UnitWeightSubmergedRow,
} from "@/lib/unit-weight-submerged";
import { calculateMoistureGravimetric } from "@/modules/calculations/moistureGravimetric";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

function methodLabel(m: UnitWeightSubmergedMethod): string {
  return m === "paraffin_submerged" ? "Cu parafină (m0, m1, m2)" : "Imersare directă (m0 aer, m2 imersat)";
}

export function UnitWeightBulkTab(props: {
  testId: string;
  payload: unknown;
  disabled: boolean;
  onSaved: () => void;
  onMessage: (msg: string | null) => void;
}) {
  const { testId, payload, disabled, onSaved, onMessage } = props;
  const [draft, setDraft] = useState<UnitWeightSubmergedPayload>(() =>
    clampUnitWeightSubmergedPayload(payload),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(clampUnitWeightSubmergedPayload(payload));
  }, [testId, payload]);

  const updateRow = useCallback((i: number, patch: Partial<UnitWeightSubmergedRow>) => {
    setDraft((d) => {
      const rows = d.rows.map((r, j) => (j === i ? { ...r, ...patch } : r));
      return { ...d, rows };
    });
  }, []);

  const addRow = useCallback(() => {
    setDraft((d) => {
      const next = d.rows.length === 0 ? 1 : Math.max(...d.rows.map((r) => r.proba_index)) + 1;
      return {
        ...d,
        rows: [...d.rows, { proba_index: next, m0_g: null, m1_g: null, m2_g: null }],
      };
    });
  }, []);

  const removeRow = useCallback((i: number) => {
    setDraft((d) => {
      if (d.rows.length <= 1) return d;
      const rows = d.rows.filter((_, j) => j !== i);
      return { ...d, rows };
    });
  }, []);

  const save = async () => {
    setSaving(true);
    onMessage(null);
    try {
      const res = await fetch(`/api/tests/${testId}`, {
        method: "PATCH",
        headers: jsonLabHeaders(),
        body: JSON.stringify({ unit_weight_submerged_json: draft }),
      });
      const json = (await res.json()) as { error?: string };
      if (res.status === 423) throw new Error(json.error ?? "Blocat.");
      if (!res.ok) throw new Error(json.error ?? "Salvare eșuată");
      onMessage("Date salvate. Rulați calculele în tabul „Calcule”.");
      onSaved();
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Eroare");
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = () => {
    setDraft(defaultUnitWeightSubmergedPayload());
    onMessage(null);
  };

  const setMoisture = useCallback((patch: Partial<MoistureGravimetricPayload>) => {
    setDraft((d) => ({
      ...d,
      moisture_gravimetric: {
        ...(d.moisture_gravimetric ?? { with_dish: true, m_dish_g: null, m_wet_g: null, m_dry_g: null }),
        ...patch,
      },
    }));
  }, []);

  const setCylinder = useCallback((patch: Partial<UnitWeightCylinderPayload>) => {
    setDraft((d) => ({
      ...d,
      cylinder: {
        ...(d.cylinder ?? { diameter_mm: null, length_mm: null, mass_natural_g: null, mass_dry_g: null }),
        ...patch,
      },
    }));
  }, []);

  const cylinderPreview = useMemo(() => {
    const c = draft.cylinder;
    if (!c) return null;
    const d = c.diameter_mm ?? NaN;
    const l = c.length_mm ?? NaN;
    const mNat = c.mass_natural_g ?? NaN;
    const mDry = c.mass_dry_g ?? NaN;
    if (!(d > 0 && l > 0 && mNat > 0 && mDry > 0)) return null;
    const volM3 = (Math.PI * ((d / 1000) / 2) ** 2) * (l / 1000);
    if (!(volM3 > 0)) return null;
    const rhoNat = (mNat / 1000) / volM3;
    const rhoDry = (mDry / 1000) / volM3;
    const g = 9.80665;
    const gammaNat = (rhoNat * g) / 1000;
    const gammaDry = (rhoDry * g) / 1000;
    return {
      gammaNat,
      gammaDry,
      rhoNat,
      rhoDry,
      volCm3: volM3 * 1_000_000,
    };
  }, [draft.cylinder]);

  const moisturePreview = useMemo(() => {
    const m = draft.moisture_gravimetric;
    if (!m) return null;
    const out = calculateMoistureGravimetric(m);
    if (out.errors.length > 0 || out.final.length === 0) return null;
    const w = out.final[0]?.value;
    if (w == null || !Number.isFinite(w)) return null;
    return w.toFixed(out.final[0]!.decimals);
  }, [draft.moisture_gravimetric]);

  const mg = draft.moisture_gravimetric ?? {
    with_dish: true,
    m_dish_g: null,
    m_wet_g: null,
    m_dry_g: null,
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Greutate volumică — cântărire submersă</CardTitle>
        <CardDescription>
          Mod cu parafină: m0 = masă probă în aer; m1 = masă probă parafinată; m2 = masă probă parafinată
          imersată. Fără parafină: m0 în aer, m2 la imersare (volum din (m0−m2)/ρ apă). Densități în g/cm³.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-md border p-4">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:justify-between">
            <div>
              <p className="font-medium">Metodă geometrică — probă cilindrică</p>
              <p className="text-muted-foreground text-sm">
                D și L cunoscute + masă naturală și masă uscată. Rezultă γ/ρ la umiditate naturală și uscată.
              </p>
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Diametru D (mm)</Label>
              <Input
                type="number"
                step="any"
                disabled={disabled || saving}
                value={draft.cylinder?.diameter_mm ?? ""}
                placeholder="—"
                onChange={(e) => {
                  const v = e.target.value.trim();
                  setCylinder({ diameter_mm: v === "" ? null : Number(v) });
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Lungime L (mm)</Label>
              <Input
                type="number"
                step="any"
                disabled={disabled || saving}
                value={draft.cylinder?.length_mm ?? ""}
                placeholder="—"
                onChange={(e) => {
                  const v = e.target.value.trim();
                  setCylinder({ length_mm: v === "" ? null : Number(v) });
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Masă naturală (g)</Label>
              <Input
                type="number"
                step="any"
                disabled={disabled || saving}
                value={draft.cylinder?.mass_natural_g ?? ""}
                placeholder="—"
                onChange={(e) => {
                  const v = e.target.value.trim();
                  setCylinder({ mass_natural_g: v === "" ? null : Number(v) });
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Masă uscată (g)</Label>
              <Input
                type="number"
                step="any"
                disabled={disabled || saving}
                value={draft.cylinder?.mass_dry_g ?? ""}
                placeholder="—"
                onChange={(e) => {
                  const v = e.target.value.trim();
                  setCylinder({ mass_dry_g: v === "" ? null : Number(v) });
                }}
              />
            </div>
          </div>
          {cylinderPreview ? (
            <div className="mt-3 overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Indicator</TableHead>
                    <TableHead>Valoare</TableHead>
                    <TableHead>Unitate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>Volum cilindru</TableCell>
                    <TableCell className="font-mono text-sm">{cylinderPreview.volCm3.toFixed(2)}</TableCell>
                    <TableCell>cm³</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Greutate volumică la umiditate naturală γ</TableCell>
                    <TableCell className="font-mono text-sm">{cylinderPreview.gammaNat.toFixed(2)}</TableCell>
                    <TableCell>kN/m³</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Greutate volumică uscată γ_d</TableCell>
                    <TableCell className="font-mono text-sm">{cylinderPreview.gammaDry.toFixed(2)}</TableCell>
                    <TableCell>kN/m³</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Densitatea la umiditate naturală ρ</TableCell>
                    <TableCell className="font-mono text-sm">{cylinderPreview.rhoNat.toFixed(0)}</TableCell>
                    <TableCell>kg/m³</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Densitatea uscată ρ_d</TableCell>
                    <TableCell className="font-mono text-sm">{cylinderPreview.rhoDry.toFixed(0)}</TableCell>
                    <TableCell>kg/m³</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-muted-foreground mt-2 text-sm">
              Completați D, L și masele ca să vedeți previzualizarea.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="space-y-2 lg:min-w-[280px]">
            <Label>Metodă</Label>
            <Select
              value={draft.method}
              disabled={disabled || saving}
              onValueChange={(v) =>
                setDraft((d) => ({ ...d, method: v as UnitWeightSubmergedMethod }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="paraffin_submerged">{methodLabel("paraffin_submerged")}</SelectItem>
                <SelectItem value="water_immersion">{methodLabel("water_immersion")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="uw-rho-w">ρ apă (g/cm³)</Label>
            <Input
              id="uw-rho-w"
              type="number"
              step="any"
              className="w-[140px]"
              disabled={disabled || saving}
              value={draft.water_density_g_cm3}
              onChange={(e) => {
                const n = Number(e.target.value);
                setDraft((d) => ({
                  ...d,
                  water_density_g_cm3: Number.isFinite(n) && n > 0 ? n : d.water_density_g_cm3,
                }));
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="uw-rho-p">ρ parafină (g/cm³)</Label>
            <Input
              id="uw-rho-p"
              type="number"
              step="any"
              className="w-[140px]"
              disabled={disabled || saving || draft.method !== "paraffin_submerged"}
              value={draft.paraffin_density_g_cm3}
              onChange={(e) => {
                const n = Number(e.target.value);
                setDraft((d) => ({
                  ...d,
                  paraffin_density_g_cm3: Number.isFinite(n) && n > 0 ? n : d.paraffin_density_g_cm3,
                }));
              }}
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[90px]">Probă</TableHead>
                <TableHead>Masă probă m₀ (g)</TableHead>
                {draft.method === "paraffin_submerged" ? (
                  <TableHead>Masă parafinată m₁ (g)</TableHead>
                ) : null}
                <TableHead>
                  {draft.method === "paraffin_submerged"
                    ? "Masă parafinată imersată m₂ (g)"
                    : "Masă imersată m₂ (g)"}
                </TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {draft.rows.map((row, i) => (
                <TableRow key={`${row.proba_index}-${i}`}>
                  <TableCell>
                    <Input
                      type="number"
                      step={1}
                      min={1}
                      className="h-8 w-16"
                      disabled={disabled || saving}
                      value={row.proba_index}
                      onChange={(e) => {
                        const n = Math.round(Number(e.target.value));
                        if (Number.isFinite(n) && n > 0) updateRow(i, { proba_index: n });
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="any"
                      className="h-8 min-w-[100px]"
                      disabled={disabled || saving}
                      value={row.m0_g ?? ""}
                      placeholder="—"
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        updateRow(i, { m0_g: v === "" ? null : Number(v) });
                      }}
                    />
                  </TableCell>
                  {draft.method === "paraffin_submerged" ? (
                    <TableCell>
                      <Input
                        type="number"
                        step="any"
                        className="h-8 min-w-[100px]"
                        disabled={disabled || saving}
                        value={row.m1_g ?? ""}
                        placeholder="—"
                        onChange={(e) => {
                          const v = e.target.value.trim();
                          updateRow(i, { m1_g: v === "" ? null : Number(v) });
                        }}
                      />
                    </TableCell>
                  ) : null}
                  <TableCell>
                    <Input
                      type="number"
                      step="any"
                      className="h-8 min-w-[100px]"
                      disabled={disabled || saving}
                      value={row.m2_g ?? ""}
                      placeholder="—"
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        updateRow(i, { m2_g: v === "" ? null : Number(v) });
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground size-8"
                      disabled={disabled || saving || draft.rows.length <= 1}
                      onClick={() => removeRow(i)}
                      aria-label="Elimină rând"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-1.5"
            disabled={disabled || saving}
            onClick={addRow}
          >
            <Plus className="size-4" />
            Adaugă probă
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled || saving} onClick={resetDefaults}>
            Reset 3 rânduri goale
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={disabled || saving}
            onClick={() => void save()}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {saving ? "Se salvează…" : "Salvează datele"}
          </Button>
        </div>

        <div className="bg-muted/30 space-y-4 rounded-lg border p-4">
          <div>
            <h3 className="text-foreground mb-1 text-sm font-semibold">Umiditate gravimetrică (opțional)</h3>
            <p className="text-muted-foreground text-xs leading-relaxed">
              <strong>m₁</strong> = probă <strong>umedă</strong> (înainte de uscare);{" "}
              <strong>m₂</strong> = aceeași probă <strong>uscată</strong> după uscare la etuvă.{" "}
              <strong>Cu farfurie:</strong> m₀ = farfurie goală; cântăriți m₁ și m₂ pe farfurie (farfurie + probă).{" "}
              <strong>Fără farfurie:</strong> mase directe ale probei (fără m₀). Formula:{" "}
              <span className="font-mono">w = (m₁ − m₂) / m_uscat × 100%</span>
              {mg.with_dish ? (
                <>
                  {" "}
                  cu <span className="font-mono">m_uscat = m₂ − m₀</span>.
                </>
              ) : (
                <>
                  {" "}
                  cu <span className="font-mono">m_uscat = m₂</span>.
                </>
              )}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Label className="text-sm">Mod cântărire</Label>
            <Select
              value={mg.with_dish ? "dish" : "nodish"}
              disabled={disabled || saving}
              onValueChange={(v) =>
                setMoisture({
                  with_dish: v === "dish",
                  m_dish_g: v === "dish" ? mg.m_dish_g : null,
                })
              }
            >
              <SelectTrigger className="w-full sm:w-[280px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dish">Cu farfurie (m₀ + m₁ + m₂)</SelectItem>
                <SelectItem value="nodish">Fără farfurie (doar m₁ și m₂, probă directă)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mg.with_dish ? (
              <div className="space-y-1.5">
                <Label htmlFor="mo-m0">m₀ — farfurie goală (g)</Label>
                <Input
                  id="mo-m0"
                  type="number"
                  step="any"
                  disabled={disabled || saving}
                  value={mg.m_dish_g ?? ""}
                  placeholder="ex. 32,15"
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    setMoisture({ m_dish_g: v === "" ? null : Number(v.replace(",", ".")) });
                  }}
                />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="mo-m1">m₁ — probă umedă (g)</Label>
              <Input
                id="mo-m1"
                type="number"
                step="any"
                disabled={disabled || saving}
                value={mg.m_wet_g ?? ""}
                placeholder="ex. 125,40"
                onChange={(e) => {
                  const v = e.target.value.trim();
                  setMoisture({ m_wet_g: v === "" ? null : Number(v.replace(",", ".")) });
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mo-m2">m₂ — probă uscată după uscare (g)</Label>
              <Input
                id="mo-m2"
                type="number"
                step="any"
                disabled={disabled || saving}
                value={mg.m_dry_g ?? ""}
                placeholder="ex. 118,05"
                onChange={(e) => {
                  const v = e.target.value.trim();
                  setMoisture({ m_dry_g: v === "" ? null : Number(v.replace(",", ".")) });
                }}
              />
            </div>
          </div>
          {moisturePreview != null ? (
            <p className="text-sm">
              <span className="text-muted-foreground">Previzualizare: </span>
              <span className="font-medium">w ≈ {moisturePreview} %</span>
              <span className="text-muted-foreground"> (după „Salvează” + „Rulează calcule” se scriu rezultatele)</span>
            </p>
          ) : null}
          <p className="text-muted-foreground text-xs leading-relaxed">
            După <strong>Calcule</strong>: apare <strong>γ uscată γ_d = γ aparentă / (1+w)</strong> (lângă γ aparentă pe
            probă), dacă aveți rânduri submersă complete și w valid. La testele ISO (ex. compresiune monoaxială), w și
            γ<sub>d</sub> pot fi propagate automat în raport când câmpurile corespunzătoare sunt goale.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
