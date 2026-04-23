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
  clampPointLoadReportMetadataForStorage,
  parsePointLoadReportMetadata,
} from "@/lib/point-load-report-metadata";
import { clampUcsReportMetadataForStorage, parseUcsReportMetadata } from "@/lib/ucs-report-metadata";
import type { TestRow } from "@/types/lab";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { LabOperatorSelect } from "./lab-operator-select";

function joinInline(...parts: (string | null | undefined)[]): string {
  return parts
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean)
    .join("; ");
}

/** Echipamente point load — acum un singur model; la al doilea aparat, adăugați o intrare. */
const POINT_LOAD_DEVICE_OPTIONS = [
  "Presă Point Load Controls, Model 45-D0550",
] as const;

function isPltDeviceOption(v: string): boolean {
  return (POINT_LOAD_DEVICE_OPTIONS as readonly string[]).includes(v);
}

const POINT_LOAD_MOISTURE_OPTIONS = ["Umiditate naturală", "Uscată (etuvă)"] as const;

function isPltMoistureOption(v: string): boolean {
  return (POINT_LOAD_MOISTURE_OPTIONS as readonly string[]).includes(v);
}

type Draft = {
  test_date: string;
  operator_name: string;
  device_name: string;
  sample_moisture: string;
  loading_vs_weakness_note: string;
};

function draftFromTest(test: TestRow): Draft {
  const u = parseUcsReportMetadata(test.ucs_report_metadata_json);
  const p = parsePointLoadReportMetadata(test.point_load_report_metadata_json);
  const rawDevice = (test.device_name ?? "").trim();
  const defaultDevice = POINT_LOAD_DEVICE_OPTIONS[0];
  return {
    test_date: test.test_date ? String(test.test_date).slice(0, 10) : "",
    operator_name: test.operator_name ?? "",
    device_name: rawDevice || defaultDevice,
    sample_moisture: joinInline(u.sample_moisture, p.moisture_condition_detail),
    loading_vs_weakness_note: joinInline(p.loading_vs_weakness_note, u.direction_vs_structure),
  };
}

export function PltReportFieldsCard(props: {
  testId: string;
  test: TestRow;
  disabled: boolean;
  onSaved: () => void;
  onMessage: (msg: string | null) => void;
}) {
  const { testId, test, disabled, onSaved, onMessage } = props;
  const [draft, setDraft] = useState<Draft>(() => draftFromTest(test));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(draftFromTest(test));
  }, [
    test.id,
    test.test_date,
    test.operator_name,
    test.device_name,
    test.ucs_report_metadata_json,
    test.point_load_report_metadata_json,
  ]);

  const save = useCallback(async () => {
    setSaving(true);
    onMessage(null);
    try {
      const loadNote = draft.loading_vs_weakness_note.trim() || null;

      const ucs_report_metadata_json = clampUcsReportMetadataForStorage({
        sample_moisture: draft.sample_moisture.trim() || null,
        direction_vs_structure: loadNote,
      });

      const plBase: Record<string, unknown> =
        test.point_load_report_metadata_json != null &&
        typeof test.point_load_report_metadata_json === "object"
          ? { ...(test.point_load_report_metadata_json as Record<string, unknown>) }
          : {};
      const plPatch: Record<string, unknown> = {
        sample_source: null,
        sampling_method: null,
        storage_conditions: null,
        structural_features: null,
        discontinuity_orientation: null,
        moisture_condition_detail: null,
        water_content_percent: null,
        loading_vs_weakness_note: loadNote,
        n_specimens_tested: null,
        specimen_preparation: null,
        statistics_note: null,
        ia50_anisotropy: null,
        anisotropy_directions_detail: null,
        failure_type: null,
        crack_location: null,
        test_validity: null,
        supplementary_notes: null,
        charts_nomograms_note: null,
      };
      for (const [k, v] of Object.entries(plPatch)) {
        if (v === null || v === "") delete plBase[k];
        else plBase[k] = v;
      }
      const point_load_report_metadata_json = clampPointLoadReportMetadataForStorage(plBase);

      const res = await fetch(`/api/tests/${testId}`, {
        method: "PATCH",
        headers: jsonLabHeaders(),
        body: JSON.stringify({
          test_date: draft.test_date.trim() ? draft.test_date.trim() : null,
          operator_name: draft.operator_name.trim() || null,
          device_name: draft.device_name.trim() || null,
          ucs_report_metadata_json,
          point_load_report_metadata_json,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (res.status === 423) throw new Error(json.error ?? "Test blocat.");
      if (!res.ok) throw new Error(json.error ?? "Salvare eșuată");
      onMessage("Date raport point load salvate.");
      onSaved();
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Eroare");
    } finally {
      setSaving(false);
    }
  }, [draft, onMessage, onSaved, test, testId]);

  const field = (
    id: string,
    label: string,
    value: string,
    on: (v: string) => void,
    rows = 1,
    placeholder?: string,
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {rows > 1 ? (
        <Textarea
          id={id}
          disabled={disabled}
          rows={rows}
          value={value}
          placeholder={placeholder}
          onChange={(e) => on(e.target.value)}
          className="min-h-[4rem]"
        />
      ) : (
        <Input
          id={id}
          disabled={disabled}
          value={value}
          placeholder={placeholder}
          onChange={(e) => on(e.target.value)}
        />
      )}
    </div>
  );

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Date pentru raport PDF (Point load, ASTM D5731)</CardTitle>
        <CardDescription>
          Date minime pentru antet și secțiunile rămase din raport; restul rubricilor au fost scoase din formular.
        </CardDescription>
      </CardHeader>
      <CardContent className="max-w-3xl space-y-6">
        <div>
          <p className="text-muted-foreground mb-3 text-xs font-medium uppercase tracking-wide">
            Execuție test și condiții generale
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="plt-rep-date">Data testului</Label>
              <Input
                id="plt-rep-date"
                type="date"
                disabled={disabled}
                value={draft.test_date}
                title="Selectați data testării"
                onChange={(e) => setDraft((d) => ({ ...d, test_date: e.target.value }))}
              />
            </div>
            <LabOperatorSelect
              id="plt-rep-op"
              disabled={disabled}
              value={draft.operator_name}
              onValueChange={(v) => setDraft((d) => ({ ...d, operator_name: v }))}
            />
            <div className="space-y-1.5">
              <Label htmlFor="plt-rep-dev">Echipament</Label>
              <Select
                value={draft.device_name}
                disabled={disabled}
                onValueChange={(v) => setDraft((d) => ({ ...d, device_name: v ?? "" }))}
              >
                <SelectTrigger id="plt-rep-dev" className="w-full">
                  <SelectValue placeholder="Selectați echipamentul" />
                </SelectTrigger>
                <SelectContent align="start" side="bottom" sideOffset={6} className="z-[200]">
                  {POINT_LOAD_DEVICE_OPTIONS.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                  {draft.device_name.trim() !== "" && !isPltDeviceOption(draft.device_name) ? (
                    <SelectItem value={draft.device_name}>{draft.device_name} (din date vechi)</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="plt-moist">Stare și detalii umiditate</Label>
              <Select
                value={draft.sample_moisture}
                disabled={disabled}
                onValueChange={(v) => setDraft((d) => ({ ...d, sample_moisture: v ?? "" }))}
              >
                <SelectTrigger id="plt-moist" className="w-full">
                  <SelectValue placeholder="Selectați starea probei" />
                </SelectTrigger>
                <SelectContent align="start" side="bottom" sideOffset={6} className="z-[200]">
                  <SelectItem value="">— Selectați —</SelectItem>
                  {POINT_LOAD_MOISTURE_OPTIONS.map((label) => (
                    <SelectItem key={label} value={label}>
                      {label}
                    </SelectItem>
                  ))}
                  {draft.sample_moisture.trim() !== "" && !isPltMoistureOption(draft.sample_moisture) ? (
                    <SelectItem value={draft.sample_moisture}>{draft.sample_moisture} (din date vechi)</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            </div>
            {field(
              "plt-load-weak",
              "Încărcare față de structură / foliație / șistozitate",
              draft.loading_vs_weakness_note,
              (v) => setDraft((d) => ({ ...d, loading_vs_weakness_note: v })),
              2,
              "ex. Sarcină ⊥ pe șistozitate (T); detalii față de codul 0/1 din măsurători",
            )}
          </div>
        </div>

        <Button type="button" disabled={disabled || saving} onClick={() => void save()}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          Salvează date raport
        </Button>
      </CardContent>
    </Card>
  );
}
