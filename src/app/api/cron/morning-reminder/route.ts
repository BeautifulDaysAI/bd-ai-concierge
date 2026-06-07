/**
 * Cron: 朝7時 - 市況チェック係に通知
 *
 * Vercel Cron で 07:00 JST (= 22:00 UTC) に毎日呼ばれる。
 *
 * 処理：
 * - 今日配信予定の brief が "draft" のままならチェック係に再通知
 *
 * © Beautiful Days
 */

import { NextRequest, NextResponse } from "next/server";
import { getTodayBrief } from "@/lib/db/queries/morning-briefs";
import { notifyFp } from "@/lib/notify/fp";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const brief = await getTodayBrief();

  if (!brief) {
    return NextResponse.json({
      ok: true,
      message: "今日配信予定のbriefはありません",
    });
  }

  if (brief.status === "draft" || brief.status === "reviewing") {
    // まだチェック完了していない → 再通知
    await notifyFp({
      type: "morning_brief_ready",
      summary: `🔔 朝の市況配信が未承認です。確認をお願いします`,
      details: { status: brief.status, brief_id: brief.id },
      link: `${process.env.NEXT_PUBLIC_APP_URL}/admin/morning-brief`,
    });
  }

  return NextResponse.json({ ok: true, status: brief.status });
}
