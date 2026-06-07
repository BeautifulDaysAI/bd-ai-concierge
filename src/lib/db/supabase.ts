/**
 * Supabase クライアント
 *
 * 重要：必ず東京リージョン (ap-northeast-1) で作成すること
 *
 * © Beautiful Days
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn("[Supabase] 環境変数が未設定です");
}

/**
 * サーバー側で使う管理権限クライアント
 * service_role キーは絶対にクライアント側に露出させない
 */
export const supabaseAdmin = createClient(
  supabaseUrl || "",
  supabaseServiceKey || "",
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);
