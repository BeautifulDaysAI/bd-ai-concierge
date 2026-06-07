/**
 * イベント管理クエリ
 *
 * © Beautiful Days
 */

import { supabaseAdmin } from "../supabase";

export type Event = {
  id: string;
  name: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  capacity: number | null;
  memberPriority: boolean;
};

export type AttendanceStatus = "yes" | "no" | "maybe";

/**
 * 直近の未来イベントを取得
 */
export async function getUpcomingEvents(limit: number = 5): Promise<Event[]> {
  const { data, error } = await supabaseAdmin
    .from("events")
    .select("*")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(limit);

  if (error || !data) {
    console.error("[Events] 取得エラー", error);
    return [];
  }

  return data.map(mapEvent);
}

/**
 * 直近の1件を取得（「次のパーティ」用）
 */
export async function getNextEvent(): Promise<Event | null> {
  const events = await getUpcomingEvents(1);
  return events[0] ?? null;
}

/**
 * 出欠を登録/更新
 */
export async function recordAttendance(
  eventId: string,
  memberId: string,
  status: AttendanceStatus,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabaseAdmin
    .from("event_attendances")
    .upsert(
      {
        event_id: eventId,
        member_id: memberId,
        status,
        responded_at: new Date().toISOString(),
      },
      { onConflict: "event_id,member_id" },
    );

  if (error) {
    console.error("[Events] 出欠登録エラー", error);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

/**
 * イベント情報をユーザー向けテキストに整形
 */
export function formatEvent(event: Event): string {
  const startDate = new Date(event.startsAt).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  let text = `📅 ${event.name}\n日時：${startDate}`;

  if (event.location) {
    text += `\n場所：${event.location}`;
  }

  if (event.description) {
    text += `\n\n${event.description}`;
  }

  return text;
}

function mapEvent(row: Record<string, unknown>): Event {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string | null,
    startsAt: row.starts_at as string,
    endsAt: row.ends_at as string | null,
    location: row.location as string | null,
    capacity: row.capacity as number | null,
    memberPriority: (row.member_priority as boolean) ?? false,
  };
}
