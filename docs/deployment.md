# Vercel デプロイガイド

bd-ai-concierge を本番環境（Vercel）にデプロイする手順です。

---

## 1. 事前準備

### ✅ 必須項目
- [ ] Week 1-3 のローカル動作確認が完了している
- [ ] GitHub アカウント or Vercel CLI が使える
- [ ] Vercel Pro プラン（Cron 機能のため）
- [ ] 各種アカウントの取得・本番用キーの準備
- [ ] Supabase プロジェクトが本番モード（東京リージョン）
- [ ] LINE 公式アカウントが本番用に設定済み

---

## 2. GitHub への push（推奨）

### 2.1 Beautiful Days 名義の GitHub Organization を作成

1. GitHub で新しい Organization「BeautifulDays」を作成
2. プライベートリポジトリ `bd-ai-concierge` を作成
3. ローカルから push：

```bash
cd C:\Users\motoki\OneDrive\デスクトップ\BD-Projects\bd-ai-concierge

git init
git add .
git commit -m "Initial: Week 1-4 完成"
git branch -M main
git remote add origin https://github.com/BeautifulDays/bd-ai-concierge.git
git push -u origin main
```

### 2.2 アクセス権設定
- 新もと：開発者として参加
- 真武さん：オーナー

---

## 3. Vercel プロジェクト作成

### 3.1 Vercel ダッシュボード

1. [vercel.com](https://vercel.com) にログイン（BD名義 or 新もと個人）
2. 「Add New Project」→「Import Git Repository」
3. GitHub の `bd-ai-concierge` を選択
4. 「Import」をクリック

### 3.2 ビルド設定

- Framework Preset：**Next.js**（自動検出）
- Root Directory：そのまま
- Build Command：そのまま（`next build`）
- Output Directory：そのまま

### 3.3 環境変数を全て設定

「Environment Variables」セクションで、`.env.local` の内容をすべて設定：

| Key | Value | Environment |
|---|---|---|
| `LINE_CHANNEL_SECRET` | 本番値 | Production |
| `LINE_CHANNEL_ACCESS_TOKEN` | 本番値 | Production |
| `ANTHROPIC_API_KEY` | 本番値 | Production |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-5` | Production |
| `NEXT_PUBLIC_SUPABASE_URL` | 本番値 | Production |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 本番値 | Production |
| `SUPABASE_SERVICE_ROLE_KEY` | 本番値 | Production |
| `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` | Production |
| `ADMIN_WEBHOOK_URL` | Slack Webhook URL | Production |
| `CRON_SECRET` | 強力なランダム文字列 | Production |

### 3.4 デプロイ実行

「Deploy」をクリック。
2〜3分で初回デプロイ完了。

---

## 4. デプロイ後の設定

### 4.1 LINE Webhook URL を本番に変更

1. LINE Developers Console を開く
2. Messaging API 設定 → Webhook URL を以下に変更：
   ```
   https://your-app.vercel.app/api/line/webhook
   ```
3. 「検証」ボタンで成功確認
4. Webhook の利用：**オン**

### 4.2 カスタムドメインの設定（任意）

Vercel ダッシュボード → Settings → Domains で：
- `ai.beautifuldays.co.jp` 等のサブドメインを設定可能
- DNS設定後、自動的にHTTPS化

### 4.3 Supabase Auth のリダイレクトURL設定

Supabase ダッシュボード → Authentication → URL Configuration：

```
Site URL: https://your-app.vercel.app
Redirect URLs: https://your-app.vercel.app/auth/callback
```

### 4.4 管理者アカウントの作成

Supabase ダッシュボード → Authentication → Users で：
1. 「Invite user」→ 真武さん・新もとのメアドを追加
2. メールから初回パスワード設定 or マジックリンクログイン

### 4.5 Vercel Cron の動作確認

Vercel ダッシュボード → 該当プロジェクト → Cron Jobs：
- 4つのCronが登録されているか確認
  - `/api/cron/morning-draft` （22:00 JST）
  - `/api/cron/morning-reminder` （07:00 JST）
  - `/api/cron/morning-deliver` （07:30 JST）
  - `/api/cron/cleanup-deleted-members` （00:00 JST）

---

## 5. 動作確認

### 5.1 基本動作

- [ ] LINE で話しかける → 応答が返る
- [ ] `https://your-app.vercel.app/admin/login` でログイン
- [ ] 管理画面が表示される
- [ ] 各メニューが正常動作

### 5.2 Cron 動作

手動でテスト実行：

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
     https://your-app.vercel.app/api/cron/morning-draft
```

レスポンスで `{ok: true, briefId: "xxx"}` が返ればOK。

---

## 6. 監視・運用

### 6.1 Vercel のログ確認

Vercel ダッシュボード → Logs で：
- リアルタイムログ
- エラー検知
- リクエスト数モニタリング

### 6.2 Anthropic API 利用量モニタリング

console.anthropic.com で：
- 月次の使用量
- 想定超過アラート設定（5,000円超など）

### 6.3 Supabase 監視

- データベース使用量
- ストレージ使用量
- API リクエスト数

---

## 7. トラブルシューティング

### LINE Webhook の検証が失敗する

- Webhook URL が https:// で始まっているか
- LINE_CHANNEL_SECRET が本番値か（テスト用と混同していないか）
- Vercel のデプロイが成功しているか

### ログインメールが届かない

- Supabase Auth → Email Templates が有効か
- 迷惑メールフォルダを確認
- 開発者なら Supabase ダッシュボードから直接マジックリンクを発行可能

### Cron が動かない

- Vercel Pro プラン以上か
- vercel.json の crons 設定が反映されているか
- CRON_SECRET が設定されているか

---

## 8. 緊急時の対応

### 緊急停止したい場合

Vercel ダッシュボード → Settings → 「Pause Deployment」で全停止可能。

または LINE 公式アカウント側で「Webhook 利用：オフ」にする。

### ロールバック

Vercel の「Deployments」一覧で過去のバージョンを選択 → 「Promote to Production」

---

## 9. 次のステップ

デプロイ完了後：

1. **限定会員10名でベータテスト**を実施
2. 1週間運用してログを確認
3. NG検出・誤回答があればFAQ・プロンプトを修正
4. 真武さんから本番公開のGOサインを取得
5. 全会員に公開

---

© Beautiful Days
