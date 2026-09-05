/**
 * Zoom Server-to-Server OAuth クライアント
 *
 * 予約確定時にオンライン相談用のミーティングを自動作成する。
 * ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET / ZOOM_USER_EMAIL が
 * 未設定の場合は作成をスキップする。
 *
 * 会議作成エンドポイントはuserIdに"me"を使わず、Server-to-Server OAuthで
 * 確実に動作する明示的なメールアドレス指定（ZOOM_USER_EMAIL）を使用する。
 *
 * © Beautiful Days
 */

type ZoomTokenResponse = {
  access_token: string;
  expires_in: number;
};

type ZoomMeetingResponse = {
  join_url: string;
};

let cachedToken: { token: string; expiresAt: number } | null = null;

function hasZoomConfig(): boolean {
  return !!(
    process.env.ZOOM_ACCOUNT_ID &&
    process.env.ZOOM_CLIENT_ID &&
    process.env.ZOOM_CLIENT_SECRET &&
    process.env.ZOOM_USER_EMAIL
  );
}

async function getAccessToken(): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  if (!accountId || !clientId || !clientSecret) return null;

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  try {
    const res = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
      {
        method: "POST",
        headers: { Authorization: `Basic ${basic}` },
      },
    );

    if (!res.ok) {
      console.error("[Zoom] トークン取得失敗", res.status, await res.text());
      return null;
    }

    const data: ZoomTokenResponse = await res.json();
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };
    return cachedToken.token;
  } catch (err) {
    console.error("[Zoom] トークン取得エラー", err);
    return null;
  }
}

/**
 * オンライン相談用のZoomミーティングを作成
 *
 * パスワードなしで参加できるようにするには、Zoomアカウント側の
 * 「ミーティングにパスコードを必須にする」設定を無効化しておく必要がある。
 */
export async function createZoomMeeting(
  start: Date,
  topic: string,
): Promise<{ success: boolean; joinUrl?: string; error?: string }> {
  if (!hasZoomConfig()) {
    console.log("[Zoom] 環境変数未設定。ミーティング作成をスキップ");
    return { success: false, error: "not_configured" };
  }

  const token = await getAccessToken();
  if (!token) {
    return { success: false, error: "token_fetch_failed" };
  }

  const userEmail = process.env.ZOOM_USER_EMAIL!;

  try {
    const res = await fetch(
      `https://api.zoom.us/v2/users/${encodeURIComponent(userEmail)}/meetings`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topic,
          type: 2, // 予約済みミーティング
          start_time: start.toISOString(),
          duration: 60,
          timezone: "Asia/Tokyo",
          settings: {
            join_before_host: true,
            waiting_room: false,
            meeting_authentication: false,
          },
        }),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("[Zoom] ミーティング作成失敗", res.status, text);
      return { success: false, error: `${res.status}: ${text}` };
    }

    const data: ZoomMeetingResponse = await res.json();
    return { success: true, joinUrl: data.join_url };
  } catch (err) {
    console.error("[Zoom] ミーティング作成エラー", err);
    return { success: false, error: String(err) };
  }
}
