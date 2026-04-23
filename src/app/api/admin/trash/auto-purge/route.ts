import { requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { toErrorMessage } from "@/lib/to-error-message";
import { NextResponse } from "next/server";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function removeStorageForTestIds(admin: ReturnType<typeof createAdminClient>, testIds: string[]) {
  if (testIds.length === 0) return;

  const [{ data: files, error: fErr }, { data: reps, error: rErr }] = await Promise.all([
    admin.from("test_files").select("file_path").in("test_id", testIds),
    admin.from("reports").select("pdf_path").in("test_id", testIds),
  ]);
  if (fErr) throw fErr;
  if (rErr) throw rErr;

  const labFiles = [...new Set((files ?? []).map((f) => f.file_path).filter(Boolean))] as string[];
  const reports = [...new Set((reps ?? []).map((r) => r.pdf_path).filter(Boolean))] as string[];

  const labImports: string[] = [];
  for (const tid of testIds) {
    const { data: objs, error: oErr } = await admin.storage.from("lab-imports").list(tid, { limit: 1000 });
    if (oErr) continue;
    for (const o of objs ?? []) {
      if (o.name) labImports.push(`${tid}/${o.name}`);
    }
  }

  for (const group of chunk(labFiles, 80)) {
    if (group.length) await admin.storage.from("lab-files").remove(group);
  }
  for (const group of chunk(reports, 80)) {
    if (group.length) await admin.storage.from("reports").remove(group);
  }
  for (const group of chunk(labImports, 80)) {
    if (group.length) await admin.storage.from("lab-imports").remove(group);
  }
}

export async function POST(req: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET?.trim();
    const headerSecret = cronSecret ? (req.headers.get("x-cron-secret") ?? "").trim() : "";
    if (!cronSecret || headerSecret !== cronSecret) {
      const auth = await requireAdmin();
      if (!auth.ok) return auth.res;
    }

    const admin = createAdminClient();
    const cutoffIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // 1) Purge tests first (storage cleanup + cascade to children)
    const { data: tests, error: tErr } = await admin
      .from("tests")
      .select("id")
      .not("deleted_at", "is", null)
      .lt("deleted_at", cutoffIso);
    if (tErr) throw tErr;
    const testIds = (tests ?? []).map((t) => t.id as string);
    await removeStorageForTestIds(admin, testIds);
    for (const group of chunk(testIds, 200)) {
      if (group.length) {
        const { error } = await admin.from("tests").delete().in("id", group);
        if (error) throw error;
      }
    }

    // 2) Purge higher levels (cascades will clean already-empty trees)
    const purgeTable = async (table: "samples" | "boreholes" | "projects") => {
      const { data, error } = await admin
        .from(table)
        .select("id")
        .not("deleted_at", "is", null)
        .lt("deleted_at", cutoffIso);
      if (error) throw error;
      const ids = (data ?? []).map((r) => r.id as string);
      for (const group of chunk(ids, 200)) {
        if (group.length) {
          const { error: dErr } = await admin.from(table).delete().in("id", group);
          if (dErr) throw dErr;
        }
      }
      return ids.length;
    };

    const purgedSamples = await purgeTable("samples");
    const purgedBoreholes = await purgeTable("boreholes");
    const purgedProjects = await purgeTable("projects");

    return NextResponse.json({
      ok: true,
      cutoffIso,
      purged: { tests: testIds.length, samples: purgedSamples, boreholes: purgedBoreholes, projects: purgedProjects },
    });
  } catch (e) {
    console.error("[POST /api/admin/trash/auto-purge]", e);
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}

