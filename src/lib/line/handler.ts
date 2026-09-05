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
  isCancelRequest,
  handleCancelRequest,
  isInReservationSession,
  getReservationStep,
  getAppointmentPromptMessage,
  handlePreferenceAndFindDates,
  handleDateSelectionAndFindSlots,
  tryConfirmAppointment,
  tryFinalizeAppointmentWithContact,
  classifyAndParseInput,
  answerInterruptionQuestion,
  BUSINESS_DAY_POLICY,
  FLOW_CONTINUE_PROMPT,
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

        // 0. 予約キャンセル検出（最優先）
        if (isCancelRequest(userText)) {
          const cancelReply = await handleCancelRequest(
            member.id,
            member.displayName ?? "会員様",
          );
          await saveMessage({ memberId: member.id, direction: "out", content: cancelReply });
          await lineClient.replyMessage({
            replyToken,
            messages: [{ type: "text", text: cancelReply }],
          });
          return;
        }

        // 0.5. 連絡先（電話番号/メールアドレス）回答の受付 → 予約確定
        const contactReply = await tryFinalizeAppointmentWithContact(
          userText, member.id, member.displayName ?? "会員様", history,
        );
        if (contactReply) {
          await saveMessage({ memberId: member.id, direction: "out", content: contactReply });
          await lineClient.replyMessage({ replyToken, messages: [{ type: "text", text: contactReply }] });
          return;
        }

        // 1. 予約セッション中の処理（3段階フロー）
        //    セッション中は「予約したい」等を含む日時指定もLLM分類で処理するため、
        //    isAppointmentRequest より先に評価する
        if (isInReservationSession(history)) {
          const step = getReservationStep(history);

          // show_times: 番号選択→予約確定を先に試行
          if (step === "show_times") {
            const confirmReply = await tryConfirmAppointment(
              userText, member.id, member.displayName ?? "会員様", history,
            );
            if (confirmReply) {
              await saveMessage({ memberId: member.id, direction: "out", content: confirmReply });
              await lineClient.replyMessage({ replyToken, messages: [{ type: "text", text: confirmReply }] });
              return;
            }
          }

          // show_dates: 番号/日付/曜日での選択を先に試行
          if (step === "show_dates") {
            const slotsReply = await handleDateSelectionAndFindSlots(userText, history);
            if (slotsReply) {
              await saveMessage({ memberId: member.id, direction: "out", content: slotsReply });
              await lineClient.replyMessage({ replyToken, messages: [{ type: "text", text: slotsReply }] });
              return;
            }
          }

          // 全ステップ共通: LLMで意図分類→分岐
          if (step === "show_times" || step === "show_dates" || step === "ask_preference") {
            const parsed = await classifyAndParseInput(userText, history);

            if (parsed.intent === "business_hours_question") {
              const reply = step === "ask_preference"
                ? BUSINESS_DAY_POLICY + "\n\nご希望の曜日・時間帯をお知らせください。"
                : BUSINESS_DAY_POLICY;
              await saveMessage({ memberId: member.id, direction: "out", content: reply });
              await lineClient.replyMessage({ replyToken, messages: [{ type: "text", text: reply }] });
              return;
            }

            if (parsed.intent === "other_question") {
              const answer = await answerInterruptionQuestion(userText, history);
              const reply = step === "ask_preference"
                ? answer + "\n\nご希望の曜日・時間帯をお知らせください。"
                : answer + FLOW_CONTINUE_PROMPT;
              await saveMessage({ memberId: member.id, direction: "out", content: reply });
              await lineClient.replyMessage({ replyToken, messages: [{ type: "text", text: reply }] });
              return;
            }

            // date_time_request → 日付候補検索
            const datesReply = await handlePreferenceAndFindDates(userText, history, parsed);
            await saveMessage({ memberId: member.id, direction: "out", content: datesReply });
            await lineClient.replyMessage({ replyToken, messages: [{ type: "text", text: datesReply }] });
            return;
          }
        }

        // 2. 「相談予約」検出 → フロー開始（セッション外のみ）
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
