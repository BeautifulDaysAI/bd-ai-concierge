/**
 * FP への LINE push通知
 *
 * 予約確定・キャンセル時にFPのLINEアカウントへ即時通知する。
 * FP_LINE_USER_ID が未設定の場合は送信をスキップする。
 *
 * © Beautiful Days
 */

import { lineClient } from "@/lib/line/client";

export async function notifyFpLine(text: string): Promise<void> {
  const fpUserId = process.env.FP_LINE_USER_ID;
  if (!fpUserId) {
    console.log("[NotifyLine] FP_LINE_USER_ID 未設定。送信スキップ", text);
    return;
  }

  try {
    await lineClient.pushMessage({
      to: fpUserId,
      messages: [{ type: "text", text }],
    });
  } catch (err) {
    console.error("[NotifyLine] 送信エラー", err);
  }
}
