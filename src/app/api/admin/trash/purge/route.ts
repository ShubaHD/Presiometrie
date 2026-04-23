import { requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { toErrorMessage } from "@/lib/to-error-message";
import { NextResponse } from "next/server";

type TrashType = "project" | "borehole" | "sample" | "test";

type PurgeBody = {
  type?: TrashType;
  id?: string;
};

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
    const auth = await requireAdmin();
    if (!auth.ok) return auth.res;

    const body = (await req.json()) as PurgeBody;
    const type = body.type;
    const id = String(body.id ?? "").trim();
    if (!type || !id) return NextResponse.json({ error: "Câmpuri obligatorii: type, id" }, { status: 400 });

    const admin = createAdminClient();

    if (type === "test") {
      await removeStorageForTestIds(admin, [id]);
      const { error } = await admin.from("tests").delete().eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (type === "sample") {
      const { data: tests, error: tErr } = await admin.from("tests").select("id").eq("sample_id", id);
      if (tErr) throw tErr;
      const testIds = (tests ?? []).map((t) => t.id as string);
      await removeStorageForTestIds(admin, testIds);
      const { error } = await admin.from("samples").delete().eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (type === "borehole") {
      const { data: samples, error: sErr } = await admin.from("samples").select("id").eq("borehole_id", id);
      if (sErr) throw sErr;
      const sampleIds = (samples ?? []).map((s) => s.id as string);
      if (sampleIds.length) {
        const { data: tests, error: tErr } = await admin.from("tests").select("id").in("sample_id", sampleIds);
        if (tErr) throw tErr;
        const testIds = (tests ?? []).map((t) => t.id as string);
        await removeStorageForTestIds(admin, testIds);
      }
      const { error } = await admin.from("boreholes").delete().eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (type === "project") {
      const { data: boreholes, error: bErr } = await admin.from("boreholes").select("id").eq("project_id", id);
      if (bErr) throw bErr;
      const boreholeIds = (boreholes ?? []).map((b) => b.id as string);
      if (boreholeIds.length) {
        const { data: samples, error: sErr } = await admin.from("samples").select("id").in("borehole_id", boreholeIds);
        if (sErr) throw sErr;
        const sampleIds = (samples ?? []).map((s) => s.id as string);
        if (sampleIds.length) {
          const { data: tests, error: tErr } = await admin.from("tests").select("id").in("sample_id", sampleIds);
          if (tErr) throw tErr;
          const testIds = (tests ?? []).map((t) => t.id as string);
          await removeStorageForTestIds(admin, testIds);
        }
      }
      const { error } = await admin.from("projects").delete().eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Tip invalid." }, { status: 400 });
  } catch (e) {
    console.error("[POST /api/admin/trash/purge]", e);
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}

