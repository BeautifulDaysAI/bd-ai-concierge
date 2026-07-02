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
  getNowJst,
  jstToUtc,
  getJstPartsPublic,
} from "@/lib/google/calendar";
import { createAppointment } from "@/lib/db/queries/appointments";
import { notifyFp } from "@/lib/notify/fp";
import { searchFaq, formatFaqForPrompt } from "@/lib/ai/knowledge/faq";
import { SYSTEM_PROMPT } from "@/lib/ai/prompts/system";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/**
 * テキストから曜日を検出（口語対応）
 * 返り値: 0(日)〜6(土)、検出なしはnull
 */
function detectDayOfWeek(text: string): number | null {
  const patterns: [RegExp, number][] = [
    [/日曜/, 0],
    [/月曜/, 1],
    [/火曜/, 2],
    [/水曜/, 3],
    [/木曜/, 4],
    [/金曜/, 5],
    [/土曜/, 6],
  ];
  for (const [regex, dow] of patterns) {
    if (regex.test(text)) return dow;
  }
  return null;
}

/**
 * 会話履歴からも曜日指定を検出
 */
function detectDayOfWeekFromHistory(
  currentText: string,
  history: { role: "user" | "assistant"; content: string }[],
): number | null {
  const fromCurrent = detectDayOfWeek(currentText);
  if (fromCurrent !== null) return fromCurrent;

  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role === "assistant" && msg.content.includes("ご希望の曜日・時間帯を教えてください")) break;
    if (msg.role === "user") {
      const detected = detectDayOfWeek(msg.content);
      if (detected !== null) return detected;
    }
  }
  return null;
}

// ── 割り込み質問の検出 ──

const DAY_KEYWORDS = /土日|週末|土曜|日曜|平日|休み|やって(い|な)|営業|祝日/;
const PREFERENCE_INDICATORS = /でやりたい|がいい|がいい|希望|にして|でお願い|がいいな|で$/;
const QUESTION_INDICATORS = /？|\?|ですか|でしょうか|ありますか|いますか|なの|かな|けど|のは|どう/;

/**
 * 曜日を含む「希望変更」を検出（「土曜でやりたい」「平日がいい」等）
 * 日曜希望か否かも返す
 */
export function isDayOfWeekPreference(text: string): { match: boolean; isSunday: boolean; dayOfWeek: number | null } {
  const dow = detectDayOfWeek(text);
  if (dow !== null) {
    if (QUESTION_INDICATORS.test(text) && !PREFERENCE_INDICATORS.test(text)) {
      return { match: false, isSunday: false, dayOfWeek: null };
    }
    return { match: true, isSunday: dow === 0, dayOfWeek: dow };
  }
  if (/平日/.test(text) && PREFERENCE_INDICATORS.test(text)) {
    return { match: true, isSunday: false, dayOfWeek: null };
  }
  return { match: false, isSunday: false, dayOfWeek: null };
}

/**
 * 営業曜日に関する「純粋な質問」を検出（「土日やってない？」等）
 */
export function isBusinessDayQuestion(text: string): boolean {
  return DAY_KEYWORDS.test(text) && QUESTION_INDICATORS.test(text);
}

export function isGeneralQuestion(text: string): boolean {
  return QUESTION_INDICATORS.test(text);
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
 * ユーザーの希望をAIでパースして日時制約に変換
 */
async function parsePreference(
  userText: string,
  history: { role: "user" | "assistant"; content: string }[],
): Promise<{
  from: Date;
  to: Date;
  preferredHourStart: number;
  preferredHourEnd: number;
  targetDayOfWeek?: number;
}> {
  const jst = getNowJst();

  const previousContext = extractReservationContext(history);
  const contextText = previousContext.length > 0
    ? `\n\nこれまでの会話でユーザーが伝えた条件:\n${previousContext.map((c) => `- 「${c}」`).join("\n")}\n\n最新の発言: 「${userText}」\n\n最新の発言で追加・変更された条件は反映し、以前の条件（時間帯等）は明示的に変更されない限り引き継いでください。`
    : `\nユーザーの希望: 「${userText}」`;

  // 「来週」「再来週」の正確な日付範囲を事前計算してAIに渡す
  // 週の始まり=月曜（dayOfWeek: 1）
  const daysUntilNextMonday = ((1 - jst.dayOfWeek + 7) % 7) || 7;
  const nextMondayDay = jst.day + daysUntilNextMonday;
  const nextSundayDay = nextMondayDay + 6;
  const weekAfterMondayDay = nextMondayDay + 7;
  const weekAfterSundayDay = weekAfterMondayDay + 6;

  const nextMon = jstToUtc(jst.year, jst.month, nextMondayDay, 0);
  const nextSun = jstToUtc(jst.year, jst.month, nextSundayDay, 0);
  const nextMonJst = getJstPartsPublic(nextMon);
  const nextSunJst = getJstPartsPublic(nextSun);

  const weekAfterMon = jstToUtc(jst.year, jst.month, weekAfterMondayDay, 0);
  const weekAfterSun = jstToUtc(jst.year, jst.month, weekAfterSundayDay, 0);
  const weekAfterMonJst = getJstPartsPublic(weekAfterMon);
  const weekAfterSunJst = getJstPartsPublic(weekAfterSun);

  const weekReference = `
「来週」= ${nextMonJst.month + 1}/${nextMonJst.day}(月)〜${nextSunJst.month + 1}/${nextSunJst.day}(日) （今日から${daysUntilNextMonday}日後の月曜から）
「再来週」= ${weekAfterMonJst.month + 1}/${weekAfterMonJst.day}(月)〜${weekAfterSunJst.month + 1}/${weekAfterSunJst.day}(日)
「今週」= 今日〜${nextMonJst.month + 1}/${nextMonJst.day - 1 > 0 ? nextMonJst.day - 1 : nextMonJst.day}(日)`;

  const prompt = `ユーザーの希望日時を解析してJSON形式で返してください。
今日は${jst.year}年${jst.month + 1}月${jst.day}日（${WEEKDAYS[jst.dayOfWeek]}曜日）です。
${weekReference}
${contextText}

以下のJSON形式のみを返してください（説明不要）:
{
  "fromDaysOffset": 検索開始日（今日から何日後。0=今日、1=明日。「来週」なら${daysUntilNextMonday}）,
  "toDaysOffset": 検索終了日（今日から何日後。最大60。「来週」なら${daysUntilNextMonday + 6}。曜日指定のみで時期指定なしなら28）,
  "hourStart": 希望開始時間（9-21の整数。「午後」なら13、「夕方」なら17、「19時以降」なら19。指定なしは9）,
  "hourEnd": 希望終了時間（9-21の整数。「午前中」なら12、「午後」なら18。指定なしは21）,
  "dayOfWeek": 特定曜日指定（0=日,1=月,2=火,3=水,4=木,5=金,6=土。指定なしはnull。「土曜」なら6、「月曜」なら1）
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
      dayOfWeek: number | null;
    };

    console.log("[Reservation] パース結果:", parsed);

    const hourStart = Math.max(9, Math.min(21, parsed.hourStart));
    const hourEnd = Math.max(hourStart + 1, Math.min(21, parsed.hourEnd));

    // 曜日指定がある場合、口語検出結果を優先（AI誤判定防止）
    const detectedDow = detectDayOfWeekFromHistory(userText, history);
    const targetDayOfWeek = detectedDow ?? (parsed.dayOfWeek !== null ? parsed.dayOfWeek : undefined);

    // 曜日指定時は検索範囲を広げる（最低28日）
    let toDaysOffset = Math.min(60, parsed.toDaysOffset);
    if (targetDayOfWeek !== undefined && toDaysOffset < 28) {
      toDaysOffset = 28;
    }

    const from = jstToUtc(
      jst.year, jst.month,
      jst.day + Math.max(0, parsed.fromDaysOffset),
      hourStart,
    );

    const to = jstToUtc(
      jst.year, jst.month,
      jst.day + toDaysOffset,
      hourEnd,
    );

    return { from, to, preferredHourStart: hourStart, preferredHourEnd: hourEnd, targetDayOfWeek };
  } catch (err) {
    console.warn("[Reservation] 希望パース失敗、デフォルト使用", err);
    const detectedDow = detectDayOfWeekFromHistory(userText, history);
    const from = jstToUtc(jst.year, jst.month, jst.day + 1, 9);
    const to = jstToUtc(jst.year, jst.month, jst.day + (detectedDow !== null ? 28 : 14), 21);
    return { from, to, preferredHourStart: 9, preferredHourEnd: 21, targetDayOfWeek: detectedDow ?? undefined };
  }
}

// ── ステップ1→2: 希望を受け取り、日付候補を返す ──

export async function handlePreferenceAndFindDates(
  userText: string,
  history: { role: "user" | "assistant"; content: string }[],
): Promise<string> {
  // 日曜指定の即時応答
  const explicitDow = detectDayOfWeekFromHistory(userText, history);
  if (explicitDow === 0) {
    return `申し訳ありません、日曜日は予約不可となっております。

平日（月〜金）または土曜日でご検討ください。
ご希望の曜日・時間帯をお知らせください。`;
  }

  try {
    const constraints = await parsePreference(userText, history);

    // parsePreferenceでも日曜が返った場合のガード
    if (constraints.targetDayOfWeek === 0) {
      return `申し訳ありません、日曜日は予約不可となっております。

平日（月〜金）または土曜日でご検討ください。
ご希望の曜日・時間帯をお知らせください。`;
    }

    const dates = findAvailableDates({
      from: constraints.from,
      to: constraints.to,
      targetDayOfWeek: constraints.targetDayOfWeek,
    });

    if (dates.length === 0) {
      return `申し訳ありません、ご希望の条件では候補日が見つかりませんでした。

別の日程や時間帯でご希望があればお知らせください。
（例：来週の平日、土曜も可、再来週あたり）`;
    }

    const maxDates = Math.min(dates.length, 5);
    let text = `以下の日程から候補をお選びください。
番号でお答えください。

`;
    for (let i = 0; i < maxDates; i++) {
      const d = dates[i];
      const dayLabel = `${d.month + 1}/${d.day}(${WEEKDAYS[d.dayOfWeek]})`;
      text += `${i + 1}. ${dayLabel}\n`;
    }

    text += `
他の日程をご希望の場合は、改めて希望をお知らせください。`;

    return text;
  } catch (err) {
    console.error("[Reservation] 日付検索エラー", err);
    return `申し訳ありません、カレンダーの確認中にエラーが発生しました。
少し時間をおいて再度「相談予約」とお送りください。`;
  }
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

// ── ステップ3→確定: 時間選択から予約確定 ──

export async function tryConfirmAppointment(
  userText: string,
  memberId: string,
  memberName: string,
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
    summary: `相談予約：${fullLabel}`,
    details: {
      scheduled_at: parsed.toISOString(),
      google_event_id: calResult.eventId,
    },
    link: `${process.env.NEXT_PUBLIC_APP_URL}/admin/appointments`,
  });

  return `予約が確定しました。

▼ ご予約内容
日時：${fullLabel}
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
