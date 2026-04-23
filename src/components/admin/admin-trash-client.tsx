"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type TrashType = "project" | "borehole" | "sample" | "test";

type TrashItem =
  | { id: string; deleted_at: string; deleted_by_user_id: string | null; code: string; name: string | null }
  | { id: string; deleted_at: string; deleted_by_user_id: string | null; code: string; name: string | null; project_id: string }
  | { id: string; deleted_at: string; deleted_by_user_id: string | null; code: string; lithology: string | null; borehole_id: string }
  | {
      id: string;
      deleted_at: string;
      deleted_by_user_id: string | null;
      test_type: string;
      status: string;
      test_date: string | null;
      sample_id: string;
    };

type TrashListResponse = {
  type: TrashType;
  items: TrashItem[];
  total: number;
  limit: number;
  offset: number;
  error?: string;
};

const TYPE_LABEL: Record<TrashType, string> = {
  project: "Proiecte",
  borehole: "Foraje",
  sample: "Probe",
  test: "Teste",
};

export function AdminTrashClient() {
  const [type, setType] = useState<TrashType>("test");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<TrashItem[]>([]);

  const canPurgeHint = useMemo(
    () => "Purge șterge definitiv (DB + fișiere Storage pentru teste).",
    [],
  );

  const load = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const params = new URLSearchParams({ type, limit: "80", offset: "0" });
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/admin/trash?${params.toString()}`, { credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as TrashListResponse;
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setItems(j.items ?? []);
    } catch (e) {
      setItems([]);
      setError(e instanceof Error ? e.message : "Nu s-a putut încărca Recycle Bin.");
    } finally {
      setBusy(false);
    }
  }, [type, q]);

  useEffect(() => {
    void load();
  }, [load]);

  async function restore(id: string) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/trash/restore", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare la restore.");
    } finally {
      setBusy(false);
    }
  }

  async function purge(id: string) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/trash/purge", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare la purge.");
    } finally {
      setBusy(false);
    }
  }

  const renderLabel = (it: TrashItem): string => {
    if ("test_type" in it) return `${it.test_type} • ${it.status}${it.test_date ? ` • ${it.test_date}` : ""}`;
    if ("lithology" in it) return `${it.code}${it.lithology ? ` • ${it.lithology}` : ""}`;
    if ("project_id" in it) return `${it.code}${it.name ? ` • ${it.name}` : ""}`;
    if ("name" in it) return `${it.code}${it.name ? ` • ${it.name}` : ""}`;
    // Exhaustive narrowing above makes this path `never` in TS; keep a safe fallback.
    return (it as { id: string }).id;
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtre</CardTitle>
          <CardDescription>Elemente mutate la coș. Restore readuce în aplicație; Purge șterge definitiv.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {(["test", "sample", "borehole", "project"] as const).map((t) => (
              <Button
                key={t}
                type="button"
                variant={type === t ? "default" : "secondary"}
                disabled={busy}
                onClick={() => setType(t)}
              >
                {TYPE_LABEL[t]}
              </Button>
            ))}
            <Button type="button" variant="outline" disabled={busy} onClick={() => void load()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Reîncarcă
            </Button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="trash-q">Căutare</Label>
              <Input
                id="trash-q"
                value={q}
                disabled={busy}
                placeholder="cod, nume, litologie, status…"
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void load();
                }}
              />
            </div>
            <div className="text-muted-foreground flex items-end text-xs">{canPurgeHint}</div>
          </div>

          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{TYPE_LABEL[type]}</CardTitle>
          <CardDescription>Primele 80 rezultate (sortare: deleted_at desc).</CardDescription>
        </CardHeader>
        <CardContent>
          {busy && items.length === 0 ? (
            <p className="text-muted-foreground text-sm">Se încarcă…</p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground text-sm">Coșul este gol pentru acest tip.</p>
          ) : (
            <ul className="divide-border divide-y rounded-md border text-sm">
              {items.map((it) => (
                <li key={it.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{renderLabel(it)}</p>
                    <p className="text-muted-foreground text-xs break-all">
                      {it.id} • șters: {new Date(it.deleted_at).toLocaleString("ro-RO")}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                    <Button type="button" variant="secondary" disabled={busy} onClick={() => void restore(it.id)}>
                      <RotateCcw className="size-4" />
                      Restore
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => void purge(it.id)}
                      title="Șterge definitiv"
                    >
                      <Trash2 className="size-4" />
                      Purge
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

