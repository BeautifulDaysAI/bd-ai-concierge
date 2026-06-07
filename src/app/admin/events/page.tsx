/**
 * イベント管理画面
 *
 * © Beautiful Days
 */

import Link from "next/link";
import { supabaseAdmin } from "@/lib/db/supabase";

async function getEvents() {
  const { data } = await supabaseAdmin
    .from("events")
    .select("*")
    .order("starts_at", { ascending: true });

  return data ?? [];
}

async function getAttendanceCount(eventId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("event_attendances")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("status", "yes");
  return count ?? 0;
}

export default async function EventsPage() {
  const events = await getEvents();

  // 各イベントの出席数を取得
  const eventsWithCount = await Promise.all(
    events.map(async (e) => ({
      ...e,
      yesCount: await getAttendanceCount(e.id),
    })),
  );

  const now = new Date();

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <Link href="/admin" className="text-sm text-yellow-700 hover:underline">
            ← ダッシュボードへ戻る
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-2">イベント管理</h1>
          <p className="text-gray-500 mt-2">
            パーティ・大人の修学旅行など
          </p>
        </header>

        <div className="space-y-3">
          {eventsWithCount.map((event) => {
            const isPast = new Date(event.starts_at) < now;
            return (
              <div
                key={event.id}
                className={`bg-white rounded-lg shadow-sm p-6 border-l-4 ${
                  isPast ? "border-gray-300 opacity-60" : "border-yellow-600"
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">
                      {event.name}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {new Date(event.starts_at).toLocaleString("ja-JP", {
                        month: "long",
                        day: "numeric",
                        weekday: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <span className="bg-yellow-100 text-yellow-800 text-sm font-bold px-3 py-1 rounded">
                    {event.yesCount} 名参加
                  </span>
                </div>

                {event.location && (
                  <p className="text-sm text-gray-700 mb-1">
                    📍 {event.location}
                  </p>
                )}
                {event.description && (
                  <p className="text-sm text-gray-600 mt-2">
                    {event.description}
                  </p>
                )}
                {event.member_priority && (
                  <span className="inline-block mt-2 bg-yellow-600 text-white text-xs px-2 py-1 rounded">
                    Member優先案内
                  </span>
                )}
              </div>
            );
          })}
          {events.length === 0 && (
            <div className="bg-white rounded-lg p-8 shadow-sm text-center text-gray-400">
              まだイベントは登録されていません
              <p className="text-sm mt-2">
                Supabase のテーブル editor から `events` に登録してください
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
