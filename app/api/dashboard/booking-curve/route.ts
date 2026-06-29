import { NextRequest, NextResponse } from "next/server";
import { buildBookingCurve } from "@/lib/api/bookingcurve";
import { getPool } from "@/lib/db/pool";
import { errorJson, parseFilters } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/dashboard/booking-curve — ブッキングカーブ
export async function GET(req: NextRequest) {
  const r = parseFilters(req.nextUrl.searchParams);
  if ("error" in r) return r.error;
  try {
    return NextResponse.json(await buildBookingCurve(getPool(), r.filters));
  } catch (e) {
    return errorJson("INTERNAL_ERROR", (e as Error).message, 500);
  }
}
