/**
 * Google Calendar API クライアント
 *
 * 担当者カレンダーの空き時間検索・予約イベント追加
 *
 * © Beautiful Days
 */

import { google } from "googleapis";

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

  const freeBusyRes = await calendar.freebusy.query({
    requestBody: {
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      timeZone: "Asia/Tokyo",
      items: [{ id: calendarId }],
    },
  });

  const busySlots = freeBusyRes.data.calendars?.[calendarId]?.busy ?? [];

  const busyRanges = busySlots.map((b) => ({
    start: new Date(b.start!),
    end: new Date(b.end!),
  }));

  const candidates: TimeSlot[] = [];
  const current = new Date(from);
  current.setMinutes(0, 0, 0);

  while (current < to && candidates.length < maxResults) {
    const dayOfWeek = current.getDay();

    if (weekdaysOnly && (dayOfWeek === 0 || dayOfWeek === 6)) {
      current.setDate(current.getDate() + 1);
      current.setHours(preferredHourStart, 0, 0, 0);
      continue;
    }

    const hour = current.getHours();
    if (hour < preferredHourStart) {
      current.setHours(preferredHourStart, 0, 0, 0);
      continue;
    }
    if (hour >= preferredHourEnd) {
      current.setDate(current.getDate() + 1);
      current.setHours(preferredHourStart, 0, 0, 0);
      continue;
    }

    if (current < new Date()) {
      current.setHours(current.getHours() + 1);
      continue;
    }

    const slotEnd = new Date(current);
    slotEnd.setHours(slotEnd.getHours() + 1);

    const isOverlapping = busyRanges.some(
      (busy) => current < busy.end && slotEnd > busy.start,
    );

    if (!isOverlapping) {
      candidates.push({
        start: new Date(current),
        end: new Date(slotEnd),
        label: formatSlotLabel(current),
      });
    }

    current.setHours(current.getHours() + 1);
  }

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

  const end = new Date(start);
  end.setHours(end.getHours() + 1);

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

function formatSlotLabel(date: Date): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const weekday = weekdays[date.getDay()];
  const hour = date.getHours().toString().padStart(2, "0");
  return `${month}/${day}(${weekday}) ${hour}:00〜${(date.getHours() + 1).toString().padStart(2, "0")}:00`;
}
