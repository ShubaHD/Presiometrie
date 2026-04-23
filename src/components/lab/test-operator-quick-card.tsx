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
import { jsonLabHeaders } from "@/lib/lab-client-user";
import {
  isUnconfinedSoilDeviceOption,
  UNCONFINED_SOIL_DEVICE_OPTIONS,
} from "@/lib/unconfined-soil-device-options";
import type { TestRow } from "@/types/lab";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { LabOperatorSelect } from "./lab-operator-select";

function quickDeviceInitialValue(test: TestRow): string {
  const raw = (test.device_name ?? "").trim();
  if (test.test_type !== "unconfined_soil") return raw;
  const preset = UNCONFINED_SOIL_DEVICE_OPTIONS[0];
  return raw || preset;
}

export function TestOperatorQuickCard(props: {
  testId: string;
  test: TestRow;
  disabled: boolean;
  onSaved: () => void;
  onMessage: (msg: string | null) => void;
}) {
  const { testId, test, disabled, onSaved, onMessage } = props;
  const [operator, setOperator] = useState<string>(test.operator_name ?? "");
  const [device, setDevice] = useState<string>(() => quickDeviceInitialValue(test));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOperator(test.operator_name ?? "");
    setDevice(quickDeviceInitialValue(test));
  }, [test]);

  const save = useCallback(async () => {
    setSaving(true);
    onMessage(null);
    try {
      const res = await fetch(`/api/tests/${testId}`, {
        method: "PATCH",
        headers: jsonLabHeaders(),
        body: JSON.stringify({
          operator_name: operator.trim() || null,
          device_name: device.trim() || null,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (res.status === 423) throw new Error(json.error ?? "Test blocat.");
      if (!res.ok) throw new Error(json.error ?? "Salvare eșuată");
      onMessage("Operator / echipament salvați.");
      onSaved();
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Eroare");
    } finally {
      setSaving(false);
    }
  }, [device, onMessage, onSaved, operator, testId]);

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Operator (raport / antet)</CardTitle>
        <CardDescription className="text-xs">
          Aceleași opțiuni ca la Point load. Se salvează pe rândul testului (<code className="text-xs">operator_name</code>
          , <code className="text-xs">device_name</code>) și se folosesc la semnături automate.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid max-w-3xl gap-3 sm:grid-cols-2">
        <LabOperatorSelect id="quick-op" disabled={disabled || saving} value={operator} onValueChange={setOperator} />
        <div className="space-y-1.5">
          <Label htmlFor="quick-dev">Echipament (opțional)</Label>
          {test.test_type === "unconfined_soil" ? (
            <Select value={device} disabled={disabled || saving} onValueChange={(v) => setDevice(v ?? "")}>
              <SelectTrigger id="quick-dev" className="w-full">
                <SelectValue placeholder="Selectați echipamentul" />
              </SelectTrigger>
              <SelectContent align="start" side="bottom" sideOffset={6} className="z-[200]">
                {UNCONFINED_SOIL_DEVICE_OPTIONS.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
                {device.trim() !== "" && !isUnconfinedSoilDeviceOption(device) ? (
                  <SelectItem value={device}>{device} (din date vechi)</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id="quick-dev"
              disabled={disabled || saving}
              value={device}
              onChange={(e) => setDevice(e.target.value)}
              placeholder="Presă / aparat"
            />
          )}
        </div>
        <div className="sm:col-span-2">
          <Button type="button" variant="secondary" disabled={disabled || saving} onClick={() => void save()}>
            {saving ? (
              <>
                <Loader2 className="mr-2 inline size-4 animate-spin" /> Se salvează…
              </>
            ) : (
              "Salvează operator / echipament"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
