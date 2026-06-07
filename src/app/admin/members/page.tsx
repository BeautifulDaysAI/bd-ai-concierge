/**
 * 会員一覧
 *
 * © Beautiful Days
 */

import Link from "next/link";
import { supabaseAdmin } from "@/lib/db/supabase";

async function getMembers() {
  const { data, error } = await supabaseAdmin
    .from("members")
    .select("*")
    .is("deleted_at", null)
    .order("joined_at", { ascending: false });

  if (error) {
    console.error("[Admin] 会員取得エラー", error);
    return [];
  }
  return data ?? [];
}

const PLAN_LABEL: Record<string, string> = {
  free: "Free",
  member: "Member",
  client: "商品契約者",
};

const PLAN_COLOR: Record<string, string> = {
  free: "bg-gray-100 text-gray-700",
  member: "bg-yellow-100 text-yellow-800",
  client: "bg-yellow-600 text-white",
};

export default async function MembersPage() {
  const members = await getMembers();

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
          <h1 className="text-3xl font-bold text-gray-900 mt-2">会員一覧</h1>
          <p className="text-gray-500 mt-2">
            アクティブ会員 {members.length}名
          </p>
        </header>

        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 text-gray-600">表示名</th>
                <th className="text-left p-3 text-gray-600">プラン</th>
                <th className="text-left p-3 text-gray-600">入会日</th>
                <th className="text-left p-3 text-gray-600">最終アクティブ</th>
                <th className="text-left p-3 text-gray-600">LINE ID</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-medium text-gray-900">
                    {m.display_name ?? "—"}
                  </td>
                  <td className="p-3">
                    <span
                      className={`text-xs font-bold px-2 py-1 rounded ${
                        PLAN_COLOR[m.plan] ?? PLAN_COLOR.free
                      }`}
                    >
                      {PLAN_LABEL[m.plan] ?? m.plan}
                    </span>
                  </td>
                  <td className="p-3 text-gray-500">
                    {new Date(m.joined_at).toLocaleDateString("ja-JP")}
                  </td>
                  <td className="p-3 text-gray-500">
                    {m.last_active_at
                      ? new Date(m.last_active_at).toLocaleString("ja-JP")
                      : "—"}
                  </td>
                  <td className="p-3 font-mono text-xs text-gray-400">
                    {m.line_user_id.slice(0, 16)}...
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-400">
                    まだ会員はいません
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
