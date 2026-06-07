/**
 * お預かり資料 管理画面
 *
 * © Beautiful Days
 */

import Link from "next/link";
import { supabaseAdmin } from "@/lib/db/supabase";

async function getDocuments() {
  const { data } = await supabaseAdmin
    .from("documents")
    .select(`
      id,
      file_url,
      file_type,
      file_size,
      received_at,
      reviewed_at,
      members ( display_name, plan )
    `)
    .order("received_at", { ascending: false })
    .limit(50);

  return data ?? [];
}

export default async function DocumentsPage() {
  const documents = await getDocuments();

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8">
          <Link href="/admin" className="text-sm text-yellow-700 hover:underline">
            ← ダッシュボードへ戻る
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-2">
            お預かり資料
          </h1>
          <p className="text-gray-500 mt-2">
            会員様からお預かりした資料。AI は内容を一切読みません。
            相談時に FP が直接確認します。
          </p>
        </header>

        <div className="bg-yellow-50 border-l-4 border-yellow-600 p-4 rounded mb-6">
          <p className="text-sm text-yellow-900">
            <strong>⚠ 取扱注意：</strong>
            このリストはお客様の個人情報を含む可能性があります。
            必要時のみアクセスし、第三者と共有しないでください。
          </p>
        </div>

        <div className="space-y-3">
          {documents.map((doc) => {
            const member = Array.isArray(doc.members) ? doc.members[0] : doc.members;
            return (
              <div
                key={doc.id}
                className={`bg-white rounded-lg shadow-sm p-4 border-l-4 ${
                  doc.reviewed_at ? "border-gray-300" : "border-yellow-600"
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-gray-900">
                      📄 {member?.display_name ?? "—"} 様
                      <span className="text-xs font-normal text-gray-400 ml-2">
                        ({member?.plan})
                      </span>
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      受領：{new Date(doc.received_at).toLocaleString("ja-JP")}
                    </p>
                    <p className="text-xs text-gray-400">
                      ファイル：{doc.file_type ?? "-"} /{" "}
                      {doc.file_size
                        ? `${Math.round((doc.file_size as number) / 1024)} KB`
                        : "-"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {doc.reviewed_at ? (
                      <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">
                        確認済
                      </span>
                    ) : (
                      <span className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded font-bold">
                        要確認
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {documents.length === 0 && (
            <div className="bg-white rounded-lg p-8 shadow-sm text-center text-gray-400">
              まだ資料はありません
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
