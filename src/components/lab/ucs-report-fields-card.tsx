"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { jsonLabHeaders } from "@/lib/lab-client-user";
import { normalizeUcsMode, parseUcsModulusSettings } from "@/lib/ucs-instrumentation";
import { clampUcsReportMetadataForStorage, parseUcsReportMetadata } from "@/lib/ucs-report-metadata";
import type { TestRow } from "@/types/lab";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LabOperatorSelect } from "./lab-operator-select";

const E_METHOD_RO: Record<string, string> = {
  tangent: "Tangentă",
  secant: "Secantă",
  loading_linear: "Regresie liniară (zonă de încărcare)",
  unloading: "Segment descărcare",
};

type Draft = {
  test_date: string;
  operator_name: string;
  device_name: string;
  loading_rate: string;
  time_to_failure: string;
  failure_mode_description: string;
  sample_moisture: string;
  direction_vs_structure: string;
  dimensional_compliance: string;
  manual_dry_unit_weight_kn_m3: string;
};

function draftFromTest(test: TestRow): Draft {
  const m = parseUcsReportMetadata(test.ucs_report_metadata_json);
  return {
    test_date: test.test_date ? String(test.test_date).slice(0, 10) : "",
    operator_name: test.operator_name ?? "",
    device_name: test.device_name ?? "",
    loading_rate: m.loading_rate ?? "",
    time_to_failure: m.time_to_failure ?? "",
    failure_mode_description: m.failure_mode_description ?? "",
    sample_moisture: m.sample_moisture ?? "",
    direction_vs_structure: m.direction_vs_structure ?? "",
    dimensional_compliance: m.dimensional_compliance ?? "",
    manual_dry_unit_weight_kn_m3:
      m.manual_dry_unit_weight_kn_m3 != null && Number.isFinite(m.manual_dry_unit_weight_kn_m3)
        ? String(m.manual_dry_unit_weight_kn_m3)
        : "",
  };
}

export function UcsReportFieldsCard(props: {
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
  ]);

  const youngMethodLabel = useMemo(() => {
    if (normalizeUcsMode(test.ucs_mode) !== "instrumented") {
      return "";
    }
    const s = parseUcsModulusSettings(test.ucs_modulus_settings_json);
    return E_METHOD_RO[s.method] ?? s.method;
  }, [test.ucs_mode, test.ucs_modulus_settings_json]);

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
        loading_rate: draft.loading_rate.trim() || null,
        time_to_failure: draft.time_to_failure.trim() || null,
        failure_mode_description: draft.failure_mode_description.trim() || null,
        sample_moisture: draft.sample_moisture.trim() || null,
        direction_vs_structure: draft.direction_vs_structure.trim() || null,
        dimensional_compliance: draft.dimensional_compliance.trim() || null,
        manual_dry_unit_weight_kn_m3:
          manualStr === "" ? null : Number(manualStr.replace(",", ".")),
      };
      const ucs_report_metadata_json = clampUcsReportMetadataForStorage(metaRaw);

      const res = await fetch(`/api/tests/${testId}`, {
        method: "PATCH",
        headers: jsonLabHeaders(),
        body: JSON.stringify({
          test_date: draft.test_date.trim() ? draft.test_date.trim() : null,
          operator_name: draft.operator_name.trim() || null,
          device_name: draft.device_name.trim() || null,
          ucs_report_metadata_json,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (res.status === 423) throw new Error(json.error ?? "Test blocat.");
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
        <CardTitle className="text-base">Date pentru raport (execuție test)</CardTitle>
        <CardDescription>
          Apare în PDF (secțiunea „Date execuție”) pentru testele UCS și Young (D7012). La import curbă cu
          coloană Time, „Timp până la rupere” poate fi completat automat. Pentru γ: lăsați gol câmpul manual ca
          să se folosească valoarea din calcule (tab „Greutate volumică” + „Rulează calcule”). Altfel în raport
          poate apărea „—”.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="rep-test-date">Data testului</Label>
            <Input
              id="rep-test-date"
              type="date"
              disabled={disabled}
              value={draft.test_date}
              onChange={(e) => setDraft((d) => ({ ...d, test_date: e.target.value }))}
            />
          </div>
          <LabOperatorSelect
            id="rep-operator"
            disabled={disabled}
            value={draft.operator_name}
            onValueChange={(v) => setDraft((d) => ({ ...d, operator_name: v }))}
          />
          <div className="space-y-1.5">
            <Label htmlFor="rep-device">Echipament</Label>
            <Input
              id="rep-device"
              disabled={disabled}
              value={draft.device_name}
              onChange={(e) => setDraft((d) => ({ ...d, device_name: e.target.value }))}
              placeholder="Presă / senzori"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rep-loading-rate">Rată de încărcare</Label>
            <Input
              id="rep-loading-rate"
              disabled={disabled}
              value={draft.loading_rate}
              onChange={(e) => setDraft((d) => ({ ...d, loading_rate: e.target.value }))}
              placeholder="ex. 0,5 MPa/s sau 30 kN/min"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rep-time-fail">Timp până la rupere</Label>
            <Input
              id="rep-time-fail"
              disabled={disabled}
              value={draft.time_to_failure}
              onChange={(e) => setDraft((d) => ({ ...d, time_to_failure: e.target.value }))}
              placeholder="ex. 120 s — la import tab presă: t la σ max (coloană Time)"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rep-moisture">Umiditate probă</Label>
            <Input
              id="rep-moisture"
              disabled={disabled}
              value={draft.sample_moisture}
              onChange={(e) => setDraft((d) => ({ ...d, sample_moisture: e.target.value }))}
              placeholder="Manual sau „Rulează calcule” după umiditate gravimetrică (tab Greutate volumică)"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="rep-direction">Direcție față de structura rocii</Label>
            <Input
              id="rep-direction"
              disabled={disabled}
              value={draft.direction_vs_structure}
              onChange={(e) => setDraft((d) => ({ ...d, direction_vs_structure: e.target.value }))}
              placeholder="ex. Încărcare ⊥ stratificație (perpendicular pe planul de șistozitate)"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rep-gamma-manual">γ uscată manuală (kN/m³)</Label>
            <Input
              id="rep-gamma-manual"
              type="text"
              inputMode="decimal"
              disabled={disabled}
              value={draft.manual_dry_unit_weight_kn_m3}
              onChange={(e) => setDraft((d) => ({ ...d, manual_dry_unit_weight_kn_m3: e.target.value }))}
              placeholder="Gol = folosește calculele"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <Label htmlFor="rep-failure-mode">Descriere mod de rupere</Label>
            <Textarea
              id="rep-failure-mode"
              disabled={disabled}
              rows={2}
              value={draft.failure_mode_description}
              onChange={(e) => setDraft((d) => ({ ...d, failure_mode_description: e.target.value }))}
              placeholder="ex. Rupere în con, unghi ~55°; fisură principală prin mijlocul probei; fragmente multiple la baza"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <Label htmlFor="rep-dim-compliance">Declarație conformitate dimensională</Label>
            <Textarea
              id="rep-dim-compliance"
              disabled={disabled}
              rows={2}
              value={draft.dimensional_compliance}
              onChange={(e) => setDraft((d) => ({ ...d, dimensional_compliance: e.target.value }))}
              placeholder="ex. Proba respectă L/D și planaritate conform procedurii / SR EN 1458-1; abateri în limitele toleranțelor laboratorului"
            />
          </div>
        </div>

        {test.test_type === "ucs" && normalizeUcsMode(test.ucs_mode) === "instrumented" ? (
          <div className="bg-muted/50 rounded-md border px-3 py-2 text-sm">
            <span className="text-muted-foreground">Metodă calcul E (modul UCS instrumentat): </span>
            <span className="font-medium">{youngMethodLabel || "—"}</span>
          </div>
        ) : null}

        <Button type="button" disabled={disabled || saving} onClick={() => void save()}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          Salvează date raport
        </Button>
      </CardContent>
    </Card>
  );
}
