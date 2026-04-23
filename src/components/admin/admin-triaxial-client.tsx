"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fitMohrCoulomb, computeTriaxialResult } from "@/lib/triaxial/compute";
import type { ChannelMapping, RawTable, TriaxialResult, TriaxialSampleMeta } from "@/lib/triaxial/types";
import { AlertTriangle, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type UploadState = {
  file: File | null;
  table: RawTable | null;
  mapping: ChannelMapping | null;
  meta: TriaxialSampleMeta;
  result: TriaxialResult | null;
  error: string | null;
};

const DEFAULT_GEOM = { diameterMm: 36, heightMm: 76 };

function guessHeader(headers: string[], needles: string[]) {
  const hLower = headers.map((h) => h.toLowerCase());
  for (const n of needles) {
    const idx = hLower.findIndex((h) => h.includes(n.toLowerCase()));
    if (idx >= 0) return headers[idx];
  }
  return null;
}

function toRawTable(sheetRows: unknown[][]): RawTable {
  const headers = (sheetRows[0] ?? []).map((h) => String(h ?? "").trim()).filter(Boolean);
  const rows: RawTable["rows"] = [];
  for (let i = 1; i < sheetRows.length; i++) {
    const r = sheetRows[i] ?? [];
    const row: Record<string, number | string | null> = {};
    for (let j = 0; j < headers.length; j++) {
      const cell = (r as unknown[])[j];
      if (cell === null || cell === undefined) {
        row[headers[j]] = null;
      } else if (typeof cell === "number" || typeof cell === "string") {
        row[headers[j]] = cell;
      } else if (typeof cell === "boolean" || typeof cell === "bigint") {
        row[headers[j]] = String(cell);
      } else if (cell instanceof Date) {
        row[headers[j]] = cell.toISOString();
      } else {
        // XLSX can yield objects (e.g. rich text); store a stable string.
        try {
          row[headers[j]] = JSON.stringify(cell);
        } catch {
          row[headers[j]] = String(cell);
        }
      }
    }
    rows.push(row);
  }
  return { headers, rows };
}

async function readWorkbookTable(file: File): Promise<RawTable> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];
  if (!rows || rows.length < 2) throw new Error("Fișierul nu are suficiente rânduri (header + date).");
  return toRawTable(rows);
}

function makeDefaultMapping(headers: string[]): ChannelMapping | null {
  const load = guessHeader(headers, ["ch1", "load", "force"]);
  const lvdta = guessHeader(headers, ["ch5", "lvd", "disp", "displacement"]);
  if (!load || !lvdta) return null;
  return {
    time: guessHeader(headers, ["time", "sec", "t"]) ?? undefined,
    load,
    lvdta,
    pressure: guessHeader(headers, ["pressure", "sigma3", "cell", "ch13"]) ?? undefined,
    strainAxial6: guessHeader(headers, ["ch6", "strain 6", "strain6"]) ?? undefined,
    strainAxial7: guessHeader(headers, ["ch7", "strain 7", "strain7"]) ?? undefined,
    strainHoop8: guessHeader(headers, ["ch8", "strain 8", "strain8", "hoop"]) ?? undefined,
  };
}

function mappingComplete(m: ChannelMapping | null): m is ChannelMapping {
  return Boolean(m?.load && m?.lvdta);
}

function SeriesCharts({ res }: { res: TriaxialResult }) {
  const data = useMemo(
    () =>
      res.series.map((p) => ({
        i: p.i,
        sigma1: p.sigma1Mpa,
        q: p.qMpa,
        epsZ: res.qc.chosenAxial === "gauges" ? p.epsAxialFromGauges : p.epsAxialFromLvdta,
      })),
    [res],
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">σ1–εz</CardTitle>
          <CardDescription>εz din sursa aleasă după QC.</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="epsZ" tickFormatter={(v) => (typeof v === "number" ? v.toFixed(3) : "")} />
              <YAxis dataKey="sigma1" tickFormatter={(v) => (typeof v === "number" ? v.toFixed(0) : "")} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="sigma1" name="σ1 (MPa)" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">q–εz</CardTitle>
          <CardDescription>\(q=σ1-σ3\).</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="epsZ" tickFormatter={(v) => (typeof v === "number" ? v.toFixed(3) : "")} />
              <YAxis dataKey="q" tickFormatter={(v) => (typeof v === "number" ? v.toFixed(0) : "")} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="q" name="q (MPa)" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function MappingEditor({
  headers,
  mapping,
  onChange,
}: {
  headers: string[];
  mapping: ChannelMapping;
  onChange: (m: ChannelMapping) => void;
}) {
  const options = headers;
  const field = (label: string, key: keyof ChannelMapping, required?: boolean) => (
    <div className="space-y-2">
      <Label className="text-xs">
        {label} {required ? <span className="text-destructive">*</span> : null}
      </Label>
      <Select
        value={(mapping[key] as string | undefined) ?? ""}
        onValueChange={(v) => onChange({ ...mapping, [key]: v || undefined })}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Alege coloană…" />
        </SelectTrigger>
        <SelectContent align="start">
          <SelectGroup>
            <SelectLabel>Coloane</SelectLabel>
            {options.map((h) => (
              <SelectItem key={h} value={h}>
                {h}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {field("Load (kN) – Ch1", "load", true)}
      {field("LVDT axial (mm) – Ch5", "lvdta", true)}
      {field("Time (opțional)", "time")}
      {field("Pressure / σ3 (opțional)", "pressure")}
      {field("Strain axial (µε) – Ch6 (opțional)", "strainAxial6")}
      {field("Strain axial (µε) – Ch7 (opțional)", "strainAxial7")}
      {field("Strain hoop/radial (µε) – Ch8 (opțional)", "strainHoop8")}
    </div>
  );
}

export function AdminTriaxialClient() {
  const [states, setStates] = useState<UploadState[]>([
    { file: null, table: null, mapping: null, result: null, error: null, meta: { id: "P1", sigma3Mpa: 25, ...DEFAULT_GEOM } },
    { file: null, table: null, mapping: null, result: null, error: null, meta: { id: "P2", sigma3Mpa: 35, ...DEFAULT_GEOM } },
    { file: null, table: null, mapping: null, result: null, error: null, meta: { id: "P3", sigma3Mpa: 40, ...DEFAULT_GEOM } },
  ]);

  const strengthPoints = useMemo(
    () => states.map((s) => s.result?.strength).filter((x): x is NonNullable<typeof x> => x != null),
    [states],
  );
  const mc = useMemo(() => fitMohrCoulomb(strengthPoints), [strengthPoints]);

  async function onPickFile(idx: number, file: File | null) {
    setStates((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, file, table: null, mapping: null, result: null, error: null } : s)),
    );
    if (!file) return;
    try {
      const table = await readWorkbookTable(file);
      const mapping = makeDefaultMapping(table.headers);
      setStates((prev) =>
        prev.map((s, i) => (i === idx ? { ...s, file, table, mapping, error: null } : s)),
      );
    } catch (e) {
      setStates((prev) =>
        prev.map((s, i) =>
          i === idx ? { ...s, error: e instanceof Error ? e.message : "Nu s-a putut citi fișierul." } : s,
        ),
      );
    }
  }

  function runCompute(idx: number) {
    setStates((prev) =>
      prev.map((s, i) => {
        if (i !== idx) return s;
        if (!s.table) return { ...s, error: "Nu există date încărcate." };
        if (!mappingComplete(s.mapping)) return { ...s, error: "Mapping incomplet: Load și LVDT sunt obligatorii." };
        const res = computeTriaxialResult({ meta: s.meta, table: s.table, mapping: s.mapping });
        return { ...s, result: res, error: null };
      }),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Input</CardTitle>
          <CardDescription>
            Încarcă exporturile P1–P3 (CSV/XLSX). Dacă fișierul e CSV, îl poți deschide și salva ca XLSX; modulul
            folosește parserul din `xlsx`.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-3">
            {states.map((s, idx) => (
              <div key={s.meta.id} className="space-y-2">
                <Label className="text-xs">{s.meta.id} — σ3 {s.meta.sigma3Mpa} MPa</Label>
                <Input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => void onPickFile(idx, e.target.files?.[0] ?? null)}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {states.map((s, idx) => (
        <Card key={`${s.meta.id}-mapping`}>
          <CardHeader>
            <CardTitle className="text-base">{s.meta.id}: Mapping + QC</CardTitle>
            <CardDescription>Load (Ch1) și LVDT (Ch5) sunt obligatorii. Restul sunt opționale.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!s.table ? (
              <p className="text-muted-foreground text-sm">Încarcă un fișier pentru {s.meta.id}.</p>
            ) : !s.mapping ? (
              <p className="text-muted-foreground text-sm">
                Nu am putut ghici automat coloanele. Alege manual mapping-ul din lista de coloane.
              </p>
            ) : (
              <MappingEditor
                headers={s.table.headers}
                mapping={s.mapping}
                onChange={(m) => setStates((prev) => prev.map((p, i) => (i === idx ? { ...p, mapping: m } : p)))}
              />
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" disabled={!s.table || !mappingComplete(s.mapping)} onClick={() => runCompute(idx)}>
                <Upload className="size-4" />
                Calculează
              </Button>
              {s.error ? (
                <p className="text-destructive flex items-center gap-2 text-sm">
                  <AlertTriangle className="size-4" />
                  {s.error}
                </p>
              ) : null}
            </div>

            {s.result ? (
              <div className="flex flex-col gap-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Rupere</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm">
                      {s.result.strength ? (
                        <div className="space-y-1">
                          <p>
                            σ1,peak: <span className="font-medium">{s.result.strength.sigma1PeakMpa.toFixed(1)} MPa</span>
                          </p>
                          <p>Index: {s.result.strength.peakIndex}</p>
                        </div>
                      ) : (
                        <p className="text-muted-foreground">Nu s-a putut determina vârful.</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Elastic</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm">
                      {s.result.elastic?.eGpa ? (
                        <div className="space-y-1">
                          <p>
                            E: <span className="font-medium">{s.result.elastic.eGpa.toFixed(2)} GPa</span>
                          </p>
                          <p>ν: {s.result.elastic.nu ? s.result.elastic.nu.toFixed(3) : "—"}</p>
                        </div>
                      ) : (
                        <p className="text-muted-foreground">Nu există fit elastic suficient.</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">QC</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs space-y-2">
                      <p>
                        εz: <span className="font-medium">{s.result.qc.chosenAxial}</span>, εr:{" "}
                        <span className="font-medium">{s.result.qc.chosenRadial}</span>
                      </p>
                      <ul className="space-y-1">
                        {s.result.qc.channels.map((c) => (
                          <li key={c.channel}>
                            <span className="font-medium">{c.channel}</span>: {c.flag}
                            {c.reasons.length ? ` — ${c.reasons.join(" / ")}` : ""}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </div>

                <SeriesCharts res={s.result} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mohr–Coulomb (din P1–P3)</CardTitle>
          <CardDescription>Fit pe punctele (σ3, σ1,peak). Rezultatul are sens doar dacă toate cele 3 probe sunt calculate.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>
            φ: <span className="font-medium">{mc.phiDeg ? `${mc.phiDeg.toFixed(1)}°` : "—"}</span> • c:{" "}
            <span className="font-medium">{mc.cMpa ? `${mc.cMpa.toFixed(2)} MPa` : "—"}</span>
          </p>
          {mc.notes.length ? <p className="text-muted-foreground text-xs">{mc.notes.join(" ")}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

