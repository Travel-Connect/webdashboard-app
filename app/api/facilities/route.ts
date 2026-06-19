import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";

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
    const { rows } = await getPool().query<{
      id: string;
      facility_code: string;
      display_name: string;
      area_name: string | null;
    }>(
      `select id, facility_code, display_name, area_name
         from app.facilities
        order by display_name asc`,
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
