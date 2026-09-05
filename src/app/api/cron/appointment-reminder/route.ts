/**
 * Cron: 前日リマインドLINE通知
 *
 * Vercel Cron で 10:00 JST (= 01:00 UTC) に毎日呼ばれる。
 * 翌日(JST)開催の予約者に、LINE pushでリマインドを送る。
 *
 * © Beautiful Days
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getAppointmentsForReminder,
  claimReminderSlot,
} from "@/lib/db/queries/appointments";
import { lineClient } from "@/lib/line/client";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function formatJstLabel(isoString: string): string {
  const jst = new Date(new Date(isoString).getTime() + JST_OFFSET_MS);
  const month = jst.getUTCMonth() + 1;
  const day = jst.getUTCDate();
  const dow = WEEKDAYS[jst.getUTCDay()];
  const hour = String(jst.getUTCHours()).padStart(2, "0");
  return `${month}/${day}(${dow}) ${hour}:00`;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const nowJst = new Date(Date.now() + JST_OFFSET_MS);
  const tomorrowJstStart = new Date(
    Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth(), nowJst.getUTCDate() + 1),
  );
  const tomorrowJstEnd = new Date(
    Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth(), nowJst.getUTCDate() + 2),
  );
  const rangeStartIso = new Date(tomorrowJstStart.getTime() - JST_OFFSET_MS).toISOString();
  const rangeEndIso = new Date(tomorrowJstEnd.getTime() - JST_OFFSET_MS).toISOString();

  const appointments = await getAppointmentsForReminder(rangeStartIso, rangeEndIso);

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const appt of appointments) {
    if (!appt.memberLineUserId) continue;

    // 送信前に原子的に枠を確保する。cronの同時・重複実行があっても
    // このUPDATEに成功できるのは1回だけなので、二重送信を防げる。
    const claimed = await claimReminderSlot(appt.id);
    if (!claimed) {
      console.error("[Reminder] 既に送信済み/確保済みのためスキップ", { appointmentId: appt.id });
      skipped++;
      continue;
    }

    const label = formatJstLabel(appt.scheduledAt);

    try {
      await lineClient.pushMessage({
        to: appt.memberLineUserId,
        messages: [
          {
            type: "text",
            text: `明日 ${label}〜のご相談のお時間です。\n担当者がお待ちしております。当日のキャンセルはお早めにご連絡ください。`,
          },
        ],
      });
      sent++;
    } catch (err) {
      console.error("[Reminder] LINE送信失敗", { appointmentId: appt.id, err: String(err) });
      failed++;
    }
  }

  return NextResponse.json({ ok: true, total: appointments.length, sent, failed, skipped });
}
