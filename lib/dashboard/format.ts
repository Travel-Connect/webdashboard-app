/* ============================================================
   format.ts — JPY / Asia-Tokyo formatters
   Ported from docs/webdashboard-app2/project/app/lib.jsx
   All return "—" for null/undefined/NaN.
   ============================================================ */

export const EM_DASH = "—";

type Num = number | null | undefined;

const _nf = new Intl.NumberFormat("ja-JP");

const isBlank = (n: Num): n is null | undefined =>
  n == null || (typeof n === "number" && Number.isNaN(n));

/** Integer with thousands separators. e.g. 1234 -> "1,234" */
export const integer = (n: Num): string =>
  isBlank(n) ? EM_DASH : _nf.format(Math.round(n));

/** Yen with ¥ prefix and thousands separators. e.g. 553514 -> "¥553,514" */
export const yen = (n: Num): string =>
  isBlank(n) ? EM_DASH : "¥" + _nf.format(Math.round(n));

/** Compact yen using 億 / 万 units. e.g. 20965637 -> "¥2,097万" */
export const yenCompact = (n: Num): string => {
  if (isBlank(n)) return EM_DASH;
  const a = Math.abs(n);
  if (a >= 1e8) return "¥" + (n / 1e8).toFixed(2).replace(/\.?0+$/, "") + "億";
  if (a >= 1e4) return "¥" + _nf.format(Math.round(n / 1e4)) + "万";
  return "¥" + _nf.format(Math.round(n));
};

/** Percentage. e.g. percent(83.8) -> "83.8%" */
export const percent = (n: Num, digits = 1): string =>
  isBlank(n) ? EM_DASH : n.toFixed(digits) + "%";

/** Signed point delta. e.g. point(3.2) -> "+3.2pt" */
export const point = (n: Num, digits = 1): string =>
  isBlank(n) ? EM_DASH : (n > 0 ? "+" : "") + n.toFixed(digits) + "pt";

/** Signed percent delta. e.g. delta(-2.1) -> "-2.1%" */
export const delta = (n: Num, digits = 1): string =>
  isBlank(n) ? EM_DASH : (n > 0 ? "+" : "") + n.toFixed(digits) + "%";

/** Generic guard: returns "—" for blank, else passes value through `fn`. */
export const orDash = <T,>(n: Num, fn: (v: number) => T): T | string =>
  isBlank(n) ? EM_DASH : fn(n);
