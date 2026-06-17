import type { FeeAdjustmentRule, SourceSystem } from "./canonical-schema";

/**
 * 全 PMS adapter で共有する純粋ユーティリティ。
 * CSV パース / 文字コード / 日付 / 数値 / 手数料補正・税逆算。
 * 副作用なし・決定論的（テスト容易）。
 */

// ---- 文字コード --------------------------------------------------------
/** UTF-8 (BOM 可)。TextDecoder が先頭 BOM を除去する。 */
export function decodeUtf8(bytes: Uint8Array): string {
  return stripBom(new TextDecoder("utf-8").decode(bytes));
}

/** cp932 / Shift_JIS。Node(フルICU)/ブラウザの TextDecoder が対応。 */
export function decodeShiftJis(bytes: Uint8Array): string {
  return stripBom(new TextDecoder("shift_jis").decode(bytes));
}

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// ---- CSV ---------------------------------------------------------------
/** RFC4180 風 CSV パーサ。引用符内のカンマ/改行/二重引用符に対応。 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = stripBom(text);
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // CRLF/CR: 行終端は \n 側で処理。単独 CR は無視
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** ヘッダ行 + データ行 → 列名キーのレコード配列。row 長がヘッダ長と異なる行は ragged。 */
export function toRecords(matrix: string[][]): {
  header: string[];
  records: Array<{ rawRowNumber: number; payload: Record<string, string>; ragged: boolean }>;
} {
  const header = (matrix[0] ?? []).map((h) => h.trim());
  const records = matrix.slice(1).map((cols, idx) => {
    const payload: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) payload[header[i]] = cols[i] ?? "";
    return { rawRowNumber: idx + 2, payload, ragged: cols.length !== header.length };
  });
  return { header, records };
}

// ---- 日付 --------------------------------------------------------------
/** "YYYY/MM/DD" または "YYYY-MM-DD" → "YYYY-MM-DD"。不正は null。 */
export function parseDate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const mm = mo.padStart(2, "0");
  const dd = d.padStart(2, "0");
  const ymd = `${y}-${mm}-${dd}`;
  return isValidYmd(ymd) ? ymd : null;
}

function isValidYmd(ymd: string): boolean {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** "YYYY-MM-DD" に日数を加算 */
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** 月初日 "YYYY-MM-01" */
export function monthStart(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

/** 日付 (時刻なし) → JST 0時の ISO 文字列 */
export function jstMidnightIso(ymd: string): string {
  return `${ymd}T00:00:00+09:00`;
}

/** 2つの "YYYY-MM-DD" の日数差 (a - b) */
export function dayDiff(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  return Math.round((da - db) / 86400000);
}

// ---- 数値 --------------------------------------------------------------
export function isBlank(s: string | undefined | null): boolean {
  return s === undefined || s === null || s.trim() === "";
}

/** 数値化できる文字列か（空欄は false 扱いにせず呼び出し側で判定） */
export function isNumericLike(s: string): boolean {
  if (isBlank(s)) return false;
  return !Number.isNaN(Number(s.replace(/,/g, "").trim()));
}

/** 空欄/非数値→0、それ以外は数値（カンマ除去） */
export function toNumOr0(s: string | undefined | null): number {
  if (isBlank(s)) return 0;
  const n = Number((s as string).replace(/,/g, "").trim());
  return Number.isNaN(n) ? 0 : n;
}

// ---- 手数料補正・税 ----------------------------------------------------
/** 税込総額から消費税を逆算（税率 r、既定 floor） */
export function reverseTax(gross: number, rate = 0.1, rounding: "floor" | "round" | "ceil" = "floor"): number {
  const raw = (gross * rate) / (1 + rate);
  if (rounding === "round") return Math.round(raw);
  if (rounding === "ceil") return Math.ceil(raw);
  return Math.floor(raw);
}

/** stay_date 時点で有効な手数料補正ルールを1件選ぶ（channel 一致を優先） */
export function pickFeeRule(
  rules: FeeAdjustmentRule[],
  args: { sourceSystem: SourceSystem; channelNormalized: string | null; stayDate: string },
): FeeAdjustmentRule | null {
  const candidates = rules.filter((r) => {
    if (r.sourceSystem && r.sourceSystem !== args.sourceSystem) return false;
    if (r.channelNormalized && r.channelNormalized !== args.channelNormalized) return false;
    if (args.stayDate < r.validFrom) return false;
    if (r.validTo && args.stayDate > r.validTo) return false;
    return true;
  });
  if (candidates.length === 0) return null;
  // channel 指定ありを優先、その中で validFrom が新しいものを優先
  candidates.sort((a, b) => {
    const ac = a.channelNormalized ? 1 : 0;
    const bc = b.channelNormalized ? 1 : 0;
    if (ac !== bc) return bc - ac;
    return a.validFrom < b.validFrom ? 1 : -1;
  });
  return candidates[0];
}

export interface FeeAdjusted {
  grossAmount: number;
  taxAmount: number;
  netAmount: number;
  ruleId: string | null;
}

/**
 * 手数料補正後の税込/税額/税抜を算出。
 *
 * 規約:
 *   fee_adjusted_gross = round(gross / gross_divisor)
 *   fee_adjusted_tax   = round(tax  / gross_divisor)   ← 税も同率で割り戻す
 *   fee_adjusted_net   = fee_adjusted_gross - fee_adjusted_tax
 *
 * gross_divisor=1（補正なし）なら入力税込/税額をそのまま使う。
 * ⚠️ 補正チャネル(Agoda/Trip.com)での税の割戻し方・丸めは create_report.py 未確認。
 *    暫定実装。base.csv + create_report.py で要検証（コード内 ASSUMPTION:FEE_TAX_SPLIT）。
 */
export function applyFeeAdjustment(
  rawGross: number,
  rawTax: number,
  rule: FeeAdjustmentRule | null,
): FeeAdjusted {
  if (!rule || rule.grossDivisor === 1) {
    return { grossAmount: rawGross, taxAmount: rawTax, netAmount: rawGross - rawTax, ruleId: rule?.id ?? null };
  }
  const gross = Math.round(rawGross / rule.grossDivisor);
  const tax = Math.round(rawTax / rule.grossDivisor); // ASSUMPTION:FEE_TAX_SPLIT
  return { grossAmount: gross, taxAmount: tax, netAmount: gross - tax, ruleId: rule.id ?? null };
}
