/**
 * 毎日の Supabase 実績取り込み一括実行（hermes cron から起動）。
 * 最新 base.csv → canonical → mart(2本) → as-of スナップショット を順に実行する。
 *
 *   NODE_OPTIONS=--max-old-space-size=8192 npx tsx scripts/db/daily-refresh.ts ["<base.csv>"]
 *
 * - base.csv 既定は OneDrive の minpakuIN-download/base.csv（minpakuin-parity と同一）。
 *   argv[2] か 環境変数 WEBDASH_BASE_CSV で上書き可。snapshots 用の dir は base.csv の親。
 * - いずれかのステップが 0 以外で終了したら即 exit 1（後続を止める）。
 * - 各ステップは既存スクリプトをそのまま子プロセスで実行（heap 8192 を付与）。
 * - 秘密値は一切出力しない（子スクリプトも .env を表示しない）。
 */
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_BASE =
  "C:\\Users\\tckam\\OneDrive - トラベルコネクト\\005.レポート\\コルディオグループ\\全施設レポート\\コルディオグループレポートNEW\\minpakuIN-download\\base.csv";
const BASE = process.argv[2] ?? process.env.WEBDASH_BASE_CSV ?? DEFAULT_BASE;
const DIR = dirname(BASE);

// scripts/db/ → プロジェクトルート
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function tsxCli(): string {
  for (const c of [
    join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"),
    join(ROOT, "node_modules", "tsx", "dist", "cli.cjs"),
  ]) {
    if (existsSync(c)) return c;
  }
  throw new Error("tsx CLI が見つかりません（node_modules/tsx を確認）");
}

function run(label: string, scriptRel: string, args: string[]): void {
  const t0 = Date.now();
  console.log(`\n===== ${label} =====`);
  const res = spawnSync(process.execPath, [tsxCli(), join(ROOT, scriptRel), ...args], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=8192" },
  });
  if (res.error) throw new Error(`${label} 起動失敗: ${res.error.message}`);
  if (res.status !== 0) {
    throw new Error(`${label} 失敗 (exit ${res.status ?? `signal ${res.signal}`})`);
  }
  console.log(`----- ${label} done (${((Date.now() - t0) / 1000).toFixed(0)}s) -----`);
}

function main(): void {
  if (!existsSync(BASE)) throw new Error(`base.csv が見つかりません: ${BASE}`);
  const st = statSync(BASE);
  console.log(
    `daily-refresh: base.csv=${BASE}\n  size=${st.size} bytes  mtime=${st.mtime.toISOString()}`,
  );
  run("STEP 1/4 load-canonical (minpakuin)", "scripts/db/load-canonical.ts", ["minpakuin", BASE]);
  run("STEP 2/4 refresh-marts (daily/channel/room_type)", "scripts/db/refresh-marts.ts", []);
  run("STEP 3/4 refresh-marts2 (country/staynights/booking-curve)", "scripts/db/refresh-marts2.ts", []);
  run("STEP 4/4 load-snapshots (as-of 増分)", "scripts/db/load-snapshots.ts", [DIR]);
  console.log("\n=== DAILY REFRESH DONE ===");
}

try {
  main();
} catch (e) {
  console.error("DAILY REFRESH FAILED:", (e as Error).message);
  process.exit(1);
}
