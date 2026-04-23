import { requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { toErrorMessage } from "@/lib/to-error-message";
import { NextResponse } from "next/server";

const MIN_PASSWORD = 8;
const BAN_LONG = "87600h"; // ~10 ani

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

type PatchBody = {
  email?: string;
  password?: string;
  disabled?: boolean;
};

export async function PATCH(req: Request, ctx: { params: Promise<{ userId: string }> }) {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.res;

    const { userId } = await ctx.params;
    if (!userId) {
      return NextResponse.json({ error: "Lipsește userId." }, { status: 400 });
    }

    const body = (await req.json()) as PatchBody;

    const patch: {
      email?: string;
      password?: string;
      ban_duration?: string;
    } = {};

    if (body.email != null) {
      const email = String(body.email).trim().toLowerCase();
      if (!isValidEmail(email)) {
        return NextResponse.json({ error: "Introduceți un email valid." }, { status: 400 });
      }
      patch.email = email;
    }

    if (body.password != null) {
      const password = String(body.password);
      if (password.length < MIN_PASSWORD) {
        return NextResponse.json(
          { error: `Parola trebuie să aibă cel puțin ${MIN_PASSWORD} caractere.` },
          { status: 400 },
        );
      }
      patch.password = password;
    }

    if (body.disabled != null) {
      patch.ban_duration = body.disabled ? BAN_LONG : "none";
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nu există câmpuri de actualizat." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.updateUserById(userId, patch);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const u = data.user;
    return NextResponse.json({
      user: {
        id: u.id,
        email: u.email,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at,
        bannedUntil: (u as { banned_until?: string | null }).banned_until ?? null,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}

