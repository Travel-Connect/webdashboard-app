-- ============================================================================
-- 20260625120000_staynights_occ_basis.sql
-- 泊数分布の ADR / 同伴係数 を「稼働分析定義（占有母数）」に統一するための列追加。
--   ADR      = Σ売上 / Σ販売室数（稼働分析と同じ＝実室泊母数・AMT売上）
--   同伴係数 = Σ宿泊人数 / Σ販売室数（稼働分析と同じ＝全行人数・実室泊母数）
-- 泊数バケット粒度で占有母数を保持する:
--   occ_sold_room_nights = ROOMS フィルタ（is_stay_night）の実室泊
--   occ_guest_count      = ROOMS フィルタの全行人数
--   occ_gross_amount     = AMT フィルタ（gross<>0）の売上（税込）
--   occ_net_amount       = AMT フィルタの純売上
-- 投入は scripts/db/refresh-marts2.ts（lib/mart/aggregate.ts の aggregateStayNights）。
-- ============================================================================

alter table mart.stay_nights_distribution
  add column if not exists occ_sold_room_nights numeric not null default 0,
  add column if not exists occ_guest_count integer not null default 0,
  add column if not exists occ_gross_amount numeric not null default 0,
  add column if not exists occ_net_amount numeric not null default 0;
