import { defineConfig } from "vitest/config";

export default defineConfig({
  // Vite ネイティブの tsconfig paths 解決（@/* エイリアス）
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["**/__tests__/**/*.test.{ts,tsx}", "**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**"],
  },
});
