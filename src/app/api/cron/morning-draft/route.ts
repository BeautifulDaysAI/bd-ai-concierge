/**
 * Cron: 夜22時の市況ドラフト生成
 *
 * Vercel Cron で 22:00 JST (= 13:00 UTC) に毎日呼ばれる。
 *
 * 処理：
 * 1. 翌日分の市況サマリをAIで生成
 * 2. DB に "draft" として保存
 * 3. FPに「ドラフト準備完了」通知
 *
 * © Beautiful Days
 */

import { NextRequest, NextResponse } from "next/server";
import { generateMorningDraft } from "@/lib/ai/morning-brief";
import { saveDraft } from "@/lib/db/queries/morning-briefs";
import { notifyFp } from "@/lib/notify/fp";

export async function GET(request: NextRequest) {
  // Vercel Cronからの呼び出しを認証
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[Cron] 市況ドラフト生成開始");

  try {
    // 翌日の日付
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const publishDate = tomorrow.toISOString().split("T")[0];

    // AIで生成
    const draft = await generateMorningDraft();

    // DBに保存
    const saved = await saveDraft(publishDate, draft);
    if (!saved) {
      throw new Error("ドラフトのDB保存失敗");
    }

    // FPに通知
    await notifyFp({
      type: "morning_brief_ready",
      summary: `明日（${publishDate}）の市況ドラフトが準備できました`,
      details: { brief_id: saved.id },
      link: `${process.env.NEXT_PUBLIC_APP_URL}/admin/morning-brief`,
    });

    console.log("[Cron] 市況ドラフト生成完了", { briefId: saved.id });

    return NextResponse.json({
      ok: true,
      briefId: saved.id,
      publishDate,
    });
  } catch (err) {
    console.error("[Cron] エラー", err);
    return NextResponse.json(
      { error: "Internal error", details: String(err) },
      { status: 500 },
    );
  }
}
