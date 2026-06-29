import { NextRequest, NextResponse } from "next/server";
import { buildOverview } from "@/lib/api/overview";
import { getPool } from "@/lib/db/pool";
import { errorJson, parseOverviewFilters } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/dashboard/overview — 総合ダッシュボード（施設SET×期間で当年/前年/予算）
export async function GET(req: NextRequest) {
  const r = parseOverviewFilters(req.nextUrl.searchParams);
  if ("error" in r) return r.error;
  try {
    return NextResponse.json(await buildOverview(getPool(), r.filters));
  } catch (e) {
    return errorJson("INTERNAL_ERROR", (e as Error).message, 500);
  }
}
