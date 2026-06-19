import { NextRequest, NextResponse } from "next/server";
import { buildStayNights } from "@/lib/api/staynights";
import { getPool } from "@/lib/db/pool";
import { errorJson, parseFilters } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/dashboard/stay-nights — 泊数分布
export async function GET(req: NextRequest) {
  const r = parseFilters(req.nextUrl.searchParams);
  if ("error" in r) return r.error;
  try {
    return NextResponse.json(await buildStayNights(getPool(), r.filters));
  } catch (e) {
    return errorJson("INTERNAL_ERROR", (e as Error).message, 500);
  }
}
