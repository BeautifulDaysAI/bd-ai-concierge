/**
 * 市況配信レビュー画面
 *
 * AIが生成したドラフトを人間がチェック・修正・承認する画面
 *
 * © Beautiful Days
 */

import Link from "next/link";
import { getPendingBrief } from "@/lib/db/queries/morning-briefs";
import BriefReviewForm from "./BriefReviewForm";

export default async function MorningBriefPage() {
  const brief = await getPendingBrief();

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <Link
            href="/admin"
            className="text-sm text-yellow-700 hover:underline"
          >
            ← ダッシュボードへ戻る
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-2">
            毎朝の市況配信
          </h1>
          <p className="text-gray-500 mt-2">
            AI が生成したドラフトをチェック・修正して、配信を承認します。
          </p>
        </header>

        {!brief ? (
          <div className="bg-white rounded-lg p-8 shadow-sm text-center">
            <p className="text-gray-500">
              現在チェック待ちのドラフトはありません。
            </p>
            <p className="text-sm text-gray-400 mt-2">
              次回ドラフト生成：今夜 22:00 (JST)
            </p>
          </div>
        ) : (
          <BriefReviewForm
            briefId={brief.id}
            aiDraft={brief.aiDraft}
            publishDate={brief.publishDate}
            currentEdit={brief.humanReviewed ?? brief.aiDraft}
            status={brief.status}
          />
        )}
      </div>
    </div>
  );
}
