/**
 * 相談予約フロー（Google Calendar連携・3段階版）
 *
 * フロー：
 * 1. 「相談予約」検出 → 希望日時を質問 (ask_preference)
 * 2. 希望をAIがパース → 日付候補を提示 (show_dates)
 * 3. 日付を番号選択 → その日の時間枠を提示 (show_times)
 * 4. 時間を番号選択 → Googleカレンダーにイベント追加 → DB保存 → FP通知
 *
 * © Beautiful Days
 */

import { getAnthropicClient, getDefaultModel } from "@/lib/ai/client";
import {
  findAvailableDates,
  findAvailableSlotsOnDate,
  createReservation,
  getDaySchedule,
  getNowJst,
  jstToUtc,
  getJstPartsPublic,
} from "@/lib/google/calendar";
import {
  createAppointment,
  getLatestScheduledAppointment,
  cancelAppointment,
} from "@/lib/db/queries/appointments";
import { notifyFp } from "@/lib/notify/fp";
import { notifyFpLine } from "@/lib/notify/line";
import { createZoomMeeting } from "@/lib/zoom/client";
import { searchFaq, formatFaqForPrompt } from "@/lib/ai/knowledge/faq";
import { SYSTEM_PROMPT } from "@/lib/ai/prompts/system";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

// ── LLMベース意図分類・日時パーサー ──

const CLASSIFIER_MODEL = "claude-haiku-4-5-20251001";

export type ClassifiedInput = {
  intent: "date_time_request" | "business_hours_question" | "other_question";
  fromDaysOffset: number;
  toDaysOffset: number;
  hourStart: number;
  hourEnd: number;
  dayOfWeek: number | null;
  specificDate: { month: number; day: number } | null;
  specificHour: number | null;
};

export async function classifyAndParseInput(
  userText: string,
  history: { role: "user" | "assistant"; content: string }[],
): Promise<ClassifiedInput> {
  const jst = getNowJst();

  const previousContext = extractReservationContext(history);
  const contextText = previousContext.length > 0
    ? `\nこれまでの会話でユーザーが伝えた条件:\n${previousContext.map((c) => `- 「${c}」`).join("\n")}\n\n最新の発言: 「${userText}」\n最新の発言で追加・変更された条件は反映し、以前の条件は明示的に変更されない限り引き継ぐ。`
    : `\nユーザーの発言: 「${userText}」`;

  const daysUntilNextMonday = ((1 - jst.dayOfWeek + 7) % 7) || 7;
  const nextMon = jstToUtc(jst.year, jst.month, jst.day + daysUntilNextMonday, 0);
  const nextSun = jstToUtc(jst.year, jst.month, jst.day + daysUntilNextMonday + 6, 0);
  const nextMonJst = getJstPartsPublic(nextMon);
  const nextSunJst = getJstPartsPublic(nextSun);
  const weekAfterMon = jstToUtc(jst.year, jst.month, jst.day + daysUntilNextMonday + 7, 0);
  const weekAfterSun = jstToUtc(jst.year, jst.month, jst.day + daysUntilNextMonday + 13, 0);
  const weekAfterMonJst = getJstPartsPublic(weekAfterMon);
  const weekAfterSunJst = getJstPartsPublic(weekAfterSun);

  const prompt = `相談予約フローでユーザーの発言を分類・解析しJSONで返せ。

今日: ${jst.year}年${jst.month + 1}月${jst.day}日（${WEEKDAYS[jst.dayOfWeek]}曜日）
「来週」= ${nextMonJst.month + 1}/${nextMonJst.day}(月)〜${nextSunJst.month + 1}/${nextSunJst.day}(日)
「再来週」= ${weekAfterMonJst.month + 1}/${weekAfterMonJst.day}(月)〜${weekAfterSunJst.month + 1}/${weekAfterSunJst.day}(日)
${contextText}

■ intent判定
- "date_time_request": 予約の日時希望（「来週」「土曜日は?」「7/18 14時」「いつでもOK」「午後がいい」「七月十八日」等。曜日名+疑問符も日時希望に含む）
- "business_hours_question": 営業日時の純粋な質問（「何時までやってますか」「祝日は予約できますか」等。特定日付・曜日で予約したい意図がないもの）
- "other_question": 予約と無関係な質問（「NISAとは?」「料金は?」等）
迷ったら "date_time_request" にせよ。

■ date_time_requestの追加フィールド
- specificDate: 具体日付→{"month":M,"day":D}に解決（「明日」→今日+1日で計算、「七月十八日」→{"month":7,"day":18}）。なければnull
- specificHour: 具体時刻（「14時」→14）。なければnull
- fromDaysOffset: 検索開始（今日=0, 明日=1, 来週=${daysUntilNextMonday}）
- toDaysOffset: 検索終了（来週末=${daysUntilNextMonday + 6}, 最大60, 曜日のみ=28, いつでもOK=30）
- hourStart: 希望開始時(9-21。午前=9, 午後=13, 夕方=17, 指定なし=9)
- hourEnd: 希望終了時(9-21。午前中=12, 午後=18, 指定なし=21)
- dayOfWeek: 曜日指定(0=日〜6=土。なければnull)

■ business_hours_question/other_questionの場合
全て初期値: fromDaysOffset=0,toDaysOffset=14,hourStart=9,hourEnd=21,dayOfWeek=null,specificDate=null,specificHour=null

JSONのみ返せ。`;

  try {
    const result = await getAnthropicClient().messages.create({
      model: CLASSIFIER_MODEL,
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });

    const content = result.content[0];
    if (content.type !== "text") throw new Error("unexpected response type");

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("no JSON in response");

    const raw = JSON.parse(jsonMatch[0]);
    console.error("[Classifier] 結果:", JSON.stringify(raw));

    const intent = ["date_time_request", "business_hours_question", "other_question"].includes(raw.intent)
      ? raw.intent as ClassifiedInput["intent"]
      : "date_time_request";

    return {
      intent,
      fromDaysOffset: typeof raw.fromDaysOffset === "number" ? Math.max(0, Math.min(60, raw.fromDaysOffset)) : 1,
      toDaysOffset: typeof raw.toDaysOffset === "number" ? Math.max(1, Math.min(60, raw.toDaysOffset)) : 14,
      hourStart: typeof raw.hourStart === "number" ? Math.max(9, Math.min(21, raw.hourStart)) : 9,
      hourEnd: typeof raw.hourEnd === "number" ? Math.max(9, Math.min(21, raw.hourEnd)) : 21,
      dayOfWeek: typeof raw.dayOfWeek === "number" && raw.dayOfWeek >= 0 && raw.dayOfWeek <= 6 ? raw.dayOfWeek : null,
      specificDate: raw.specificDate && typeof raw.specificDate.month === "number" && typeof raw.specificDate.day === "number"
        ? { month: raw.specificDate.month, day: raw.specificDate.day }
        : null,
      specificHour: typeof raw.specificHour === "number" ? raw.specificHour : null,
    };
  } catch (err) {
    console.error("[Classifier] LLM分類失敗、date_time_requestとして処理", err);
    return {
      intent: "date_time_request",
      fromDaysOffset: 1,
      toDaysOffset: 14,
      hourStart: 9,
      hourEnd: 21,
      dayOfWeek: null,
      specificDate: null,
      specificHour: null,
    };
  }
}

export const BUSINESS_DAY_POLICY = `ご相談は月〜土で承っております（日曜はお休みです）。
上記の候補からご希望の番号をお選びください。`;

export const SUNDAY_REJECTION_IN_FLOW = `日曜はお休みをいただいております。
月曜〜土曜でご希望の曜日・時間帯をお知らせください。`;

export const FLOW_CONTINUE_PROMPT = "\n\n引き続き、上記の候補から番号でお選びください。";

export async function answerInterruptionQuestion(
  userText: string,
  history: { role: "user" | "assistant"; content: string }[],
): Promise<string> {
  const relevantFaqs = searchFaq(userText, 3);
  const faqContext = formatFaqForPrompt(relevantFaqs);
  const systemWithFaq = faqContext ? `${SYSTEM_PROMPT}\n\n${faqContext}` : SYSTEM_PROMPT;

  try {
    const result = await getAnthropicClient().messages.create({
      model: getDefaultModel(),
      max_tokens: 512,
      system: `${systemWithFaq}\n\n現在、ユーザーは相談予約の日程選択中です。質問に簡潔に回答してください。予約フローの案内（日程リストの再提示など）は不要です。`,
      messages: [...history.slice(-6), { role: "user", content: userText }],
    });
    const content = result.content[0];
    if (content.type === "text") return content.text;
  } catch (err) {
    console.error("[Reservation] 割り込み質問応答エラー", err);
  }
  return "申し訳ありません、回答を生成できませんでした。";
}

export type ReservationStep =
  | "ask_preference"
  | "show_dates"
  | "show_times"
  | "none";

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
      if (msg.content.includes("ご希望の曜日・時間帯をお知らせください")) return true;
      if (msg.content.includes("以下の日程から候補をお選びください")) return true;
      if (msg.content.includes("以下の時間帯からお選びください")) return true;
      if (msg.content.includes("上記の候補からご希望の番号をお選びください")) return true;
      if (msg.content.includes("上記の候補から番号でお選びください")) return true;
    }
  }
  return false;
}

/**
 * 予約フローのどのステップかを判定
 */
export function getReservationStep(
  history: { role: "user" | "assistant"; content: string }[],
): ReservationStep {
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role === "assistant") {
      if (msg.content.includes("予約が確定しました")) return "none";
      if (msg.content.includes("予約の確定に失敗")) return "none";
      if (msg.content.includes("以下の時間帯からお選びください")) return "show_times";
      if (msg.content.includes("以下の日程から候補をお選びください")) return "show_dates";
      if (msg.content.includes("ご希望の曜日・時間帯を教えてください")) return "ask_preference";
      if (msg.content.includes("ご希望の曜日・時間帯をお知らせください")) return "ask_preference";
      // 割り込み質問への応答はスキップして前のステップを探す
      if (msg.content.includes("上記の候補からご希望の番号をお選びください")) continue;
      if (msg.content.includes("上記の候補から番号でお選びください")) continue;
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

担当者のカレンダーから空き日程をお探しします。`;
}

/**
 * 予約セッション中のユーザーメッセージ履歴を抽出
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
      if (msg.content.includes("ご希望の曜日・時間帯を教えてください")) break;
    }
    if (msg.role === "user") {
      context.unshift(msg.content);
    }
  }
  return context;
}

/**
 * 指定の月(0-indexed)・日が、JST基準で今日より過去かどうかを判定
 * （今年の日付として解釈し、年をまたいで未来に丸めることはしない）
 */
function isPastDate(
  jst: { year: number; month: number; day: number },
  month0: number,
  day: number,
): boolean {
  return month0 < jst.month || (month0 === jst.month && day < jst.day);
}

// ── ステップ1→2: 希望を受け取り、日付候補を返す ──

export async function handlePreferenceAndFindDates(
  _userText: string,
  _history: { role: "user" | "assistant"; content: string }[],
  parsed: ClassifiedInput,
): Promise<string> {
  if (parsed.dayOfWeek === 0) {
    return `申し訳ありません、日曜日は予約不可となっております。

平日（月〜金）または土曜日でご検討ください。
ご希望の曜日・時間帯をお知らせください。`;
  }

  // 具体日付+時間 → 日付選択・時間選択をスキップ
  if (parsed.specificDate && parsed.specificHour !== null) {
    try {
      const jst = getNowJst();
      const year = jst.year;
      const month = parsed.specificDate.month - 1;
      if (isPastDate(jst, month, parsed.specificDate.day)) {
        return `申し訳ありません、${parsed.specificDate.month}/${parsed.specificDate.day}は過去の日付のため予約できません。
本日以降の日程をお知らせください。`;
      }

      const dayOfWeek = getJstPartsPublic(jstToUtc(year, month, parsed.specificDate.day, 12)).dayOfWeek;

      const schedule = getDaySchedule(year, month, parsed.specificDate.day, dayOfWeek);
      if (!schedule) {
        return `申し訳ありません、${parsed.specificDate.month}/${parsed.specificDate.day}は予約不可日です（日曜・祝日）。
別の日程をお知らせください。`;
      }

      if (parsed.specificHour < schedule.open || parsed.specificHour > schedule.lastStart) {
        return `申し訳ありません、${parsed.specificDate.month}/${parsed.specificDate.day}の営業時間は${schedule.open}:00〜${schedule.close}:00です。
この範囲内でご希望の時間をお知らせください。`;
      }

      const slots = await findAvailableSlotsOnDate(
        year, month, parsed.specificDate.day, schedule,
        parsed.specificHour, parsed.specificHour + 1,
      );

      const dayLabel = `${parsed.specificDate.month}/${parsed.specificDate.day}(${WEEKDAYS[dayOfWeek]})`;

      if (slots.length > 0) {
        const startH = String(parsed.specificHour).padStart(2, "0");
        const endH = String(parsed.specificHour + 1).padStart(2, "0");
        return `${dayLabel} の空き時間です。
以下の時間帯からお選びください。
番号でお答えください。

1. ${startH}:00〜${endH}:00

他の日程をご希望の場合は、改めて希望をお知らせください。`;
      }

      const allSlots = await findAvailableSlotsOnDate(year, month, parsed.specificDate.day, schedule);
      if (allSlots.length === 0) {
        return formatNearbyAlternatives(dayLabel, year, month, parsed.specificDate.day, parsed);
      }

      const maxSlots = Math.min(allSlots.length, 5);
      let text = `${parsed.specificHour}:00〜はすでに予約が入っております。
${dayLabel} の他の空き時間をご案内します。
以下の時間帯からお選びください。
番号でお答えください。

`;
      for (let i = 0; i < maxSlots; i++) {
        const s = allSlots[i];
        const sH = s.label.match(/(\d+:\d+)〜/)?.[1] ?? "";
        const eH = s.label.match(/〜(\d+:\d+)/)?.[1] ?? "";
        text += `${i + 1}. ${sH}〜${eH}\n`;
      }
      text += `\n他の日程をご希望の場合は、改めて希望をお知らせください。`;
      return text;
    } catch (err) {
      console.error("[Reservation] 日時直接指定エラー", err);
    }
  }

  // 具体日付のみ（時間指定なし）→ その日の空き時間を直接表示
  if (parsed.specificDate) {
    try {
      const jst = getNowJst();
      const year = jst.year;
      const month = parsed.specificDate.month - 1;
      if (isPastDate(jst, month, parsed.specificDate.day)) {
        return `申し訳ありません、${parsed.specificDate.month}/${parsed.specificDate.day}は過去の日付のため予約できません。
本日以降の日程をお知らせください。`;
      }

      const dayOfWeek = getJstPartsPublic(jstToUtc(year, month, parsed.specificDate.day, 12)).dayOfWeek;
      const schedule = getDaySchedule(year, month, parsed.specificDate.day, dayOfWeek);
      if (!schedule) {
        return `申し訳ありません、${parsed.specificDate.month}/${parsed.specificDate.day}は予約不可日です（日曜・祝日）。
別の日程をお知らせください。`;
      }

      const slots = await findAvailableSlotsOnDate(
        year, month, parsed.specificDate.day, schedule,
        parsed.hourStart, parsed.hourEnd,
      );
      const dayLabel = `${parsed.specificDate.month}/${parsed.specificDate.day}(${WEEKDAYS[dayOfWeek]})`;

      if (slots.length === 0) {
        return formatNearbyAlternatives(dayLabel, year, month, parsed.specificDate.day, parsed);
      }

      const maxSlots = Math.min(slots.length, 5);
      let text = `${dayLabel} の空き時間です。
以下の時間帯からお選びください。
番号でお答えください。

`;
      for (let i = 0; i < maxSlots; i++) {
        const s = slots[i];
        const sH = s.label.match(/(\d+:\d+)〜/)?.[1] ?? "";
        const eH = s.label.match(/〜(\d+:\d+)/)?.[1] ?? "";
        text += `${i + 1}. ${sH}〜${eH}\n`;
      }
      text += `\n他の日程をご希望の場合は、改めて希望をお知らせください。`;
      return text;
    } catch (err) {
      console.error("[Reservation] 日付指定エラー", err);
    }
  }

  // 範囲検索（「来週」「土曜がいい」「いつでもOK」等）
  try {
    const jst = getNowJst();
    const hourStart = Math.max(9, Math.min(21, parsed.hourStart));
    const hourEnd = Math.max(hourStart + 1, Math.min(21, parsed.hourEnd));

    let toDaysOffset = Math.min(60, parsed.toDaysOffset);
    if (parsed.dayOfWeek !== null && toDaysOffset < 28) {
      toDaysOffset = 28;
    }

    const from = jstToUtc(jst.year, jst.month, jst.day + Math.max(0, parsed.fromDaysOffset), hourStart);
    const to = jstToUtc(jst.year, jst.month, jst.day + toDaysOffset, hourEnd);
    const targetDayOfWeek = parsed.dayOfWeek ?? undefined;

    const dates = findAvailableDates({ from, to, targetDayOfWeek });

    if (dates.length === 0) {
      return `申し訳ありません、ご希望の条件では候補日が見つかりませんでした。

別の日程や時間帯でご希望があればお知らせください。
（例：来週の平日、土曜も可、再来週あたり）`;
    }

    const MAX_CHECK = 10;
    const TARGET_COUNT = 5;
    const confirmedDates: typeof dates = [];
    for (let i = 0; i < Math.min(dates.length, MAX_CHECK) && confirmedDates.length < TARGET_COUNT; i++) {
      const d = dates[i];
      const slots = await findAvailableSlotsOnDate(d.year, d.month, d.day, d.schedule, hourStart, hourEnd);
      if (slots.length > 0) {
        confirmedDates.push(d);
      }
    }

    if (confirmedDates.length === 0) {
      const jstNow = getNowJst();
      const extendedDates = findAvailableDates({
        from: to,
        to: jstToUtc(jstNow.year, jstNow.month, jstNow.day + 60, 21),
        targetDayOfWeek,
      });
      for (let i = 0; i < Math.min(extendedDates.length, MAX_CHECK) && confirmedDates.length < TARGET_COUNT; i++) {
        const d = extendedDates[i];
        const slots = await findAvailableSlotsOnDate(d.year, d.month, d.day, d.schedule, hourStart, hourEnd);
        if (slots.length > 0) {
          confirmedDates.push(d);
        }
      }

      if (confirmedDates.length === 0) {
        return `申し訳ありません、ご希望の条件では空き枠のある日が見つかりませんでした。

別の日程や時間帯でご希望があればお知らせください。
（例：来週の平日、土曜も可、再来週あたり）`;
      }

      const originalLabel = dates.length > 0
        ? `${dates[0].month + 1}/${dates[0].day}(${WEEKDAYS[dates[0].dayOfWeek]})`
        : "ご指定の日程";

      return formatDateOrTimeList(confirmedDates, hourStart, hourEnd, `申し訳ありません、${originalLabel}は空き枠がありませんでした。\n`);
    }

    return formatDateOrTimeList(confirmedDates, hourStart, hourEnd);
  } catch (err) {
    console.error("[Reservation] 日付検索エラー", err);
    return `申し訳ありません、カレンダーの確認中にエラーが発生しました。
少し時間をおいて再度「相談予約」とお送りください。`;
  }
}

async function formatNearbyAlternatives(
  dayLabel: string,
  year: number,
  month: number,
  day: number,
  parsed: ClassifiedInput,
): Promise<string> {
  const hStart = parsed.hourStart ?? 9;
  const hEnd = parsed.hourEnd ?? 21;
  const targetDow = parsed.dayOfWeek ?? undefined;

  const nextDay = jstToUtc(year, month, day + 1, 0);
  const searchEnd = jstToUtc(year, month, day + 60, 21);
  const nearbyDates = findAvailableDates({ from: nextDay, to: searchEnd, targetDayOfWeek: targetDow });
  const nearbyConfirmed: typeof nearbyDates = [];
  for (let i = 0; i < Math.min(nearbyDates.length, 10) && nearbyConfirmed.length < 5; i++) {
    const nd = nearbyDates[i];
    const ndSlots = await findAvailableSlotsOnDate(nd.year, nd.month, nd.day, nd.schedule, hStart, hEnd);
    if (ndSlots.length > 0) nearbyConfirmed.push(nd);
  }
  if (nearbyConfirmed.length === 0) {
    return `申し訳ありません、${dayLabel}は空き枠がありませんでした。\n別の日程をお知らせください。`;
  }
  return formatDateOrTimeList(
    nearbyConfirmed, hStart, hEnd,
    `申し訳ありません、${dayLabel}は空き枠がありませんでした。\n`,
  );
}

async function formatDateOrTimeList(
  confirmedDates: Array<{ year: number; month: number; day: number; dayOfWeek: number; schedule: { open: number; close: number; lastStart: number } }>,
  hourStart: number,
  hourEnd: number,
  prefix = "",
): Promise<string> {
  if (confirmedDates.length === 1) {
    const d = confirmedDates[0];
    const dayLabel = `${d.month + 1}/${d.day}(${WEEKDAYS[d.dayOfWeek]})`;
    const slots = await findAvailableSlotsOnDate(d.year, d.month, d.day, d.schedule, hourStart, hourEnd);
    const maxSlots = Math.min(slots.length, 5);
    let text = prefix ? `${prefix}最も近い${dayLabel} の空き時間です。\n` : `${dayLabel} の空き時間です。\n`;
    text += `以下の時間帯からお選びください。\n番号でお答えください。\n\n`;
    for (let i = 0; i < maxSlots; i++) {
      const s = slots[i];
      const sH = s.label.match(/(\d+:\d+)〜/)?.[1] ?? "";
      const eH = s.label.match(/〜(\d+:\d+)/)?.[1] ?? "";
      text += `${i + 1}. ${sH}〜${eH}\n`;
    }
    text += `\n他の日程をご希望の場合は、改めて希望をお知らせください。`;
    return text;
  }

  let text = prefix;
  text += prefix ? `近い日程で以下の日程から候補をお選びください。\n` : `以下の日程から候補をお選びください。\n`;
  text += `番号でお答えください。\n\n`;
  for (let i = 0; i < confirmedDates.length; i++) {
    const d = confirmedDates[i];
    text += `${i + 1}. ${d.month + 1}/${d.day}(${WEEKDAYS[d.dayOfWeek]})\n`;
  }
  text += `\n他の日程をご希望の場合は、改めて希望をお知らせください。`;
  return text;
}

/**
 * ユーザー入力から日付候補のインデックスを特定
 * 番号（「4」「4番」）、日付（「7/9」「7月9日」「9日」）、曜日（「水曜」）に対応
 */
function resolveSelectedDate(input: string, dateLabels: string[]): number | null {
  // 1. 番号マッチ（「4」「4番」「４」）
  const numMatch = input.match(/^([1-9１-９])[番.\s]?$/);
  if (numMatch) {
    const numMap: Record<string, number> = {
      "1": 1, "2": 2, "3": 3, "4": 4, "5": 5,
      "6": 6, "7": 7, "8": 8, "9": 9,
      "１": 1, "２": 2, "３": 3, "４": 4, "５": 5,
      "６": 6, "７": 7, "８": 8, "９": 9,
    };
    const num = numMap[numMatch[1]];
    if (num && num <= dateLabels.length) return num - 1;
  }

  // 2. 日付マッチ（「7/9」「7月9日」「9日」）
  const dateTextMatch = input.match(/(?:(\d{1,2})[\/月])?(\d{1,2})日?$/);
  if (dateTextMatch) {
    const targetMonth = dateTextMatch[1] ? parseInt(dateTextMatch[1], 10) : null;
    const targetDay = parseInt(dateTextMatch[2], 10);

    for (let i = 0; i < dateLabels.length; i++) {
      const labelMatch = dateLabels[i].match(/(\d+)\/(\d+)/);
      if (!labelMatch) continue;
      const labelMonth = parseInt(labelMatch[1], 10);
      const labelDay = parseInt(labelMatch[2], 10);
      if (labelDay === targetDay && (targetMonth === null || labelMonth === targetMonth)) {
        return i;
      }
    }
  }

  // 3. 曜日マッチ（「水曜」「水曜日」「水」）
  const dayOfWeekMatch = input.match(/([月火水木金土])[曜日]?/);
  if (dayOfWeekMatch) {
    for (let i = 0; i < dateLabels.length; i++) {
      if (dateLabels[i].includes(`(${dayOfWeekMatch[1]})`)) return i;
    }
  }

  return null;
}

// ── ステップ2→3: 日付選択を受け取り、時間枠を返す ──

export async function handleDateSelectionAndFindSlots(
  userText: string,
  history: { role: "user" | "assistant"; content: string }[],
): Promise<string | null> {
  const lastBotMsg = [...history].reverse().find(
    (m) => m.role === "assistant" && m.content.includes("以下の日程から候補をお選びください"),
  );
  if (!lastBotMsg) return null;

  const dateLabels = lastBotMsg.content.match(/\d+\.\s*\d+\/\d+\([^\)]+\)/g);
  if (!dateLabels) return null;

  const selectedIndex = resolveSelectedDate(userText.trim(), dateLabels);
  if (selectedIndex === null) return null;

  const dateMatch = dateLabels[selectedIndex].match(/(\d+)\/(\d+)\(([^\)]+)\)/);
  if (!dateMatch) return null;

  const jst = getNowJst();
  let year = jst.year;
  const month = parseInt(dateMatch[1], 10) - 1;
  const day = parseInt(dateMatch[2], 10);
  const dayOfWeekLabel = dateMatch[3];

  if (month < jst.month || (month === jst.month && day < jst.day)) {
    year += 1;
  }

  const dayOfWeek = WEEKDAYS.indexOf(dayOfWeekLabel);

  const schedule = dayOfWeek === 6
    ? { open: 10, close: 18, lastStart: 17 }
    : { open: 9, close: 21, lastStart: 20 };

  const preferredConstraints = extractPreferredHoursFromHistory(history);

  try {
    const slots = await findAvailableSlotsOnDate(
      year, month, day, schedule,
      preferredConstraints.hourStart,
      preferredConstraints.hourEnd,
    );

    if (slots.length === 0) {
      return `申し訳ありません、${dateMatch[1]}/${dateMatch[2]}(${dayOfWeekLabel}) は空き枠がありませんでした。

別の日付を選ぶか、「相談予約」と送って最初からやり直せます。`;
    }

    const maxSlots = Math.min(slots.length, 5);
    let text = `${dateMatch[1]}/${dateMatch[2]}(${dayOfWeekLabel}) の空き時間です。
以下の時間帯からお選びください。
番号でお答えください。

`;
    for (let i = 0; i < maxSlots; i++) {
      const s = slots[i];
      const startH = s.label.match(/(\d+:\d+)〜/)?.[1] ?? "";
      const endH = s.label.match(/〜(\d+:\d+)/)?.[1] ?? "";
      text += `${i + 1}. ${startH}〜${endH}\n`;
    }

    text += `
他の日程をご希望の場合は、改めて希望をお知らせください。`;

    return text;
  } catch (err) {
    console.error("[Reservation] 時間枠検索エラー", err);
    return `申し訳ありません、カレンダーの確認中にエラーが発生しました。
少し時間をおいて再度「相談予約」とお送りください。`;
  }
}

/**
 * 会話履歴から希望時間帯を抽出（AIパース結果の再利用はできないので簡易判定）
 */
function extractPreferredHoursFromHistory(
  history: { role: "user" | "assistant"; content: string }[],
): { hourStart?: number; hourEnd?: number } {
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role === "user") {
      const text = msg.content;
      if (text.includes("午後")) return { hourStart: 13, hourEnd: 18 };
      if (text.includes("午前")) return { hourStart: 9, hourEnd: 12 };
      if (text.includes("夕方")) return { hourStart: 17, hourEnd: 21 };
      if (text.includes("夜")) return { hourStart: 18, hourEnd: 21 };
      if (text.includes("朝")) return { hourStart: 9, hourEnd: 12 };
      const hourMatch = text.match(/(\d{1,2})時以降/);
      if (hourMatch) return { hourStart: parseInt(hourMatch[1], 10) };
      const hourMatch2 = text.match(/(\d{1,2})時まで/);
      if (hourMatch2) return { hourEnd: parseInt(hourMatch2[1], 10) };
    }
    if (msg.role === "assistant" && msg.content.includes("ご希望の曜日・時間帯を教えてください")) {
      break;
    }
  }
  return {};
}

// ── ステップ3→連絡先確認: 時間選択を受けて連絡先をヒアリング ──

export const CONTACT_REQUEST_PROMPT =
  "当日ご連絡のため、お電話番号かメールアドレスを教えてください。";

export async function tryConfirmAppointment(
  userText: string,
  _memberId: string,
  _memberName: string,
  history: { role: "user" | "assistant"; content: string }[],
): Promise<string | null> {
  const step = getReservationStep(history);
  if (step !== "show_times") return null;

  const match = userText.trim().match(/^(\d{1,2})[番.\s]?$/);
  if (!match) return null;

  const num = parseInt(match[1], 10);
  if (num < 1) return null;

  const lastBotMsg = [...history].reverse().find(
    (m) => m.role === "assistant" && m.content.includes("以下の時間帯からお選びください"),
  );
  if (!lastBotMsg) return null;

  const dateHeader = lastBotMsg.content.match(/^(\d+\/\d+\([^\)]+\))/);
  if (!dateHeader) return null;

  const timeLabels = lastBotMsg.content.match(/\d+\.\s*(\d+:\d+〜\d+:\d+)/g);
  if (!timeLabels || !timeLabels[num - 1]) return null;

  const selectedTime = timeLabels[num - 1].replace(/^\d+\.\s*/, "");
  const fullLabel = `${dateHeader[1]} ${selectedTime}`;

  const parsed = parseSlotLabel(fullLabel);
  if (!parsed) {
    return "申し訳ありません、日時の解析に失敗しました。改めて「相談予約」とお送りください。";
  }

  return `${fullLabel} で予約を確定いたします。

${CONTACT_REQUEST_PROMPT}`;
}

// ── ステップ4→確定: 連絡先を受け取り予約を確定 ──

const CONTACT_PHONE_REGEX = /^0\d{9,10}$/;
const CONTACT_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidContactInfo(text: string): boolean {
  const digitsOnly = text.replace(/[-\s]/g, "");
  return CONTACT_PHONE_REGEX.test(digitsOnly) || CONTACT_EMAIL_REGEX.test(text);
}

export function isAwaitingContactInfo(
  history: { role: "user" | "assistant"; content: string }[],
): boolean {
  const lastBotMsg = [...history].reverse().find((m) => m.role === "assistant");
  return !!lastBotMsg && lastBotMsg.content.includes(CONTACT_REQUEST_PROMPT);
}

function extractPendingSlotLabel(
  history: { role: "user" | "assistant"; content: string }[],
): string | null {
  const lastBotMsg = [...history].reverse().find(
    (m) => m.role === "assistant" && m.content.includes(CONTACT_REQUEST_PROMPT),
  );
  if (!lastBotMsg) return null;

  const match = lastBotMsg.content.match(/^(\d+\/\d+\([^)]+\)\s*\d{2}:\d{2}〜\d{2}:\d{2})/);
  return match ? match[1] : null;
}

export async function tryFinalizeAppointmentWithContact(
  userText: string,
  memberId: string,
  memberName: string,
  history: { role: "user" | "assistant"; content: string }[],
): Promise<string | null> {
  if (!isAwaitingContactInfo(history)) return null;

  const fullLabel = extractPendingSlotLabel(history);
  if (!fullLabel) {
    return "申し訳ありません、予約情報の確認に失敗しました。改めて「相談予約」とお送りください。";
  }

  const trimmed = userText.trim();
  if (!isValidContactInfo(trimmed)) {
    // fullLabel と CONTACT_REQUEST_PROMPT を再掲することで、
    // 不正入力後も isAwaitingContactInfo / extractPendingSlotLabel が
    // 次のターンで正しく状態を認識できるようにする
    return `${fullLabel} で予約を確定いたします。

恐れ入りますが、電話番号かメールアドレスの形式でお送りください。
例：09012345678 または taro@example.com

${CONTACT_REQUEST_PROMPT}`;
  }

  const parsed = parseSlotLabel(fullLabel);
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
    googleEventId: calResult.eventId,
    contactInfo: trimmed,
  });

  if (!appt) {
    console.error("[Reservation] DB保存は失敗したがカレンダー登録は成功");
  }

  const zoomResult = await createZoomMeeting(parsed, `Beautiful Days FP相談 - ${memberName}`);
  if (!zoomResult.success) {
    console.error("[Reservation] Zoomミーティング作成スキップ/失敗", zoomResult.error);
  }

  await notifyFp({
    type: "fp_appointment",
    memberName,
    memberId,
    summary: `相談予約：${fullLabel}`,
    details: {
      scheduled_at: parsed.toISOString(),
      google_event_id: calResult.eventId,
      zoom_join_url: zoomResult.joinUrl ?? null,
      contact_info: trimmed,
    },
    link: `${process.env.NEXT_PUBLIC_APP_URL}/admin/appointments`,
  });

  const fpLineParts = [
    `新規予約: ${formatShortJstLabel(parsed)} ${memberName}様`,
    `連絡先: ${trimmed}`,
  ];
  if (zoomResult.success && zoomResult.joinUrl) {
    fpLineParts.push(`Zoom: ${zoomResult.joinUrl}`);
  }
  await notifyFpLine(fpLineParts.join("\n"));

  const zoomSection =
    zoomResult.success && zoomResult.joinUrl
      ? `\n\n📹 オンライン相談のURL：${zoomResult.joinUrl}\n当日はこちらからご参加ください。`
      : "\n\nオンライン相談の詳細URLは、担当者より別途LINEでご案内いたします。";

  return `予約が確定しました。

▼ ご予約内容
日時：${fullLabel}
所要時間：約1時間
連絡先：${trimmed}

担当者から改めてご連絡します。
ご相談内容を事前に整理いただけると、より充実した時間になります。

ご予約の変更・キャンセルは「予約変更」とお送りください。${zoomSection}`;
}

/**
 * FP向けLINE通知用の短い日時ラベル（例: "7/27 15:00"）
 */
function formatShortJstLabel(date: Date): string {
  const jst = getJstPartsPublic(date);
  return `${jst.month + 1}/${jst.day} ${String(jst.hour).padStart(2, "0")}:00`;
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

// ── キャンセルフロー ──

const CANCEL_KEYWORDS = ["予約キャンセル", "予約変更", "キャンセルしたい", "予約を取り消し", "予約取り消し"];

export function isCancelRequest(text: string): boolean {
  return CANCEL_KEYWORDS.some((kw) => text.includes(kw));
}

export async function handleCancelRequest(
  memberId: string,
  memberName: string,
): Promise<string> {
  const appt = await getLatestScheduledAppointment(memberId);
  if (!appt) {
    return "現在、有効な予約が見つかりませんでした。\n新たに予約する場合は「相談予約」とお送りください。";
  }

  const scheduledJst = getJstPartsPublic(new Date(appt.scheduledAt));
  const label = `${scheduledJst.month + 1}/${scheduledJst.day}(${WEEKDAYS[scheduledJst.dayOfWeek]}) ${String(scheduledJst.hour).padStart(2, "0")}:00`;

  // カレンダー削除の自動処理は行わない（複数カレンダー・トークン失効等で
  // 信頼性が低いため）。DB上は即キャンセル済みにし、
  // Googleカレンダーからの削除は担当者が手動で行う運用とする。
  const cancelled = await cancelAppointment(appt.id);
  if (!cancelled) {
    return "申し訳ありません、キャンセル処理中にエラーが発生しました。\n担当者に直接ご連絡ください。";
  }

  await notifyFp({
    type: "cancel_appointment",
    memberName,
    memberId,
    summary: `予約キャンセル（要カレンダー手動削除）: ${label}`,
    details: { appointmentId: appt.id, scheduledAt: appt.scheduledAt, googleEventId: appt.googleEventId },
    link: `${process.env.NEXT_PUBLIC_APP_URL}/admin/appointments`,
  });

  await notifyFpLine(`キャンセル: ${formatShortJstLabel(new Date(appt.scheduledAt))} ${memberName}様`);

  return `予約のキャンセルを受け付けました。

▼ キャンセル済み
日時：${label}

担当者がカレンダーの調整を行います。
再度予約する場合は「相談予約」とお送りください。`;
}
