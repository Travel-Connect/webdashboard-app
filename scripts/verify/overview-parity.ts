/**
 * 総合ダッシュボード overview の「施設別ウィジェット」が各分析画面と ±0 一致するかを
 * 全施設について検証する（直接 pg 接続・Next 非経由）。
 *
 *   NODE_OPTIONS=--max-old-space-size=4096 npx tsx scripts/verify/overview-parity.ts
 *
 * 代表期間 2026-06(monthly) と 2026(yearly) について、各施設ごとに:
 *   - buildOverview({facilityId:'all',...}) を1回呼び perFacility を id で引く。
 *   - 各施設で単施設ビルダを呼び、下記を突合:
 *       売上/販売室数/ADR/同伴  = buildOccupancy(summary)
 *       平均泊数                 = buildStayNights(Σsold/Σreservation)
 *       上位経路の売上/構成比    = buildChannels(matrix)
 *       上位国籍の売上/構成比    = buildNationalities(rows)
 *       予算達成率(actual/budget)= buildOccupancy(summary.roomRevenue / res.budget.roomRevenue)
 *                                  ＋ yearly は buildAnnualSales とも突合
 * 金額は ±1(丸め)・比率は 1e-6 以内を一致とみなす。秘密値は出力しない。
 */
import { Pool } from "pg";
import { loadEnv, isConfigured } from "../db/load-env";
import { buildOverview } from "../../lib/api/overview";
import { buildOccupancy } from "../../lib/api/occupancy";
import { buildStayNights } from "../../lib/api/staynights";
import { buildChannels } from "../../lib/api/channels";
import { buildNationalities } from "../../lib/api/nationalities";
import { buildAnnualSales } from "../../lib/api/annualsales";
import type {
  DashboardFilters,
  ChannelsResponse,
  NationalitiesResponse,
  OverviewFacility,
  Period,
} from "../../lib/api/types";

loadEnv();
if (!isConfigured("SUPABASE_DB_URL")) { console.error("SUPABASE_DB_URL 未設定"); process.exit(1); }
const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });

const EPS = 1e-6;
const num = (v: number | null | undefined) => (v == null ? null : Number(v));
function eqMoney(a: number | null, b: number | null): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(Math.round(a) - Math.round(b)) <= 1;
}
function eqRate(a: number | null, b: number | null): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= EPS;
}
const r0 = (v: number | null) => (v == null ? "-" : String(Math.round(v)));
const r2 = (v: number | null) => (v == null ? "-" : v.toFixed(4));

interface Check { metric: string; ok: boolean; a: number | null; b: number | null; note?: string }
const c = (metric: string, ok: boolean, a: number | null, b: number | null, note?: string): Check => ({ metric, ok, a, b, note });

/** 単施設の経路 上位1件（売上/構成比）を各期間の buildChannels 出力から取り出す。 */
function facilityTopChannel(res: ChannelsResponse, facId: string, monthly: boolean): { channel: string; revenue: number; share: number | null } | null {
  const list = monthly
    ? res.matrix.rows.map((r) => ({ channel: r.channel, revenue: r.cells[facId] ?? 0 })).filter((x) => x.revenue > 0)
    : res.matrix.rows.map((r) => ({ channel: r.channel, revenue: r.total })).filter((x) => x.revenue > 0);
  list.sort((a, b) => b.revenue - a.revenue);
  if (list.length === 0) return null;
  const total = list.reduce((s, x) => s + x.revenue, 0);
  return { channel: list[0].channel, revenue: list[0].revenue, share: total > 0 ? list[0].revenue / total : null };
}

/** 単施設の国籍 上位1件（不明除外・売上/構成比）を buildNationalities 出力から取り出す。
 *  overview は country_normalized 単位なので、ここも normalized に再集約して同一粒度で比較。 */
function facilityTopCountry(res: NationalitiesResponse): { country: string; revenue: number; share: number | null } | null {
  const m = new Map<string, { major: string; revenue: number }>();
  for (const row of res.rows) {
    const e = m.get(row.country);
    if (!e) m.set(row.country, { major: row.countryMajor, revenue: row.revenue });
    else { e.revenue += row.revenue; if (row.countryMajor > e.major) e.major = row.countryMajor; }
  }
  const known = [...m.entries()].filter(([, v]) => v.major !== "不明").map(([country, v]) => ({ country, revenue: v.revenue }));
  known.sort((a, b) => b.revenue - a.revenue);
  if (known.length === 0) return null;
  const total = res.summary.totalRevenue; // 不明含む母数（overview の natTotalRev と同一）
  return { country: known[0].country, revenue: known[0].revenue, share: total > 0 ? known[0].revenue / total : null };
}

async function checkFacility(
  fac: OverviewFacility,
  period: Period,
  year: number,
  month: number | undefined,
  annualRate: number | null | undefined,
): Promise<Check[]> {
  const facId = fac.facilityId;
  const f: DashboardFilters = { facilityId: facId, year, month, period, taxMode: "gross" };
  const monthly = period === "monthly";

  const [occ, stay, chan, nat] = await Promise.all([
    buildOccupancy(pool, f),
    buildStayNights(pool, f),
    buildChannels(pool, f),
    buildNationalities(pool, f),
  ]);

  const checks: Check[] = [];

  // 1) 稼働分析: 売上・販売室数・ADR・同伴
  checks.push(c("売上", eqMoney(fac.current.revenue, occ.summary.roomRevenue), fac.current.revenue, occ.summary.roomRevenue));
  checks.push(c("販売室数", eqMoney(fac.current.soldRoomNights, occ.summary.soldRoomNights), fac.current.soldRoomNights, occ.summary.soldRoomNights));
  checks.push(c("ADR", eqMoney(fac.current.adr, occ.summary.adr), fac.current.adr, occ.summary.adr));
  checks.push(c("同伴", eqRate(fac.current.avgGuestsPerRoom, occ.summary.avgGuestsPerRoom), fac.current.avgGuestsPerRoom, occ.summary.avgGuestsPerRoom));

  // 2) 泊数分析表: 平均泊数 = Σsold / Σreservation
  const expNights = stay.summary.totalReservations > 0 ? stay.summary.totalSoldRoomNights / stay.summary.totalReservations : null;
  checks.push(c("平均泊数", eqRate(fac.current.avgNights, expNights), fac.current.avgNights, expNights));

  // 3) 経路分析: 上位経路の売上・構成比
  const topCh = facilityTopChannel(chan, facId, monthly);
  const ovCh = fac.channels.current[0] ?? null;
  if (topCh == null && ovCh == null) {
    checks.push(c("経路(上位)", true, null, null, "データ無"));
  } else if (topCh == null || ovCh == null) {
    checks.push(c("経路(上位)", false, ovCh?.revenue ?? null, topCh?.revenue ?? null, "片方のみ"));
  } else {
    const sameName = topCh.channel === ovCh.channel;
    checks.push(c("経路売上", sameName && eqMoney(ovCh.revenue, topCh.revenue), ovCh.revenue, topCh.revenue, sameName ? undefined : `名称差 ${ovCh.channel}/${topCh.channel}`));
    checks.push(c("経路構成比", sameName && eqRate(ovCh.share, topCh.share), ovCh.share, topCh.share));
  }

  // 4) 国籍別分析: 上位国籍(不明除外)の売上・構成比
  const topC = facilityTopCountry(nat);
  const ovC = fac.nationalities.top10[0] ?? null;
  if (topC == null && ovC == null) {
    checks.push(c("国籍(上位)", true, null, null, "データ無"));
  } else if (topC == null || ovC == null) {
    checks.push(c("国籍(上位)", false, ovC?.revenue ?? null, topC?.revenue ?? null, "片方のみ"));
  } else {
    const sameName = topC.country === ovC.country;
    checks.push(c("国籍売上", sameName && eqMoney(ovC.revenue, topC.revenue), ovC.revenue, topC.revenue, sameName ? undefined : `名称差 ${ovC.country}/${topC.country}`));
    checks.push(c("国籍構成比", sameName && eqRate(ovC.share, topC.share), ovC.share, topC.share));
  }

  // 5) 予算達成率 = 稼働分析売上 / 予算(budgets)。overview.budget.perFacility と突合。
  const ovBud = fac.budget; // OverviewMetricSet | null
  const budActual = occ.summary.roomRevenue;
  const budAmt = occ.budget ? occ.budget.roomRevenue : null;
  const expRate = budAmt != null && budAmt !== 0 ? budActual / budAmt : null;
  const ovRate = ovBud && ovBud.revenue !== 0 ? fac.current.revenue / ovBud.revenue : null;
  checks.push(c("予算達成率", eqRate(ovRate, expRate), ovRate, expRate, budAmt == null ? "予算無" : undefined));
  // yearly は buildAnnualSales とも突合（予算達成率）
  if (period === "yearly") {
    checks.push(c("予算(annual)", eqRate(ovRate, num(annualRate)), ovRate, num(annualRate), annualRate == null ? "予算無" : undefined));
  }

  return checks;
}

async function runPeriod(label: string, period: Period, year: number, month: number | undefined) {
  const f: DashboardFilters = { facilityId: "all", year, month, period, taxMode: "gross" };
  const ov = await buildOverview(pool, f);

  // yearly: buildAnnualSales を1回呼び施設別の予算達成率を引く
  const annualRate = new Map<string, number | null | undefined>();
  if (period === "yearly") {
    const as = await buildAnnualSales(pool, f);
    for (const row of as.rows) annualRate.set(row.facilityId, row.budgetAchievementRate);
  }

  console.log(`\n======== [${label}] 施設数=${ov.scope.facilityCount} ========`);
  let pass = 0;
  let fail = 0;
  const failLines: string[] = [];

  for (const fac of ov.perFacility) {
    const checks = await checkFacility(fac, period, year, month, annualRate.get(fac.facilityId));
    const bad = checks.filter((x) => !x.ok);
    const nm = fac.name.slice(0, 16).padEnd(16);
    if (bad.length === 0) {
      pass++;
      const nights = fac.current.avgNights;
      console.log(`  OK  ${nm} 売上${r0(fac.current.revenue)} 室${r0(fac.current.soldRoomNights)} ADR${r0(fac.current.adr)} 同伴${r2(fac.current.avgGuestsPerRoom)} 平均泊${r2(nights)}`);
    } else {
      fail++;
      console.log(`  NG  ${nm} 不一致${bad.length}件`);
      for (const b of bad) {
        const line = `        - ${b.metric}: overview=${typeof b.a === "number" && Math.abs(b.a) < 10 ? r2(b.a) : r0(b.a)} vs screen=${typeof b.b === "number" && Math.abs(b.b) < 10 ? r2(b.b) : r0(b.b)}${b.note ? ` (${b.note})` : ""}`;
        console.log(line);
        failLines.push(`[${label}] ${fac.name} ${b.metric}`);
      }
    }
  }
  console.log(`  --- ${label}: PASS=${pass} FAIL=${fail} ---`);
  return { pass, fail, failLines };
}

async function main() {
  const results = [
    await runPeriod("2026-06 monthly gross", "monthly", 2026, 6),
    await runPeriod("2026 yearly gross", "yearly", 2026, undefined),
  ];
  const totalFail = results.reduce((s, r) => s + r.fail, 0);
  const totalPass = results.reduce((s, r) => s + r.pass, 0);
  console.log(`\n======== 総合判定 ========`);
  console.log(`  施設×期間: PASS=${totalPass} FAIL=${totalFail}`);
  if (totalFail === 0) {
    console.log("  ✅ 全施設・全期間で overview の施設別ウィジェットが各分析画面と ±0 一致");
  } else {
    console.log("  ❌ 不一致あり:");
    for (const r of results) for (const l of r.failLines) console.log(`     - ${l}`);
  }
  await pool.end();
  process.exit(totalFail === 0 ? 0 : 2);
}
main().catch(async (e) => { console.error("ERROR:", (e as Error).message); try { await pool.end(); } catch { /* noop */ } process.exit(1); });
