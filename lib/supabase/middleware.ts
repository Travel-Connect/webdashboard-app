import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * セッションを更新しつつ、未認証アクセスをログインへ誘導する。
 * @supabase/ssr 公式の updateSession パターン。
 * createServerClient と getUser の間に他処理を挟まないこと（セッション不整合の回避）。
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() は毎回トークンを検証する（getSession より安全）。間に処理を挟まない。
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = pathname === "/login" || pathname.startsWith("/auth");

  if (!user && !isPublic) {
    // API は JSON 401、ページはログインへリダイレクト。
    if (pathname.startsWith("/api")) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "ログインが必要です" } },
        { status: 401 },
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    if (pathname !== "/") url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // 認証済みでログイン画面に来たらダッシュボードへ。
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}
