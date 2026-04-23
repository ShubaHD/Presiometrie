"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isLabOperatorSelectOption, LAB_OPERATOR_SELECT_OPTIONS } from "@/lib/lab-operator-options";

export function LabOperatorSelect(props: {
  id: string;
  label?: string;
  disabled?: boolean;
  value: string;
  onValueChange: (v: string) => void;
}) {
  const { id, label = "Operator", disabled, value, onValueChange } = props;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} disabled={disabled} onValueChange={(v) => onValueChange(v ?? "")}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Selectați operatorul" />
        </SelectTrigger>
        <SelectContent align="start" side="bottom" sideOffset={6} className="z-[200]">
          <SelectItem value="">— Selectați —</SelectItem>
          {LAB_OPERATOR_SELECT_OPTIONS.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
          {value.trim() !== "" && !isLabOperatorSelectOption(value) ? (
            <SelectItem value={value}>{value} (din date vechi)</SelectItem>
          ) : null}
        </SelectContent>
      </Select>
    </div>
  );
}
