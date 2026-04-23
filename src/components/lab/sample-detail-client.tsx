"use client";

import { ExplorerDeleteDialog } from "@/components/lab/explorer-delete-dialog";
import { LabBreadcrumb } from "@/components/lab/lab-breadcrumb";
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
import { Textarea } from "@/components/ui/textarea";
import { jsonLabHeaders } from "@/lib/lab-client-user";
import { NEW_TEST_OPTIONS } from "@/lib/test-type-options";
import type { Borehole, Project, Sample, TestType } from "@/types/lab";
import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

export function SampleDetailClient({
  projectId,
  boreholeId,
  sampleId,
}: {
  projectId: string;
  boreholeId: string;
  sampleId: string;
}) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [borehole, setBorehole] = useState<Borehole | null>(null);
  const [row, setRow] = useState<Sample | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [newType, setNewType] = useState<TestType>("presiometry_program_a");

  const selectedNewTest = useMemo(
    () => NEW_TEST_OPTIONS.find((o) => o.value === newType),
    [newType],
  );

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [pr, br, sr] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/boreholes/${boreholeId}`),
        fetch(`/api/samples/${sampleId}`),
      ]);
      const pj = (await pr.json()) as Project & { error?: string };
      const bj = (await br.json()) as Borehole & { error?: string };
      const sj = (await sr.json()) as Sample & { error?: string };
      if (!pr.ok) throw new Error(pj.error ?? "Proiect");
      if (!br.ok) throw new Error(bj.error ?? "Foraj");
      if (!sr.ok) throw new Error(sj.error ?? "Probă");
      setProject(pj);
      setBorehole(bj);
      setRow(sj);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Eroare");
    }
  }, [projectId, boreholeId, sampleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!row) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/samples/${sampleId}`, {
        method: "PATCH",
        headers: jsonLabHeaders(),
        body: JSON.stringify({
          code: row.code,
          depth_from: row.depth_from,
          depth_to: row.depth_to,
          lithology: row.lithology,
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

  const createTest = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/samples/${sampleId}/tests`, {
        method: "POST",
        headers: jsonLabHeaders(),
        body: JSON.stringify({ test_type: newType }),
      });
      const json = (await res.json()) as { id: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Eroare");
      setOpen(false);
      router.push(
        `/projects/${projectId}/boreholes/${boreholeId}/samples/${sampleId}/tests/${json.id}`,
      );
      router.refresh();
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

  if (!row || !project || !borehole) {
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
          { label: borehole.code, href: `/projects/${projectId}/boreholes/${boreholeId}` },
          { label: `Număr probă ${row.code}`, href: null },
        ]}
      />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Număr probă {row.code}</h1>
        <Button type="button" size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-1 size-4" />
          Test nou
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="overflow-visible sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Test nou</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <Label>Tip încercare</Label>
              <Select value={newType} onValueChange={(v) => setNewType(v as TestType)}>
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
              {selectedNewTest && (
                <Card className="bg-muted/40 border-dashed">
                  <CardHeader className="space-y-1 pb-2">
                    <CardTitle className="text-sm font-medium">Grafice și calcule (rezumat)</CardTitle>
                    <CardDescription className="text-xs whitespace-pre-line">
                      {selectedNewTest.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Renunță
              </Button>
              <Button type="button" disabled={busy} onClick={() => void createTest()}>
                Creează
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-lg">Date probă</CardTitle>
          <CardDescription>
            Foraj {borehole.code}
            {borehole.name?.trim() ? ` — ${borehole.name.trim()}` : ""} · adâncimi și litologie
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="code">Număr probă</Label>
            <Input id="code" value={row.code} onChange={(e) => setRow({ ...row, code: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="df">De la (m)</Label>
              <Input
                id="df"
                type="number"
                step="any"
                value={row.depth_from ?? ""}
                onChange={(e) =>
                  setRow({ ...row, depth_from: e.target.value === "" ? null : Number(e.target.value) })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dt">Până la (m)</Label>
              <Input
                id="dt"
                type="number"
                step="any"
                value={row.depth_to ?? ""}
                onChange={(e) =>
                  setRow({ ...row, depth_to: e.target.value === "" ? null : Number(e.target.value) })
                }
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lith">Litologie</Label>
            <Input
              id="lith"
              value={row.lithology ?? ""}
              onChange={(e) => setRow({ ...row, lithology: e.target.value || null })}
            />
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

      <Card className="border-destructive/40 mt-8 max-w-xl">
        <CardHeader>
          <CardTitle className="text-destructive text-base">Zonă periculoasă</CardTitle>
          <CardDescription>
            Ștergerea probei elimină definitiv toate testele înregistrate pe această probă. Acțiunea nu poate fi
            anulată.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExplorerDeleteDialog
            layout="inline"
            inlineLabel="Șterge proba"
            apiUrl={`/api/samples/${sampleId}`}
            title="Șterge probă"
            description={`Probă „${row.code}” și toate testele ei vor fi eliminate din baza de date.`}
            pathPrefix={`/projects/${projectId}/boreholes/${boreholeId}/samples/${sampleId}`}
            redirectHref={`/projects/${projectId}/boreholes/${boreholeId}`}
            stopRowEvent={false}
            onDeleted={() => {}}
          />
        </CardContent>
      </Card>
    </div>
  );
}
