/**
 * 配信先取得（Memberプラン以上の会員）
 *
 * © Beautiful Days
 */

import { supabaseAdmin } from "../supabase";

export type DeliveryTarget = {
  memberId: string;
  lineUserId: string;
  displayName: string | null;
};

/**
 * 市況配信の対象者を取得
 * （Member / Client プラン、退会していない）
 */
export async function getMorningBriefRecipients(): Promise<DeliveryTarget[]> {
  const { data, error } = await supabaseAdmin
    .from("members")
    .select("id, line_user_id, display_name")
    .in("plan", ["member", "client"])
    .is("deleted_at", null);

  if (error || !data) {
    console.error("[Delivery] 受信者取得エラー", error);
    return [];
  }

  return data.map((m) => ({
    memberId: m.id as string,
    lineUserId: m.line_user_id as string,
    displayName: m.display_name as string | null,
  }));
}
