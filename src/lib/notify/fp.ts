/**
 * FP への通知サービス
 *
 * Slack Webhook、または メール経由でFPに通知。
 * ADMIN_WEBHOOK_URL が設定されていれば Slack 形式で送信。
 *
 * © Beautiful Days
 */

export type NotifyType =
  | "document_received" // 資料お預かり
  | "lv3_inquiry"       // Lv.3 相談（FP直行案件）
  | "fp_appointment"    // FP相談予約
  | "ng_detected"       // NG検出（要レビュー）
  | "morning_brief_ready"; // 朝の市況ドラフト準備完了

export type NotifyPayload = {
  type: NotifyType;
  memberName?: string;
  memberId?: string;
  summary?: string;
  details?: Record<string, unknown>;
  link?: string;
};

const TYPE_EMOJI: Record<NotifyType, string> = {
  document_received: "📩",
  lv3_inquiry: "🚨",
  fp_appointment: "📅",
  ng_detected: "⚠️",
  morning_brief_ready: "☀️",
};

const TYPE_LABEL: Record<NotifyType, string> = {
  document_received: "資料お預かり",
  lv3_inquiry: "FP直行案件 (Lv.3)",
  fp_appointment: "FP相談予約",
  ng_detected: "NG検出",
  morning_brief_ready: "朝の市況ドラフト",
};

/**
 * FP に通知を送る
 */
export async function notifyFp(payload: NotifyPayload): Promise<void> {
  const webhookUrl = process.env.ADMIN_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log("[Notify] ADMIN_WEBHOOK_URL 未設定。コンソール出力のみ");
    console.log("[Notify]", payload);
    return;
  }

  const emoji = TYPE_EMOJI[payload.type];
  const label = TYPE_LABEL[payload.type];

  // Slack の Block Kit 形式
  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${emoji} ${label}`,
      },
    },
    {
      type: "section",
      fields: [
        ...(payload.memberName
          ? [{ type: "mrkdwn", text: `*会員:*\n${payload.memberName}` }]
          : []),
        ...(payload.summary
          ? [{ type: "mrkdwn", text: `*概要:*\n${payload.summary}` }]
          : []),
      ],
    },
    ...(payload.details
      ? [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `\`\`\`${JSON.stringify(payload.details, null, 2)}\`\`\``,
            },
          },
        ]
      : []),
    ...(payload.link
      ? [
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "管理画面で確認" },
                url: payload.link,
              },
            ],
          },
        ]
      : []),
  ];

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks }),
    });

    if (!res.ok) {
      console.error("[Notify] Slack送信失敗", res.status, await res.text());
    }
  } catch (err) {
    console.error("[Notify] 通知エラー", err);
  }
}
