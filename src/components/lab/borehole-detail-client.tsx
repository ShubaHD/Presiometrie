"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { ExplorerDeleteDialog } from "@/components/lab/explorer-delete-dialog";
import { LabBreadcrumb } from "@/components/lab/lab-breadcrumb";
import { Textarea } from "@/components/ui/textarea";
import { NEW_TEST_OPTIONS } from "@/lib/test-type-options";
import type { Borehole, Project, Sample, TestType } from "@/types/lab";
import { Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Paginated<T> = { data: T[] };

export function BoreholeDetailClient({ projectId, boreholeId }: { projectId: string; boreholeId: string }) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [row, setRow] = useState<Borehole | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [loadingSamples, setLoadingSamples] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openSample, setOpenSample] = useState(false);
  const [autoSampleNumber, setAutoSampleNumber] = useState(true);
  const [autoCodeTestType, setAutoCodeTestType] = useState<TestType>("presiometry_program_a");
  const [allocationDateIso, setAllocationDateIso] = useState("");
  const [suggestedSampleCode, setSuggestedSampleCode] = useState<string | null>(null);
  const [createdSampleCodeNote, setCreatedSampleCodeNote] = useState<string | null>(null);
  const [newSp, setNewSp] = useState({
    code: "",
    depth_from: "" as string,
    depth_to: "" as string,
    lithology: "",
  });

  const loadSamples = useCallback(async () => {
    setLoadingSamples(true);
    try {
      const res = await fetch(`/api/boreholes/${boreholeId}/samples?page=1&pageSize=200`);
      const json = (await res.json()) as Paginated<Sample> & { error?: string };
      if (res.ok) setSamples(json.data ?? []);
    } finally {
      setLoadingSamples(false);
    }
  }, [boreholeId]);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [pr, br] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/boreholes/${boreholeId}`),
      ]);
      const pj = (await pr.json()) as Project & { error?: string };
      const bj = (await br.json()) as Borehole & { error?: string };
      if (!pr.ok) throw new Error(pj.error ?? "Proiect");
      if (!br.ok) throw new Error(bj.error ?? "Foraj");
      setProject(pj);
      setRow(bj);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Eroare");
    }
  }, [projectId, boreholeId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadSamples();
  }, [loadSamples]);

  useEffect(() => {
    if (!openSample || !autoSampleNumber) {
      setSuggestedSampleCode(null);
      setCreatedSampleCodeNote(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const q = new URLSearchParams({ testType: autoCodeTestType });
      if (allocationDateIso.trim()) q.set("date", allocationDateIso.trim());
      const res = await fetch(`/api/boreholes/${boreholeId}/samples/next-code?${q.toString()}`);
      const json = (await res.json()) as { suggestedCode?: string; error?: string };
      if (!cancelled && res.ok && json.suggestedCode) setSuggestedSampleCode(json.suggestedCode);
      else if (!cancelled) setSuggestedSampleCode(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [openSample, autoSampleNumber, boreholeId, autoCodeTestType, allocationDateIso]);

  const save = async () => {
    if (!row) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/boreholes/${boreholeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: row.code,
          name: row.name,
          depth_total: row.depth_total,
          elevation: row.elevation,
          notes: row.notes,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Eroare");
      setRow(json);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(false);
    }
  };

  const createSample = async () => {
    if (!autoSampleNumber && !newSp.code.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/boreholes/${boreholeId}/samples`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auto_number: autoSampleNumber,
          code: autoSampleNumber ? undefined : newSp.code.trim(),
          test_type: autoSampleNumber ? autoCodeTestType : undefined,
          allocation_date: autoSampleNumber && allocationDateIso.trim() ? allocationDateIso.trim() : undefined,
          depth_from: newSp.depth_from === "" ? null : Number(newSp.depth_from),
          depth_to: newSp.depth_to === "" ? null : Number(newSp.depth_to),
          lithology: newSp.lithology.trim() || null,
        }),
      });
      const json = (await res.json()) as Sample & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Eroare");
      const finalCode = (json as unknown as { code?: unknown }).code;
      if (typeof finalCode === "string" && finalCode.trim()) {
        const base = autoSampleNumber ? (suggestedSampleCode ?? "").trim() : newSp.code.trim();
        if (base && base !== finalCode.trim()) {
          setCreatedSampleCodeNote(`Cod ajustat automat pentru unicitate în proiect: ${finalCode.trim()}`);
        } else {
          setCreatedSampleCodeNote(null);
        }
      }
      setOpenSample(false);
      setAutoSampleNumber(true);
      setAutoCodeTestType("presiometry_program_a");
      setAllocationDateIso("");
      setNewSp({ code: "", depth_from: "", depth_to: "", lithology: "" });
      await loadSamples();
      await load();
      router.refresh();
      router.push(`/projects/${projectId}/boreholes/${boreholeId}/samples/${json.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(false);
    }
  };

  if (err && !row) {
    return (
      <div className="p-8">
        <p className="text-destructive text-sm">{err}</p>
      </div>
    );
  }

  if (!row || !project) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 p-8 text-sm">
        <Loader2 className="size-4 animate-spin" /> Se încarcă…
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      <LabBreadcrumb
        items={[
          { label: "Proiecte", href: "/projects" },
          { label: project.code, href: `/projects/${projectId}` },
          { label: row.code, href: null },
        ]}
      />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Foraj {row.code}</h1>
          {row.name?.trim() ? (
            <p className="text-muted-foreground mt-1 text-sm">Adâncime probă: {row.name.trim()}</p>
          ) : null}
        </div>
        <Button type="button" size="sm" onClick={() => setOpenSample(true)}>
          <Plus className="mr-1 size-4" />
          Probă nouă
        </Button>
      </div>
      <Dialog
        open={openSample}
        onOpenChange={(o) => {
          setOpenSample(o);
          if (!o) {
            setAutoSampleNumber(true);
            setAutoCodeTestType("presiometry_program_a");
            setAllocationDateIso("");
            setCreatedSampleCodeNote(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Probă nouă</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={autoSampleNumber}
                onChange={(e) => setAutoSampleNumber(e.target.checked)}
              />
              <span>
                <span className="font-medium">Număr probă automat</span>
                <span className="text-muted-foreground block text-xs">
                  Cod de forma PREFIX + zi (DDMMYYYY) + număr (5 cifre), ex. PMTA1404202600001. Contor separat
                  per foraj, tip încercare și zi (fără curse la creare simultană). Ziua implicită: azi
                  (Europe/București), dacă nu alegeți altă dată.
                </span>
              </span>
            </label>
            {autoSampleNumber ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Tip încercare (prefix cod probă)</Label>
                  <Select
                    value={autoCodeTestType}
                    onValueChange={(v) => setAutoCodeTestType(v as TestType)}
                  >
                    <SelectTrigger className="h-auto min-h-8 w-full max-w-full py-1.5 whitespace-normal [&_[data-slot=select-value]]:line-clamp-none [&_[data-slot=select-value]]:text-pretty">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent
                      align="start"
                      alignItemWithTrigger={false}
                      side="bottom"
                      sideOffset={6}
                      className="z-[200] max-h-[min(75vh,36rem)] w-[min(calc(100vw-2rem),48rem)] min-w-[min(calc(100vw-2rem),48rem)] max-w-[min(calc(100vw-2rem),48rem)]"
                    >
                      <SelectGroup>
                        <SelectLabel className="text-muted-foreground px-2 py-1.5">Presiometrie</SelectLabel>
                        {NEW_TEST_OPTIONS.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ns-alloc-day">Zi cod probă (opțional)</Label>
                  <Input
                    id="ns-alloc-day"
                    type="date"
                    value={allocationDateIso}
                    onChange={(e) => setAllocationDateIso(e.target.value)}
                  />
                  <p className="text-muted-foreground text-xs">
                    Gol = ziua curentă la salvare (fus Europe/București în baza de date).
                  </p>
                </div>
                <div className="bg-muted/60 rounded-md border px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Următorul cod (estimativ): </span>
                  <span className="font-mono font-semibold">{suggestedSampleCode ?? "…"}</span>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Valoarea finală se fixează la salvare (poate diferi dacă altcineva creează o probă între
                    timp).
                  </p>
                </div>
                {createdSampleCodeNote ? (
                  <p className="text-muted-foreground text-xs">{createdSampleCodeNote}</p>
                ) : null}
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="ns-code">Număr probă (manual)</Label>
                <Input
                  id="ns-code"
                  value={newSp.code}
                  onChange={(e) => setNewSp((s) => ({ ...s, code: e.target.value }))}
                  placeholder="ex. P-01"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ns-df">Adâncime de la (m)</Label>
                <Input
                  id="ns-df"
                  type="number"
                  step="any"
                  value={newSp.depth_from}
                  onChange={(e) => setNewSp((s) => ({ ...s, depth_from: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ns-dt">Adâncime până la (m)</Label>
                <Input
                  id="ns-dt"
                  type="number"
                  step="any"
                  value={newSp.depth_to}
                  onChange={(e) => setNewSp((s) => ({ ...s, depth_to: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ns-lith">Litologie</Label>
              <Input
                id="ns-lith"
                value={newSp.lithology}
                onChange={(e) => setNewSp((s) => ({ ...s, lithology: e.target.value }))}
                placeholder="opțional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpenSample(false)}>
              Renunță
            </Button>
            <Button
              type="button"
              disabled={busy || (!autoSampleNumber && !newSp.code.trim())}
              onClick={() => void createSample()}
            >
              Creează
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-lg">Date foraj</CardTitle>
          <CardDescription>Proiect {project.code}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="code">Cod foraj</Label>
            <Input id="code" value={row.code} onChange={(e) => setRow({ ...row, code: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">Adâncime probă</Label>
            <Input
              id="name"
              value={row.name ?? ""}
              onChange={(e) => setRow({ ...row, name: e.target.value || null })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="depth">Adâncime totală (m)</Label>
              <Input
                id="depth"
                type="number"
                step="any"
                value={row.depth_total ?? ""}
                onChange={(e) =>
                  setRow({
                    ...row,
                    depth_total: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="elev">Cota (m)</Label>
              <Input
                id="elev"
                type="number"
                step="any"
                value={row.elevation ?? ""}
                onChange={(e) =>
                  setRow({
                    ...row,
                    elevation: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Note</Label>
            <Textarea
              id="notes"
              rows={3}
              value={row.notes ?? ""}
              onChange={(e) => setRow({ ...row, notes: e.target.value || null })}
            />
          </div>
          {err && <p className="text-destructive text-sm">{err}</p>}
          <Button type="button" disabled={busy} onClick={() => void save()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Salvează
          </Button>
        </CardContent>
      </Card>

      <Card className="mt-8 max-w-xl">
        <CardHeader>
          <CardTitle className="text-lg">Probe</CardTitle>
          <CardDescription>
            Deschideți o probă pentru teste. La „Număr probă automat”, codul este PREFIX + DDMMYYYY + număr
            (5 cifre), unic per foraj / tip încercare / zi — vezi dialogul Probă nouă.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingSamples ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" /> Se încarcă…
            </p>
          ) : samples.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nicio probă. Folosiți „Probă nouă” pentru a adăuga prima probă.
            </p>
          ) : (
            <ul className="space-y-1">
              {samples.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/projects/${projectId}/boreholes/${boreholeId}/samples/${s.id}`}
                    className="text-primary font-medium hover:underline"
                  >
                    Număr probă {s.code}
                  </Link>
                  {s.depth_from != null || s.depth_to != null ? (
                    <span className="text-muted-foreground text-sm">
                      {" "}
                      · {s.depth_from ?? "—"} – {s.depth_to ?? "—"} m
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/40 mt-8 max-w-xl">
        <CardHeader>
          <CardTitle className="text-destructive text-base">Zonă periculoasă</CardTitle>
          <CardDescription>
            Ștergerea forajului elimină definitiv toate probele și testele din acest foraj. Acțiunea nu poate fi
            anulată.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExplorerDeleteDialog
            layout="inline"
            inlineLabel="Șterge forajul"
            apiUrl={`/api/boreholes/${boreholeId}`}
            title="Șterge foraj"
            description={`Forajul „${row.code}” și toate probele / testele aferente vor fi eliminate din baza de date.`}
            pathPrefix={`/projects/${projectId}/boreholes/${boreholeId}`}
            redirectHref={`/projects/${projectId}`}
            stopRowEvent={false}
            onDeleted={() => {}}
          />
        </CardContent>
      </Card>
    </div>
  );
}
