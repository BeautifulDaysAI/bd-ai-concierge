/**
 * LINE Webhook 署名検証
 *
 * LINE からのリクエストか検証する。
 * これがないと第三者からのリクエストを受け付けてしまう。
 *
 * 参考: https://developers.line.biz/ja/docs/messaging-api/receiving-messages/#verifying-signatures
 *
 * © Beautiful Days
 */

import crypto from "node:crypto";

export function validateLineSignature(
  body: string,
  signature: string,
): boolean {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;

  if (!channelSecret) {
    console.error("[LINE] LINE_CHANNEL_SECRET が未設定です");
    return false;
  }

  const hash = crypto
    .createHmac("sha256", channelSecret)
    .update(body)
    .digest("base64");

  return hash === signature;
}
