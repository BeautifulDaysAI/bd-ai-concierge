/**
 * LINE経由のFP相談予約フロー
 *
 * 会員様が「FP相談予約」と送ると起動する。
 *
 * 簡易フロー：
 * 1. 「FP相談予約」検出 → 候補日時を提示
 * 2. 会員様が日時を選ぶ
 * 3. 予約確定 → FP通知 → カレンダー連携
 *
 * Week 4ではシンプルに「候補3つを提示 → 番号で返信」方式
 * （Quick Reply / Flex Message は Week 5 で高度化）
 *
 * © Beautiful Days
 */

import { createAppointment } from "@/lib/db/queries/appointments";
import { notifyFp } from "@/lib/notify/fp";

/**
 * 「FP相談予約」キーワード検出
 */
export function isAppointmentRequest(text: string): boolean {
  const keywords = [
    "FP相談予約",
    "FP相談を予約",
    "相談予約",
    "予約したい",
    "FPに相談したい",
    "相談したい",
  ];
  return keywords.some((kw) => text.includes(kw));
}

/**
 * 候補日時を3つ生成（平日の10時/14時/19時）
 */
export function generateSlots(): { label: string; iso: string }[] {
  const slots: { label: string; iso: string }[] = [];
  const now = new Date();
  let added = 0;
  let offset = 1;

  while (added < 3 && offset < 14) {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    const dayOfWeek = d.getDay();

    // 土日はスキップ
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      offset++;
      continue;
    }

    // 14時で予約
    d.setHours(14, 0, 0, 0);

    const label = d.toLocaleString("ja-JP", {
      month: "numeric",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

    slots.push({ label, iso: d.toISOString() });
    added++;
    offset++;
  }

  return slots;
}

/**
 * 予約フロー初期化応答
 */
export function getAppointmentPromptMessage(): string {
  const slots = generateSlots();

  let text = `📅 FP相談のご予約

以下の候補からご都合のよい日時をお選びください。
番号でお答えいただくか、ご希望の日時をお送りください。

`;

  slots.forEach((s, i) => {
    text += `${i + 1}. ${s.label}\n`;
  });

  text += `
他の日程ご希望の場合は「他の日時を希望」とお送りください。
担当 FP から個別にご案内いたします。`;

  return text;
}

/**
 * 番号選択を検出して予約確定
 */
export async function tryConfirmAppointment(
  userText: string,
  memberId: string,
  memberName: string,
): Promise<string | null> {
  // 「1」「2」「3」または「1番」「２」など
  const match = userText.trim().match(/^[123１２３][番.\s]?$/);
  if (!match) return null;

  // 数字を半角に
  const numMap: Record<string, number> = {
    "1": 1, "2": 2, "3": 3,
    "１": 1, "２": 2, "３": 3,
  };
  const num = numMap[match[0][0]];
  if (!num) return null;

  // 候補を再生成（時系列が変わらないように同じロジックを使う想定）
  // ※ 本実装では Redis/DB に候補を保存してから選ばせるのが安全
  // Week 4ではシンプル化のため、即時生成と同じものを使う
  const slots = generateSlots();
  const selected = slots[num - 1];

  if (!selected) return null;

  // 予約作成
  const appt = await createAppointment({
    memberId,
    scheduledAt: selected.iso,
    durationMinutes: 30,
  });

  if (!appt) {
    return "申し訳ありません、予約処理に失敗しました。少し時間をおいて再度お試しください。";
  }

  // FPに通知
  await notifyFp({
    type: "fp_appointment",
    memberName,
    memberId,
    summary: `FP相談予約：${selected.label}`,
    details: { scheduled_at: selected.iso },
    link: `${process.env.NEXT_PUBLIC_APP_URL}/admin/appointments`,
  });

  return `📅 FP相談を予約しました

日時：${selected.label}
所要時間：30分

▼ 当日について
担当 FP から開始10分前にメッセージをお送りします。
ご相談内容を事前に整理いただけると、より深いお話ができます。

ご予約の変更・キャンセルは、こちらに「予約変更」とお送りください。`;
}
