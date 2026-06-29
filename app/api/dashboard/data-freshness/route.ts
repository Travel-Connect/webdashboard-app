import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { errorJson } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/dashboard/data-freshness — 当年実績(ライブデータ)が何日時点かを返す。
// minpakuIN canonical の最終ロード日時(created_at)を JST 日付で。
export async function GET() {
  try {
    const r = await getPool().query(
      `select to_char(max(created_at) at time zone 'Asia/Tokyo', 'YYYY-MM-DD') d
       from app.reservation_stay_nights
       where source_system = 'minpakuin'`,
    );
    return NextResponse.json({ dataAsOf: (r.rows[0]?.d as string | null) ?? null });
  } catch (e) {
    return errorJson("INTERNAL_ERROR", (e as Error).message, 500);
  }
}
