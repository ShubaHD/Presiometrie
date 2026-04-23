"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { newTestOptionLabel } from "@/lib/test-type-options";
import type { Borehole, Project, Sample, TestRow, TestStatus, TestType } from "@/types/lab";
import { ExplorerDeleteDialog } from "@/components/lab/explorer-delete-dialog";
import { ChevronDown, ChevronRight, FlaskConical, Folder, Layers, TestTube } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Paginated<T> = { data: T[]; total: number; page: number; pageSize: number };

function matchesPath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Extrage ID-uri din rutele lab: /projects/pId/boreholes/bId/samples/sId/tests/tId */
function parseLabHierarchyPath(pathname: string): {
  projectId: string;
  boreholeId?: string;
  sampleId?: string;
  testId?: string;
} | null {
  const m = pathname.match(
    /^\/projects\/([^/]+)(?:\/boreholes\/([^/]+)(?:\/samples\/([^/]+)(?:\/tests\/([^/]+))?)?)?/,
  );
  if (!m) return null;
  return {
    projectId: m[1],
    boreholeId: m[2],
    sampleId: m[3],
    testId: m[4],
  };
}

const STATUS_SHORT: Record<TestStatus, string> = {
  draft: "Ciornă",
  verified: "Verif.",
  approved: "Aprob.",
  reported: "Rap.",
};

/** Etichetă în arbore: metraj (m); dacă lipsește, cod probă. */
function sampleExplorerDisplay(s: Sample): { primary: string; subtitle: string | null; title: string } {
  const df = s.depth_from;
  const dt = s.depth_to;
  const hasF = df != null && Number.isFinite(Number(df));
  const hasT = dt != null && Number.isFinite(Number(dt));
  if (!hasF && !hasT) {
    return { primary: s.code, subtitle: null, title: `Probă ${s.code}` };
  }
  let primary: string;
  if (hasF && hasT) {
    const a = Number(df).toFixed(2);
    const b = Number(dt).toFixed(2);
    primary = a === b ? `${a} m` : `${a}–${b} m`;
  } else if (hasF) {
    primary = `${Number(df).toFixed(2)} m`;
  } else {
    primary = `${Number(dt).toFixed(2)} m`;
  }
  return {
    primary,
    subtitle: s.code,
    title: `${primary} · cod ${s.code}`,
  };
}

export function ExplorerTree() {
  const pathname = usePathname();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectPage, setProjectPage] = useState(1);
  const [projectTotal, setProjectTotal] = useState(0);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [expandedBoreholes, setExpandedBoreholes] = useState<Set<string>>(new Set());
  const [expandedSamples, setExpandedSamples] = useState<Set<string>>(new Set());

  const [boreholesByProject, setBoreholesByProject] = useState<Record<string, Borehole[]>>({});
  const [samplesByBorehole, setSamplesByBorehole] = useState<Record<string, Sample[]>>({});
  const [testsBySample, setTestsBySample] = useState<Record<string, TestRow[]>>({});

  const [loadingBoreholes, setLoadingBoreholes] = useState<Record<string, boolean>>({});
  const [loadingSamples, setLoadingSamples] = useState<Record<string, boolean>>({});
  const [loadingTests, setLoadingTests] = useState<Record<string, boolean>>({});

  const loadProjects = useCallback(async (page: number, append: boolean) => {
    setLoadingProjects(true);
    setProjectsError(null);
    try {
      const res = await fetch(`/api/projects?page=${page}&pageSize=40`);
      const json = (await res.json()) as Paginated<Project> & { error?: string };
      if (!res.ok) {
        setProjectsError(json.error ?? `Eroare încărcare proiecte (${res.status})`);
        if (!append) {
          setProjects([]);
          setProjectTotal(0);
        }
        return;
      }
      setProjectTotal(json.total);
      setProjectPage(json.page);
      setProjects((prev) => (append ? [...prev, ...json.data] : json.data));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Rețea sau răspuns invalid de la server.";
      setProjectsError(msg);
      if (!append) {
        setProjects([]);
        setProjectTotal(0);
      }
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects(1, false);
  }, [loadProjects]);

  /** Deschide automat proiect → foraj → probă și încarcă datele când URL-ul e mai jos în ierarhie. */
  useEffect(() => {
    const ids = parseLabHierarchyPath(pathname);
    if (!ids) return;

    const { projectId, boreholeId, sampleId } = ids;

    setExpandedProjects((prev) => {
      if (prev.has(projectId)) return prev;
      const next = new Set(prev);
      next.add(projectId);
      return next;
    });
    if (boreholeId) {
      setExpandedBoreholes((prev) => {
        if (prev.has(boreholeId)) return prev;
        const next = new Set(prev);
        next.add(boreholeId);
        return next;
      });
    }
    if (sampleId) {
      setExpandedSamples((prev) => {
        if (prev.has(sampleId)) return prev;
        const next = new Set(prev);
        next.add(sampleId);
        return next;
      });
    }

    let cancelled = false;

    void (async () => {
      if (!boreholesByProject[projectId]) {
        setLoadingBoreholes((s) => ({ ...s, [projectId]: true }));
        try {
          const res = await fetch(`/api/projects/${projectId}/boreholes?page=1&pageSize=200`);
          const json = (await res.json()) as Paginated<Borehole>;
          if (!cancelled && res.ok) setBoreholesByProject((m) => ({ ...m, [projectId]: json.data }));
        } finally {
          if (!cancelled) setLoadingBoreholes((s) => ({ ...s, [projectId]: false }));
        }
      }

      if (boreholeId && !samplesByBorehole[boreholeId]) {
        setLoadingSamples((s) => ({ ...s, [boreholeId]: true }));
        try {
          const res = await fetch(`/api/boreholes/${boreholeId}/samples?page=1&pageSize=200`);
          const json = (await res.json()) as Paginated<Sample>;
          if (!cancelled && res.ok) setSamplesByBorehole((m) => ({ ...m, [boreholeId]: json.data }));
        } finally {
          if (!cancelled) setLoadingSamples((s) => ({ ...s, [boreholeId]: false }));
        }
      }

      if (sampleId && !testsBySample[sampleId]) {
        setLoadingTests((s) => ({ ...s, [sampleId]: true }));
        try {
          const res = await fetch(`/api/samples/${sampleId}/tests?page=1&pageSize=200`);
          const json = (await res.json()) as Paginated<TestRow>;
          if (!cancelled && res.ok) setTestsBySample((m) => ({ ...m, [sampleId]: json.data }));
        } finally {
          if (!cancelled) setLoadingTests((s) => ({ ...s, [sampleId]: false }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, boreholesByProject, samplesByBorehole, testsBySample]);

  const toggleProject = async (id: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (!boreholesByProject[id]) {
      setLoadingBoreholes((s) => ({ ...s, [id]: true }));
      try {
        const res = await fetch(`/api/projects/${id}/boreholes?page=1&pageSize=200`);
        const json = (await res.json()) as Paginated<Borehole>;
        if (res.ok) setBoreholesByProject((m) => ({ ...m, [id]: json.data }));
      } finally {
        setLoadingBoreholes((s) => ({ ...s, [id]: false }));
      }
    }
  };

  const toggleBorehole = async (boreholeId: string) => {
    setExpandedBoreholes((prev) => {
      const next = new Set(prev);
      if (next.has(boreholeId)) next.delete(boreholeId);
      else next.add(boreholeId);
      return next;
    });
    if (!samplesByBorehole[boreholeId]) {
      setLoadingSamples((s) => ({ ...s, [boreholeId]: true }));
      try {
        const res = await fetch(`/api/boreholes/${boreholeId}/samples?page=1&pageSize=200`);
        const json = (await res.json()) as Paginated<Sample>;
        if (res.ok) setSamplesByBorehole((m) => ({ ...m, [boreholeId]: json.data }));
      } finally {
        setLoadingSamples((s) => ({ ...s, [boreholeId]: false }));
      }
    }
  };

  const toggleSample = async (sampleId: string) => {
    setExpandedSamples((prev) => {
      const next = new Set(prev);
      if (next.has(sampleId)) next.delete(sampleId);
      else next.add(sampleId);
      return next;
    });
    if (!testsBySample[sampleId]) {
      setLoadingTests((s) => ({ ...s, [sampleId]: true }));
      try {
        const res = await fetch(`/api/samples/${sampleId}/tests?page=1&pageSize=200`);
        const json = (await res.json()) as Paginated<TestRow>;
        if (res.ok) setTestsBySample((m) => ({ ...m, [sampleId]: json.data }));
      } finally {
        setLoadingTests((s) => ({ ...s, [sampleId]: false }));
      }
    }
  };

  const hasMoreProjects = projects.length < projectTotal;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {projectsError && (
        <div className="border-destructive/40 bg-destructive/10 text-destructive m-2 min-w-0 max-w-full shrink-0 rounded-md border px-2 py-2 text-xs">
          <p className="font-medium">Explorer</p>
          <div className="mt-1 max-h-36 min-w-0 overflow-y-auto overflow-x-hidden text-left leading-snug">
            <p className="whitespace-normal break-words">{projectsError}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 h-7 w-full border-destructive/40"
            onClick={() => void loadProjects(1, false)}
          >
            Reîncearcă
          </Button>
        </div>
      )}
      <ScrollArea className="min-h-0 min-w-0 flex-1">
        <div className="space-y-0.5 p-2 pb-8">
        {projects.map((p) => {
          const href = `/projects/${p.id}`;
          const open = expandedProjects.has(p.id);
          const active = matchesPath(pathname, href);
          return (
            <div key={p.id} className="space-y-0.5">
              <div
                className={cn(
                  "hover:bg-sidebar-accent/60 flex min-w-0 items-center gap-0.5 rounded-md text-sm",
                  active && "bg-sidebar-accent/80",
                )}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  onClick={() => void toggleProject(p.id)}
                  aria-label={open ? "Restrânge" : "Extinde"}
                >
                  {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                </Button>
                <Link
                  href={href}
                  className="text-sidebar-foreground flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-1"
                >
                  <Folder className="text-muted-foreground size-3.5 shrink-0" />
                  <span className="truncate font-medium">{p.code}</span>
                </Link>
                <ExplorerDeleteDialog
                  apiUrl={`/api/projects/${p.id}`}
                  title="Șterge proiect"
                  description={`Proiectul „${p.code}” și tot ce e dedesubt (foraje, probe, teste) va fi șters definitiv din baza de date.`}
                  pathPrefix={`/projects/${p.id}`}
                  redirectHref="/projects"
                  onDeleted={() => {
                    const bhs = boreholesByProject[p.id] ?? [];
                    setProjects((prev) => prev.filter((x) => x.id !== p.id));
                    setBoreholesByProject((prev) => {
                      const n = { ...prev };
                      delete n[p.id];
                      return n;
                    });
                    setSamplesByBorehole((prev) => {
                      const n = { ...prev };
                      for (const bh of bhs) delete n[bh.id];
                      return n;
                    });
                    setTestsBySample((prev) => {
                      const n = { ...prev };
                      for (const bh of bhs) {
                        for (const sa of samplesByBorehole[bh.id] ?? []) {
                          delete n[sa.id];
                        }
                      }
                      return n;
                    });
                    setExpandedProjects((prev) => {
                      const n = new Set(prev);
                      n.delete(p.id);
                      return n;
                    });
                    setExpandedBoreholes((prev) => {
                      const n = new Set(prev);
                      for (const bh of bhs) n.delete(bh.id);
                      return n;
                    });
                    setExpandedSamples((prev) => {
                      const n = new Set(prev);
                      for (const bh of bhs) {
                        for (const sa of samplesByBorehole[bh.id] ?? []) {
                          n.delete(sa.id);
                        }
                      }
                      return n;
                    });
                  }}
                />
              </div>
              {open && (
                <div className="border-sidebar-border ml-3 border-l pl-2">
                  {loadingBoreholes[p.id] && (
                    <p className="text-muted-foreground px-2 py-1 text-xs">Se încarcă forajele…</p>
                  )}
                  {(boreholesByProject[p.id] ?? []).map((b) => {
                    const bHref = `/projects/${p.id}/boreholes/${b.id}`;
                    const bOpen = expandedBoreholes.has(b.id);
                    const bActive = matchesPath(pathname, bHref);
                    return (
                      <div key={b.id} className="space-y-0.5">
                        <div
                          className={cn(
                            "hover:bg-sidebar-accent/60 flex min-w-0 items-center gap-0.5 rounded-md text-sm",
                            bActive && "bg-sidebar-accent/80",
                          )}
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 shrink-0"
                            onClick={() => void toggleBorehole(b.id)}
                          >
                            {bOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                          </Button>
                          <Link href={bHref} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-1">
                            <Layers className="text-muted-foreground size-3.5 shrink-0" />
                            <span className="truncate" title={b.name?.trim() ? `Nume foraj: ${b.name.trim()}` : undefined}>
                              {b.code}
                              {b.name?.trim() ? (
                                <span className="text-muted-foreground font-normal"> · {b.name.trim()}</span>
                              ) : null}
                            </span>
                          </Link>
                          <ExplorerDeleteDialog
                            apiUrl={`/api/boreholes/${b.id}`}
                            title="Șterge foraj"
                            description={`Forajul „${b.code}” și toate probele și testele din el vor fi șterse definitiv.`}
                            pathPrefix={`/projects/${p.id}/boreholes/${b.id}`}
                            redirectHref={`/projects/${p.id}`}
                            onDeleted={() => {
                              const samples = samplesByBorehole[b.id] ?? [];
                              setBoreholesByProject((m) => ({
                                ...m,
                                [p.id]: (m[p.id] ?? []).filter((x) => x.id !== b.id),
                              }));
                              setSamplesByBorehole((m) => {
                                const n = { ...m };
                                delete n[b.id];
                                return n;
                              });
                              setTestsBySample((m) => {
                                const n = { ...m };
                                for (const sa of samples) delete n[sa.id];
                                return n;
                              });
                              setExpandedBoreholes((prev) => {
                                const n = new Set(prev);
                                n.delete(b.id);
                                return n;
                              });
                              setExpandedSamples((prev) => {
                                const n = new Set(prev);
                                for (const sa of samples) n.delete(sa.id);
                                return n;
                              });
                            }}
                          />
                        </div>
                        {bOpen && (
                          <div className="border-sidebar-border ml-3 border-l pl-2">
                            {loadingSamples[b.id] && (
                              <p className="text-muted-foreground px-2 py-1 text-xs">Se încarcă probele…</p>
                            )}
                            {(samplesByBorehole[b.id] ?? []).map((s) => {
                              const sDisp = sampleExplorerDisplay(s);
                              const sHref = `/projects/${p.id}/boreholes/${b.id}/samples/${s.id}`;
                              const sOpen = expandedSamples.has(s.id);
                              const sActive = matchesPath(pathname, sHref);
                              return (
                                <div key={s.id} className="space-y-0.5">
                                  <div
                                    className={cn(
                                      "hover:bg-sidebar-accent/60 flex min-w-0 items-center gap-0.5 rounded-md text-sm",
                                      sActive && "bg-sidebar-accent/80",
                                    )}
                                  >
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="size-7 shrink-0"
                                      onClick={() => void toggleSample(s.id)}
                                    >
                                      {sOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                                    </Button>
                                    <Link
                                      href={sHref}
                                      className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-1"
                                      title={sDisp.title}
                                    >
                                      <TestTube className="text-muted-foreground size-3.5 shrink-0" />
                                      <span className="flex min-w-0 flex-col leading-tight">
                                        <span className="truncate">{sDisp.primary}</span>
                                        {sDisp.subtitle ? (
                                          <span className="text-muted-foreground truncate text-[10px]">
                                            {sDisp.subtitle}
                                          </span>
                                        ) : null}
                                      </span>
                                    </Link>
                                    <ExplorerDeleteDialog
                                      apiUrl={`/api/samples/${s.id}`}
                                      title="Șterge probă"
                                      description={`Probă „${s.code}” și toate testele ei vor fi șterse definitiv.`}
                                      pathPrefix={`/projects/${p.id}/boreholes/${b.id}/samples/${s.id}`}
                                      redirectHref={`/projects/${p.id}/boreholes/${b.id}`}
                                      onDeleted={() => {
                                        setSamplesByBorehole((m) => ({
                                          ...m,
                                          [b.id]: (m[b.id] ?? []).filter((x) => x.id !== s.id),
                                        }));
                                        setTestsBySample((m) => {
                                          const n = { ...m };
                                          delete n[s.id];
                                          return n;
                                        });
                                        setExpandedSamples((prev) => {
                                          const n = new Set(prev);
                                          n.delete(s.id);
                                          return n;
                                        });
                                      }}
                                    />
                                  </div>
                                  {sOpen && (
                                    <div className="border-sidebar-border ml-3 border-l pl-2">
                                      {loadingTests[s.id] && (
                                        <p className="text-muted-foreground px-2 py-1 text-xs">
                                          Se încarcă testele…
                                        </p>
                                      )}
                                      {(testsBySample[s.id] ?? []).map((t) => {
                                        const tHref = `/projects/${p.id}/boreholes/${b.id}/samples/${s.id}/tests/${t.id}`;
                                        const tActive = pathname === tHref;
                                        return (
                                          <div
                                            key={t.id}
                                            className={cn(
                                              "hover:bg-sidebar-accent/60 flex min-w-0 items-center gap-0.5 rounded-md py-1.5 pr-1 pl-8 text-xs",
                                              tActive && "bg-sidebar-accent font-medium",
                                            )}
                                          >
                                            <Link
                                              href={tHref}
                                              className="flex min-w-0 flex-1 items-center gap-2"
                                            >
                                              <FlaskConical className="text-muted-foreground size-3.5 shrink-0" />
                                              <span className="truncate">
                                                {newTestOptionLabel(t.test_type as TestType)}
                                              </span>
                                              <Badge
                                                variant="outline"
                                                className="ml-auto shrink-0 px-1.5 py-0 text-[10px] font-normal"
                                              >
                                                {STATUS_SHORT[t.status] ?? t.status}
                                              </Badge>
                                            </Link>
                                            <ExplorerDeleteDialog
                                              apiUrl={`/api/tests/${t.id}`}
                                              title="Șterge test"
                                              description={`Testul „${newTestOptionLabel(t.test_type as TestType)}” va fi eliminat (măsurători, rezultate, fișiere înregistrate în DB). Fișierele din Storage pot rămâne orfane — curățați manual dacă e nevoie.`}
                                              pathPrefix={tHref}
                                              redirectHref={sHref}
                                              onDeleted={() => {
                                                setTestsBySample((m) => ({
                                                  ...m,
                                                  [s.id]: (m[s.id] ?? []).filter((x) => x.id !== t.id),
                                                }));
                                              }}
                                            />
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {loadingProjects && projects.length === 0 && (
          <p className="text-muted-foreground px-2 py-3 text-xs">Se încarcă proiectele…</p>
        )}
        {hasMoreProjects && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 w-full"
            disabled={loadingProjects}
            onClick={() => void loadProjects(projectPage + 1, true)}
          >
            Mai multe proiecte
          </Button>
        )}
      </div>
      </ScrollArea>
    </div>
  );
}
