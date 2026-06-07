/**
 * LINE Messaging API クライアント
 *
 * © Beautiful Days
 */

import { messagingApi } from "@line/bot-sdk";

const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

if (!accessToken) {
  // 起動時に環境変数チェック
  console.warn("[LINE] LINE_CHANNEL_ACCESS_TOKEN が未設定です");
}

export const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: accessToken || "",
});

export const lineBlobClient = new messagingApi.MessagingApiBlobClient({
  channelAccessToken: accessToken || "",
});
