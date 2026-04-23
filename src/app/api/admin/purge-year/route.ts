import {
  assertValidYear,
  collectStoragePathsForProjects,
  loadProjectsTreeForYearRange,
  purgeConfirmationPhrase,
} from "@/lib/admin/year-archive";
import { requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { toErrorMessage } from "@/lib/to-error-message";
import { NextResponse } from "next/server";

/** Golire date pentru proiecte cu created_at în anul calendaristic UTC indicat. Necesită confirmare exactă. */
export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.res;

    const body = (await req.json()) as { year?: number; confirmation?: string };
    const year = typeof body.year === "number" ? body.year : parseInt(String(body.year ?? ""), 10);
    if (!Number.isInteger(year)) {
      return NextResponse.json({ error: "Câmp year obligatoriu (număr întreg)." }, { status: 400 });
    }
    const expected = purgeConfirmationPhrase(year);
    if (String(body.confirmation ?? "").trim() !== expected) {
      return NextResponse.json(
        { error: `Confirmare invalidă. Trimiteți confirmation exact: "${expected}".` },
        { status: 400 },
      );
    }

    const { start, end } = assertValidYear(year);

    const admin = createAdminClient();
    const projects = await loadProjectsTreeForYearRange(admin, start, end);
    const projectIds = (projects as { id: string }[]).map((p) => p.id);

    const paths = await collectStoragePathsForProjects(admin, projectIds);

    const chunk = <T,>(arr: T[], size: number): T[][] => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
      return out;
    };

    for (const group of chunk(paths.labFiles, 80)) {
      if (group.length) await admin.storage.from("lab-files").remove(group);
    }
    for (const group of chunk(paths.reports, 80)) {
      if (group.length) await admin.storage.from("reports").remove(group);
    }
    for (const group of chunk(paths.labImports, 80)) {
      if (group.length) await admin.storage.from("lab-imports").remove(group);
    }

    let deletedProjects = 0;
    for (const pid of projectIds) {
      const { error } = await admin.from("projects").delete().eq("id", pid);
      if (error) throw error;
      deletedProjects += 1;
    }

    return NextResponse.json({
      ok: true,
      year,
      deletedProjects,
      storageRemoved: {
        labFiles: paths.labFiles.length,
        reports: paths.reports.length,
        labImports: paths.labImports.length,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
