# Week 1 セットアップガイド

このドキュメントは、bd-ai-concierge の Week 1（基盤構築）でやることをまとめています。

順番通りに進めれば、Week 1 終了時点で「LINE で話しかけたら Claude が答える」最小動作環境ができあがります。

---

## 1. ローカル環境の準備

### 1.1 Node.js のインストール

Node.js 20+ が必要です。すでに入っている場合はスキップ。

```bash
node --version
# v20.x.x 以上であればOK
```

未インストールなら [Node.js公式](https://nodejs.org/) から LTS をダウンロード。

### 1.2 プロジェクトのセットアップ

```bash
cd C:\Users\motoki\OneDrive\デスクトップ\BD-Projects
# ↑ お好みのパスでOK。VanceTrunkとは別フォルダで！

# このプロジェクト一式を配置
# （Claudeから提供されたZIPを展開 or 個別ファイル配置）

cd bd-ai-concierge

# 依存パッケージインストール
npm install
```

---

## 2. 各種アカウント作成

すべて **新もと個人名義** で取得し、領収書を保管。後で BD に請求。

### 2.1 LINE Developers

1. [LINE Developers](https://developers.line.biz/console/) にログイン
2. プロバイダーを作成（例：「Beautiful Days」）
3. **Messaging API チャネル**を新規作成
4. 設定項目：
   - チャネル名：`Beautiful Days AI Concierge`
   - チャネル説明：`会員様向けAIコンシェルジュ`
   - 大業種：金融
   - 小業種：その他金融
5. **取得するもの**：
   - チャネルシークレット（基本設定タブ）
   - チャネルアクセストークン（Messaging APIタブで発行）

### 2.2 LINE 公式アカウント

1. [LINE Official Account Manager](https://manager.line.biz/) で公式アカウント作成
2. プラン：**Light**（5,000円/月）
3. Messaging API と連携
4. 応答設定：
   - 応答モード：**Bot**
   - Webhookの利用：**オン**
   - 応答メッセージ：**オフ**

### 2.3 Anthropic API

1. [Anthropic Console](https://console.anthropic.com/) でアカウント作成
2. 課金情報を登録（クレジットカード）
3. **重要**：プライバシー設定で「ゼロ・データ保持」を確認
4. API キーを発行（`sk-ant-xxx...`）
5. クレジットを 5,000円分くらいチャージ

### 2.4 Supabase

1. [Supabase](https://supabase.com/) でアカウント作成
2. **新規プロジェクト作成**：
   - 名前：`bd-ai-concierge`
   - パスワード：強力なものを生成・保管
   - **リージョン：Northeast Asia (Tokyo)** ← 必須！
3. プロジェクト作成完了後、設定 → API から取得：
   - Project URL
   - anon public key
   - service_role key（秘密！）

### 2.5 Vercel

1. [Vercel](https://vercel.com/) でアカウント作成
2. **後で（Week 2）**プロジェクトをデプロイ
   - GitHub連携が便利だが、未準備なら一旦 Vercel CLI でもOK

---

## 3. 環境変数の設定

```bash
# .env.example をコピー
cp .env.example .env.local

# エディタで .env.local を開き、各値を埋める
```

埋めるべき値（取得手順は上記参照）：

```env
LINE_CHANNEL_SECRET=xxxxx
LINE_CHANNEL_ACCESS_TOKEN=xxxxx
ANTHROPIC_API_KEY=sk-ant-xxxxx
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxxxx
```

---

## 4. データベースのセットアップ

1. Supabase プロジェクトを開く
2. SQL Editor を開く
3. このプロジェクトの `db/schema.sql` の中身をコピペ
4. 実行（Run）

テーブルが作成されたか、Table Editor で確認。

---

## 5. ローカルで動作確認

```bash
# 開発サーバー起動
npm run dev
```

`http://localhost:3000/api/line/webhook` にブラウザでアクセス、
JSON で `{"service":"bd-ai-concierge","status":"ok",...}` が返れば成功。

---

## 6. LINE Webhook の設定（ローカルテスト）

LINEからWebhookを受け取るには、ローカルサーバーを外部公開する必要があります。
**ngrok** を使うと簡単です。

### 6.1 ngrok のインストール

[ngrok](https://ngrok.com/) からダウンロードして展開。

### 6.2 トンネル開通

```bash
# 別ターミナルで
ngrok http 3000
```

`https://xxxx.ngrok.io` のような URL が出るのでコピー。

### 6.3 LINE 側に Webhook URL を設定

1. LINE Developers Console → Messaging API設定
2. Webhook URL に `https://xxxx.ngrok.io/api/line/webhook` を貼る
3. 検証ボタンを押して成功するか確認
4. Webhookの利用：オン

### 6.4 LINE 公式アカウントを友だち追加して話しかける

QRコードまたはLINE IDで友だち追加し、「こんにちは」と送ってみる。
Claude が応答すれば成功！

---

## 7. Week 1 完了チェックリスト

- [ ] Node.js / npm が動く
- [ ] プロジェクト一式が配置されている
- [ ] `npm install` が成功している
- [ ] LINE Developers にチャネル作成済み
- [ ] LINE 公式アカウント作成済み（Light プラン契約）
- [ ] Anthropic API キー取得済み
- [ ] Supabase プロジェクト作成済み（東京リージョン）
- [ ] DB スキーマ実行済み
- [ ] `.env.local` が全項目埋まっている
- [ ] `npm run dev` でローカル起動できる
- [ ] ngrok 経由で Webhook が動く
- [ ] LINE 公式アカウントに話しかけて Claude が応答する

すべて☑になったら Week 2 へ進みます。

---

## トラブルシューティング

### Webhook検証が失敗する

- `.env.local` の LINE_CHANNEL_SECRET が正しいか確認
- ngrok の URL が変わっていないか確認（無料版は起動の度に変わる）

### Claude API がエラーを返す

- API キーが正しいか
- クレジットが残っているか
- ANTHROPIC_MODEL が存在するモデル名か（タイポに注意）

### Supabase に接続できない

- URL/キーが正しいか
- プロジェクトが起動状態か
- service_role キーを誤ってクライアントで使っていないか

---

## 経費メモ（後でBDに請求用）

| 日付 | 項目 | 金額 | 用途 |
|---|---|---|---|
| | LINE公式 Light | 5,000円/月 | Messaging API |
| | Anthropic API | 5,000円〜 | テスト用クレジット |
| | ngrok（任意） | 無料〜 | Webhook検証用 |
| | Supabase | 無料〜25ドル | Pro移行時 |

領収書は必ず保管。月次でまとめて BD に請求。

---

© Beautiful Days
