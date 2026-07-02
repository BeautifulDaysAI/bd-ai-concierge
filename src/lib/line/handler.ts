/**
 * LINE イベントハンドラ（アポ獲得特化版）
 *
 * 予約フロー: ask_preference → show_dates → show_times → 確定
 *
 * © Beautiful Days
 */

import type { WebhookEvent, MessageEvent } from "@line/bot-sdk";
import { lineClient } from "./client";
import { generateAiResponse, HOUSEHOLD_IMAGE_URL } from "@/lib/ai/respond";
import { handleDocumentUpload } from "./document-intake";
import {
  getOrCreateMember,
  markMemberDeleted,
} from "@/lib/db/queries/members";
import {
  saveMessage,
  getRecentMessages,
} from "@/lib/db/queries/messages";
import {
  isAppointmentRequest,
  isInReservationSession,
  getReservationStep,
  getAppointmentPromptMessage,
  handlePreferenceAndFindDates,
  handleDateSelectionAndFindSlots,
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
        const member = await getOrCreateMember(userId, displayName);
        if (!member) {
          await safeErrorReply(replyToken);
          return;
        }

        await saveMessage({
          memberId: member.id,
          direction: "in",
          content: userText,
        });

        const history = await getRecentMessages(member.id, 10);

        // 1. 予約セッション中の処理（3段階フロー）
        if (isInReservationSession(history)) {
          const step = getReservationStep(history);

          // show_times → 番号で時間選択 → 予約確定
          if (step === "show_times") {
            const confirmReply = await tryConfirmAppointment(
              userText,
              member.id,
              member.displayName ?? "会員様",
              history,
            );
            if (confirmReply) {
              await saveMessage({ memberId: member.id, direction: "out", content: confirmReply });
              await lineClient.replyMessage({
                replyToken,
                messages: [{ type: "text", text: confirmReply }],
              });
              return;
            }
            // 番号以外 → 希望し直し → 日付候補を再提示
            const datesReply = await handlePreferenceAndFindDates(userText, history);
            await saveMessage({ memberId: member.id, direction: "out", content: datesReply });
            await lineClient.replyMessage({
              replyToken,
              messages: [{ type: "text", text: datesReply }],
            });
            return;
          }

          // show_dates → 番号で日付選択 → 時間枠提示
          if (step === "show_dates") {
            const slotsReply = await handleDateSelectionAndFindSlots(userText, history);
            if (slotsReply) {
              await saveMessage({ memberId: member.id, direction: "out", content: slotsReply });
              await lineClient.replyMessage({
                replyToken,
                messages: [{ type: "text", text: slotsReply }],
              });
              return;
            }
            // 番号以外 → 希望し直し → 日付候補を再提示
            const datesReply = await handlePreferenceAndFindDates(userText, history);
            await saveMessage({ memberId: member.id, direction: "out", content: datesReply });
            await lineClient.replyMessage({
              replyToken,
              messages: [{ type: "text", text: datesReply }],
            });
            return;
          }

          // ask_preference → 希望パース → 日付候補提示
          if (step === "ask_preference") {
            const datesReply = await handlePreferenceAndFindDates(userText, history);
            await saveMessage({ memberId: member.id, direction: "out", content: datesReply });
            await lineClient.replyMessage({
              replyToken,
              messages: [{ type: "text", text: datesReply }],
            });
            return;
          }
        }

        // 2. 「相談予約」検出 → フロー開始
        if (isAppointmentRequest(userText)) {
          const promptMsg = getAppointmentPromptMessage();
          await saveMessage({ memberId: member.id, direction: "out", content: promptMsg });
          await lineClient.replyMessage({
            replyToken,
            messages: [{ type: "text", text: promptMsg }],
          });
          return;
        }

        // 3. それ以外は AI 応答（respond.ts内でsaveMessage済み）
        const aiResult = await generateAiResponse({
          userId,
          userText,
          displayName,
        });

        const messages: Array<{ type: "text"; text: string } | { type: "image"; originalContentUrl: string; previewImageUrl: string }> = [
          { type: "text", text: aiResult.text },
        ];

        if (aiResult.diagnosticComplete) {
          messages.push({
            type: "image",
            originalContentUrl: HOUSEHOLD_IMAGE_URL,
            previewImageUrl: HOUSEHOLD_IMAGE_URL,
          });
        }

        await lineClient.replyMessage({
          replyToken,
          messages,
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

  let displayName: string | undefined;
  try {
    const profile = await lineClient.getProfile(userId);
    displayName = profile.displayName;
  } catch (err) {
    console.warn("[LINE] プロフィール取得失敗", err);
  }

  await getOrCreateMember(userId, displayName);

  const welcomeMessage = `${displayName ? displayName + " 様、" : ""}友だち追加ありがとうございます。

Beautiful Days の AI コンシェルジュです。
資産形成に関するご質問に24時間お答えします。

▼ できること
・3分ライフプラン診断（7問で気づきを整理）
・30秒お金診断（5問で価値観タイプがわかる）
・ライフイベントの必要資金の目安
・サービスのご案内
・担当者への相談予約

個別の状況に合わせた具体的なご提案は、担当者がお伺いします。
「相談予約」とお送りいただくか、リッチメニューからどうぞ。`;

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
  await markMemberDeleted(userId);
}

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
