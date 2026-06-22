import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { activeGroup } from "@/lib/api/group";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/group — 現在のアクティブグループ（シェルのブランディング表示用）
export async function GET() {
  try {
    const g = await activeGroup(getPool());
    return NextResponse.json({ slug: g.slug, name: g.name });
  } catch (e) {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: (e as Error).message } },
      { status: 500 },
    );
  }
}
