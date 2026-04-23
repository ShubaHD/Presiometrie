import { requireAuth } from "@/lib/auth/session";
import { getLabActorFromRequest } from "@/lib/lab-actor";
import { toErrorMessage } from "@/lib/to-error-message";
import { parsePagination } from "@/lib/pagination";
import type { TestType } from "@/types/lab";
import { NextResponse } from "next/server";

/** Tipuri care pot fi filtrate la GET (inclusiv vechi înregistrate în DB). */
const FILTERABLE_TEST_TYPES: TestType[] = [
  "presiometry_program_a",
  "presiometry_program_b",
  "presiometry_program_c",
];

/** Tipuri permise la POST „Test nou” (fără greutate volumică și SR EN 1926 standalone). */
const CREATABLE_TEST_TYPES: TestType[] = [
  "presiometry_program_a",
  "presiometry_program_b",
  "presiometry_program_c",
];

type Params = { params: Promise<{ sampleId: string }> };

export async function GET(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { sampleId } = await params;
    const { searchParams } = new URL(req.url);
    const { page, pageSize, from, to } = parsePagination(searchParams);
    const testType = searchParams.get("testType") as TestType | null;

    let query = supabase
      .from("tests")
      .select("*", { count: "exact" })
      .eq("sample_id", sampleId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (testType && FILTERABLE_TEST_TYPES.includes(testType)) {
      query = query.eq("test_type", testType);
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
    const { sampleId } = await params;
    const actor = getLabActorFromRequest(req, { fallbackUserId: auth.user.id });
    const body = (await req.json()) as Record<string, unknown>;
    const testType = body.test_type as TestType;
    if (!testType || !CREATABLE_TEST_TYPES.includes(testType)) {
      return NextResponse.json({ error: "Tip test invalid." }, { status: 400 });
    }
    const row = {
      sample_id: sampleId,
      test_type: testType,
      status: "draft",
      operator_name: body.operator_name ? String(body.operator_name) : null,
      device_name: body.device_name ? String(body.device_name) : null,
      test_date: body.test_date ? String(body.test_date) : null,
      notes: body.notes ? String(body.notes) : null,
      created_by: actor.displayName,
      created_by_user_id: actor.userId,
      updated_by: actor.displayName,
      updated_by_user_id: actor.userId,
    };
    const { data, error } = await supabase.from("tests").insert(row).select("*").single();
    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
