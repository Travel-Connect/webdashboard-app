import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { errorJson } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/dashboard/snapshots — 指定日取込(as-of)で選べる取込日一覧（降順）
export async function GET() {
  try {
    const r = await getPool().query(
      `select to_char(snapshot_date,'YYYY-MM-DD') d
       from mart.daily_facility_metrics_snapshot
       group by snapshot_date order by snapshot_date desc`,
    );
    return NextResponse.json({ dates: r.rows.map((x) => x.d as string) });
  } catch (e) {
    return errorJson("INTERNAL_ERROR", (e as Error).message, 500);
  }
}
