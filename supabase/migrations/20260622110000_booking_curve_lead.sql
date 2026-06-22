-- ============================================================
-- booking_curve_lead_metrics: リードタイム別の累積（販売室数＋売上）。
-- 既存 mart.booking_curve_monthly（販売室数のみ・wide）に対し、売上(gross/net)も
-- 持つ long 形式。販売室数/売上/ADR メトリクス＋当年vs前年＋二軸チャート用。
-- lead_bucket = sameDay / oneDayBefore / ... / oneFiftyOnePlusDaysBefore（12種・累積）。
-- aggregateBookingCurveLead（lib/mart/aggregate.ts）が canonical から生成。
-- ============================================================
create table if not exists mart.booking_curve_lead_metrics (
  facility_id      uuid not null references app.facilities(id) on delete cascade,
  stay_month       date not null,
  cancel_scope     text not null check (cancel_scope in ('with_cancelled','without_cancelled')),
  lead_bucket      text not null,
  sold_room_nights numeric not null default 0,
  gross_amount     numeric not null default 0,
  net_amount       numeric not null default 0,
  primary key (facility_id, stay_month, cancel_scope, lead_bucket)
);
