/**
 * AI 応答生成
 *
 * © Beautiful Days
 */

import { getAnthropicClient, getDefaultModel } from "./client";
import { SYSTEM_PROMPT, FILTER_PROMPT, DIAGNOSTIC_PROMPT } from "./prompts/system";
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
  userId: string;
  userText: string;
  displayName?: string;
};

export type AiResult = {
  text: string;
  diagnosticComplete: boolean;
};

const DIAGNOSTIC_TRIGGERS = ["診断", "ライフプラン診断", "診断したい", "診断スタート", "診断をしたい", "3分診断"];

function isDiagnosticTrigger(text: string): boolean {
  return DIAGNOSTIC_TRIGGERS.some((t) => text.includes(t));
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

function isInDiagnosticSession(history: { role: "user" | "assistant"; content: string }[]): boolean {
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role === "assistant" && msg.content.includes("気づきシート")) return false;
    if (msg.role === "assistant" && msg.content.includes("3分ライフプラン診断")) return true;
    if (msg.role === "assistant" && msg.content.includes("年代を教えてください")) return true;
    if (msg.role === "assistant" && msg.content.includes("ご家族構成")) return true;
    if (msg.role === "assistant" && msg.content.includes("いちばん気になっていること")) return true;
    if (msg.role === "assistant" && msg.content.includes("なにか対策をされていますか")) return true;
    if (msg.role === "assistant" && msg.content.includes("生活費")) return true;
    if (msg.role === "assistant" && msg.content.includes("割合が大きいと感じる")) return true;
    if (msg.role === "assistant" && msg.content.includes("お金との付き合い方")) return true;
  }
  return false;
}

/**
 * AI 応答を生成する（メインエントリ）
 */
export async function generateAiResponse(req: AiRequest): Promise<AiResult> {
  const { userId, userText, displayName } = req;

  console.log("[AI] 応答生成開始", { userId });

  const member = await getOrCreateMember(userId, displayName);
  if (!member) {
    console.error("[AI] 会員取得失敗");
    return { text: SAFE_FALLBACK_RESPONSE, diagnosticComplete: false };
  }

  await saveMessage({
    memberId: member.id,
    direction: "in",
    content: userText,
  });

  // 個別商品名の検出 → Lv.3 強制
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
    return { text: response, diagnosticComplete: false };
  }

  // 会話履歴を取得（直近10件）
  const history = await getRecentMessages(member.id, 10);

  // 診断モード判定
  const diagnosticMode = isDiagnosticTrigger(userText) || isInDiagnosticSession(history);

  if (diagnosticMode) {
    console.log("[AI] 診断モード");
    const rawResponse = await generateDiagnosticResponse(userText, history);
    const response = stripMarkdown(rawResponse);
    const isDiagnosticDone = response.includes("気づきシート");
    const ngCheck = checkNgWords(response);
    if (!ngCheck.ok) {
      console.warn("[AI] NG検出 → fallback応答", ngCheck.matched);
      await saveMessage({
        memberId: member.id,
        direction: "out",
        content: response,
        filterLevel: "lv1",
        aiModel: getDefaultModel(),
        ngDetected: true,
        ngWords: ngCheck.matched,
      });
      return { text: SAFE_FALLBACK_RESPONSE, diagnosticComplete: false };
    }
    await saveMessage({
      memberId: member.id,
      direction: "out",
      content: response,
      filterLevel: "lv1",
      aiModel: getDefaultModel(),
    });
    return { text: response, diagnosticComplete: isDiagnosticDone };
  }

  // 3段階フィルターでレベル判定
  const level = await classifyMessage(userText);
  console.log("[AI] フィルターレベル:", level);

  // 関連FAQを検索
  const relevantFaqs = searchFaq(userText, 3);
  const faqContext = formatFaqForPrompt(relevantFaqs);

  // レベル別に応答生成
  let response: string;
  switch (level) {
    case "lv1":
      response = stripMarkdown(await generateLv1Response(userText, history, faqContext));
      break;
    case "lv2":
      response = stripMarkdown(await generateLv2Response(userText, history, faqContext));
      break;
    case "lv3":
      response = getLv3Response();
      break;
  }

  // 出力側NGワードチェック
  const ngCheck = checkNgWords(response);
  if (!ngCheck.ok) {
    console.warn("[AI] NG検出 → fallback応答", ngCheck.matched);
    await saveMessage({
      memberId: member.id,
      direction: "out",
      content: response,
      filterLevel: level,
      aiModel: getDefaultModel(),
      ngDetected: true,
      ngWords: ngCheck.matched,
    });
    return { text: SAFE_FALLBACK_RESPONSE, diagnosticComplete: false };
  }

  await saveMessage({
    memberId: member.id,
    direction: "out",
    content: response,
    filterLevel: level,
    aiModel: getDefaultModel(),
  });

  return { text: response, diagnosticComplete: false };
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
    return "lv2";
  }
}

/**
 * Lv.1: AI即答ゾーン
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

このユーザーの質問は個別性のある内容です。
具体的な判断はFPが行うため、必要な情報を聞き取り、FP相談を提案する応答を生成してください。`;

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

この内容は、担当FPが直接お答えする領域です。
ぜひ相談時間に詳しくお聞かせください。

▼ FP相談のご予約
「FP相談予約」とお送りください。担当者からスケジュール候補をご案内します。

※ 個別商品のご判断やご契約の検討は、資格を持つFPが直接ご対応します。`;
}

/**
 * 3分ライフプラン診断モード
 */
async function generateDiagnosticResponse(
  text: string,
  history: { role: "user" | "assistant"; content: string }[],
): Promise<string> {
  const diagnosticSystem = `${SYSTEM_PROMPT}\n\n${DIAGNOSTIC_PROMPT}`;

  try {
    const result = await getAnthropicClient().messages.create({
      model: getDefaultModel(),
      max_tokens: 2000,
      system: diagnosticSystem,
      messages: [...history, { role: "user", content: text }],
    });

    const content = result.content[0];
    if (content.type !== "text") return SAFE_FALLBACK_RESPONSE;
    return content.text;
  } catch (err) {
    console.error("[AI] 診断応答生成エラー", err);
    return SAFE_FALLBACK_RESPONSE;
  }
}

export const HOUSEHOLD_IMAGE_URL = "https://bd-ai-concierge.vercel.app/bd-household-sample.png";
