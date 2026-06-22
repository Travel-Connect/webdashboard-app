import { z } from "zod";

/**
 * Dashboard API 契約（docs/api-contract.md の単一真実源）。
 * 入力(query)は Zod で検証、出力(response)は TS 型で型付けする。
 */

// ---- 共通 query ----
export const dashboardQuerySchema = z
  .object({
    facilityId: z.string().min(1), // uuid or "all"
    year: z.coerce.number().int(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    period: z.enum(["monthly", "yearly"]),
    taxMode: z.enum(["gross", "net"]),
    compareWith: z.enum(["previous_year", "budget", "previous_snapshot"]).optional(),
  })
  .refine((q) => q.period !== "monthly" || q.month != null, {
    message: "period=monthly のとき month は必須です",
    path: ["month"],
  });

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

export type TaxMode = "gross" | "net";
export type Period = "monthly" | "yearly";
export type CompareWith = "previous_year" | "budget" | "previous_snapshot";

export interface DashboardFilters {
  facilityId: string | "all";
  year: number;
  month?: number;
  period: Period;
  taxMode: TaxMode;
  compareWith?: CompareWith;
}

// ---- 共通 response 封筒 ----
export interface MetricComparison {
  metric: string;
  current: number | null;
  baseline: number | null;
  diff: number | null;
  rate: number | null;
}

export interface DashboardComparison<TComparisonRow> {
  basis: CompareWith;
  metrics: MetricComparison[];
  rows: TComparisonRow[];
}

export interface DashboardResponse<TSummary, TRow, TSeries = never, TComparisonRow = TRow> {
  filters: DashboardFilters;
  summary: TSummary;
  rows: TRow[];
  series?: TSeries[];
  comparison?: DashboardComparison<TComparisonRow> | null;
  generatedAt: string;
}

// ---- 共通 error ----
export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "FEATURE_NOT_ENABLED"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";

export interface ApiErrorResponse {
  error: { code: ApiErrorCode; message: string; details?: unknown };
}

// ---- 1. 稼働分析 ----
export interface OccupancySummary {
  soldRoomNights: number;
  sellableRoomNights: number;
  remainingRoomNights: number;
  occupancyRate: number | null;
  guestCount: number;
  roomRevenue: number;
  guestUnitPrice: number | null;
  adr: number | null;
  revpar: number | null;
  avgGuestsPerRoom: number | null;
}
export type OccupancyRow = OccupancySummary & { date: string };

// ---- 2. 経路分析 ----
export interface ChannelSummary {
  totalRevenue: number;
  totalSoldRoomNights: number;
  channelCount: number;
}
export interface ChannelRow {
  channel: string;
  revenue: number;
  soldRoomNights: number;
  compositionRate: number | null;
  previousYearRevenue?: number;
  yoyDiff?: number;
  yoyRate?: number | null;
}

// 経路×施設（月間）/ 経路×月（年間）クロスタブ
export interface ChannelMatrixColumn {
  /** facility id (columnKind=facility) or month number "1".."12" (columnKind=month). */
  key: string;
  label: string;
  /** area name — groups the facility super-header; undefined for month columns. */
  group?: string;
}
export interface ChannelMatrixRow {
  channel: string;
  total: number;
  /** column key -> revenue */
  cells: Record<string, number>;
}
export interface ChannelMatrix {
  columnKind: "facility" | "month";
  /** yearly only: "{facName} · {year}年" spanning all month columns. */
  groupLabel?: string;
  columns: ChannelMatrixColumn[];
  rows: ChannelMatrixRow[];
  grandTotal: number;
}

// ---- 3. 国籍別分析 ----
export interface NationalityRow {
  countryMajor: string;
  countryMiddle: string;
  country: string;
  revenue: number;
  soldRoomNights: number;
  guestCount: number;
  adr: number | null;
  reservationCount: number;
  avgGuestsPerRoom: number | null;
  multiNightRate: number | null;
  avgLeadTime: number | null;
}

// ---- 4. 泊数分布 ----
export type NightsBucket = "1" | "2" | "3_4" | "5_6" | "7_plus";
export interface StayNightsRow {
  month: string;
  nightsBucket: NightsBucket;
  reservationCount: number;
  soldRoomNights: number;
  guestCount: number;
  revenue: number;
  adr: number | null;
  guestFactor: number | null;
}

// ---- 5. 部屋タイプ別分析 ----
export interface RoomTypeRow {
  roomType: string;
  budgetRoomType: string;
  revenue: number;
  soldRoomNights: number;
  guestCount: number;
  reservationCount: number;
  adr: number | null;
}

// ---- 6. 全施設年間売上 ----
export interface AnnualSalesRow {
  facilityId: string;
  facilityCode: string;
  facilityName: string;
  areaName: string;
  revenue: number;
  previousYearRevenue?: number;
  yoyDiff?: number;
  yoyRate?: number | null;
  budgetAmount?: number;
  budgetAchievementRate?: number | null;
}

// ---- 7. ブッキングカーブ ----
export type CancelScope = "with_cancelled" | "without_cancelled";
export interface BookingCurveRow {
  month: string;
  cancelScope: CancelScope;
  sameDay: number;
  oneDayBefore: number;
  twoDaysBefore: number;
  threeToSixDaysBefore: number;
  sevenToThirteenDaysBefore: number;
  fourteenToTwentyDaysBefore: number;
  twentyOneToThirtyDaysBefore: number;
  thirtyOneToSixtyDaysBefore: number;
  sixtyOneToNinetyDaysBefore: number;
  ninetyOneToOneTwentyDaysBefore: number;
  oneTwentyOneToOneFiftyDaysBefore: number;
  oneFiftyOnePlusDaysBefore: number;
}

// summary（契約に明示が無いエンドポイントは合計系を返す）
export interface NationalitySummary {
  totalRevenue: number;
  totalSoldRoomNights: number;
  totalGuestCount: number;
  totalReservationCount: number;
  avgLeadTime: number | null;
  countryCount: number;
}
export interface StayNightsSummary {
  totalReservations: number;
  totalSoldRoomNights: number;
  totalGuestCount: number;
  totalRevenue: number;
}
export interface AnnualSalesSummary {
  totalRevenue: number;
  totalPreviousYearRevenue: number | null;
  yoyRate: number | null;
  totalBudget: number | null;
  budgetAchievementRate: number | null;
  facilityCount: number;
}
export type CurveTotals = Omit<BookingCurveRow, "month" | "cancelScope">;
export interface BookingCurveSummary {
  months: number;
  withCancelled: CurveTotals;
  withoutCancelled: CurveTotals;
}

// 各エンドポイントの response 別名
export type OccupancyResponse = DashboardResponse<OccupancySummary, OccupancyRow>;
export interface ChannelsResponse extends DashboardResponse<ChannelSummary, ChannelRow> {
  matrix: ChannelMatrix;
  matrixPrevious?: ChannelMatrix | null;
}
export type RoomTypesResponse = DashboardResponse<RoomTypeRow, RoomTypeRow>;
export type NationalitiesResponse = DashboardResponse<NationalitySummary, NationalityRow>;
export type StayNightsResponse = DashboardResponse<StayNightsSummary, StayNightsRow>;
export type BookingCurveResponse = DashboardResponse<BookingCurveSummary, BookingCurveRow>;
export type AnnualSalesResponse = DashboardResponse<AnnualSalesSummary, AnnualSalesRow>;
