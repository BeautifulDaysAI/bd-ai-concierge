/**
 * 毎朝の市況サマリ生成プロンプト
 *
 * 重要：このAI生成物は「ドラフト」であり、必ず人間チェック後に配信する
 *
 * © Beautiful Days
 */

import { getAnthropicClient, getDefaultModel } from "./client";

const MORNING_BRIEF_PROMPT = `あなたは Beautiful Days の AI コンシェルジュです。
会員様向けの「毎朝の市況サマリ」のドラフトを作成してください。

## 守るべきルール

1. 個別商品（個別株、特定の投資信託など）の銘柄推奨は絶対にしない
2. 「上がる」「下がる」など断定はしない（〜の傾向、〜と見られている、など）
3. 「絶対」「必ず」「儲かる」「保証」などは使わない
4. 数値や日付は「事実として確認できる範囲」に留める
5. 必ず最後に「※ 投資判断はご自身で。ご相談は担当 FP まで」と入れる

## 出力フォーマット

\`\`\`
☀️ Beautiful Days モーニングブリーフ
${new Date().toLocaleDateString("ja-JP")}

▼ マーケットの動き（一般論として）
・米国市場：（前日の傾向の一般的な解説）
・日本市場：（同上）
・為替・金利：（同上）

▼ 今日の注目ポイント
・（一般的に注目されている経済指標やイベント）

▼ 一言コメント
（落ち着いた中立的なコメント）

※ 投資判断はご自身で。ご相談は担当 FP まで。
（AI作成・担当者確認済）
\`\`\`

長すぎないように、400-500文字程度でまとめてください。
日本語で、Beautiful Days のフラットで誠実なトーンで。`;

/**
 * 翌日の市況サマリドラフトを生成
 */
export async function generateMorningDraft(): Promise<string> {
  try {
    const result = await getAnthropicClient().messages.create({
      model: getDefaultModel(),
      max_tokens: 1500,
      system: MORNING_BRIEF_PROMPT,
      messages: [
        {
          role: "user",
          content:
            "明日の朝、会員様にお届けする市況サマリのドラフトを作成してください。一般的・中立的なトーンでお願いします。",
        },
      ],
    });

    const content = result.content[0];
    if (content.type !== "text") {
      throw new Error("AI応答が text 型ではありません");
    }

    return content.text;
  } catch (err) {
    console.error("[MorningBrief] 生成エラー", err);
    throw err;
  }
}
