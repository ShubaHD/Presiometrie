import { requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { toErrorMessage } from "@/lib/to-error-message";
import { NextResponse } from "next/server";

const MIN_PASSWORD = 8;

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/** Listă utilizatori Auth (max. 100). Doar admin. */
export async function GET() {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.res;

    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const users = (data.users ?? []).map((u) => ({
      id: u.id,
      email: u.email,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at,
      bannedUntil: (u as { banned_until?: string | null }).banned_until ?? null,
    }));

    return NextResponse.json({ users });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}

/** Creare utilizator cu email + parolă (rol implicit lab_user, din trigger `profiles`). Doar admin. */
export async function POST(req: Request) {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.res;

    const body = (await req.json()) as { email?: string; password?: string; displayName?: string };
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const displayName = body.displayName != null ? String(body.displayName).trim() : "";

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Introduceți un email valid." }, { status: 400 });
    }
    if (password.length < MIN_PASSWORD) {
      return NextResponse.json(
        { error: `Parola trebuie să aibă cel puțin ${MIN_PASSWORD} caractere.` },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: displayName ? { full_name: displayName } : {},
    });

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        return NextResponse.json({ error: "Există deja un cont cu acest email." }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        user: {
          id: data.user.id,
          email: data.user.email,
          createdAt: data.user.created_at,
        },
      },
      { status: 201 },
    );
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
