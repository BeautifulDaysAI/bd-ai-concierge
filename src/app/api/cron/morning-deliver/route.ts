/**
 * Cron: 朝の市況一斉配信
 *
 * Vercel Cron で 07:30 JST (= 22:30 UTC) に毎日呼ばれる。
 *
 * 処理：
 * 1. 今日の brief が "approved" ならそれを取得
 * 2. Member/Client プラン会員全員に LINE 配信
 * 3. 配信完了したら brief.status を "sent" に更新
 *
 * © Beautiful Days
 */

import { NextRequest, NextResponse } from "next/server";
import { getTodayBrief, markSent } from "@/lib/db/queries/morning-briefs";
import { getMorningBriefRecipients } from "@/lib/db/queries/delivery";
import { lineClient } from "@/lib/line/client";
import { notifyFp } from "@/lib/notify/fp";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[Cron] 朝の市況配信開始");

  // 1. 今日の brief を取得
  const brief = await getTodayBrief();
  if (!brief) {
    console.log("[Cron] 今日の brief なし");
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "no_brief",
    });
  }

  if (brief.status !== "approved") {
    console.log("[Cron] brief が未承認", brief.status);
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: `status_${brief.status}`,
    });
  }

  // 2. 配信先を取得
  const recipients = await getMorningBriefRecipients();
  console.log("[Cron] 配信先:", recipients.length, "名");

  if (recipients.length === 0) {
    await markSent(brief.id);
    return NextResponse.json({
      ok: true,
      sent: 0,
      reason: "no_recipients",
    });
  }

  // 3. 一斉送信（pushMessage）
  const message = brief.humanReviewed ?? brief.aiDraft;
  let successCount = 0;
  let failCount = 0;

  // LINEの multicast は500件まで一括可能だが、Week 4ではシンプルに個別送信
  for (const recipient of recipients) {
    try {
      await lineClient.pushMessage({
        to: recipient.lineUserId,
        messages: [{ type: "text", text: message }],
      });
      successCount++;
    } catch (err) {
      console.error("[Cron] 配信失敗:", recipient.memberId, err);
      failCount++;
    }
  }

  // 4. ステータス更新
  await markSent(brief.id);

  // 5. FP に配信完了通知
  await notifyFp({
    type: "morning_brief_ready",
    summary: `☀️ 朝の市況配信完了`,
    details: {
      sent_to: successCount,
      failed: failCount,
      brief_id: brief.id,
    },
  });

  console.log("[Cron] 朝の市況配信完了", { successCount, failCount });

  return NextResponse.json({
    ok: true,
    sent: successCount,
    failed: failCount,
  });
}
