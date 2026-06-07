/**
 * FP相談予約 管理画面
 *
 * © Beautiful Days
 */

import Link from "next/link";
import { supabaseAdmin } from "@/lib/db/supabase";

async function getAppointmentsWithMembers() {
  const { data } = await supabaseAdmin
    .from("fp_appointments")
    .select(`
      id,
      scheduled_at,
      duration_minutes,
      hearing_summary,
      status,
      fp_name,
      created_at,
      members ( display_name, plan )
    `)
    .gte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true });
  return data ?? [];
}

const STATUS_COLOR: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-gray-100 text-gray-500",
  no_show: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<string, string> = {
  scheduled: "予約済",
  completed: "完了",
  cancelled: "キャンセル",
  no_show: "未来訪",
};

export default async function AppointmentsPage() {
  const appointments = await getAppointmentsWithMembers();

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <Link href="/admin" className="text-sm text-yellow-700 hover:underline">
            ← ダッシュボードへ戻る
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-2">
            FP相談予約
          </h1>
          <p className="text-gray-500 mt-2">
            今後の相談予約 {appointments.length}件
          </p>
        </header>

        <div className="space-y-3">
          {appointments.map((appt) => {
            const member = Array.isArray(appt.members) ? appt.members[0] : appt.members;
            return (
              <div
                key={appt.id}
                className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-yellow-600"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="text-2xl font-bold text-gray-900">
                      {new Date(appt.scheduled_at).toLocaleString("ja-JP", {
                        month: "long",
                        day: "numeric",
                        weekday: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <p className="text-sm text-gray-500">
                      所要時間：{appt.duration_minutes}分
                    </p>
                  </div>
                  <span
                    className={`text-xs font-bold px-2 py-1 rounded ${
                      STATUS_COLOR[appt.status] ?? STATUS_COLOR.scheduled
                    }`}
                  >
                    {STATUS_LABEL[appt.status] ?? appt.status}
                  </span>
                </div>

                <div className="border-t pt-3">
                  <p className="text-sm">
                    <span className="text-gray-500">会員：</span>
                    <span className="font-bold">
                      {member?.display_name ?? "—"}
                    </span>
                    <span className="text-xs text-gray-400 ml-2">
                      ({member?.plan})
                    </span>
                  </p>
                  {appt.fp_name && (
                    <p className="text-sm">
                      <span className="text-gray-500">担当FP：</span>
                      {appt.fp_name}
                    </p>
                  )}
                  {appt.hearing_summary && (
                    <div className="mt-2 bg-yellow-50 p-3 rounded text-sm">
                      <p className="font-bold text-yellow-800 text-xs mb-1">
                        🎯 事前ヒアリング要約
                      </p>
                      <p className="text-gray-700 whitespace-pre-wrap">
                        {appt.hearing_summary}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {appointments.length === 0 && (
            <div className="bg-white rounded-lg p-8 shadow-sm text-center text-gray-400">
              予約はまだありません
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
