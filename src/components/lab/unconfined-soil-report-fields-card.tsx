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
import { Textarea } from "@/components/ui/textarea";
import { jsonLabHeaders } from "@/lib/lab-client-user";
import {
  isUnconfinedSoilDeviceOption,
  UNCONFINED_SOIL_DEVICE_OPTIONS,
} from "@/lib/unconfined-soil-device-options";
import {
  isUnconfinedSoilSampleSelectionMethodOption,
  UNCONFINED_SOIL_SAMPLE_SELECTION_METHOD_OPTIONS,
} from "@/lib/unconfined-soil-sample-selection-options";
import {
  clampUnconfinedSoilReportMetadataForStorage,
  parseUnconfinedSoilReportMetadata,
} from "@/lib/unconfined-soil-report-metadata";
import type { UnconfinedSoilCurvePayload } from "@/lib/unconfined-soil-curve";
import { estimateUnconfinedSoilLoadingRatesFromCurve } from "@/lib/unconfined-soil-loading-rate-from-curve";
import {
  buildIso14688VisualDescription,
  emptyVisualDescriptionPicks,
  US_VISUAL_COLOR_OPTIONS,
  US_VISUAL_CONSISTENCY_OPTIONS,
  US_VISUAL_INCLUSIONS_OPTIONS,
  US_VISUAL_MATERIAL_OPTIONS,
  US_VISUAL_MOISTURE_OPTIONS,
  US_VISUAL_STRUCTURE_OPTIONS,
  type VisualDescriptionPicks,
} from "@/lib/unconfined-soil-visual-description-builder";
import {
  PRESET_COARSE_1_10,
  PRESET_COARSE_1_6,
  PRESET_DEVIATIONS,
  PRESET_FAILURE_DOC,
  PRESET_FAILURE_MODE,
  PRESET_SPECIMEN_PROCEDURE,
} from "@/lib/unconfined-soil-report-field-presets";
import type { TestRow } from "@/types/lab";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LabOperatorSelect } from "./lab-operator-select";
import { ReportTextPresetBlock } from "./report-text-preset-block";

type Draft = {
  test_date: string;
  operator_name: string;
  device_name: string;
  specimen_depth_in_sample_note: string;
  sample_selection_method: string;
  compression_rate: string;
  compression_rate_strain_pct_per_min: string;
  time_to_failure: string;
  failure_mode_description: string;
  sample_moisture: string;
  visual_description: string;
  coarse_particle_note_1_10_d: string;
  coarse_particle_note_1_6_d: string;
  specimen_type_procedure: string;
  deviations: string;
  failure_documentation: string;
  manual_dry_unit_weight_kn_m3: string;
};

function draftFromTest(test: TestRow): Draft {
  const m = parseUnconfinedSoilReportMetadata(test.unconfined_soil_report_metadata_json);
  const rawDevice = (test.device_name ?? "").trim();
  const defaultDevice = UNCONFINED_SOIL_DEVICE_OPTIONS[0];
  return {
    test_date: test.test_date ? String(test.test_date).slice(0, 10) : "",
    operator_name: test.operator_name ?? "",
    device_name: rawDevice || defaultDevice,
    specimen_depth_in_sample_note: m.specimen_depth_in_sample_note ?? "",
    sample_selection_method: m.sample_selection_method ?? "",
    compression_rate: m.compression_rate ?? "",
    compression_rate_strain_pct_per_min: m.compression_rate_strain_pct_per_min ?? "",
    time_to_failure: m.time_to_failure ?? "",
    failure_mode_description: m.failure_mode_description ?? "",
    sample_moisture: m.sample_moisture ?? "",
    visual_description: m.visual_description ?? "",
    coarse_particle_note_1_10_d: m.coarse_particle_note_1_10_d ?? "",
    coarse_particle_note_1_6_d: m.coarse_particle_note_1_6_d ?? "",
    specimen_type_procedure: m.specimen_type_procedure ?? "",
    deviations: m.deviations ?? "",
    failure_documentation: m.failure_documentation ?? "",
    manual_dry_unit_weight_kn_m3:
      m.manual_dry_unit_weight_kn_m3 != null && Number.isFinite(m.manual_dry_unit_weight_kn_m3)
        ? String(m.manual_dry_unit_weight_kn_m3)
        : "",
  };
}

export function UnconfinedSoilReportFieldsCard(props: {
  testId: string;
  test: TestRow;
  disabled: boolean;
  onSaved: () => void;
  onMessage: (msg: string | null) => void;
  /** Curbă instrumentată (din test); pentru estimare rată încărcare. */
  curveForRateEstimate?: UnconfinedSoilCurvePayload | null;
  /** H₀ din măsurători; pentru ε̇ din curbă. */
  heightMmForRateEstimate?: number | null;
}) {
  const {
    testId,
    test,
    disabled,
    onSaved,
    onMessage,
    curveForRateEstimate = null,
    heightMmForRateEstimate = null,
  } = props;
  const [draft, setDraft] = useState<Draft>(() => draftFromTest(test));
  const [saving, setSaving] = useState(false);
  const [visualPicks, setVisualPicks] = useState<VisualDescriptionPicks>(() => emptyVisualDescriptionPicks());

  useEffect(() => {
    setDraft(draftFromTest(test));
  }, [test]);

  useEffect(() => {
    setVisualPicks(emptyVisualDescriptionPicks());
  }, [test.id]);

  const visualGender = useMemo(() => {
    const m = US_VISUAL_MATERIAL_OPTIONS.find((o) => o.value === visualPicks.material);
    return m?.gender ?? "m";
  }, [visualPicks.material]);

  const applyVisualDescriptionFromPicks = useCallback(() => {
    const built = buildIso14688VisualDescription(visualPicks);
    if (!built) {
      onMessage("Selectați tipul materialului pentru descrierea din liste.");
      return;
    }
    setDraft((d) => ({ ...d, visual_description: built }));
    onMessage("Descriere vizuală generată din liste — o puteți ajusta în caseta de mai jos.");
  }, [onMessage, visualPicks]);

  const fillRatesFromCurve = useCallback(() => {
    const pts = curveForRateEstimate?.points ?? [];
    if (pts.length < 2) {
      onMessage("Importați mai întâi curba (mod instrumentat), cu coloană de timp.");
      return;
    }
    const h = heightMmForRateEstimate;
    const est = estimateUnconfinedSoilLoadingRatesFromCurve(pts, h ?? NaN);
    if (!est.ok || !est.compression_rate_line || !est.strain_pct_per_min_line) {
      onMessage(est.messages.join(" "));
      return;
    }
    setDraft((d) => ({
      ...d,
      compression_rate: est.compression_rate_line ?? "",
      compression_rate_strain_pct_per_min: est.strain_pct_per_min_line ?? "",
    }));
    onMessage(est.messages.join(" "));
  }, [curveForRateEstimate, heightMmForRateEstimate, onMessage]);

  const save = useCallback(async () => {
    setSaving(true);
    onMessage(null);
    try {
      const manualStr = draft.manual_dry_unit_weight_kn_m3.trim();
      if (manualStr !== "") {
        const n = Number(manualStr.replace(",", "."));
        if (!Number.isFinite(n) || n <= 0) {
          onMessage("γ manuală: introduceți un număr pozitiv sau lăsați câmpul gol.");
          setSaving(false);
          return;
        }
      }
      const metaRaw: Record<string, unknown> = {
        specimen_depth_in_sample_note: draft.specimen_depth_in_sample_note.trim() || null,
        sample_selection_method: draft.sample_selection_method.trim() || null,
        compression_rate: draft.compression_rate.trim() || null,
        compression_rate_strain_pct_per_min: draft.compression_rate_strain_pct_per_min.trim() || null,
        time_to_failure: draft.time_to_failure.trim() || null,
        failure_mode_description: draft.failure_mode_description.trim() || null,
        sample_moisture: draft.sample_moisture.trim() || null,
        visual_description: draft.visual_description.trim() || null,
        coarse_particle_note_1_10_d: draft.coarse_particle_note_1_10_d.trim() || null,
        coarse_particle_note_1_6_d: draft.coarse_particle_note_1_6_d.trim() || null,
        specimen_type_procedure: draft.specimen_type_procedure.trim() || null,
        deviations: draft.deviations.trim() || null,
        failure_documentation: draft.failure_documentation.trim() || null,
      };
      if (manualStr !== "") {
        metaRaw.manual_dry_unit_weight_kn_m3 = Number(manualStr.replace(",", "."));
      }
      const meta = clampUnconfinedSoilReportMetadataForStorage(metaRaw);
      const res = await fetch(`/api/tests/${testId}`, {
        method: "PATCH",
        headers: jsonLabHeaders(),
        body: JSON.stringify({
          test_date: draft.test_date.trim() || null,
          operator_name: draft.operator_name.trim() || null,
          device_name: draft.device_name.trim() || null,
          unconfined_soil_report_metadata_json: meta,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Salvare eșuată");
      onMessage("Date raport salvate.");
      onSaved();
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Eroare");
    } finally {
      setSaving(false);
    }
  }, [draft, onMessage, onSaved, testId]);

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Date pentru raport PDF (ISO 17892-7)</CardTitle>
        <CardDescription className="text-xs">
          Condiții de încercare, descriere probă, abateri. Umiditatea poate fi completată manual sau din calcule
          gravimetrice (submersă).
        </CardDescription>
      </CardHeader>
      <CardContent className="grid max-w-3xl gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Data încercării</Label>
          <Input
            type="date"
            value={draft.test_date}
            disabled={disabled}
            onChange={(e) => setDraft((d) => ({ ...d, test_date: e.target.value }))}
          />
        </div>
        <LabOperatorSelect
          id="us-rep-op"
          disabled={disabled}
          value={draft.operator_name}
          onValueChange={(v) => setDraft((d) => ({ ...d, operator_name: v }))}
        />
        <div className="space-y-1.5">
          <Label htmlFor="us-rep-dev">Echipament</Label>
          <Select
            value={draft.device_name}
            disabled={disabled}
            onValueChange={(v) => setDraft((d) => ({ ...d, device_name: v ?? "" }))}
          >
            <SelectTrigger id="us-rep-dev" className="w-full">
              <SelectValue placeholder="Selectați echipamentul" />
            </SelectTrigger>
            <SelectContent align="start" side="bottom" sideOffset={6} className="z-[200]">
              {UNCONFINED_SOIL_DEVICE_OPTIONS.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
              {draft.device_name.trim() !== "" && !isUnconfinedSoilDeviceOption(draft.device_name) ? (
                <SelectItem value={draft.device_name}>{draft.device_name} (din date vechi)</SelectItem>
              ) : null}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Detalii adâncime probă în eșantion (raport §8.1 a)</Label>
          <Input
            placeholder="ex. poziție în tub, secțiune, strat; dacă e relevant"
            value={draft.specimen_depth_in_sample_note}
            disabled={disabled}
            onChange={(e) => setDraft((d) => ({ ...d, specimen_depth_in_sample_note: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Metodă selecție probă (raport §8.1 a)</Label>
          <Select
            value={draft.sample_selection_method}
            disabled={disabled}
            onValueChange={(v) => setDraft((d) => ({ ...d, sample_selection_method: v ?? "" }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selectați metoda" />
            </SelectTrigger>
            <SelectContent align="start" side="bottom" sideOffset={6} className="z-[200]">
              {UNCONFINED_SOIL_SAMPLE_SELECTION_METHOD_OPTIONS.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
              {draft.sample_selection_method.trim() !== "" &&
              !isUnconfinedSoilSampleSelectionMethodOption(draft.sample_selection_method) ? (
                <SelectItem value={draft.sample_selection_method}>
                  {draft.sample_selection_method} (din date vechi)
                </SelectItem>
              ) : null}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Viteza de forfecare (mm/min) (raport §8.1 h)</Label>
          <Input
            placeholder="ex. 0,82 mm/min"
            value={draft.compression_rate}
            disabled={disabled}
            onChange={(e) => setDraft((d) => ({ ...d, compression_rate: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Rată compresie (% torsiune/min) (opțional, raport §8.1 h)</Label>
          <Input
            placeholder="ex. 1,5 %/min (2 cifre semnificative)"
            value={draft.compression_rate_strain_pct_per_min}
            disabled={disabled}
            onChange={(e) =>
              setDraft((d) => ({ ...d, compression_rate_strain_pct_per_min: e.target.value }))
            }
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled || saving || (curveForRateEstimate?.points?.length ?? 0) < 2}
            onClick={() => fillRatesFromCurve()}
          >
            Estimează din curbă
          </Button>
          <p className="text-muted-foreground text-xs">
            Folosește primul și ultimul punct cu timp (sec) din curbă și H₀ din Măsurători. Nu parsează automat
            text liber; completarea manuală rămâne posibilă.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Timp până la rupere</Label>
          <Input
            value={draft.time_to_failure}
            disabled={disabled}
            onChange={(e) => setDraft((d) => ({ ...d, time_to_failure: e.target.value }))}
          />
          <p className="text-muted-foreground text-xs">
            La import curbă Uniframe (cu timp) sau la <strong>Calcule</strong>, timpul la q<sub>u</sub> maxim se
            completează automat dacă câmpul e gol și există H₀ / geometrie pentru curbă.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>γ uscată manuală (kN/m³)</Label>
          <Input
            value={draft.manual_dry_unit_weight_kn_m3}
            disabled={disabled}
            onChange={(e) => setDraft((d) => ({ ...d, manual_dry_unit_weight_kn_m3: e.target.value }))}
          />
          <p className="text-muted-foreground text-xs">
            Lăsați gol pentru a folosi γ<sub>d</sub> calculată din γ aparentă (submersă) și w din tabul{" "}
            <strong>Greutate volumică</strong> după <strong>Calcule</strong> (se scrie automat în metadata dacă nu
            introduceți manual).
          </p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Umiditate probă (text)</Label>
          <Input
            value={draft.sample_moisture}
            disabled={disabled}
            onChange={(e) => setDraft((d) => ({ ...d, sample_moisture: e.target.value }))}
          />
          <p className="text-muted-foreground text-xs">
            Dacă completați umiditatea gravimetrică în tabul <strong>Greutate volumică</strong> și rulați{" "}
            <strong>Calcule</strong>, câmpul gol poate fi completat automat cu w (gravimetric).
          </p>
        </div>
        <div className="space-y-3 sm:col-span-2">
          <Label>Descriere vizuală (ISO 14688-1)</Label>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Selectați caracteristicile (ca în ghidul de probă); apoi <strong>Aplică în descriere</strong>. Textul
            rămâne editabil în caseta de dedesubt.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tip material</Label>
              <Select
                value={visualPicks.material || "__none__"}
                disabled={disabled}
                onValueChange={(v) =>
                  setVisualPicks((p) => ({
                    ...p,
                    material: v === "__none__" ? "" : (v as VisualDescriptionPicks["material"]),
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Alegeți" />
                </SelectTrigger>
                <SelectContent className="z-[200]" align="start" sideOffset={6}>
                  <SelectItem value="__none__">— Alegeți —</SelectItem>
                  {US_VISUAL_MATERIAL_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Culoare</Label>
              <Select
                value={visualPicks.color || "__none__"}
                disabled={disabled || !visualPicks.material}
                onValueChange={(v) =>
                  setVisualPicks((p) => ({ ...p, color: v && v !== "__none__" ? v : "" }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Alegeți" />
                </SelectTrigger>
                <SelectContent className="z-[200]" align="start" sideOffset={6}>
                  <SelectItem value="__none__">— Opțional —</SelectItem>
                  {US_VISUAL_COLOR_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {visualGender === "f" ? o.f : o.m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Consistență</Label>
              <Select
                value={visualPicks.consistency || "__none__"}
                disabled={disabled || !visualPicks.material}
                onValueChange={(v) =>
                  setVisualPicks((p) => ({ ...p, consistency: v && v !== "__none__" ? v : "" }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Alegeți" />
                </SelectTrigger>
                <SelectContent className="z-[200]" align="start" sideOffset={6}>
                  <SelectItem value="__none__">— Opțional —</SelectItem>
                  {US_VISUAL_CONSISTENCY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {visualGender === "f" ? o.f : o.m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Umiditate (aspect)</Label>
              <Select
                value={visualPicks.moisture || "__none__"}
                disabled={disabled || !visualPicks.material}
                onValueChange={(v) =>
                  setVisualPicks((p) => ({ ...p, moisture: v && v !== "__none__" ? v : "" }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Alegeți" />
                </SelectTrigger>
                <SelectContent className="z-[200]" align="start" sideOffset={6}>
                  <SelectItem value="__none__">— Opțional —</SelectItem>
                  {US_VISUAL_MOISTURE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {visualGender === "f" ? o.f : o.m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Structură</Label>
              <Select
                value={visualPicks.structure || "__none__"}
                disabled={disabled || !visualPicks.material}
                onValueChange={(v) =>
                  setVisualPicks((p) => ({ ...p, structure: v && v !== "__none__" ? v : "" }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Alegeți" />
                </SelectTrigger>
                <SelectContent className="z-[200]" align="start" sideOffset={6}>
                  <SelectItem value="__none__">— Opțional —</SelectItem>
                  {US_VISUAL_STRUCTURE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {visualGender === "f" ? o.f : o.m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Incluziuni (opțional)</Label>
              <Select
                value={visualPicks.inclusions || "none"}
                disabled={disabled || !visualPicks.material}
                onValueChange={(v) => setVisualPicks((p) => ({ ...p, inclusions: v ?? "none" }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Alegeți" />
                </SelectTrigger>
                <SelectContent className="z-[200]" align="start" sideOffset={6}>
                  {US_VISUAL_INCLUSIONS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled || !visualPicks.material}
            onClick={() => applyVisualDescriptionFromPicks()}
          >
            Aplică în descriere
          </Button>
          <Textarea
            rows={3}
            placeholder="Text final pentru raport (ISO 14688-1)…"
            value={draft.visual_description}
            disabled={disabled}
            onChange={(e) => setDraft((d) => ({ ...d, visual_description: e.target.value }))}
          />
        </div>
        <ReportTextPresetBlock
          label={
            <>
              Particule grosiere {" > "} 1/10 din diametru (raport §8.1 b)
            </>
          }
          presets={PRESET_COARSE_1_10}
          value={draft.coarse_particle_note_1_10_d}
          onChange={(v) => setDraft((d) => ({ ...d, coarse_particle_note_1_10_d: v }))}
          disabled={disabled}
          placeholder="Observații despre particule mari (dacă există)."
        />
        <ReportTextPresetBlock
          label={
            <>
              Notă particule {" > "} 1/6 din diametru (posibil efect asupra rezultatului) (raport §8.1 b)
            </>
          }
          presets={PRESET_COARSE_1_6}
          value={draft.coarse_particle_note_1_6_d}
          onChange={(v) => setDraft((d) => ({ ...d, coarse_particle_note_1_6_d: v }))}
          disabled={disabled}
          placeholder="Dacă există particule > 1/6 D, notați dacă rezultatul poate fi afectat."
        />
        <ReportTextPresetBlock
          label="Tip probă / procedură preparare"
          presets={PRESET_SPECIMEN_PROCEDURE}
          value={draft.specimen_type_procedure}
          onChange={(v) => setDraft((d) => ({ ...d, specimen_type_procedure: v }))}
          disabled={disabled}
          placeholder="Descriere probă / mod de preparare…"
        />
        <ReportTextPresetBlock
          label="Mod eșec / observații"
          presets={PRESET_FAILURE_MODE}
          value={draft.failure_mode_description}
          onChange={(v) => setDraft((d) => ({ ...d, failure_mode_description: v }))}
          disabled={disabled}
          placeholder="Descriere mod de rupere / observații la încărcare…"
        />
        <ReportTextPresetBlock
          label="Documentare eșec (schiță / fotografie) (raport §8.1 k)"
          presets={PRESET_FAILURE_DOC}
          value={draft.failure_documentation}
          onChange={(v) => setDraft((d) => ({ ...d, failure_documentation: v }))}
          disabled={disabled}
          placeholder="Notă despre schițe / fotografii pentru modul de eșec…"
          hint={
            <>
              Pentru documentare vizuală în PDF, încărcați imagini în tab <strong>POZE</strong> (înainte / după
              încercare). Dacă aveți o schiță, o puteți include ca imagine „după încercare”.
            </>
          }
        />
        <ReportTextPresetBlock
          label="Abateri de la procedură"
          presets={PRESET_DEVIATIONS}
          value={draft.deviations}
          onChange={(v) => setDraft((d) => ({ ...d, deviations: v }))}
          disabled={disabled}
          placeholder="Abateri față de SR EN ISO 17892-7 (dacă există)…"
        />
        <div className="sm:col-span-2">
          <Button type="button" size="sm" disabled={disabled || saving} onClick={() => void save()}>
            {saving ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
            Salvează date raport
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
