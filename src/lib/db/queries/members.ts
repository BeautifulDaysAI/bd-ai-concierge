/**
 * 会員管理のDB操作
 *
 * © Beautiful Days
 */

import { supabaseAdmin } from "../supabase";

export type MemberPlan = "free" | "member" | "client";

export type Member = {
  id: string;
  lineUserId: string;
  displayName: string | null;
  plan: MemberPlan;
  email: string | null;
  joinedAt: string;
  lastActiveAt: string | null;
  deletedAt: string | null;
};

/**
 * LINE User IDから会員を取得（なければ作成）
 *
 * フォロー時 or 初回メッセージ時に呼ばれる想定
 */
export async function getOrCreateMember(
  lineUserId: string,
  displayName?: string,
): Promise<Member | null> {
  // 既存会員を探す
  const { data: existing, error: findError } = await supabaseAdmin
    .from("members")
    .select("*")
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  if (findError) {
    console.error("[DB] 会員検索エラー", findError);
    return null;
  }

  if (existing) {
    // 最終アクティブ日時を更新
    await supabaseAdmin
      .from("members")
      .update({ last_active_at: new Date().toISOString() })
      .eq("id", existing.id);

    return mapToMember(existing);
  }

  // 新規作成（デフォルトはFreeプラン）
  const { data: created, error: createError } = await supabaseAdmin
    .from("members")
    .insert({
      line_user_id: lineUserId,
      display_name: displayName ?? null,
      plan: "free",
      last_active_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (createError || !created) {
    console.error("[DB] 会員作成エラー", createError);
    return null;
  }

  console.log("[DB] 新規会員作成:", created.id);
  return mapToMember(created);
}

/**
 * 会員プランを更新
 */
export async function updateMemberPlan(
  memberId: string,
  plan: MemberPlan,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("members")
    .update({ plan })
    .eq("id", memberId);

  if (error) {
    console.error("[DB] プラン更新エラー", error);
  }
}

/**
 * 退会処理（ソフトデリート）
 * 個人情報保護法対応：30日後に物理削除予定（pg_cronで実装）
 */
export async function markMemberDeleted(lineUserId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("members")
    .update({ deleted_at: new Date().toISOString() })
    .eq("line_user_id", lineUserId);

  if (error) {
    console.error("[DB] 退会処理エラー", error);
  }
}

// DBの行をMember型に変換
function mapToMember(row: Record<string, unknown>): Member {
  return {
    id: row.id as string,
    lineUserId: row.line_user_id as string,
    displayName: row.display_name as string | null,
    plan: row.plan as MemberPlan,
    email: row.email as string | null,
    joinedAt: row.joined_at as string,
    lastActiveAt: row.last_active_at as string | null,
    deletedAt: row.deleted_at as string | null,
  };
}
