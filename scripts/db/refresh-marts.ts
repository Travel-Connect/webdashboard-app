/**
 * canonical → mart（daily / channel / room_type）を再構築。検証済みフィルタを SQL FILTER で再現:
 *   金額系 = fee_adjusted_gross<>0 AND not is_cancelled（is_stay_night では絞らない）
 *   室数/人数 = is_stay_night AND not is_cancelled
 * 経路/部屋タイプは raw でグルーピング、空キーは除外（groupby dropna 相当）。
 *   npx tsx scripts/db/refresh-marts.ts
 * ※ country 予約指標 / stay_nights_distribution / booking_curve は予約単位・累積のため別途（TS集計）。
 */
import { Client } from "pg";
import { loadEnv, isConfigured } from "./load-env";

loadEnv();
if (!isConfigured("SUPABASE_DB_URL")) { console.error("SUPABASE_DB_URL 未設定"); process.exit(1); }
const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });

const ROOMS = "filter (where is_stay_night and not is_cancelled)";
const AMT = "filter (where fee_adjusted_gross_amount <> 0 and not is_cancelled)";

async function main() {
  await c.connect();

  await c.query("truncate mart.daily_facility_metrics");
  await c.query(`
    insert into mart.daily_facility_metrics (facility_id, stay_date, sold_room_nights, guest_count, gross_amount, tax_amount, net_amount)
    select facility_id, stay_date,
      coalesce(sum(sold_room_nights) ${ROOMS}, 0),
      coalesce(sum(guest_count) ${ROOMS}, 0),
      coalesce(sum(fee_adjusted_gross_amount) ${AMT}, 0),
      coalesce(sum(fee_adjusted_tax_amount) ${AMT}, 0),
      coalesce(sum(fee_adjusted_net_amount) ${AMT}, 0)
    from app.reservation_stay_nights
    group by facility_id, stay_date
    having coalesce(sum(sold_room_nights) ${ROOMS},0) <> 0
        or coalesce(sum(fee_adjusted_gross_amount) ${AMT},0) <> 0`);

  await c.query("truncate mart.monthly_channel_metrics");
  await c.query(`
    insert into mart.monthly_channel_metrics (facility_id, stay_month, channel, sold_room_nights, guest_count, gross_amount, tax_amount, net_amount)
    select facility_id, stay_month, channel,
      coalesce(sum(sold_room_nights) ${ROOMS}, 0),
      coalesce(sum(guest_count) ${ROOMS}, 0),
      coalesce(sum(fee_adjusted_gross_amount) ${AMT}, 0),
      coalesce(sum(fee_adjusted_tax_amount) ${AMT}, 0),
      coalesce(sum(fee_adjusted_net_amount) ${AMT}, 0)
    from app.reservation_stay_nights
    where coalesce(channel,'') <> ''
    group by facility_id, stay_month, channel
    having coalesce(sum(sold_room_nights) ${ROOMS},0) <> 0
        or coalesce(sum(fee_adjusted_gross_amount) ${AMT},0) <> 0`);

  await c.query("truncate mart.monthly_room_type_metrics");
  await c.query(`
    insert into mart.monthly_room_type_metrics (facility_id, stay_month, room_type_normalized, budget_room_type, sold_room_nights, guest_count, reservation_count, gross_amount, tax_amount, net_amount)
    select facility_id, stay_month, room_type_normalized, coalesce(budget_room_type,''),
      coalesce(sum(sold_room_nights) ${ROOMS}, 0),
      coalesce(sum(guest_count) ${ROOMS}, 0),
      count(distinct reservation_key) ${ROOMS},
      coalesce(sum(fee_adjusted_gross_amount) ${AMT}, 0),
      coalesce(sum(fee_adjusted_tax_amount) ${AMT}, 0),
      coalesce(sum(fee_adjusted_net_amount) ${AMT}, 0)
    from app.reservation_stay_nights
    where coalesce(room_type_normalized,'') <> ''
    group by facility_id, stay_month, room_type_normalized, coalesce(budget_room_type,'')
    having coalesce(sum(sold_room_nights) ${ROOMS},0) <> 0
        or coalesce(sum(fee_adjusted_gross_amount) ${AMT},0) <> 0`);

  // 検証: mart 合計 = canonical 合計
  const q = async (s: string) => (await c.query(s)).rows[0];
  const d = await q("select count(*)::int rows, coalesce(sum(sold_room_nights),0)::int rooms, coalesce(sum(gross_amount),0)::bigint gross from mart.daily_facility_metrics");
  const ch = await q("select count(*)::int rows, coalesce(sum(sold_room_nights),0)::int rooms, coalesce(sum(gross_amount),0)::bigint gross from mart.monthly_channel_metrics");
  const rt = await q("select count(*)::int rows, coalesce(sum(sold_room_nights),0)::int rooms, coalesce(sum(gross_amount),0)::bigint gross from mart.monthly_room_type_metrics");
  console.log("daily_facility :", d.rows, "rows / rooms", d.rooms, "/ gross", d.gross);
  console.log("monthly_channel:", ch.rows, "rows / rooms", ch.rooms, "/ gross", ch.gross);
  console.log("monthly_roomtyp:", rt.rows, "rows / rooms", rt.rooms, "/ gross", rt.gross);
  await c.end();
}
main().catch(async (e) => { console.log("ERROR:", (e as Error).message); try { await c.end(); } catch {} process.exit(1); });
