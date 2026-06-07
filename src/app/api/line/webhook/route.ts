/**
 * LINE Webhook 受信エンドポイント
 *
 * LINE からのメッセージを受け取り、Claude API で応答を生成して返す。
 *
 * セキュリティ：
 * - 必ず署名検証を行う
 * - 不正なリクエストは即 401
 *
 * © Beautiful Days
 */

import { NextRequest, NextResponse } from "next/server";
import { validateLineSignature } from "@/lib/line/signature";
import { handleLineEvent } from "@/lib/line/handler";
import type { WebhookEvent } from "@line/bot-sdk";

export async function POST(request: NextRequest) {
  // 1. 署名検証（LINEからの正規リクエストか確認）
  const signature = request.headers.get("x-line-signature");
  const body = await request.text();

  if (!signature || !validateLineSignature(body, signature)) {
    console.warn("[LINE Webhook] 署名検証失敗");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // 2. イベントをパース
  let events: WebhookEvent[];
  try {
    const json = JSON.parse(body);
    events = json.events || [];
  } catch (err) {
    console.error("[LINE Webhook] JSONパースエラー", err);
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // 3. 各イベントを順次処理
  // LINEは10秒以内にレスポンスを返す必要があるため、
  // 重い処理は非同期で進めて先に200を返すパターンが推奨
  // ただしVercelのFunction時間制限内なら同期処理でもOK
  try {
    await Promise.all(events.map((event) => handleLineEvent(event)));
  } catch (err) {
    console.error("[LINE Webhook] イベント処理エラー", err);
    // エラーでも200を返す（LINEのリトライを防ぐ）
  }

  return NextResponse.json({ ok: true });
}

// 簡易ヘルスチェック（オプション）
export async function GET() {
  return NextResponse.json({
    service: "bd-ai-concierge",
    status: "ok",
    timestamp: new Date().toISOString(),
  });
}
