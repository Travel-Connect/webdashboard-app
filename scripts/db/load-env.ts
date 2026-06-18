import { readFileSync, existsSync } from "node:fs";

/**
 * .env.local を process.env へ読み込む（スクリプト用の最小ローダ）。
 * 値は一切出力しない。既存の process.env を上書きしない。
 */
export function loadEnv(path = ".env.local"): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue; // コメント/空行はスキップ
    const key = m[1];
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

/** 値を出さずに「設定済みか（プレースホルダでないか）」だけ判定 */
export function isConfigured(key: string): boolean {
  const v = process.env[key] ?? "";
  return v.length > 0 && !v.includes("YOUR_");
}
