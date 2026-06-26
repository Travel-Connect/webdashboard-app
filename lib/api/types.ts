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
    asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // 指定日取込の取込日(YYYY-MM-DD)
    roomType: z.string().min(1).optional(), // 泊数分布の部屋タイプ絞り込み（未指定=全室タイプ）
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
  asOfDate?: string; // previous_snapshot の取込日(YYYY-MM-DD)。未指定なら最新前日にフォールバック
  roomType?: string; // 泊数分布の部屋タイプ絞り込み（room_type_normalized）。未指定=全室タイプ
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
  asOf?: string; // previous_snapshot で解決された取込日 (YYYY-MM-DD)
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

// 国籍×12ヶ月 クロスタブ。指標（ADR/同伴人数/連泊率/リードタイム等）は base measures
// からフロントで算出するため、セルは生の集計値を持つ（合計も同じ式で算出できる）。
export interface NatCell {
  rev: number;
  rooms: number;
  guests: number;
  resv: number;
  multi: number; // 連泊（2泊以上）予約数
  ltTotal: number; // リードタイム合計（日）
  ltCount: number; // 有効リードタイム件数
}
export interface NatMatrixRow {
  country: string;
  region: string; // countryMajor（大分類・参考。列としては表示しない）
  months: NatCell[]; // length 12, index0 = 1月
  total: NatCell;
}
export interface NationalityMatrix {
  facName: string;
  year: number;
  rows: NatMatrixRow[]; // 売上合計の降順
  colTotals: NatCell[]; // length 12
  grand: NatCell;
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
  /** ADR = Σ占有売上 / Σ販売室数（稼働分析と同基準＝占有母数）。 */
  adr: number | null;
  /** 同伴係数 = Σ宿泊人数 / Σ販売室数（稼働分析と同基準＝占有母数）。 */
  guestFactor: number | null;
  /** 占有母数: 販売室数（実室泊）。ADR/同伴係数 の分母。 */
  occSoldRoomNights: number;
  /** 占有母数: 宿泊人数（全行）。同伴係数 の分子。 */
  occGuestCount: number;
  /** 占有母数: 売上（税表示反映後）。ADR の分子。 */
  occRevenue: number;
  /** （未使用）ADR 加重和 = Σ(セル丸めADR × 室泊数)（税表示反映済）。 */
  adrWeightedNum: number;
  /** （未使用）同伴係数 加重和 = Σ(セル丸め同伴係数 × 予約件数)。 */
  compWeightedNum: number;
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

// 部屋タイプ×12ヶ月 クロスタブ（指標はフロントで base measures から算出）
export interface RtCell {
  rev: number;
  rooms: number;
  guests: number;
}
export interface RtMatrixRow {
  roomType: string;
  months: RtCell[]; // length 12, index0 = 1月
  total: RtCell;
}
export interface RoomTypeMatrix {
  facName: string;
  year: number;
  rows: RtMatrixRow[]; // 売上合計の降順
  colTotals: RtCell[]; // length 12
  grand: RtCell;
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

// 12ヶ月(行) × 施設(列) クロスタブ。指標(実績/予算/達成率/予算差)はフロントで算出。
export interface AnnualCell {
  actual: number;
  budget: number | null; // null = 予算未登録
}
export interface AnnualMatrixFacility {
  id: string;
  name: string;
  area: string;
}
export interface AnnualMonthRow {
  month: number; // 1-12
  cells: Record<string, AnnualCell>; // facilityId -> cell
  total: AnnualCell; // その月の全施設合計
}
export interface AnnualMatrix {
  year: number;
  facilities: AnnualMatrixFacility[]; // 列（display_order 昇順・エリアグループ）
  rows: AnnualMonthRow[]; // 12ヶ月
  facilityTotals: Record<string, AnnualCell>; // 施設ごと年間合計（合計行）
  grand: AnnualCell;
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

// ブッキングカーブ matrix（当年/前年 × キャンセル区分 × リードタイム別 累積）
export interface BcCell {
  rooms: number;
  gross: number;
  net: number;
}
export interface BookingCurveYear {
  year: number;
  withoutCancelled: BcCell[]; // 12 buckets, ordered
  withCancelled: BcCell[];
  sellable: number; // 期間の販売可能室数（稼働率の分母）
}
export interface BookingCurveMatrix {
  facName: string;
  buckets: { key: string; label: string }[]; // 12
  current: BookingCurveYear;
  previous: BookingCurveYear | null;
}

// 稼働分析「A室数の試算」（残室を埋めるための目標単価・前年比）
export interface OccupancyTargeting {
  sellableRoomNights: number;
  remainingRoomNights: number;
  /** 翌日以降（明日〜期間末）の残室合計。過去日は販売不可なので除外。
   *  目標達成シミュレータの「残室」「必要単価」はこちらを基準にする。 */
  futureRemainingRoomNights: number;
  soldRoomNights: number;
  roomRevenue: number;
  budgetRevenue: number | null;
  revenueGap: number | null;
  requiredAdr: number | null;
  previousYearRevenue: number | null;
  yoyRate: number | null;
}

// 各エンドポイントの response 別名
export interface OccupancyResponse extends DashboardResponse<OccupancySummary, OccupancyRow> {
  targeting?: OccupancyTargeting;
  /** 予算サマリ（当年実績テーブルの「予算」行用）。対象施設×期間に予算が無ければ null。 */
  budget?: OccupancySummary | null;
}
export interface ChannelsResponse extends DashboardResponse<ChannelSummary, ChannelRow> {
  matrix: ChannelMatrix;
  matrixPrevious?: ChannelMatrix | null;
}
export interface RoomTypesResponse extends DashboardResponse<RoomTypeRow, RoomTypeRow> {
  matrix: RoomTypeMatrix;
}
export interface NationalitiesResponse extends DashboardResponse<NationalitySummary, NationalityRow> {
  matrix: NationalityMatrix;
}
export interface StayNightsResponse extends DashboardResponse<StayNightsSummary, StayNightsRow> {
  /** 施設×期間で選択可能な部屋タイプ（room_type_normalized, 売上降順）。部屋タイプ選択UIの母集合。 */
  roomTypes: string[];
}
export interface BookingCurveResponse extends DashboardResponse<BookingCurveSummary, BookingCurveRow> {
  matrix: BookingCurveMatrix;
}
export interface AnnualSalesResponse extends DashboardResponse<AnnualSalesSummary, AnnualSalesRow> {
  matrix: AnnualMatrix;
}
