/**
 * 会話ログ一覧
 *
 * FP が会員様との全会話を確認できる画面
 * NG検出のあるメッセージは赤くハイライト
 *
 * © Beautiful Days
 */

import Link from "next/link";
import { supabaseAdmin } from "@/lib/db/supabase";

async function getRecentMessages() {
  const { data, error } = await supabaseAdmin
    .from("messages")
    .select(
      `
      id,
      direction,
      content,
      filter_level,
      ng_detected,
      ng_words,
      created_at,
      member_id,
      members ( display_name, line_user_id, plan )
    `,
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[Admin] メッセージ取得エラー", error);
    return [];
  }
  return data ?? [];
}

export default async function MessagesPage() {
  const messages = await getRecentMessages();

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <Link
            href="/admin"
            className="text-sm text-yellow-700 hover:underline"
          >
            ← ダッシュボードへ戻る
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-2">
            会話ログ
          </h1>
          <p className="text-gray-500 mt-2">
            直近100件 / NG検出のあるメッセージは赤く表示
          </p>
        </header>

        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 text-gray-600">日時</th>
                <th className="text-left p-3 text-gray-600">会員</th>
                <th className="text-left p-3 text-gray-600">方向</th>
                <th className="text-left p-3 text-gray-600">Lv</th>
                <th className="text-left p-3 text-gray-600">内容</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((m) => {
                const member = Array.isArray(m.members) ? m.members[0] : m.members;
                return (
                  <tr
                    key={m.id}
                    className={`border-b hover:bg-gray-50 ${
                      m.ng_detected ? "bg-red-50" : ""
                    }`}
                  >
                    <td className="p-3 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(m.created_at).toLocaleString("ja-JP")}
                    </td>
                    <td className="p-3">
                      <div className="text-gray-900 font-medium">
                        {member?.display_name ?? "—"}
                      </div>
                      <div className="text-xs text-gray-400">
                        {member?.plan}
                      </div>
                    </td>
                    <td className="p-3">
                      {m.direction === "in" ? (
                        <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded">
                          User
                        </span>
                      ) : (
                        <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded">
                          AI
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-xs text-gray-500">
                      {m.filter_level ?? "—"}
                    </td>
                    <td className="p-3">
                      <div className="text-gray-900 max-w-xl whitespace-pre-wrap break-words">
                        {m.content}
                      </div>
                      {m.ng_detected && (
                        <div className="text-xs text-red-600 mt-1">
                          ⚠ NG検出: {m.ng_words?.join(", ")}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {messages.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-400">
                    まだメッセージはありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
