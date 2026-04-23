import { assertValidYear, loadProjectsTreeForYearRange } from "@/lib/admin/year-archive";
import { requireAdmin } from "@/lib/auth/session";
import { toErrorMessage } from "@/lib/to-error-message";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.res;

    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get("year") ?? "", 10);
    if (!Number.isFinite(year)) {
      return NextResponse.json({ error: "Parametru year obligatoriu (ex. ?year=2026)." }, { status: 400 });
    }
    const { start, end } = assertValidYear(year);

    const projects = await loadProjectsTreeForYearRange(auth.supabase, start, end);

    const body = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        year,
        createdAtRangeUtc: { start, end },
        projects,
      },
      null,
      2,
    );

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="roca-export-${year}.json"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
