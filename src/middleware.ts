import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = path.startsWith("/login") || path.startsWith("/auth/");
  const needsUserPage =
    path === "/" ||
    path.startsWith("/projects") ||
    path.startsWith("/settings") ||
    path.startsWith("/admin");

  if (!user && !isPublic && needsUserPage) {
    const u = request.nextUrl.clone();
    u.pathname = "/login";
    u.searchParams.set("next", path === "/" ? "/projects" : path);
    return NextResponse.redirect(u);
  }

  if (user && path === "/login") {
    const u = request.nextUrl.clone();
    const next = request.nextUrl.searchParams.get("next");
    u.pathname = next && next.startsWith("/") ? next : "/projects";
    u.searchParams.delete("next");
    return NextResponse.redirect(u);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
