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
import { ExplorerDeleteDialog } from "@/components/lab/explorer-delete-dialog";
import { LabBreadcrumb } from "@/components/lab/lab-breadcrumb";
import { Textarea } from "@/components/ui/textarea";
import type { Borehole, Project } from "@/types/lab";
import { Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Paginated<T> = { data: T[]; total: number };

export function ProjectDetailClient({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [row, setRow] = useState<Project | null>(null);
  const [boreholes, setBoreholes] = useState<Borehole[]>([]);
  const [loadingBoreholes, setLoadingBoreholes] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openBorehole, setOpenBorehole] = useState(false);
  const [newBh, setNewBh] = useState({
    code: "",
    name: "",
    depth_total: "" as string,
    elevation: "" as string,
  });

  const loadBoreholes = useCallback(async () => {
    setLoadingBoreholes(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/boreholes?page=1&pageSize=200`);
      const json = (await res.json()) as Paginated<Borehole> & { error?: string };
      if (res.ok) setBoreholes(json.data ?? []);
    } finally {
      setLoadingBoreholes(false);
    }
  }, [projectId]);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      const json = (await res.json()) as Project & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Eroare");
      setRow(json);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Eroare");
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadBoreholes();
  }, [loadBoreholes]);

  const save = async () => {
    if (!row) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: row.code,
          name: row.name,
          client_name: row.client_name,
          location: row.location,
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

  const createBorehole = async () => {
    const code = newBh.code.trim();
    if (!code) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/boreholes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          name: newBh.name.trim() || null,
          depth_total: newBh.depth_total === "" ? null : Number(newBh.depth_total),
          elevation: newBh.elevation === "" ? null : Number(newBh.elevation),
        }),
      });
      const json = (await res.json()) as Borehole & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Eroare");
      setOpenBorehole(false);
      setNewBh({ code: "", name: "", depth_total: "", elevation: "" });
      await loadBoreholes();
      router.refresh();
      router.push(`/projects/${projectId}/boreholes/${json.id}`);
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

  if (!row) {
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
          { label: row.code, href: null },
        ]}
      />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Proiect {row.code}</h1>
        <Button type="button" size="sm" onClick={() => setOpenBorehole(true)}>
          <Plus className="mr-1 size-4" />
          Foraj nou
        </Button>
      </div>
      <Dialog open={openBorehole} onOpenChange={setOpenBorehole}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Foraj nou</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="nb-code">Cod foraj</Label>
              <Input
                id="nb-code"
                value={newBh.code}
                onChange={(e) => setNewBh((s) => ({ ...s, code: e.target.value }))}
                placeholder="ex. F-01"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nb-name">Nume foraj</Label>
              <Input
                id="nb-name"
                value={newBh.name}
                onChange={(e) => setNewBh((s) => ({ ...s, name: e.target.value }))}
                placeholder="opțional"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="nb-d">Adâncime totală (m)</Label>
                <Input
                  id="nb-d"
                  type="number"
                  step="any"
                  value={newBh.depth_total}
                  onChange={(e) => setNewBh((s) => ({ ...s, depth_total: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nb-e">Cotă (m)</Label>
                <Input
                  id="nb-e"
                  type="number"
                  step="any"
                  value={newBh.elevation}
                  onChange={(e) => setNewBh((s) => ({ ...s, elevation: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpenBorehole(false)}>
              Renunță
            </Button>
            <Button type="button" disabled={busy || !newBh.code.trim()} onClick={() => void createBorehole()}>
              Creează
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-lg">Date proiect</CardTitle>
          <CardDescription>Modificările se salvează în PostgreSQL.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="code">Cod</Label>
            <Input id="code" value={row.code} onChange={(e) => setRow({ ...row, code: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">Denumire</Label>
            <Input id="name" value={row.name} onChange={(e) => setRow({ ...row, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="client">Client</Label>
            <Input
              id="client"
              value={row.client_name ?? ""}
              onChange={(e) => setRow({ ...row, client_name: e.target.value || null })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loc">Amplasament</Label>
            <Input
              id="loc"
              value={row.location ?? ""}
              onChange={(e) => setRow({ ...row, location: e.target.value || null })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Note</Label>
            <Textarea
              id="notes"
              rows={4}
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
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-lg">Foraje</CardTitle>
            <CardDescription>Proiect → Foraj → Probă → Test</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {loadingBoreholes ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" /> Se încarcă…
            </p>
          ) : boreholes.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Niciun foraj. Folosiți „Foraj nou” pentru a adăuga primul foraj.
            </p>
          ) : (
            <ul className="space-y-1">
              {boreholes.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/projects/${projectId}/boreholes/${b.id}`}
                    className="text-primary hover:underline"
                  >
                    <span className="font-medium">{b.code}</span>
                    {b.name?.trim() ? (
                      <span className="text-muted-foreground"> — {b.name.trim()}</span>
                    ) : null}
                  </Link>
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
            Ștergerea proiectului elimină definitiv toate forajele, probele și testele din acest proiect. Acțiunea
            nu poate fi anulată.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExplorerDeleteDialog
            layout="inline"
            inlineLabel="Șterge proiectul"
            apiUrl={`/api/projects/${projectId}`}
            title="Șterge proiect"
            description={`Proiectul „${row.code}” și tot conținutul ierarhic vor fi eliminate din baza de date.`}
            pathPrefix={`/projects/${projectId}`}
            redirectHref="/projects"
            stopRowEvent={false}
            onDeleted={() => {}}
          />
        </CardContent>
      </Card>
    </div>
  );
}
