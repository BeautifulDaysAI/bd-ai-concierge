/**
 * Google Calendar API クライアント
 *
 * 担当者カレンダーの空き時間検索・予約イベント追加
 * すべてのDate操作はUTCで行い、JST変換は表示時のみ
 *
 * © Beautiful Days
 */

import { google } from "googleapis";

const JST_OFFSET_HOURS = 9;

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
 * 例: jstHour=14 → UTC 05:00 の Date
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
 * 指定期間の空き1時間枠を検索
 */
export async function findAvailableSlots(constraints: {
  from: Date;
  to: Date;
  preferredHourStart?: number;
  preferredHourEnd?: number;
  weekdaysOnly?: boolean;
  maxResults?: number;
}): Promise<TimeSlot[]> {
  const {
    from,
    to,
    preferredHourStart = 9,
    preferredHourEnd = 21,
    weekdaysOnly = true,
    maxResults = 3,
  } = constraints;

  const calendar = getCalendarClient();
  const calendarId = getCalendarId();

  console.log("[Calendar] freeBusy検索", {
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
    preferredHourStart,
    preferredHourEnd,
    weekdaysOnly,
  });

  const freeBusyRes = await calendar.freebusy.query({
    requestBody: {
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      timeZone: "Asia/Tokyo",
      items: [{ id: calendarId }],
    },
  });

  const busySlots = freeBusyRes.data.calendars?.[calendarId]?.busy ?? [];

  console.log("[Calendar] busy件数:", busySlots.length);
  busySlots.forEach((b) => {
    console.log("[Calendar] busy:", b.start, "〜", b.end);
  });

  const busyRanges = busySlots.map((b) => ({
    start: new Date(b.start!),
    end: new Date(b.end!),
  }));

  const candidates: TimeSlot[] = [];
  const now = new Date();

  const fromJst = getJstParts(from);
  let currentUtc = jstToUtc(fromJst.year, fromJst.month, fromJst.day, preferredHourStart);

  if (currentUtc < from) {
    currentUtc = new Date(from);
    const cJst = getJstParts(currentUtc);
    if (cJst.hour < preferredHourStart) {
      currentUtc = jstToUtc(cJst.year, cJst.month, cJst.day, preferredHourStart);
    }
  }

  while (currentUtc < to && candidates.length < maxResults) {
    const jst = getJstParts(currentUtc);

    if (weekdaysOnly && (jst.dayOfWeek === 0 || jst.dayOfWeek === 6)) {
      currentUtc = jstToUtc(jst.year, jst.month, jst.day + 1, preferredHourStart);
      continue;
    }

    if (jst.hour < preferredHourStart) {
      currentUtc = jstToUtc(jst.year, jst.month, jst.day, preferredHourStart);
      continue;
    }
    if (jst.hour >= preferredHourEnd) {
      currentUtc = jstToUtc(jst.year, jst.month, jst.day + 1, preferredHourStart);
      continue;
    }

    if (currentUtc <= now) {
      currentUtc = new Date(currentUtc.getTime() + 60 * 60 * 1000);
      continue;
    }

    const slotEndUtc = new Date(currentUtc.getTime() + 60 * 60 * 1000);

    const isOverlapping = busyRanges.some(
      (busy) => currentUtc < busy.end && slotEndUtc > busy.start,
    );

    if (!isOverlapping) {
      candidates.push({
        start: new Date(currentUtc),
        end: new Date(slotEndUtc),
        label: formatSlotLabelJst(currentUtc),
      });
    }

    currentUtc = new Date(currentUtc.getTime() + 60 * 60 * 1000);
  }

  console.log("[Calendar] 候補数:", candidates.length);
  return candidates;
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
export { jstToUtc };
