import { createBrowserClient } from "@supabase/ssr";

/**
 * ブラウザ用 Supabase クライアント（Client Component から使用）。
 * anon キーのみ使用（RLS が将来のセキュリティ境界。現状は middleware でゲート）。
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
