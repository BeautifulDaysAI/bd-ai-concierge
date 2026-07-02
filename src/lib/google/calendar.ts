/**
 * Google Calendar API クライアント
 *
 * 担当者カレンダーの空き時間検索・予約イベント追加
 * すべてのDate操作はUTCで行い、JST変換は表示時のみ
 *
 * 営業時間ルール:
 *   平日(月〜金) 9:00-21:00（最終開始20:00）
 *   土曜        10:00-18:00（最終開始17:00）
 *   日曜・祝日   予約不可
 *   昼休憩      12:00-13:00 除外
 *   直前予約     24時間以内は不可
 *   遠方予約     60日以上先は不可
 *
 * © Beautiful Days
 */

import { google } from "googleapis";

const JST_OFFSET_HOURS = 9;
const MIN_ADVANCE_HOURS = 24;
const MAX_ADVANCE_DAYS = 60;

type DaySchedule = {
  open: number;
  close: number;
  lastStart: number;
};

const WEEKDAY_SCHEDULE: DaySchedule = { open: 9, close: 21, lastStart: 20 };
const SATURDAY_SCHEDULE: DaySchedule = { open: 10, close: 18, lastStart: 17 };

const LUNCH_START = 12;
const LUNCH_END = 13;

/**
 * 日本の祝日（2026-2027年）
 * 年末に翌々年分を追加すること
 */
const JAPANESE_HOLIDAYS: Set<string> = new Set([
  // 2026
  "2026-01-01", "2026-01-12", "2026-02-11", "2026-02-23",
  "2026-03-20", "2026-04-29", "2026-05-03", "2026-05-04",
  "2026-05-05", "2026-05-06", "2026-07-20", "2026-08-11",
  "2026-09-21", "2026-09-22", "2026-09-23", "2026-10-12",
  "2026-11-03", "2026-11-23", "2026-12-23",
  // 2027
  "2027-01-01", "2027-01-11", "2027-02-11", "2027-02-23",
  "2027-03-21", "2027-04-29", "2027-05-03", "2027-05-04",
  "2027-05-05", "2027-07-19", "2027-08-11", "2027-09-20",
  "2027-09-23", "2027-10-11", "2027-11-03", "2027-11-23",
]);

function isJapaneseHoliday(year: number, month: number, day: number): boolean {
  const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return JAPANESE_HOLIDAYS.has(key);
}

function getCalendarClient() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  auth.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });
  return google.calendar({ version: "v3", auth });
}

function getCalendarId(): string {
  return process.env.GOOGLE_CALENDAR_ID ?? "primary";
}

export type TimeSlot = {
  start: Date;
  end: Date;
  label: string;
};

/**
 * JST時刻をUTC Dateとして生成
 */
function jstToUtc(year: number, month: number, day: number, hour: number): Date {
  return new Date(Date.UTC(year, month, day, hour - JST_OFFSET_HOURS, 0, 0));
}

/**
 * UTC DateからJSTの時間情報を取得
 */
function getJstParts(d: Date): { year: number; month: number; day: number; hour: number; dayOfWeek: number } {
  const jst = new Date(d.getTime() + JST_OFFSET_HOURS * 60 * 60 * 1000);
  return {
    year: jst.getUTCFullYear(),
    month: jst.getUTCMonth(),
    day: jst.getUTCDate(),
    hour: jst.getUTCHours(),
    dayOfWeek: jst.getUTCDay(),
  };
}

/**
 * 指定日JSTの営業スケジュールを返す。予約不可の日はnull
 */
function getDaySchedule(year: number, month: number, day: number, dayOfWeek: number): DaySchedule | null {
  if (dayOfWeek === 0) return null;
  if (isJapaneseHoliday(year, month, day)) return null;
  if (dayOfWeek === 6) return SATURDAY_SCHEDULE;
  return WEEKDAY_SCHEDULE;
}

/**
 * 指定日に提示可能な時間枠の開始時刻一覧を返す（JST時）
 * 昼休憩(12:00-13:00)を除外
 */
function getBusinessHours(schedule: DaySchedule): number[] {
  const hours: number[] = [];
  for (let h = schedule.open; h <= schedule.lastStart; h++) {
    if (h >= LUNCH_START && h < LUNCH_END) continue;
    hours.push(h);
  }
  return hours;
}

/**
 * 予約候補を出せる日付一覧を返す（JST）
 * 直前24h以内と60日以上先を除外
 */
export function findAvailableDates(constraints: {
  from: Date;
  to: Date;
  targetDayOfWeek?: number;
}): Array<{ year: number; month: number; day: number; dayOfWeek: number; schedule: DaySchedule }> {
  const { from, to, targetDayOfWeek } = constraints;

  const now = new Date();
  const earliest = new Date(now.getTime() + MIN_ADVANCE_HOURS * 60 * 60 * 1000);
  const latest = new Date(now.getTime() + MAX_ADVANCE_DAYS * 24 * 60 * 60 * 1000);

  const effectiveFrom = from > earliest ? from : earliest;
  const effectiveTo = to < latest ? to : latest;

  if (effectiveFrom >= effectiveTo) return [];

  const dates: Array<{ year: number; month: number; day: number; dayOfWeek: number; schedule: DaySchedule }> = [];

  const startJst = getJstParts(effectiveFrom);
  let cursor = jstToUtc(startJst.year, startJst.month, startJst.day, 0);

  while (cursor < effectiveTo) {
    const jst = getJstParts(cursor);
    const schedule = getDaySchedule(jst.year, jst.month, jst.day, jst.dayOfWeek);

    if (schedule) {
      if (targetDayOfWeek !== undefined && jst.dayOfWeek !== targetDayOfWeek) {
        cursor = jstToUtc(jst.year, jst.month, jst.day + 1, 0);
        continue;
      }
      dates.push({ year: jst.year, month: jst.month, day: jst.day, dayOfWeek: jst.dayOfWeek, schedule });
    }

    cursor = jstToUtc(jst.year, jst.month, jst.day + 1, 0);
  }

  return dates;
}

/**
 * 特定日のfreeBusyを取得し、空き1時間枠を返す
 */
export async function findAvailableSlotsOnDate(
  year: number,
  month: number,
  day: number,
  schedule: DaySchedule,
  preferredHourStart?: number,
  preferredHourEnd?: number,
): Promise<TimeSlot[]> {
  const calendar = getCalendarClient();
  const calendarId = getCalendarId();

  const dayStart = jstToUtc(year, month, day, schedule.open);
  const dayEnd = jstToUtc(year, month, day, schedule.close);

  const freeBusyRes = await calendar.freebusy.query({
    requestBody: {
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      timeZone: "Asia/Tokyo",
      items: [{ id: calendarId }],
    },
  });

  const busySlots = freeBusyRes.data.calendars?.[calendarId]?.busy ?? [];
  const busyRanges = busySlots.map((b) => ({
    start: new Date(b.start!),
    end: new Date(b.end!),
  }));

  const now = new Date();
  const earliest = new Date(now.getTime() + MIN_ADVANCE_HOURS * 60 * 60 * 1000);
  const hours = getBusinessHours(schedule);

  const effectiveStart = preferredHourStart ?? schedule.open;
  const effectiveEnd = preferredHourEnd ?? schedule.close;

  const slots: TimeSlot[] = [];

  for (const h of hours) {
    if (h < effectiveStart || h >= effectiveEnd) continue;

    const slotStart = jstToUtc(year, month, day, h);
    const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

    if (slotStart < earliest) continue;

    const isOverlapping = busyRanges.some(
      (busy) => slotStart < busy.end && slotEnd > busy.start,
    );
    if (isOverlapping) continue;

    slots.push({
      start: new Date(slotStart),
      end: new Date(slotEnd),
      label: formatSlotLabelJst(slotStart),
    });
  }

  return slots;
}

/**
 * 指定期間の空き1時間枠を検索（メインAPI）
 *
 * 営業時間・昼休憩・祝日・24h制限・60日制限を厳格適用
 */
export async function findAvailableSlots(constraints: {
  from: Date;
  to: Date;
  preferredHourStart?: number;
  preferredHourEnd?: number;
  maxResults?: number;
}): Promise<TimeSlot[]> {
  const {
    from,
    to,
    preferredHourStart,
    preferredHourEnd,
    maxResults = 3,
  } = constraints;

  console.log("[Calendar] 空き検索開始", {
    from: from.toISOString(),
    to: to.toISOString(),
    preferredHourStart,
    preferredHourEnd,
  });

  const dates = findAvailableDates({ from, to });
  console.log("[Calendar] 候補日数:", dates.length);

  const allSlots: TimeSlot[] = [];

  for (const date of dates) {
    if (allSlots.length >= maxResults) break;

    const remaining = maxResults - allSlots.length;
    const daySlots = await findAvailableSlotsOnDate(
      date.year, date.month, date.day, date.schedule,
      preferredHourStart, preferredHourEnd,
    );

    allSlots.push(...daySlots.slice(0, remaining));
  }

  console.log("[Calendar] 最終候補数:", allSlots.length);
  return allSlots;
}

/**
 * Googleカレンダーに予約イベントを追加
 */
export async function createReservation(
  start: Date,
  userName: string,
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  const calendar = getCalendarClient();
  const calendarId = getCalendarId();

  const end = new Date(start.getTime() + 60 * 60 * 1000);

  try {
    const event = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: `【BD AI】相談予約 - ${userName}`,
        description: "LINE経由の相談予約",
        start: {
          dateTime: start.toISOString(),
          timeZone: "Asia/Tokyo",
        },
        end: {
          dateTime: end.toISOString(),
          timeZone: "Asia/Tokyo",
        },
      },
    });

    return { success: true, eventId: event.data.id ?? undefined };
  } catch (err) {
    console.error("[Calendar] イベント作成エラー", err);
    return { success: false, error: String(err) };
  }
}

/**
 * UTC DateをJST表示ラベルに変換
 */
function formatSlotLabelJst(utcDate: Date): string {
  const jst = getJstParts(utcDate);
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const hour = jst.hour.toString().padStart(2, "0");
  const nextHour = (jst.hour + 1).toString().padStart(2, "0");
  return `${jst.month + 1}/${jst.day}(${weekdays[jst.dayOfWeek]}) ${hour}:00〜${nextHour}:00`;
}

/**
 * 現在のJST日時情報を返す（AIパース用）
 */
export function getNowJst(): { year: number; month: number; day: number; hour: number; dayOfWeek: number } {
  return getJstParts(new Date());
}

/**
 * JST日付指定からUTC Dateを生成（外部から利用）
 */
export { jstToUtc, getJstParts as getJstPartsPublic };
