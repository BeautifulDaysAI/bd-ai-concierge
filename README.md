# bd-ai-concierge

Beautiful Days 会員様向け LINE AI コンシェルジュ。

> 「判断するのではなく、準備するAI。」

## このプロジェクトについて

Beautiful Days の会員様が LINE で 24時間相談・問い合わせできる AI コンシェルジュです。AI は「準備・整理・調整」を担当し、判断・推奨・診断は必ず人間（FP）が行う設計です。

---

## クイックスタート

### 必要なもの

- Node.js 20+
- npm or pnpm
- 以下のアカウント
  - [LINE Developers](https://developers.line.biz/)
  - [Anthropic API](https://console.anthropic.com/)
  - [Supabase](https://supabase.com/)
  - [Vercel](https://vercel.com/)

### セットアップ手順

```bash
# 1. リポジトリをクローン（GitHub化後）
git clone <repo-url>
cd bd-ai-concierge

# 2. 依存パッケージをインストール
npm install

# 3. 環境変数を設定
cp .env.example .env.local
# .env.local を編集（後述）

# 4. データベースをセットアップ
npm run db:setup

# 5. 開発サーバーを起動
npm run dev
```

ローカルで `http://localhost:3000` にアクセス可能になります。

---

## 環境変数（.env.local）

```bash
# LINE Messaging API
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=

# Anthropic Claude API
ANTHROPIC_API_KEY=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# アプリ設定
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development

# 管理者通知（Slackなど）
ADMIN_WEBHOOK_URL=
```

各サービスでアカウントを作成後、それぞれの管理画面から取得します。詳細は `docs/setup.md`（後日作成）参照。

---

## ディレクトリ構造

詳細は `CLAUDE.md` の「ディレクトリ構造」セクション参照。

```
src/app/api/line/webhook   # LINE Webhook受信
src/lib/ai/                # Claude API 関連
src/lib/line/              # LINE SDK 関連
src/lib/db/                # Supabase 関連
docs/                      # 設計書・ナレッジ
```

---

## 開発スクリプト

```bash
npm run dev          # 開発サーバー起動
npm run build        # 本番ビルド
npm run start        # 本番サーバー起動
npm run lint         # ESLint 実行
npm run type-check   # TypeScript 型チェック
npm run test         # テスト実行
```

---

## デプロイ

Vercelにデプロイ：

```bash
npm install -g vercel
vercel
```

詳細は `docs/deployment.md`（後日作成）参照。

---

## ライセンス・帰属

このプロジェクトのコード・データ・成果物は **Beautiful Days** に帰属します。

無断複製・他プロジェクトへの流用を禁じます。

---

## ドキュメント

- `CLAUDE.md` - プロジェクト全体のコンテキスト（Claude Code向け）
- `docs/system-prompt.md` - AI システムプロンプト設計
- `docs/ng-words.md` - NG ワード一覧
- `docs/faq-knowledge.md` - AI が参照する FAQ
- `docs/operations.md` - 運用手順書

---

最終更新：2026年5月
