import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { activeGroupId } from "@/lib/api/group";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface FacilityOption {
  id: string;
  facilityCode: string;
  displayName: string;
  areaName: string;
}

// GET /api/facilities — 施設セレクタ用の一覧（display_name 昇順）
export async function GET() {
  try {
    const pool = getPool();
    const gid = await activeGroupId(pool);
    // アクティブグループの施設のみ（display_order 順）＝他グループはセレクタに出さない
    const { rows } = await pool.query<{
      id: string;
      facility_code: string;
      display_name: string;
      area_name: string | null;
    }>(
      `select id, facility_code, display_name, area_name
         from app.facilities
        where group_id = $1
        order by coalesce(display_order, 999999), display_name asc`,
      [gid],
    );
    const facilities: FacilityOption[] = rows.map((r) => ({
      id: r.id,
      facilityCode: r.facility_code,
      displayName: r.display_name,
      areaName: r.area_name ?? "",
    }));
    return NextResponse.json(facilities);
  } catch (e) {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: (e as Error).message } },
      { status: 500 },
    );
  }
}
