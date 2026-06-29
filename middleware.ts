import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/** 全ページ/API をセッション必須にする（最小ログインゲート）。 */
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * 静的アセット以外の全パス（ページ＋API）を対象にする。
     * _next/static, _next/image, favicon, 画像ファイルは除外。
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
