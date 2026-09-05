# 復旧手順書（BD AI Concierge 休止中の再開用）

このドキュメントは、BD AI Conciergeを一時的に稼働停止し、後日再開する際に
「何を」「どこから」「どう復元するか」をまとめたものです。

**方針：** このファイルには環境変数の**名前・用途・取得元のみ**を記載し、
実際の値（APIキー・トークン等）は一切含めません。値は各サービスの管理画面、
またはパスワードマネージャー等の安全な場所で別途管理してください。

最終更新：2026年（本ドキュメント作成時点で main ブランチの最新コミットに追従済み）

---

## 1. コードの所在

- リポジトリ: `https://github.com/BeautifulDaysAI/bd-ai-concierge`
- ブランチ: `main`
- **再開時は、このリポジトリの`main`ブランチをそのままVercelにインポートすれば、
  停止時点の全機能（予約フロー・連絡先確認・LINE push通知・Zoom連携・
  前日リマインドcron等）が揃った状態から復元できます。**

停止直前に、それまでの未コミット作業（LINE push通知・Zoom連携・連絡先確認フロー・
前日リマインドcron・DBマイグレーション002/003・テスト一式）はすべて`main`に
コミット・push済みです。

---

## 2. 環境変数一覧（名前・用途・取得元）

Vercelプロジェクトの Settings → Environment Variables に、以下をすべて
Production（必要ならPreviewも）に設定する。テンプレートは`.env.example`にも
同じ内容がある。

### LINE Messaging API（必須）

| 変数名 | 用途 | 取得元 |
|---|---|---|
| `LINE_CHANNEL_SECRET` | Webhook署名検証 | LINE Developers Console → 対象チャネル → Basic settings → Channel secret |
| `LINE_CHANNEL_ACCESS_TOKEN` | メッセージ送受信（reply/push） | LINE Developers Console → 対象チャネル → Messaging API → Channel access token（長期）発行 |

### Anthropic Claude API（必須）

| 変数名 | 用途 | 取得元 |
|---|---|---|
| `ANTHROPIC_API_KEY` | AI応答生成・日時分類LLM | https://console.anthropic.com/settings/keys |
| `ANTHROPIC_MODEL` | 使用モデル指定（例: `claude-sonnet-4-5`） | 固定値。コード内`getDefaultModel()`のデフォルトと合わせる |

### Supabase（必須）

| 変数名 | 用途 | 取得元 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabaseプロジェクトのベースエンドポイント | Supabase Dashboard → 対象プロジェクト → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | クライアント用anonキー | 同上 |
| `SUPABASE_SERVICE_ROLE_KEY` | サーバー側の全権限キー（**絶対にクライアントに露出させない**） | 同上（service_role） |

**注意：** Supabase無料プランは7日間アクセスがないとプロジェクトが自動一時停止する。
長期休止する場合は、再開時にSupabase Dashboardで一時停止解除（Restore）操作が
必要になる可能性がある。

### Google Calendar連携（必須）

| 変数名 | 用途 | 取得元 |
|---|---|---|
| `GOOGLE_CLIENT_ID` | OAuth2クライアントID | Google Cloud Console → APIとサービス → 認証情報 |
| `GOOGLE_CLIENT_SECRET` | OAuth2クライアントシークレット | 同上 |
| `GOOGLE_REFRESH_TOKEN` | カレンダーAPIアクセス用リフレッシュトークン | OAuth Playground（`https://developers.google.com/oauthplayground`）で`https://www.googleapis.com/auth/calendar`スコープを認可して取得。**注意：OAuth同意画面が「テスト」公開ステータスのままだと約7日で失効するため、本番運用では「本番環境」への切り替えを推奨** |
| `GOOGLE_CALENDAR_ID` | 予約イベントの**書き込み先**カレンダー（ボット自身のアカウント） | 対象Googleカレンダーのメールアドレス |
| `GOOGLE_CALENDAR_READ_IDS` | 空き状況確認のための**読み取り対象**カレンダー（カンマ区切り、複数可） | FP本人の実カレンダーのメールアドレス等。二重予約防止のため必須 |

### FP向けLINE通知（必須・機能に直結）

| 変数名 | 用途 | 取得元 |
|---|---|---|
| `FP_LINE_USER_ID` | 予約確定・キャンセル・前日リマインドのpush通知先 | FPがLINE公式アカウントに何かメッセージを送り、そのWebhookログの`source.userId`（`U`から始まる33文字）を確認 |

### Zoom（オプション・未設定でも予約フローは完結する）

| 変数名 | 用途 | 取得元 |
|---|---|---|
| `ZOOM_ACCOUNT_ID` | Server-to-Server OAuthアプリのAccount ID | Zoom Marketplace → 対象アプリ → App Credentials |
| `ZOOM_CLIENT_ID` | 同アプリのClient ID | 同上 |
| `ZOOM_CLIENT_SECRET` | 同アプリのClient Secret | 同上（Regenerateすると値が変わるので要再取得） |
| `ZOOM_USER_EMAIL` | ミーティング作成対象のZoomアカウントのメールアドレス | Server-to-Server OAuthアプリを作成したZoomアカウント本人のメールアドレス |

**既知の問題：** 過去にこのZoom連携でスコープ不足（`meeting:write:meeting`が
選択できずadmin/masterスコープしか使えない）・アプリの意図しない無効化が発生した
実績がある。再開時は必ず、Zoom Marketplaceでアプリが「Activated」状態か、
必要なスコープ（`meeting:write:meeting`）が付与されているかを先に確認すること。
動作しない場合はコード側は自動的にスキップし、予約確定メッセージが
「オンライン相談の詳細URLは、担当者より別途LINEでご案内いたします」という
手動運用の文言にフォールバックする設計になっている（機能停止にはならない）。

### 管理者通知（オプション・Slack、現状未使用）

| 変数名 | 用途 | 取得元 |
|---|---|---|
| `ADMIN_WEBHOOK_URL` | Slack Incoming Webhook URL（設定時のみ、FP通知をSlackにも送る） | Slack App管理画面 |
| `MORNING_REVIEWER_NOTIFY` | 朝の市況配信チェック係への通知先 | 運用ルールに応じて設定 |

### アプリ全般

| 変数名 | 用途 | 取得元 |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | 管理画面リンク生成等に使用する自サイトURL | 本番は`https://<Vercelプロジェクトのドメイン>` |
| `NODE_ENV` | 環境識別 | Vercelが自動設定するため通常は明示不要 |

### 廃止済み（設定不要）

過去に使用していたが現在は完全に削除されている変数。**再開時にこれらを
設定する必要はない：**

- `RESEND_API_KEY` / `EMAIL_FROM` / `ADMIN_NOTIFY_EMAIL`（メール通知は撤退し
  LINE pushに一本化したため、Resend関連コード自体が削除済み）

---

## 3. Supabaseのテーブル構成

正本は`db/schema.sql`（初期構築）＋`db/migrations/*.sql`（差分）。
新規Supabaseプロジェクトで再構築する場合は、`db/schema.sql`を実行した後、
`db/migrations/001_add_google_event_id.sql`
→ `002_add_reminder_sent_at.sql`
→ `003_add_contact_info.sql`
の順に実行する（すでに`schema.sql`側にも反映済みなので、新規構築なら
`schema.sql`だけでも足りるが、既存DBに差分だけ当てる場合はmigrationsを使う）。

| テーブル | 役割 |
|---|---|
| `members` | 会員マスタ（LINE user ID、表示名、プラン、登録日等） |
| `messages` | 全会話ログ（応答内容・3段階フィルターレベル・NG検出フラグ） |
| `documents` | 資料お預かり（AIは内容を読まない設計） |
| `morning_briefs` | 毎朝の市況配信ドラフト・人間チェック・配信履歴 |
| `events` / `event_attendances` | パーティ・イベント管理と出欠 |
| `fp_appointments` | FP相談予約。`google_event_id`（カレンダー連携）、`reminder_sent_at`（前日リマインド送信済みフラグ）、`contact_info`（連絡先）を含む |

Row Level Securityは全テーブルで有効化済み（`schema.sql`参照）。

---

## 4. 復旧手順（新しいVercelアカウント/プロジェクトへの移行を想定）

以下は、現在のVercelアカウント/チームにアクセスできない場合や、
新規に作り直す場合の手順。既存プロジェクトが生きている場合は
手順1・6は不要。

### 手順1：Vercelプロジェクトを作成し、GitHubリポジトリをインポート

1. 復旧作業に使うVercelアカウントでログイン
2. 「Add New...」→「Project」
3. `BeautifulDaysAI/bd-ai-concierge`リポジトリを選択してImport
   （GitHub連携の認可が必要な場合はここで許可する）
4. Framework Presetは自動でNext.jsが検出される。ビルド設定はデフォルトのままでよい

### 手順2：環境変数を設定

1. プロジェクト作成画面、または作成後の Settings → Environment Variables で、
   本ドキュメント「2. 環境変数一覧」の**必須**カテゴリ（LINE / Anthropic /
   Supabase / Google Calendar / FP向けLINE通知）を最低限すべて設定する
2. Zoomは任意（未設定でも予約フローは完結する）
3. Production環境に設定する。Preview環境も使うなら同じ値を複製する

### 手順3：Supabaseプロジェクトを準備

1. 休止前のSupabaseプロジェクトが生きていれば、`SUPABASE_SERVICE_ROLE_KEY`
   等を再取得してそのまま使う（テーブルは既存のものを流用でき、データも残っている）
2. Supabaseプロジェクトが一時停止（無料プラン7日間無アクセスで自動停止）している
   場合は、Supabase Dashboardで「Restore project」を実行してから使う
3. 完全に新規のSupabaseプロジェクトを作る場合は、`db/schema.sql`を
   SQL Editorで実行し、その後`db/migrations/`配下のファイルを
   ファイル名の数字順に実行する

### 手順4：Google Calendar連携の確認・再取得

1. `GOOGLE_REFRESH_TOKEN`は前述の通り約7日で失効する場合がある
   （OAuth同意画面が「テスト」ステータスの場合）。再開時は必ず
   OAuth Playgroundで取り直すか、Google Cloud Consoleで同意画面を
   「本番環境」に昇格しているか確認する
2. `GOOGLE_CALENDAR_ID`（書き込み先）・`GOOGLE_CALENDAR_READ_IDS`
   （読み取り対象、FP本人の実カレンダー）が正しいメールアドレスに
   なっているか確認する

### 手順5：デプロイ

1. Vercelで初回デプロイを実行（インポート時に自動実行される、または
   手動で「Deploy」）
2. デプロイ完了後、割り当てられたVercelドメイン
   （例：`<プロジェクト名>.vercel.app`）を確認する
3. Vercel Cron（`vercel.json`に定義済み：朝の市況配信、前日リマインド、
   退会者クリーンアップ等）は、Production環境へのデプロイと同時に
   自動的に有効化される

### 手順6：LINE Webhook URLを更新

1. LINE Developers Console → 対象チャネル → Messaging API設定を開く
2. Webhook URLを、手順5で確認した新しいドメインの
   `https://<新ドメイン>/api/line/webhook`に更新する
3. 「検証（Verify）」ボタンで疎通確認（200が返ればOK）
4. Webhookの利用が「オン」になっているか確認する

### 手順7：動作確認

1. LINE公式アカウントにメッセージを送り、AI応答が返るか確認
2. 「相談予約」→日時選択→連絡先入力→予約確定まで一通り実行し、
   Googleカレンダーにイベントが作成されるか、FPのLINEに
   「新規予約」通知が届くか確認
3. `docs/operations.md`の日次運用フローに沿って、朝の市況チェック等が
   正常に動くか確認

---

## 5. 既知の注意点（過去のトラブルの再発防止）

- **Vercelドメインの割り当てが外れる事象が過去に発生した。** 再開後、
  本番ドメイン（`*.vercel.app`）にアクセスして、自分たちのアプリが
  正しく表示されるか（他の無関係なプロジェクトが表示されていないか）
  を必ず確認すること
- Vercel CLIのログイン状態は、チーム（`beautiful-days-projects`等）に
  実際に所属しているアカウントで行うこと。個人アカウントでログインしても
  対象プロジェクトは見えない
- Zoom連携は過去に複数回のスコープ・Deactivate問題が発生しており、
  現状FPのLINEへの手動案内にフォールバックする設計になっている。
  無理に直そうとせず、まずはこのフォールバック運用で問題ないか判断すること
