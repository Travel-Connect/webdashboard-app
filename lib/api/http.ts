import { NextResponse } from "next/server";
import { dashboardQuerySchema } from "./types";
import type { ApiErrorCode, ApiErrorResponse, DashboardFilters } from "./types";

/** 統一エラー response */
export function errorJson(code: ApiErrorCode, message: string, status: number, details?: unknown) {
  const body: ApiErrorResponse = { error: { code, message, ...(details !== undefined ? { details } : {}) } };
  return NextResponse.json(body, { status });
}

/** 共通 query を検証して DashboardFilters に。失敗時は error response を返す。 */
export function parseFilters(
  searchParams: URLSearchParams,
): { filters: DashboardFilters } | { error: ReturnType<typeof errorJson> } {
  const parsed = dashboardQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return { error: errorJson("VALIDATION_ERROR", "query が不正です", 400, parsed.error.flatten()) };
  }
  return { filters: parsed.data as DashboardFilters };
}
