/**
 * 環境変数のバリデーション
 *
 * 起動時に必須の環境変数が揃っているかチェック。
 * 不足している場合は警告ログを出す（本番ではエラーにする）。
 *
 * © Beautiful Days
 */

import { z } from "zod";

const envSchema = z.object({
  // LINE
  LINE_CHANNEL_SECRET: z.string().min(1, "LINE_CHANNEL_SECRET 必須"),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().min(1, "LINE_CHANNEL_ACCESS_TOKEN 必須"),

  // Anthropic
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY 必須"),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-5"),

  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL は有効なURLが必要"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY 必須"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY 必須"),

  // App
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Optional
  ADMIN_WEBHOOK_URL: z.string().url().optional().or(z.literal("")),
  MORNING_REVIEWER_NOTIFY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

/**
 * 環境変数を取得（バリデーション込み）
 */
export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");

    console.error(`[ENV] バリデーションエラー:\n${errors}`);

    // 本番では起動を止める
    if (process.env.NODE_ENV === "production") {
      throw new Error(`環境変数エラー:\n${errors}`);
    }
  }

  cachedEnv = (result.success ? result.data : (process.env as unknown as Env));
  return cachedEnv;
}
