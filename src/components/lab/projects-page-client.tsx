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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { Project } from "@/types/lab";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Paginated<T> = { data: T[]; total: number; page: number; pageSize: number };

export function ProjectsPageClient() {
  const [rows, setRows] = useState<Project[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 15 });
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState({ code: "", name: "", client_name: "", location: "", notes: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const page = pagination.pageIndex + 1;
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pagination.pageSize),
      });
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/projects?${params}`);
      const json = (await res.json()) as Paginated<Project> & { error?: string };
      if (!res.ok) {
        setLoadError(json.error ?? `Eroare server (${res.status})`);
        setRows([]);
        setTotal(0);
        return;
      }
      setRows(json.data);
      setTotal(json.total);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Nu s-a putut contacta serverul.");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [pagination.pageIndex, pagination.pageSize, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns = useMemo<ColumnDef<Project>[]>(
    () => [
      {
        accessorKey: "code",
        header: "Cod",
        cell: ({ row }) => (
          <Link
            className="text-primary font-medium underline-offset-4 hover:underline"
            href={`/projects/${row.original.id}`}
          >
            {row.original.code}
          </Link>
        ),
      },
      { accessorKey: "name", header: "Denumire" },
      { accessorKey: "client_name", header: "Client" },
      { accessorKey: "location", header: "Amplasament" },
      {
        accessorKey: "created_at",
        header: "Creat",
        cell: ({ row }) => (
          <span className="text-muted-foreground text-xs">
            {new Date(row.original.created_at).toLocaleDateString("ro-RO")}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
            <ExplorerDeleteDialog
              layout="inline"
              inlineLabel="Șterge"
              apiUrl={`/api/projects/${row.original.id}`}
              title="Șterge proiect"
              description={`Proiectul „${row.original.code}” și tot conținutul ierarhic vor fi eliminate.`}
              pathPrefix={`/projects/${row.original.id}`}
              redirectHref="/projects"
              stopRowEvent={false}
              onDeleted={() => void load()}
            />
          </div>
        ),
      },
    ],
    [load],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { pagination },
    manualPagination: true,
    pageCount: Math.max(1, Math.ceil(total / pagination.pageSize)),
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
  });

  const createProject = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code,
          name: form.name,
          client_name: form.client_name || null,
          location: form.location || null,
          notes: form.notes || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Eroare");
      setOpen(false);
      setForm({ code: "", name: "", client_name: "", location: "", notes: "" });
      await load();
    } catch {
      /* toast */
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-6 lg:p-8">
      <LabBreadcrumb items={[{ label: "Proiecte", href: null }]} />

      {loadError && (
        <div
          role="alert"
          className="border-destructive/50 bg-destructive/10 text-destructive mb-4 rounded-lg border px-4 py-3 text-sm"
        >
          <p className="font-medium">Nu s-au putut încărca proiectele</p>
          <p className="mt-1 break-words">{loadError}</p>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
            Reîncearcă
          </Button>
        </div>
      )}

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Proiecte</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Paginare și filtrare server-side; selectați un proiect în arbore sau din tabel.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Caută cod, nume, client…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPagination((p) => ({ ...p, pageIndex: 0 }));
            }}
            className="w-[220px]"
          />
          <Button type="button" onClick={() => setOpen(true)}>
            <Plus className="mr-1 size-4" />
            Proiect nou
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Proiect nou</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="p-code">Cod</Label>
                  <Input
                    id="p-code"
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-name">Denumire</Label>
                  <Input
                    id="p-name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-client">Client</Label>
                  <Input
                    id="p-client"
                    value={form.client_name}
                    onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-loc">Amplasament</Label>
                  <Input
                    id="p-loc"
                    value={form.location}
                    onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-notes">Note</Label>
                  <Textarea
                    id="p-notes"
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                  Renunță
                </Button>
                <Button type="button" disabled={creating || !form.code || !form.name} onClick={() => void createProject()}>
                  {creating ? <Loader2 className="size-4 animate-spin" /> : "Salvează"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Listă proiecte</CardTitle>
          <CardDescription>{total} înregistrări</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id}>
                    {hg.headers.map((h) => (
                      <TableHead key={h.id}>
                        {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="text-muted-foreground h-24 text-center">
                      <Loader2 className="mx-auto size-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : table.getRowModel().rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="text-muted-foreground h-24 text-center">
                      Niciun proiect.
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-muted-foreground text-sm">
              Pagina {pagination.pageIndex + 1} din {table.getPageCount()}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!table.getCanPreviousPage()}
                onClick={() => table.previousPage()}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!table.getCanNextPage()}
                onClick={() => table.nextPage()}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
