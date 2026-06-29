import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Claude Design のプロトタイプ。ブラウザ内 Babel 前提の参照資料であり
    // アプリのソースではないため lint 対象外（実装は視覚を再現する）。
    "docs/**",
  ]),
]);

export default eslintConfig;
