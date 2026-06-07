/**
 * メッセージログのDB操作
 *
 * 重要：全会話を保存し、週次レビューで品質チェックする
 * 個人情報保護法：退会30日後に自動削除（pg_cronで実装予定）
 *
 * © Beautiful Days
 */

import { supabaseAdmin } from "../supabase";
import type { FilterLevel } from "@/lib/ai/respond";

export type SaveMessageInput = {
  memberId: string;
  direction: "in" | "out";
  content: string;
  filterLevel?: FilterLevel;
  aiModel?: string;
  ngDetected?: boolean;
  ngWords?: string[];
};

/**
 * メッセージを保存
 */
export async function saveMessage(input: SaveMessageInput): Promise<void> {
  const { error } = await supabaseAdmin.from("messages").insert({
    member_id: input.memberId,
    direction: input.direction,
    content: input.content,
    filter_level: input.filterLevel ?? null,
    ai_model: input.aiModel ?? null,
    ng_detected: input.ngDetected ?? false,
    ng_words: input.ngWords ?? null,
  });

  if (error) {
    console.error("[DB] メッセージ保存失敗", error);
    // 保存失敗してもユーザー体験を止めないので throw しない
  }
}

/**
 * 直近の会話履歴を取得（文脈として AI に渡す用）
 */
export async function getRecentMessages(
  memberId: string,
  limit: number = 10,
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const { data, error } = await supabaseAdmin
    .from("messages")
    .select("direction, content, created_at")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) {
    console.error("[DB] 履歴取得失敗", error);
    return [];
  }

  // 古い順に並び替えて、Claudeのmessages形式に変換
  return data
    .reverse()
    .map((m) => ({
      role: m.direction === "in" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    }));
}
