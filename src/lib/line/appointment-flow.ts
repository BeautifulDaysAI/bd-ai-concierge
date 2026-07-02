/**
 * 相談予約フロー（Google Calendar連携版）
 *
 * フロー：
 * 1. 「相談予約」検出 → 希望日時を質問
 * 2. 希望をAIがパース → Google Calendar空き時間検索
 * 3. 候補3つ提示
 * 4. 番号選択 → Googleカレンダーにイベント追加 → DB保存 → FP通知
 *
 * © Beautiful Days
 */

import { getAnthropicClient, getDefaultModel } from "@/lib/ai/client";
import { findAvailableSlots, createReservation, getNowJst, jstToUtc } from "@/lib/google/calendar";
import { createAppointment } from "@/lib/db/queries/appointments";
import { notifyFp } from "@/lib/notify/fp";

/**
 * 「相談予約」キーワード検出
 */
export function isAppointmentRequest(text: string): boolean {
  const keywords = [
    "相談予約",
    "予約したい",
    "相談したい",
    "FP相談予約",
    "FP相談を予約",
    "FPに相談したい",
  ];
  return keywords.some((kw) => text.includes(kw));
}

/**
 * 予約セッション中かどうかを会話履歴から判定
 */
export function isInReservationSession(
  history: { role: "user" | "assistant"; content: string }[],
): boolean {
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role === "assistant") {
      if (msg.content.includes("予約が確定しました")) return false;
      if (msg.content.includes("予約の確定に失敗")) return false;
      if (msg.content.includes("ご希望の曜日・時間帯を教えてください")) return true;
      if (msg.content.includes("以下の候補からご都合のよい日時")) return true;
    }
  }
  return false;
}

/**
 * 予約フローのどのステップかを判定
 */
export function getReservationStep(
  history: { role: "user" | "assistant"; content: string }[],
): "ask_preference" | "show_slots" | "none" {
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role === "assistant") {
      if (msg.content.includes("予約が確定しました")) return "none";
      if (msg.content.includes("予約の確定に失敗")) return "none";
      if (msg.content.includes("以下の候補からご都合のよい日時")) return "show_slots";
      if (msg.content.includes("ご希望の曜日・時間帯を教えてください")) return "ask_preference";
    }
  }
  return "none";
}

/**
 * 予約フロー開始メッセージ
 */
export function getAppointmentPromptMessage(): string {
  return `ご相談の予約を承ります。

ご希望の曜日・時間帯を教えてください。
（例：来週の平日19時以降、今週木曜の午後、いつでもOK）

担当者のカレンダーから空き時間をお探しします。`;
}

/**
 * 予約セッション中のユーザーメッセージ履歴を抽出
 * （条件継承のため、セッション内の全ユーザー発言を取得）
 */
function extractReservationContext(
  history: { role: "user" | "assistant"; content: string }[],
): string[] {
  const context: string[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role === "assistant") {
      if (msg.content.includes("予約が確定しました")) break;
      if (msg.content.includes("予約の確定に失敗")) break;
      if (msg.content.includes("ご希望の曜日・時間帯を教えてください")) {
        break;
      }
    }
    if (msg.role === "user") {
      context.unshift(msg.content);
    }
  }
  return context;
}

/**
 * ユーザーの希望をAIでパースして日時制約に変換
 * 会話履歴から条件を引き継ぐ
 */
async function parsePreference(
  userText: string,
  history: { role: "user" | "assistant"; content: string }[],
): Promise<{
  from: Date;
  to: Date;
  preferredHourStart: number;
  preferredHourEnd: number;
  weekdaysOnly: boolean;
}> {
  const jst = getNowJst();
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

  const previousContext = extractReservationContext(history);
  const contextText = previousContext.length > 0
    ? `\n\nこれまでの会話でユーザーが伝えた条件:\n${previousContext.map((c) => `- 「${c}」`).join("\n")}\n\n最新の発言: 「${userText}」\n\n最新の発言で追加・変更された条件は反映し、以前の条件（時間帯等）は明示的に変更されない限り引き継いでください。`
    : `\nユーザーの希望: 「${userText}」`;

  const prompt = `ユーザーの希望日時を解析してJSON形式で返してください。
今日は${jst.year}年${jst.month + 1}月${jst.day}日（${weekdays[jst.dayOfWeek]}曜日）です。
${contextText}

以下のJSON形式のみを返してください（説明不要）:
{
  "fromDaysOffset": 検索開始日（今日から何日後。0=今日、1=明日）,
  "toDaysOffset": 検索終了日（今日から何日後。最大14）,
  "hourStart": 希望開始時間（9-21の整数。「午後」なら12、「夕方」なら17、「19時以降」なら19。指定なしは9）,
  "hourEnd": 希望終了時間（9-21の整数。「午前中」なら12、「午後」なら21。指定なしは21）,
  "weekdaysOnly": 平日のみか（true/false。土日希望ならfalse）
}`;

  try {
    const result = await getAnthropicClient().messages.create({
      model: getDefaultModel(),
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });

    const content = result.content[0];
    if (content.type !== "text") throw new Error("unexpected response type");

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("no JSON in response");

    const parsed = JSON.parse(jsonMatch[0]) as {
      fromDaysOffset: number;
      toDaysOffset: number;
      hourStart: number;
      hourEnd: number;
      weekdaysOnly: boolean;
    };

    console.log("[Reservation] パース結果:", parsed);

    const hourStart = Math.max(9, Math.min(21, parsed.hourStart));
    const hourEnd = Math.max(hourStart + 1, Math.min(21, parsed.hourEnd));

    const from = jstToUtc(
      jst.year, jst.month,
      jst.day + Math.max(0, parsed.fromDaysOffset),
      hourStart,
    );

    const to = jstToUtc(
      jst.year, jst.month,
      jst.day + Math.min(14, parsed.toDaysOffset),
      hourEnd,
    );

    return { from, to, preferredHourStart: hourStart, preferredHourEnd: hourEnd, weekdaysOnly: parsed.weekdaysOnly };
  } catch (err) {
    console.warn("[Reservation] 希望パース失敗、デフォルト使用", err);
    const from = jstToUtc(jst.year, jst.month, jst.day + 1, 9);
    const to = jstToUtc(jst.year, jst.month, jst.day + 14, 21);
    return { from, to, preferredHourStart: 9, preferredHourEnd: 21, weekdaysOnly: true };
  }
}

/**
 * 希望を受け取り、空き時間候補を返す
 */
export async function handlePreferenceAndFindSlots(
  userText: string,
  history: { role: "user" | "assistant"; content: string }[],
): Promise<string> {
  try {
    const constraints = await parsePreference(userText, history);
    const slots = await findAvailableSlots({
      ...constraints,
      maxResults: 3,
    });

    if (slots.length === 0) {
      return `申し訳ありません、ご希望の条件では空き枠が見つかりませんでした。

別の日程や時間帯でご希望があればお知らせください。
（例：来週の平日、土日でもOK、午前中希望）`;
    }

    let text = `以下の候補からご都合のよい日時をお選びください。
番号でお答えください。

`;
    slots.forEach((s, i) => {
      text += `${i + 1}. ${s.label}\n`;
    });

    text += `
他の日程をご希望の場合は、改めて希望をお知らせください。`;

    return text;
  } catch (err) {
    console.error("[Reservation] 空き時間検索エラー", err);
    return `申し訳ありません、カレンダーの確認中にエラーが発生しました。
少し時間をおいて再度「相談予約」とお送りください。`;
  }
}

/**
 * 番号選択から候補をパースし、予約を確定
 */
export async function tryConfirmAppointment(
  userText: string,
  memberId: string,
  memberName: string,
  history: { role: "user" | "assistant"; content: string }[],
): Promise<string | null> {
  const step = getReservationStep(history);
  if (step !== "show_slots") return null;

  const match = userText.trim().match(/^[123１２３][番.\s]?$/);
  if (!match) return null;

  const numMap: Record<string, number> = {
    "1": 1, "2": 2, "3": 3,
    "１": 1, "２": 2, "３": 3,
  };
  const num = numMap[match[0][0]];
  if (!num) return null;

  const lastBotMsg = [...history].reverse().find(
    (m) => m.role === "assistant" && m.content.includes("以下の候補からご都合のよい日時"),
  );
  if (!lastBotMsg) return null;

  const slotLabels = lastBotMsg.content.match(/\d+\. .+/g);
  if (!slotLabels || !slotLabels[num - 1]) return null;

  const selectedLabel = slotLabels[num - 1].replace(/^\d+\.\s*/, "");

  const parsed = parseSlotLabel(selectedLabel);
  if (!parsed) {
    return "申し訳ありません、日時の解析に失敗しました。改めて「相談予約」とお送りください。";
  }

  const calResult = await createReservation(parsed, memberName);
  if (!calResult.success) {
    return `申し訳ありません、予約の確定に失敗しました。
少し時間をおいて再度「相談予約」とお送りください。`;
  }

  const appt = await createAppointment({
    memberId,
    scheduledAt: parsed.toISOString(),
    durationMinutes: 60,
  });

  if (!appt) {
    console.warn("[Reservation] DB保存は失敗したがカレンダー登録は成功");
  }

  await notifyFp({
    type: "fp_appointment",
    memberName,
    memberId,
    summary: `相談予約：${selectedLabel}`,
    details: {
      scheduled_at: parsed.toISOString(),
      google_event_id: calResult.eventId,
    },
    link: `${process.env.NEXT_PUBLIC_APP_URL}/admin/appointments`,
  });

  return `予約が確定しました。

▼ ご予約内容
日時：${selectedLabel}
所要時間：約1時間

担当者から改めてご連絡します。
ご相談内容を事前に整理いただけると、より充実した時間になります。

ご予約の変更・キャンセルは「予約変更」とお送りください。`;
}

/**
 * スロットラベル（例: "7/5(木) 19:00〜20:00"）をUTC Dateにパース
 */
function parseSlotLabel(label: string): Date | null {
  const match = label.match(/(\d+)\/(\d+)\(.+\)\s*(\d+):(\d+)/);
  if (!match) return null;

  const jst = getNowJst();
  let year = jst.year;
  const month = parseInt(match[1], 10) - 1;
  const day = parseInt(match[2], 10);
  const hour = parseInt(match[3], 10);

  const date = jstToUtc(year, month, day, hour);

  if (date < new Date()) {
    return jstToUtc(year + 1, month, day, hour);
  }

  return date;
}
