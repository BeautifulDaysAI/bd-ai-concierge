/**
 * 毎朝の市況配信 DB操作
 *
 * © Beautiful Days
 */

import { supabaseAdmin } from "../supabase";

export type MorningBriefStatus =
  | "draft"      // AI生成のみ
  | "reviewing"  // 人間チェック中
  | "approved"   // 承認済み（配信待ち）
  | "sent"       // 配信完了
  | "rejected";  // 却下

export type MorningBrief = {
  id: string;
  publishDate: string;
  aiDraft: string;
  aiGeneratedAt: string;
  humanReviewed: string | null;
  reviewerId: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  sentAt: string | null;
  status: MorningBriefStatus;
};

/**
 * ドラフトを保存
 */
export async function saveDraft(
  publishDate: string,
  aiDraft: string,
): Promise<MorningBrief | null> {
  const { data, error } = await supabaseAdmin
    .from("morning_briefs")
    .upsert(
      {
        publish_date: publishDate,
        ai_draft: aiDraft,
        ai_generated_at: new Date().toISOString(),
        status: "draft",
      },
      { onConflict: "publish_date" },
    )
    .select()
    .single();

  if (error || !data) {
    console.error("[MorningBrief] ドラフト保存エラー", error);
    return null;
  }

  return mapBrief(data);
}

/**
 * チェック中ステータスを取得
 */
export async function getPendingBrief(): Promise<MorningBrief | null> {
  const { data, error } = await supabaseAdmin
    .from("morning_briefs")
    .select("*")
    .in("status", ["draft", "reviewing"])
    .order("publish_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[MorningBrief] 取得エラー", error);
    return null;
  }

  return data ? mapBrief(data) : null;
}

/**
 * 今日の配信用
 */
export async function getTodayBrief(): Promise<MorningBrief | null> {
  const today = new Date().toISOString().split("T")[0];
  const { data, error } = await supabaseAdmin
    .from("morning_briefs")
    .select("*")
    .eq("publish_date", today)
    .maybeSingle();

  if (error) {
    console.error("[MorningBrief] 今日のbrief取得エラー", error);
    return null;
  }

  return data ? mapBrief(data) : null;
}

/**
 * 承認＆配信内容更新
 */
export async function approveBrief(
  briefId: string,
  humanReviewed: string,
  reviewerId?: string,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("morning_briefs")
    .update({
      human_reviewed: humanReviewed,
      reviewer_id: reviewerId ?? null,
      reviewed_at: now,
      approved_at: now,
      status: "approved",
    })
    .eq("id", briefId);

  if (error) {
    console.error("[MorningBrief] 承認エラー", error);
  }
}

/**
 * 配信完了マーク
 */
export async function markSent(briefId: string): Promise<void> {
  await supabaseAdmin
    .from("morning_briefs")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
    })
    .eq("id", briefId);
}

function mapBrief(row: Record<string, unknown>): MorningBrief {
  return {
    id: row.id as string,
    publishDate: row.publish_date as string,
    aiDraft: row.ai_draft as string,
    aiGeneratedAt: row.ai_generated_at as string,
    humanReviewed: row.human_reviewed as string | null,
    reviewerId: row.reviewer_id as string | null,
    reviewedAt: row.reviewed_at as string | null,
    approvedAt: row.approved_at as string | null,
    sentAt: row.sent_at as string | null,
    status: row.status as MorningBriefStatus,
  };
}
