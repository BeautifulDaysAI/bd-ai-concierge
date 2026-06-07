/**
 * Cron: 退会30日後の会員データ削除
 *
 * Vercel Cron で 00:00 JST に毎日実行。
 *
 * 個人情報保護法の「遅滞なく削除」義務への対応。
 * 退会から30日経過した会員のデータを物理削除する。
 *
 * 削除対象：
 * - members レコード本体
 * - messages（CASCADE削除）
 * - documents（CASCADE削除）
 * - Storage上のファイルも削除
 *
 * © Beautiful Days
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db/supabase";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[Cron] 退会会員クリーンアップ開始");

  // 30日前の日時
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffISO = cutoff.toISOString();

  // 削除対象を取得
  const { data: targets, error } = await supabaseAdmin
    .from("members")
    .select("id")
    .lt("deleted_at", cutoffISO)
    .not("deleted_at", "is", null);

  if (error) {
    console.error("[Cleanup] 対象取得エラー", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!targets || targets.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0 });
  }

  const memberIds = targets.map((t) => t.id as string);
  console.log("[Cleanup] 削除対象:", memberIds.length, "名");

  // 1. Storage の各会員フォルダを削除
  for (const memberId of memberIds) {
    try {
      const { data: files } = await supabaseAdmin.storage
        .from("member-documents")
        .list(memberId);

      if (files && files.length > 0) {
        const paths = files.map((f) => `${memberId}/${f.name}`);
        await supabaseAdmin.storage
          .from("member-documents")
          .remove(paths);
      }
    } catch (err) {
      console.error("[Cleanup] Storage削除エラー", memberId, err);
    }
  }

  // 2. members テーブルから削除（CASCADE で messages, documents も削除される）
  const { error: deleteError } = await supabaseAdmin
    .from("members")
    .delete()
    .in("id", memberIds);

  if (deleteError) {
    console.error("[Cleanup] 削除エラー", deleteError);
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  console.log("[Cleanup] 完了:", memberIds.length, "名削除");

  return NextResponse.json({
    ok: true,
    deleted: memberIds.length,
  });
}
