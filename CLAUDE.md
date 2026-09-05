# bd-ai-concierge

## プロジェクト概要

Beautiful Days（資産形成コンサル会社）の会員様向けLINE AIコンシェルジュ。

**コアコンセプト：「判断するのではなく、準備するAI」**

AIは「整理・受付・調整」だけを担い、判断・推奨・診断は必ず人間（FP）が行う設計。

---

## 帰属・知財

- このプロジェクトのコード・データ・成果物は **Beautiful Days** に帰属する
- 開発担当：新もと（業務委託）
- VanceTrunkとは完全に切り離された独立プロジェクト
- ソースコードのヘッダーに「Beautiful Days」のクレジットを記載
- 個人名・他社名は記載しない

---

## 重要：絶対に守るルール

### 法的グレーゾーンの徹底回避

AIは以下を**絶対にやらない**：

1. **保険業法違反**：他社保険商品の内容説明・推奨・批評
2. **金融商品取引法違反**：個別商品の投資助言・売買判断
3. **税理士法違反**：個別の税務判断・申告アドバイス
4. **宅建業法違反**：不動産物件の良否判断・購入推奨
5. **断定表現**：「絶対」「必ず」「保証」「儲かる」などの言葉
6. **AI単独完結**：判断を要する相談をAIだけで完結させること

### AIが担うのは「準備」まで

| AIに任せる（DO） | AIにやらせない（DON'T） |
|---|---|
| BD会社・サービス・料金の案内 | 保険証券の内容解析・論点提示 |
| パーティ・イベント案内と出欠管理 | 個別商品の推奨・批評 |
| 金融用語の辞書的解説（制度説明） | 「買うべき・売るべき」の判断 |
| FP相談予約のスケジュール調整 | 税務の個別判断・申告アドバイス |
| 資料お預かり（内容は読まない） | 不動産物件の良否判断 |
| アポ前ヒアリング・課題整理 | AIだけで相談を完結させること |
| FP向け事前ブリーフィング | 「絶対」「必ず」などの断定表現 |
| 市況情報のドラフト生成（人間チェック前提） | 人間チェックなしの情報配信 |
| 性格タイプ診断・ライフプラン診断（自己理解の参考） | 診断結果を根拠にした商品推奨・売買判断 |
| 診断完了時の家計サンプル画像の送付 | 会員の家計画像・証券の内容解析 |
| Google Calendar 連携での相談枠の提示・予約・キャンセル | 予約枠の裏で行う個別商品の提案・契約 |
| 代表者／創業者など会社情報のFAQ即答 | 事実確認できない人物・実績の創作 |

### 全配信物に「人間チェック」を必須化

- 毎朝の市況配信は AI生成 → 担当者が朝7:00に確認 → 配信
- 「AI作成・担当者確認済」を必ず明記
- ローテーション制（4名で週1回ずつ）

---

## 3段階フィルター（中核設計）

会員様からの質問を3段階で自動判定：

```
Lv.1（70%）AI即答ゾーン
  - NISA/iDeCoの制度説明
  - 金融用語の辞書的解説
  - BDサービス・料金・パーティ情報
  - イベント出欠
  → AIが即答、FPには繋がない

Lv.2（20%）グレーゾーン
  - 「私の年収だといくら積立?」
  - 「保険の見直しを検討中」
  - 個別性が出てきた相談
  → AIが事前ヒアリング → FP判定

Lv.3（10%）FP直行ゾーン
  - 個別商品名・銘柄の判断
  - 契約・解約・乗り換え
  - 高額（500万超）の運用判断
  → 即アポ誘導
```

---

## 主な会員向け機能（実装済み・アポ獲得特化版）

`src/lib/ai/respond.ts` / `src/lib/line/handler.ts` を中核に、以下が動いている。

### 診断（自己理解の入口・アポ誘導）

- **3分ライフプラン診断（7問）**：`DIAGNOSTIC_PROMPT`。7問すべて回答後に「気づきシート」を返す。
- **30秒お金診断（5問・性格タイプ判定）**：`MONEY_DIAGNOSTIC_PROMPT`。5問の回答から4つのお金の性格タイプのいずれかを判定。
- 診断は「自己理解の参考」であり「商品の推奨ではない」ことをプロンプト側で明記させている。
- 診断モードは3段階フィルターのレベル分類より前に分岐するが、**共通ガードは効いている**：
  - 入力は `detectProductName()` による個別商品名検出の対象（検出時は Lv.3 強制でFP直行）
  - 診断の応答テキストは出力時に `checkNgWords()`（NGワードガード）を通し、NG検出時は `SAFE_FALLBACK_RESPONSE` に差し替え

### 家計サンプル画像の送信

- ライフプラン診断が完了（気づきシート到達）すると、`handler.ts` が LINE の image メッセージで家計支出のサンプル画像を添付する（`HOUSEHOLD_IMAGE_URL` の固定・静的サンプル。会員個人の画像ではない）。
- 画像に先立つ診断テキストは上記NGワードガードを通過済み。

### Google Calendar 連携の相談予約フロー

- `src/lib/google/calendar.ts`（freeBusy 検索・予約作成・イベント削除）と `src/lib/line/appointment-flow.ts` で構成。
- 予約は3段階フロー：`ask_preference`（希望聴取）→ `show_dates`（日付候補提示）→ `show_times`（時間候補提示）→ 連絡先受付で確定。確定時に `google_event_id` を保存。
- 「キャンセル」でカレンダーイベント削除まで実行。予約フロー中の割り込み質問にも応答して復帰する。
- 曜日フィルタ・日曜予約不可・昼休憩・祝日・24h/60日制限など営業時間ルールを厳格化。

### 会社情報FAQ（代表者／創業者を分離）

- `src/lib/ai/knowledge/faq.ts`。「代表者は誰か」と「創業者は誰か」を別FAQに分離し、代表取締役＝岡 竜一、創業者＝真武（またけ）と正確に返す。

---

## プラン構成

| プラン | 月額 | 内容 |
|---|---|---|
| **Free** | 0円 | サービス案内・パーティ案内・用語解説・初回FP相談（商品検討時1回）|
| **Member** | 3,300円 | Free機能 + 毎朝市況・ライフプラン概算・月1FP相談・資料お預かり |
| **商品契約者** | 別途協議 | Member機能 + FP相談随時・契約後フォロー・VIPイベント（※検討中）|

---

## 技術スタック

```
- ランタイム: Node.js 20+
- 言語: TypeScript
- フレームワーク: Next.js 15 (App Router)
- DB: Supabase (Postgres) ※東京リージョン
- AI: Anthropic Claude API (claude-sonnet-4-5)
- メッセージング: LINE Messaging API
- 決済: Stripe（Phase 2で実装）
- ホスティング: Vercel
- 認証: LINE Login + Supabase Auth
```

### 選定理由

- **ノーロックイン**：全て標準APIで実装、提供業者切替が容易
- **国内データ保管**：Supabase 東京リージョンで個人情報保護法対応
- **段階的拡張可能**：月額課金型で小さく始めて成長させられる

---

## ディレクトリ構造

```
bd-ai-concierge/
├── CLAUDE.md                 # このファイル
├── README.md                 # セットアップ手順
├── .env.example              # 環境変数テンプレート
├── .env.local                # ローカル環境変数（コミット禁止）
├── .gitignore
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
│
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── line/
│   │   │   │   └── webhook/
│   │   │   │       └── route.ts        # LINE Webhook受信
│   │   │   ├── admin/
│   │   │   │   ├── morning-brief/      # 市況配信管理
│   │   │   │   └── members/            # 会員管理
│   │   │   └── cron/
│   │   │       └── morning-draft/      # 毎朝のドラフト生成
│   │   ├── admin/                      # 管理画面（人間チェック等）
│   │   └── page.tsx                    # ランディング
│   │
│   ├── lib/
│   │   ├── ai/
│   │   │   ├── client.ts               # Anthropic SDKクライアント
│   │   │   ├── respond.ts              # 応答生成の中核（診断/3段階分岐）
│   │   │   ├── morning-brief.ts        # 市況ドラフト生成
│   │   │   ├── prompts/
│   │   │   │   └── system.ts           # SYSTEM_PROMPT / FILTER_PROMPT / DIAGNOSTIC_PROMPT / MONEY_DIAGNOSTIC_PROMPT
│   │   │   ├── guards/
│   │   │   │   └── ng-words.ts         # NGワード/個別商品名/契約意図の検出
│   │   │   └── knowledge/
│   │   │       └── faq.ts              # AIが参照するBD独自FAQ
│   │   │
│   │   ├── line/
│   │   │   ├── client.ts               # LINE SDK
│   │   │   ├── handler.ts              # Webhookイベント処理・予約フロー分岐
│   │   │   ├── appointment-flow.ts     # 相談予約3段階フロー
│   │   │   ├── document-intake.ts      # 資料お預かり受付
│   │   │   └── signature.ts            # Webhook署名検証
│   │   │
│   │   ├── google/
│   │   │   └── calendar.ts             # Google Calendar連携（freeBusy/予約/削除）
│   │   │
│   │   ├── notify/
│   │   │   ├── fp.ts                    # FPへの通知
│   │   │   └── line.ts                  # LINEプッシュ通知
│   │   │
│   │   ├── db/
│   │   │   ├── supabase.ts             # Supabaseクライアント
│   │   │   ├── supabase-server.ts      # Server Component用
│   │   │   ├── supabase-browser.ts     # Browser用
│   │   │   └── queries/
│   │   │       ├── members.ts
│   │   │       ├── messages.ts
│   │   │       ├── appointments.ts
│   │   │       ├── events.ts
│   │   │       ├── delivery.ts
│   │   │       └── morning-briefs.ts
│   │   │
│   │   └── utils/
│   │       └── env.ts                  # 環境変数バリデーション
│   │
│   └── middleware.ts                   # /admin 配下の認証保護
│
└── docs/
    ├── system-prompt.md                # システムプロンプト設計書
    ├── week1-setup.md 〜 week4-guide.md # 週次実装ガイド
    ├── deployment.md                   # Vercelデプロイガイド
    └── operations.md                   # 運用手順書
```

※ NGワードは `src/lib/ai/guards/ng-words.ts`、FAQは `src/lib/ai/knowledge/faq.ts` がソース・オブ・トゥルース。`docs/ng-words.md`・`docs/faq-knowledge.md`・`scripts/` は存在しない（過去案の名残）。

---

## 開発の進め方

### Week 1：基盤構築（今ココ）
- [ ] プロジェクト初期化
- [ ] CLAUDE.md作成 ✅
- [ ] LINE Developers アカウント作成
- [ ] Vercel / Supabase 環境構築
- [ ] ナレッジ素材整備（FAQ50本）
- [ ] システムプロンプト初稿
- [ ] DB スキーマ設計

### Week 2：コア実装 ✅
- [x] Webhook受信 → Claude応答の最小実装
- [x] 3段階フィルター実装
- [x] NGワードフィルター実装（入出力双方向）
- [x] メッセージログのDB保存
- [x] 会員自動登録
- [x] BD独自FAQの参照
- [x] 会話履歴を踏まえた応答
- [x] エラーハンドリング強化
- [x] 管理画面の土台（ダッシュボード・会話ログ・会員一覧）
- [x] テストコード（NGワード・FAQ検索）

### Week 3：機能拡充 ✅
- [x] AI事前ヒアリング機能（Lv.2応答に含まれる）
- [x] 市況配信スケジューラ（Vercel Cron）
- [x] 人間チェック画面（市況配信レビュー）
- [x] FPへの通知連携（Slack Webhook）
- [x] 資料お預かり窓口の本実装
- [x] イベント管理画面
- [x] FP相談予約DB・管理画面
- [ ] ライフプラン概算機能（Week 4へ繰越）

### Week 4：本番リリース準備 ✅
- [x] 管理画面の認証（Supabase Auth マジックリンク）
- [x] LINE経由のFP相談予約フロー
- [x] 朝の市況配信（本実装・自動配信Cron）
- [x] 退会30日後の自動削除Cron
- [x] プライバシーポリシー（ベース版）
- [x] 利用規約（ベース版）
- [x] Vercelデプロイガイド
- [x] 運用手順書
- [ ] FP2名（新もと・真武さん）で社内ベータテスト ← 次のアクション
- [ ] 顧問弁護士による規約・プラポリ最終確認 ← 次のアクション
- [ ] 限定会員10名で先行ベータ開始 ← 次のアクション

### Week 5: ベータ運用後の拡張（任意）
- [ ] Flex Message UI
- [ ] カレンダー連携
- [ ] Stripe決済（サブスク自動化）
- [ ] ライフプラン概算機能
- [ ] ベクトル検索FAQ（pgvector）

---

## DB設計（概要）

### `members` テーブル
- id (uuid)
- line_user_id (string, unique)
- display_name
- plan ('free' | 'member' | 'client')
- joined_at
- ※その他は実装時に詳細化

### `messages` テーブル（応答ログ全件保存）
- id
- member_id
- direction ('in' | 'out')
- content
- filter_level ('lv1' | 'lv2' | 'lv3')
- ai_model
- created_at

### `documents` テーブル（資料お預かり）
- id
- member_id
- file_url（暗号化保管）
- received_at
- forwarded_to_fp_at
- ※AIは内容を読まない設計

### `morning_briefs` テーブル
- id
- ai_draft（AI生成原文）
- human_reviewed（チェック後）
- reviewer_id
- approved_at
- sent_at

---

## ブランドトーン

Beautiful Days の世界観に合わせる：

- **等身大**：高圧的でない、親しみやすい敬語
- **対等なパートナー**：上から目線ではなく、伴走者の立場
- **シビアな現実**：耳障りの良いことだけ言わない、誠実
- **フラット**：堅苦しくない、でも軽すぎない
- **黒×ゴールド**の世界観

絵文字は使いすぎない。プロフェッショナルな雰囲気を保つ。

---

## セキュリティ

- 個人情報は Supabase 東京リージョンに保管
- 通信は全て HTTPS / TLS 暗号化
- 行レベルセキュリティ（RLS）で他人のデータにアクセス不可
- 退会時の自動削除フロー（30日以内）
- Anthropic API は **ゼロ・データ保持設定**
- LINE Webhook の署名検証必須
- 全会話ログを保存し週次レビュー

---

## 開発時の注意

### Claude Codeで作業するときの指示

1. **コードを書く前に必ずCLAUDE.mdを読む**
2. **NGリストに触れる機能は実装しない**
3. **不確実な場合は実装せず質問する**
4. **新機能追加時は法的リスクを必ず検討**
5. **全コードに型定義を付ける（TypeScript strict）**
6. **エラーハンドリングを丁寧に**
7. **ログ・コメントは日本語で書いてOK**

### 学習・参考にしてよい外部情報

- LINE Messaging API 公式ドキュメント
- Anthropic Claude API 公式ドキュメント
- Supabase 公式ドキュメント
- Next.js / Vercel 公式ドキュメント
- 金融庁 AI ディスカッションペーパー

### 触らない・参照しない情報

- 他社のFPサービスの内部情報
- BD会員様の個人情報を例として使うこと（架空のサンプルのみ）
- VanceTrunk の他プロジェクトのコード

---

## 連絡・確認先

- **コンセプト確認・ブランドトーン**：真武さん
- **法務確認**：BD顧問弁護士
- **実装相談**：新もと（このプロジェクトのオーナー兼開発者）

---

最終更新：2026年7月12日（実装同期）
