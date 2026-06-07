/**
 * Next.js ミドルウェア
 *
 * /admin 配下を Supabase Auth で保護する
 *
 * © Beautiful Days
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  // /admin と /api/admin のみ保護
  const path = request.nextUrl.pathname;
  if (!path.startsWith("/admin") && !path.startsWith("/api/admin")) {
    return NextResponse.next();
  }

  // ログインページ自体は素通し
  if (path === "/admin/login") {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // 未ログイン → ログインページへ
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/admin/login";
    return NextResponse.redirect(loginUrl);
  }

  // ロールチェック（admin_users テーブルで管理する想定）
  // TODO: 本格的にはRBACテーブルでチェック
  // 現状は「ログイン済み = 管理者」とする

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
