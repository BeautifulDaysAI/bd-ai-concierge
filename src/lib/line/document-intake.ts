/**
 * 資料お預かり窓口（本実装）
 *
 * 処理の流れ：
 * 1. LINE から画像/ファイルバイナリを取得
 * 2. Supabase Storage に暗号化保存
 * 3. documents テーブルにレコード作成
 * 4. FP に通知（Slack Webhook）
 * 5. 会員様には受領通知のみ（中身は読まない）
 *
 * 重要：AIは資料の中身を一切解析しない（保険業法リスク回避）
 *
 * © Beautiful Days
 */

import { lineClient, lineBlobClient } from "./client";
import { supabaseAdmin } from "@/lib/db/supabase";
import { getOrCreateMember } from "@/lib/db/queries/members";
import { notifyFp } from "@/lib/notify/fp";

export type DocumentUploadRequest = {
  userId: string;
  messageId: string;
  replyToken: string;
};

const BUCKET_NAME = "member-documents";

export async function handleDocumentUpload(
  req: DocumentUploadRequest,
): Promise<void> {
  const { userId, messageId, replyToken } = req;

  console.log("[Document] 受領処理開始", { userId, messageId });

  // 1. 会員取得
  const member = await getOrCreateMember(userId);
  if (!member) {
    console.error("[Document] 会員取得失敗");
    return;
  }

  // 2. LINE からファイル取得
  let fileBuffer: Buffer;
  let contentType: string;
  try {
    const stream = await lineBlobClient.getMessageContent(messageId);
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      chunks.push(chunk);
    }
    fileBuffer = Buffer.concat(chunks);
    contentType = "image/jpeg"; // LINE画像はJPEGが基本
  } catch (err) {
    console.error("[Document] LINEファイル取得エラー", err);
    await sendErrorMessage(replyToken);
    return;
  }

  // 3. ファイルパス（会員IDフォルダ内に保存）
  const timestamp = Date.now();
  const ext = contentType === "image/jpeg" ? "jpg" : "bin";
  const filePath = `${member.id}/${timestamp}-${messageId}.${ext}`;

  // 4. Supabase Storage にアップロード
  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .upload(filePath, fileBuffer, {
      contentType,
      upsert: false,
    });

  if (uploadError) {
    console.error("[Document] アップロードエラー", uploadError);
    await sendErrorMessage(replyToken);
    return;
  }

  // 5. documents テーブルにレコード作成
  const { data: docRow, error: dbError } = await supabaseAdmin
    .from("documents")
    .insert({
      member_id: member.id,
      line_message_id: messageId,
      file_url: filePath,
      file_type: contentType,
      file_size: fileBuffer.byteLength,
    })
    .select()
    .single();

  if (dbError || !docRow) {
    console.error("[Document] DB登録エラー", dbError);
  }

  // 6. FPに通知
  await notifyFp({
    type: "document_received",
    memberName: member.displayName ?? "（名前なし）",
    memberId: member.id,
    summary: `${member.displayName ?? "会員"}様から資料をお預かりしました`,
    details: {
      file_size_kb: Math.round(fileBuffer.byteLength / 1024),
      content_type: contentType,
    },
    link: `${process.env.NEXT_PUBLIC_APP_URL}/admin/documents`,
  });

  // 7. 会員様に受領通知（中身は読まない！）
  const receivedAt = new Date().toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
  });

  await lineClient.replyMessage({
    replyToken,
    messages: [
      {
        type: "text",
        text: `📩 資料を受け取りました

▼ お預かりした内容
ファイル：1件（暗号化して保管）
受領日時：${receivedAt}

▼ 次のアクション
担当 FP に通知しました。
次回ご相談の際に、内容を詳しくご説明いたします。

ご相談予約はこちらから↓
「FP相談予約」とお送りください。

※ お送りいただいた資料は、AI は内容を読みません。
　ご相談時に担当 FP が直接確認いたします。`,
      },
    ],
  });

  console.log("[Document] 受領完了", { docId: docRow?.id });
}

async function sendErrorMessage(replyToken: string): Promise<void> {
  try {
    await lineClient.replyMessage({
      replyToken,
      messages: [
        {
          type: "text",
          text: "申し訳ありません、資料の受け取りに失敗しました。もう一度お試しいただくか、担当 FP までご連絡ください。",
        },
      ],
    });
  } catch {
    // 無視
  }
}
