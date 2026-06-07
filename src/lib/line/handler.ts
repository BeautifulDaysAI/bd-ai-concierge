/**
 * LINE イベントハンドラ v2
 *
 * Week 2強化版：
 * - LINE プロフィール取得（displayName）で初回登録時の名前保存
 * - 退会・ブロック時の自動退会処理
 * - エラー時の安全な応答
 *
 * © Beautiful Days
 */

import type { WebhookEvent, MessageEvent } from "@line/bot-sdk";
import { lineClient } from "./client";
import { generateAiResponse } from "@/lib/ai/respond";
import { handleDocumentUpload } from "./document-intake";
import {
  getOrCreateMember,
  markMemberDeleted,
} from "@/lib/db/queries/members";
import {
  isAppointmentRequest,
  getAppointmentPromptMessage,
  tryConfirmAppointment,
} from "./appointment-flow";

export async function handleLineEvent(event: WebhookEvent): Promise<void> {
  console.log("[LINE Event]", event.type);

  switch (event.type) {
    case "message":
      await handleMessage(event);
      break;

    case "follow":
      await handleFollow(event);
      break;

    case "unfollow":
      await handleUnfollow(event);
      break;

    default:
      console.log("[LINE] 未対応のイベント:", event.type);
  }
}

async function handleMessage(event: MessageEvent): Promise<void> {
  const { message, replyToken, source } = event;
  const userId = source.userId;

  if (!userId) {
    console.warn("[LINE] userId が取得できませんでした");
    return;
  }

  // プロフィールを取得（初回登録のため）
  let displayName: string | undefined;
  try {
    const profile = await lineClient.getProfile(userId);
    displayName = profile.displayName;
  } catch (err) {
    console.warn("[LINE] プロフィール取得失敗", err);
  }

  switch (message.type) {
    case "text": {
      const userText = message.text;
      try {
        // 1. 予約番号選択を最優先で処理
        const member = await getOrCreateMember(userId, displayName);
        if (member) {
          const confirmReply = await tryConfirmAppointment(
            userText,
            member.id,
            member.displayName ?? "会員様",
          );
          if (confirmReply) {
            await lineClient.replyMessage({
              replyToken,
              messages: [{ type: "text", text: confirmReply }],
            });
            return;
          }

          // 2. 「FP相談予約」検出
          if (isAppointmentRequest(userText)) {
            await lineClient.replyMessage({
              replyToken,
              messages: [
                { type: "text", text: getAppointmentPromptMessage() },
              ],
            });
            return;
          }
        }

        // 3. それ以外は AI 応答
        const aiReply = await generateAiResponse({
          userId,
          userText,
          displayName,
        });

        await lineClient.replyMessage({
          replyToken,
          messages: [{ type: "text", text: aiReply }],
        });
      } catch (err) {
        console.error("[LINE] テキスト応答エラー", err);
        await safeErrorReply(replyToken);
      }
      break;
    }

    case "image":
    case "file": {
      try {
        await handleDocumentUpload({
          userId,
          messageId: message.id,
          replyToken,
        });
      } catch (err) {
        console.error("[LINE] 資料受領エラー", err);
        await safeErrorReply(replyToken);
      }
      break;
    }

    default:
      // スタンプ・動画など
      await lineClient.replyMessage({
        replyToken,
        messages: [
          {
            type: "text",
            text: "ご連絡ありがとうございます。テキスト・画像での質問にお答えできます。",
          },
        ],
      });
  }
}

async function handleFollow(event: WebhookEvent): Promise<void> {
  if (event.type !== "follow") return;

  const userId = event.source.userId;
  if (!userId) return;

  // プロフィール取得
  let displayName: string | undefined;
  try {
    const profile = await lineClient.getProfile(userId);
    displayName = profile.displayName;
  } catch (err) {
    console.warn("[LINE] プロフィール取得失敗", err);
  }

  // 会員登録
  await getOrCreateMember(userId, displayName);

  const welcomeMessage = `${displayName ? displayName + " 様、" : ""}友だち追加ありがとうございます。

Beautiful Days の AI コンシェルジュです。
ご質問やパーティのご案内、資料のお預かりなど、
24時間お気軽にお問い合わせください。

▼ できること
・サービス・料金のご案内
・パーティ・イベントのお知らせ
・FP 相談のご予約
・資料のお預かり

判断が必要なご相談は、担当 FP がしっかりお答えします。

まずはお気軽に、ご質問やご興味をお聞かせください。`;

  await lineClient.replyMessage({
    replyToken: event.replyToken,
    messages: [{ type: "text", text: welcomeMessage }],
  });
}

async function handleUnfollow(event: WebhookEvent): Promise<void> {
  if (event.type !== "unfollow") return;

  const userId = event.source.userId;
  if (!userId) return;

  console.log("[LINE] ユーザーがブロック/退会:", userId);

  // 退会処理（ソフトデリート）
  // 30日後にpg_cronで物理削除
  await markMemberDeleted(userId);
}

/**
 * エラー時の安全な応答（replyTokenがまだ有効なら）
 */
async function safeErrorReply(replyToken: string): Promise<void> {
  try {
    await lineClient.replyMessage({
      replyToken,
      messages: [
        {
          type: "text",
          text: "申し訳ありません、現在システムが混み合っています。少し時間をおいて再度お試しください。",
        },
      ],
    });
  } catch {
    // replyToken切れなどは無視
  }
}
