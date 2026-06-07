/**
 * AI 応答生成 v2
 *
 * Week 2強化版：
 * - 会員自動登録
 * - 会話履歴を文脈として活用
 * - BD独自FAQの参照
 * - メッセージログのDB保存
 * - NGワード入出力チェック
 *
 * 処理の流れ：
 * 1. 会員の取得 or 作成
 * 2. ユーザー入力の安全チェック
 * 3. 3段階フィルターでレベル判定
 * 4. 過去の会話履歴を取得
 * 5. 関連FAQを検索
 * 6. レベル別に応答生成（履歴・FAQを文脈に含める）
 * 7. NGワードチェック
 * 8. ログ保存
 *
 * © Beautiful Days
 */

import { getAnthropicClient, getDefaultModel } from "./client";
import { SYSTEM_PROMPT, FILTER_PROMPT } from "./prompts/system";
import {
  checkNgWords,
  detectProductName,
  SAFE_FALLBACK_RESPONSE,
} from "./guards/ng-words";
import { searchFaq, formatFaqForPrompt } from "./knowledge/faq";
import { getOrCreateMember } from "@/lib/db/queries/members";
import {
  saveMessage,
  getRecentMessages,
} from "@/lib/db/queries/messages";
import { notifyFp } from "@/lib/notify/fp";

export type FilterLevel = "lv1" | "lv2" | "lv3";

export type AiRequest = {
  /** LINE User ID */
  userId: string;
  /** ユーザーが送ってきたテキスト */
  userText: string;
  /** LINE Display Name（初回登録用） */
  displayName?: string;
};

/**
 * AI 応答を生成する（メインエントリ）
 */
export async function generateAiResponse(req: AiRequest): Promise<string> {
  const { userId, userText, displayName } = req;

  console.log("[AI] 応答生成開始", { userId });

  // 1. 会員を取得 or 作成
  const member = await getOrCreateMember(userId, displayName);
  if (!member) {
    console.error("[AI] 会員取得失敗");
    return SAFE_FALLBACK_RESPONSE;
  }

  // 2. ユーザー入力をログ保存
  await saveMessage({
    memberId: member.id,
    direction: "in",
    content: userText,
  });

  // 3. 個別商品名の検出 → Lv.3 強制
  const productCheck = detectProductName(userText);
  if (productCheck.detected) {
    console.log("[AI] 個別商品名検出 → Lv.3", productCheck.products);
    const response = getLv3Response();
    await saveMessage({
      memberId: member.id,
      direction: "out",
      content: response,
      filterLevel: "lv3",
    });
    // FP に通知（個別商品の相談が来た）
    await notifyFp({
      type: "lv3_inquiry",
      memberName: member.displayName ?? "（名前なし）",
      memberId: member.id,
      summary: `個別商品名を含む相談がありました`,
      details: {
        products: productCheck.products,
        user_text: userText.slice(0, 200),
      },
      link: `${process.env.NEXT_PUBLIC_APP_URL}/admin/messages`,
    });
    return response;
  }

  // 4. 3段階フィルターでレベル判定
  const level = await classifyMessage(userText);
  console.log("[AI] フィルターレベル:", level);

  // 5. 過去の会話履歴を取得（直近10件）
  const history = await getRecentMessages(member.id, 10);

  // 6. 関連FAQを検索
  const relevantFaqs = searchFaq(userText, 3);
  const faqContext = formatFaqForPrompt(relevantFaqs);

  // 7. レベル別に応答生成
  let response: string;
  switch (level) {
    case "lv1":
      response = await generateLv1Response(userText, history, faqContext);
      break;
    case "lv2":
      response = await generateLv2Response(userText, history, faqContext);
      break;
    case "lv3":
      response = getLv3Response();
      break;
  }

  // 8. 出力側NGワードチェック
  const ngCheck = checkNgWords(response);
  if (!ngCheck.ok) {
    console.warn("[AI] NG検出 → fallback応答", ngCheck.matched);

    // NG検出ログを残す（元の応答を保存）
    await saveMessage({
      memberId: member.id,
      direction: "out",
      content: response,
      filterLevel: level,
      aiModel: getDefaultModel(),
      ngDetected: true,
      ngWords: ngCheck.matched,
    });

    return SAFE_FALLBACK_RESPONSE;
  }

  // 9. 応答ログを保存
  await saveMessage({
    memberId: member.id,
    direction: "out",
    content: response,
    filterLevel: level,
    aiModel: getDefaultModel(),
  });

  return response;
}

/**
 * 質問内容を3レベルに分類
 */
async function classifyMessage(text: string): Promise<FilterLevel> {
  try {
    const result = await getAnthropicClient().messages.create({
      model: getDefaultModel(),
      max_tokens: 10,
      system: FILTER_PROMPT,
      messages: [{ role: "user", content: text }],
    });

    const content = result.content[0];
    if (content.type !== "text") return "lv2";

    const raw = content.text.trim().toLowerCase();
    if (raw.includes("lv1")) return "lv1";
    if (raw.includes("lv3")) return "lv3";
    return "lv2";
  } catch (err) {
    console.error("[AI] フィルター判定エラー", err);
    return "lv2"; // エラー時は安全側に
  }
}

/**
 * Lv.1: AI即答ゾーン（履歴・FAQを文脈に活用）
 */
async function generateLv1Response(
  text: string,
  history: { role: "user" | "assistant"; content: string }[],
  faqContext: string,
): Promise<string> {
  const systemWithFaq = faqContext
    ? `${SYSTEM_PROMPT}\n\n${faqContext}`
    : SYSTEM_PROMPT;

  try {
    const result = await getAnthropicClient().messages.create({
      model: getDefaultModel(),
      max_tokens: 1024,
      system: systemWithFaq,
      messages: [...history, { role: "user", content: text }],
    });

    const content = result.content[0];
    if (content.type !== "text") return SAFE_FALLBACK_RESPONSE;
    return content.text;
  } catch (err) {
    console.error("[AI] Lv1応答生成エラー", err);
    return SAFE_FALLBACK_RESPONSE;
  }
}

/**
 * Lv.2: グレーゾーン → ヒアリング
 */
async function generateLv2Response(
  text: string,
  history: { role: "user" | "assistant"; content: string }[],
  faqContext: string,
): Promise<string> {
  const hearingSystemPrompt = `${SYSTEM_PROMPT}

${faqContext}

なお、このユーザーの質問は個別性のある内容です。
具体的な判断は AI ではなく FP が行うため、必要な情報を聞き取り、
FP 相談を提案する応答を生成してください。`;

  try {
    const result = await getAnthropicClient().messages.create({
      model: getDefaultModel(),
      max_tokens: 1024,
      system: hearingSystemPrompt,
      messages: [...history, { role: "user", content: text }],
    });

    const content = result.content[0];
    if (content.type !== "text") return SAFE_FALLBACK_RESPONSE;
    return content.text;
  } catch (err) {
    console.error("[AI] Lv2応答生成エラー", err);
    return SAFE_FALLBACK_RESPONSE;
  }
}

/**
 * Lv.3: 即 FP誘導
 */
function getLv3Response(): string {
  return `ご質問ありがとうございます。

このご質問は、担当 FP が直接お答えする内容です。
詳しいお話を、ぜひ相談時間にお聞かせください。

▼ FP 相談のご予約
このチャットで「FP相談予約」とお送りください。
担当者からスケジュール候補をご案内します。

※ 個別商品のご判断やご契約の検討は、資格を持つ FP が直接ご対応します。`;
}
