import { NextRequest, NextResponse } from "next/server";
import { buildChannels } from "@/lib/api/channels";
import { getPool } from "@/lib/db/pool";
import { errorJson, parseFilters } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/dashboard/channels — 経路分析
export async function GET(req: NextRequest) {
  const r = parseFilters(req.nextUrl.searchParams);
  if ("error" in r) return r.error;
  try {
    return NextResponse.json(await buildChannels(getPool(), r.filters));
  } catch (e) {
    return errorJson("INTERNAL_ERROR", (e as Error).message, 500);
  }
}
