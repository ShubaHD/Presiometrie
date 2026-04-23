"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { PresetLine } from "@/lib/unconfined-soil-report-field-presets";
import { presetIdForText, presetLabel, presetTextById } from "@/lib/unconfined-soil-report-field-presets";
import { useMemo, type ReactNode } from "react";

export function ReportTextPresetBlock(props: {
  label: ReactNode;
  presets: PresetLine[];
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
  textareaRows?: number;
  placeholder?: string;
  hint?: ReactNode;
}) {
  const { label, presets, value, onChange, disabled, textareaRows = 2, placeholder, hint } = props;
  const selectValue = useMemo(() => presetIdForText(presets, value), [presets, value]);

  return (
    <div className="space-y-1.5 sm:col-span-2">
      <Label>{label}</Label>
      <Select
        value={selectValue}
        disabled={disabled}
        onValueChange={(id) => {
          if (!id || id === "__custom__") return;
          onChange(presetTextById(presets, id));
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Alegeți variantă sau editați manual dedesubt" />
        </SelectTrigger>
        <SelectContent align="start" side="bottom" sideOffset={6} className="z-[200] max-h-[min(70vh,420px)]">
          {presets.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {presetLabel(p)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Textarea
        rows={textareaRows}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint ? <div className="text-muted-foreground text-xs">{hint}</div> : null}
    </div>
  );
}
