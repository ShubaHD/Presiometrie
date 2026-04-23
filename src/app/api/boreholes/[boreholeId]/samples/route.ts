import { requireAuth } from "@/lib/auth/session";
import { isTestType, parseAllocationDateIso } from "@/lib/sample-auto-code";
import { parsePagination } from "@/lib/pagination";
import { toErrorMessage } from "@/lib/to-error-message";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ boreholeId: string }> };

export async function GET(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { boreholeId } = await params;
    const { searchParams } = new URL(req.url);
    const { page, pageSize, from, to } = parsePagination(searchParams);
    const q = (searchParams.get("q") ?? "").trim();

    let query = supabase
      .from("samples")
      .select("*", { count: "exact" })
      .eq("borehole_id", boreholeId)
      .is("deleted_at", null)
      .order("code", { ascending: true })
      .range(from, to);

    if (q) {
      query = query.or(`code.ilike.%${q}%,lithology.ilike.%${q}%`);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({
      data: data ?? [],
      total: count ?? 0,
      page,
      pageSize,
    });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { boreholeId } = await params;
    const body = (await req.json()) as Record<string, unknown>;
    const autoNumber = body.auto_number === true || body.auto_number === "true";
    let code = String(body.code ?? "").trim();

    if (autoNumber) {
      const tt = body.test_type != null ? String(body.test_type).trim() : "";
      if (!isTestType(tt)) {
        return NextResponse.json(
          { error: "La număr automat, selectați tipul încercării (test_type) pentru codul probei." },
          { status: 400 },
        );
      }
      const dateIso = parseAllocationDateIso(body.allocation_date);
      const rpcArgs: {
        p_borehole_id: string;
        p_test_type: string;
        p_day?: string;
      } = { p_borehole_id: boreholeId, p_test_type: tt };
      if (dateIso) rpcArgs.p_day = dateIso;

      const { data: allocated, error: rpcErr } = await supabase.rpc("allocate_next_sample_code", rpcArgs);
      if (rpcErr) throw rpcErr;
      if (allocated == null || String(allocated).trim() === "") {
        return NextResponse.json(
          { error: "Alocare număr probă eșuată. Rulați migrarea SQL (allocate_next_sample_code)." },
          { status: 500 },
        );
      }
      code = String(allocated).trim();
    } else if (!code) {
      return NextResponse.json(
        { error: "Introduceți numărul probei sau activați generarea automată." },
        { status: 400 },
      );
    }

    const baseRow = {
      borehole_id: boreholeId,
      depth_from: body.depth_from != null && body.depth_from !== "" ? Number(body.depth_from) : null,
      depth_to: body.depth_to != null && body.depth_to !== "" ? Number(body.depth_to) : null,
      lithology: body.lithology ? String(body.lithology) : null,
      notes: body.notes ? String(body.notes) : null,
    };
    if (!code) {
      return NextResponse.json({ error: "Număr probă obligatoriu (sau activați generarea automată)." }, { status: 400 });
    }

    // Global uniqueness is enforced in DB.
    // - For auto-number: retry by requesting a new allocation (no "-2" suffix).
    // - For manual code: return a conflict error.
    const maxAttempts = 30;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const row = { ...baseRow, code };
      const { data, error } = await supabase.from("samples").insert(row).select("*").single();
      if (!error) return NextResponse.json(data, { status: 201 });

      // Unique violation (Postgres): 23505
      const pgCode = (error as unknown as { code?: string }).code;
      if (pgCode !== "23505") throw error;

      if (!autoNumber) {
        return NextResponse.json(
          { error: `Cod probă deja folosit: ${code}.` },
          { status: 409 },
        );
      }

      // Try allocating again (race-safe, no suffixes).
      const tt = body.test_type != null ? String(body.test_type).trim() : "";
      const dateIso = parseAllocationDateIso(body.allocation_date);
      const rpcArgs: {
        p_borehole_id: string;
        p_test_type: string;
        p_day?: string;
      } = { p_borehole_id: boreholeId, p_test_type: tt };
      if (dateIso) rpcArgs.p_day = dateIso;

      const { data: allocated, error: rpcErr } = await supabase.rpc("allocate_next_sample_code", rpcArgs);
      if (rpcErr) throw rpcErr;
      if (allocated == null || String(allocated).trim() === "") break;
      code = String(allocated).trim();
    }

    return NextResponse.json(
      { error: `Nu am putut aloca un cod unic pentru probă după ${maxAttempts} încercări.` },
      { status: 409 },
    );
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
