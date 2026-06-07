/**
 * 市況配信レビューフォーム（クライアント）
 *
 * © Beautiful Days
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BriefReviewForm({
  briefId,
  aiDraft,
  publishDate,
  currentEdit,
  status,
}: {
  briefId: string;
  aiDraft: string;
  publishDate: string;
  currentEdit: string;
  status: string;
}) {
  const router = useRouter();
  const [edited, setEdited] = useState(currentEdit);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/morning-brief/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ briefId, humanReviewed: edited }),
      });
      if (!res.ok) throw new Error(await res.text());
      alert("承認しました。配信予約完了です。");
      router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-yellow-50 border-l-4 border-yellow-600 p-4 rounded">
        <p className="text-sm text-yellow-800">
          <strong>配信日：</strong>
          {publishDate}　
          <strong className="ml-4">ステータス：</strong>
          {status}
        </p>
      </div>

      {/* AIドラフト（参考表示） */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="font-bold text-gray-700 mb-2">
          🤖 AI 生成ドラフト（参考）
        </h2>
        <pre className="text-sm text-gray-600 whitespace-pre-wrap font-sans bg-gray-50 p-4 rounded">
          {aiDraft}
        </pre>
      </div>

      {/* 編集欄 */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="font-bold text-gray-700 mb-2">
          ✏️ 配信内容（編集してください）
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          数値・出典・表現を確認し、必要に応じて修正してから承認してください。
        </p>
        <textarea
          value={edited}
          onChange={(e) => setEdited(e.target.value)}
          rows={16}
          className="w-full p-4 border rounded font-sans text-sm focus:ring-2 focus:ring-yellow-600 focus:border-transparent"
          placeholder="配信する内容を入力..."
        />
        <div className="text-xs text-gray-400 mt-1 text-right">
          {edited.length} 文字
        </div>
      </div>

      {/* チェック項目 */}
      <div className="bg-blue-50 rounded-lg p-4 text-sm">
        <p className="font-bold text-blue-900 mb-2">✅ チェック項目</p>
        <ul className="space-y-1 text-blue-800">
          <li>□ 数値の正確性</li>
          <li>□ 出典の妥当性</li>
          <li>□ 「絶対」「必ず」などの断定表現がない</li>
          <li>□ 「AI作成・担当者確認済」が記載されている</li>
          <li>□ Beautiful Days のトーンに合っている</li>
        </ul>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* アクション */}
      <div className="flex justify-end gap-3">
        <button
          onClick={handleApprove}
          disabled={submitting || edited.length < 10}
          className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-300 text-white font-bold py-3 px-6 rounded transition"
        >
          {submitting ? "送信中..." : "承認して配信予約"}
        </button>
      </div>
    </div>
  );
}
