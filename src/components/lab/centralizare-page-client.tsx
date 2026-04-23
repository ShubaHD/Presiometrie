"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LabBreadcrumb } from "@/components/lab/lab-breadcrumb";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { newTestOptionLabel } from "@/lib/test-type-options";
import type { TestStatus, TestType } from "@/types/lab";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type CentralRow = {
  id: string;
  test_type: TestType;
  status: TestStatus;
  test_date: string | null;
  created_at: string;
  sample: {
    id: string;
    code: string;
    borehole: { id: string; code: string; project: { id: string; code: string } };
  };
};

type Paginated = { data: CentralRow[]; total: number; page: number; pageSize: number };

function statusVariant(s: TestStatus): "default" | "secondary" | "outline" {
  if (s === "reported" || s === "approved") return "default";
  if (s === "verified") return "secondary";
  return "outline";
}

export function CentralizarePageClient() {
  const [rows, setRows] = useState<CentralRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const page = pagination.pageIndex + 1;
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pagination.pageSize),
      });
      const res = await fetch(`/api/lab/centralizare?${params}`);
      const json = (await res.json()) as Paginated & { error?: string };
      if (!res.ok) {
        setLoadError(json.error ?? `Eroare server (${res.status})`);
        setRows([]);
        setTotal(0);
        return;
      }
      setRows(json.data ?? []);
      setTotal(json.total ?? 0);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Nu s-a putut contacta serverul.");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [pagination.pageIndex, pagination.pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns = useMemo<ColumnDef<CentralRow>[]>(
    () => [
      {
        id: "project",
        header: "Proiect",
        cell: ({ row }) => (
          <Link
            className="text-primary font-medium underline-offset-4 hover:underline"
            href={`/projects/${row.original.sample.borehole.project.id}`}
          >
            {row.original.sample.borehole.project.code}
          </Link>
        ),
      },
      {
        id: "borehole",
        header: "Foraj",
        cell: ({ row }) => (
          <Link
            className="text-primary font-medium underline-offset-4 hover:underline"
            href={`/projects/${row.original.sample.borehole.project.id}/boreholes/${row.original.sample.borehole.id}`}
          >
            {row.original.sample.borehole.code}
          </Link>
        ),
      },
      {
        id: "sample",
        header: "Probă",
        cell: ({ row }) => (
          <Link
            className="text-primary font-medium underline-offset-4 hover:underline"
            href={`/projects/${row.original.sample.borehole.project.id}/boreholes/${row.original.sample.borehole.id}/samples/${row.original.sample.id}`}
          >
            {row.original.sample.code}
          </Link>
        ),
      },
      {
        accessorKey: "test_type",
        header: "Tip test",
        cell: ({ row }) => <span className="text-sm">{newTestOptionLabel(row.original.test_type)}</span>,
      },
      {
        accessorKey: "status",
        header: "Stare",
        cell: ({ row }) => (
          <Badge variant={statusVariant(row.original.status)} className="capitalize">
            {row.original.status}
          </Badge>
        ),
      },
      {
        accessorKey: "test_date",
        header: "Dată test",
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {row.original.test_date
              ? new Date(row.original.test_date).toLocaleDateString("ro-RO")
              : "—"}
          </span>
        ),
      },
      {
        id: "open",
        header: "",
        cell: ({ row }) => {
          const p = row.original.sample.borehole.project.id;
          const b = row.original.sample.borehole.id;
          const s = row.original.sample.id;
          return (
            <Link
              className="text-primary text-sm underline-offset-4 hover:underline"
              href={`/projects/${p}/boreholes/${b}/samples/${s}/tests/${row.original.id}`}
            >
              Deschide
            </Link>
          );
        },
      },
    ],
    [],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { pagination },
    onPaginationChange: setPagination,
    manualPagination: true,
    pageCount: Math.max(1, Math.ceil(total / pagination.pageSize)),
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="p-4 md:p-6">
      <LabBreadcrumb items={[{ label: "Proiecte", href: "/projects" }, { label: "Centralizare", href: null }]} />

      <div className="mb-4">
        <h1 className="text-foreground text-xl font-semibold tracking-tight">Centralizare teste</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Toate testele de presiometrie, ordonate după data creării, cu legături către proiect, foraj și probă.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Listă</CardTitle>
          <CardDescription>Paginare server; exclude înregistrările șterse (soft delete).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadError ? <p className="text-destructive text-sm">{loadError}</p> : null}
          <div className="overflow-auto rounded-md border">
            <Table>
              <TableHeader className="bg-muted/40">
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id}>
                    {hg.headers.map((h) => (
                      <TableHead key={h.id} className={h.column.id === "open" ? "w-[100px]" : undefined}>
                        {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="text-muted-foreground py-8 text-center text-sm">
                      <Loader2 className="mx-auto mb-2 size-5 animate-spin opacity-60" />
                      Se încarcă…
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="text-muted-foreground py-8 text-center text-sm">
                      Nu există teste de afișat.
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((r) => (
                    <TableRow key={r.id}>
                      {r.getVisibleCells().map((c) => (
                        <TableCell key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              {total === 0 ? "0 rânduri" : `${pagination.pageIndex * pagination.pageSize + 1}–${Math.min((pagination.pageIndex + 1) * pagination.pageSize, total)} din ${total}`}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading || !table.getCanPreviousPage()}
                onClick={() => table.previousPage()}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading || !table.getCanNextPage()}
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
