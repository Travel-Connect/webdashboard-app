# API Contract

最終更新: 2026-06-15

## 1. 共通仕様

Dashboard API は mart/RPC の結果だけを返す。raw/canonical に対して route handler 内で重い group by を実行しない。

### 1.1 共通 query

| query | type | required | note |
| --- | --- | --- | --- |
| `facilityId` | uuid or `all` | yes | `all` は admin のみ許可 |
| `year` | number | yes | JST の暦年 |
| `month` | number | period が monthly の場合 yes | 1-12 |
| `period` | `monthly` or `yearly` | yes | 月間/年間 |
| `taxMode` | `gross` or `net` | yes | 税込/税抜 |
| `compareWith` | `previous_year`, `budget`, `previous_snapshot` | no | 比較対象 |

日付・月は `YYYY-MM-DD` を使う。月は月初日で表現する。

### 1.2 共通 response

```ts
export type DashboardResponse<TSummary, TRow, TSeries = never> = {
  filters: {
    facilityId: string | "all";
    year: number;
    month?: number;
    period: "monthly" | "yearly";
    taxMode: "gross" | "net";
    compareWith?: "previous_year" | "budget" | "previous_snapshot";
  };
  summary: TSummary;
  rows: TRow[];
  series?: TSeries[];
  comparison?: {
    basis: "previous_year" | "budget" | "previous_snapshot";
    rows: unknown[];
  };
  generatedAt: string;
};
```

### 1.3 共通 error

```ts
export type ApiErrorResponse = {
  error: {
    code:
      | "BAD_REQUEST"
      | "UNAUTHORIZED"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "VALIDATION_ERROR"
      | "INTERNAL_ERROR";
    message: string;
    details?: unknown;
  };
};
```

| status | 条件 |
| --- | --- |
| 400 | query 不正、期間不正 |
| 401 | 未ログイン |
| 403 | 施設権限なし、`facilityId=all` を admin 以外が指定 |
| 404 | 対象施設/バッチなし |
| 422 | import validation error |
| 500 | 想定外 |

## 2. Dashboard Endpoints

### 2.1 `GET /api/dashboard/occupancy`

```ts
type OccupancySummary = {
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
};

type OccupancyRow = OccupancySummary & {
  date: string;
};
```

Rows are sorted by `date` ascending.

### 2.2 `GET /api/dashboard/channels`

```ts
type ChannelSummary = {
  totalRevenue: number;
  totalSoldRoomNights: number;
  channelCount: number;
};

type ChannelRow = {
  channel: string;
  revenue: number;
  soldRoomNights: number;
  compositionRate: number | null;
  previousYearRevenue?: number;
  yoyDiff?: number;
  yoyRate?: number | null;
};
```

Rows are sorted by `revenue` descending, then `channel` ascending.

### 2.3 `GET /api/dashboard/nationalities`

```ts
type NationalityRow = {
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
};
```

Rows are sorted by `revenue` descending.

### 2.4 `GET /api/dashboard/stay-nights`

```ts
type StayNightsRow = {
  month: string;
  nightsBucket: "1" | "2" | "3_4" | "5_6" | "7_plus";
  reservationCount: number;
  soldRoomNights: number;
  guestCount: number;
  revenue: number;
  adr: number | null;
  guestFactor: number | null;
};
```

Rows are sorted by `month` ascending, then bucket order.

### 2.5 `GET /api/dashboard/room-types`

```ts
type RoomTypeRow = {
  roomType: string;
  budgetRoomType: string;
  revenue: number;
  soldRoomNights: number;
  guestCount: number;
  reservationCount: number;
  adr: number | null;
};
```

Rows are sorted by `revenue` descending.

### 2.6 `GET /api/dashboard/annual-sales`

```ts
type AnnualSalesRow = {
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
};
```

Rows are sorted by `areaName`, then `facilityName`.

### 2.7 `GET /api/dashboard/booking-curve`

```ts
type BookingCurveRow = {
  month: string;
  cancelScope: "with_cancelled" | "without_cancelled";
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
};
```

## 3. Import API

### 3.1 `POST /api/imports/raw-files`

Uploads raw file to private Supabase Storage and creates `ingest.raw_files` + `ingest.import_batches`.

Response:

```ts
type RawFileUploadResponse = {
  rawFileId: string;
  batchId: string;
  sourceSystem: "minpakuin" | "neppan" | "temairazu";
  status: "uploaded";
};
```

### 3.2 `POST /api/imports/:batchId/parse`

Creates staging rows.

```ts
type ParseResponse = {
  batchId: string;
  status: "parsed";
  rawRowCount: number;
  stagingCanonicalRowCount: number;
  warnings: number;
  errors: number;
};
```

### 3.3 `POST /api/imports/:batchId/validate`

Runs validation rules and returns blocking status.

```ts
type ValidateResponse = {
  batchId: string;
  status: "validated" | "validation_failed";
  canCommit: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
};

type ValidationIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  rawRowNumber?: number;
  canonicalRowNumber?: number;
  field?: string;
};
```

### 3.4 `POST /api/imports/:batchId/commit`

Commits staging canonical rows to `app.reservation_stay_nights`, refreshes affected marts, and records import commit metadata.

```ts
type CommitResponse = {
  batchId: string;
  status: "committed";
  affectedFacilityIds: string[];
  affectedStayMonths: string[];
  upsertedRows: number;
  deletedRows: number;
  refreshedMarts: string[];
};
```

## 4. Cache

- Dashboard API responses may use short server-side cache only when `generatedAt` and `filters` are included.
- Import API must not be cached.
- API must not return raw file contents or PII fields.
