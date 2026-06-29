import type {
  CanonicalStayNight,
  FeeAdjustmentRule,
  SourceSystem,
} from "./canonical-schema";

export type { CanonicalStayNight, FeeAdjustmentRule, SourceSystem };

/** raw ファイルの取込コンテキスト（詳細設計書 §5.2） */
export interface RawFileContext {
  rawFileId: string;
  storagePath: string;
  originalFileName: string;
  sourceFacilityCode?: string;
  encoding?: "utf-8-sig" | "utf-8" | "cp932" | "shift_jis";
}

/** parse 結果の raw 1 行 */
export interface ParsedRawRow {
  /** 1 始まりの raw 行番号 */
  rawRowNumber: number;
  /** 列名 → 値。PII を含む可能性があるため canonical/API には流さない */
  payload: Record<string, string>;
}

export interface ParsedSourceRows {
  sourceSystem: SourceSystem;
  rawFileId: string;
  rows: ParsedRawRow[];
}

/** validation issue（api-contract / 取込仕様 §5 に対応） */
export interface ValidationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  rawRowNumber?: number;
  canonicalRowNumber?: number;
  field?: string;
}

export interface ValidationResult {
  canCommit: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

/** normalize 時に adapter へ渡すマスタ解決・補正ルール */
export interface NormalizeContext {
  /** PMS 側施設コード/名称 → 内部 facility_id（uuid） */
  resolveFacilityId(input: {
    sourceSystem: SourceSystem;
    sourceFacilityCode?: string;
    sourceFacilityName?: string;
  }): string | null;
  /** raw 部屋タイプ → { normalized, budget } */
  resolveRoomType(input: {
    sourceSystem: SourceSystem;
    facilityId: string;
    roomTypeRaw: string;
  }): { roomTypeNormalized: string; budgetRoomType: string } | null;
  /** raw 経路 → 正規化経路名 */
  resolveChannel(input: {
    sourceSystem: SourceSystem;
    channelRaw: string;
  }): { channelNormalized: string; channelGroup?: string } | null;
  /** raw 国籍 → 分類 */
  resolveCountry(input: {
    countryRaw: string;
  }): {
    countryNormalized: string;
    countryMajor: string;
    countryMiddle: string;
  } | null;
  /** 有効な手数料補正ルール（valid_from/valid_to で適用判定） */
  feeRules: FeeAdjustmentRule[];
}

/** PMS/OTA ごとの取込アダプタ（詳細設計書 §5.1） */
export interface ImportAdapter {
  sourceSystem: SourceSystem;
  detect(input: RawFileContext): Promise<boolean>;
  parse(input: RawFileContext): Promise<ParsedSourceRows>;
  validate(
    rows: ParsedSourceRows,
    context: NormalizeContext,
  ): Promise<ValidationResult>;
  normalize(
    rows: ParsedSourceRows,
    context: NormalizeContext,
  ): Promise<CanonicalStayNight[]>;
}
