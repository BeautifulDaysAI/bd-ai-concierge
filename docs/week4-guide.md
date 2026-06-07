# Week 4 機能ガイド

Week 1-3 で機能実装、Week 4 で「本番リリース可能」状態に到達しました 🎊

---

## ✨ Week 4 で追加された機能

### 1. 管理画面の認証 ✅

Supabase Auth による マジックリンク方式の認証を実装。

**ファイル**：
- `src/middleware.ts` - `/admin` 配下を保護
- `src/app/admin/login/page.tsx` - ログイン画面
- `src/app/auth/callback/route.ts` - マジックリンクコールバック
- `src/lib/db/supabase-server.ts` - Server Component 用クライアント
- `src/lib/db/supabase-browser.ts` - Browser 用クライアント

**利用方法**：
1. Supabase ダッシュボードで管理者ユーザーを「Invite」
2. メールに届くマジックリンクをクリック
3. `/admin` にアクセスできるように

### 2. LINE経由のFP相談予約フロー ✅

会員が「FP相談予約」と送ると、対話形式で予約完了。

**ファイル**：`src/lib/line/appointment-flow.ts`

**フロー**：
```
[会員] 「FP相談予約」
   ↓
[AI Bot] 「以下の3つから選んでください」
        「1. 5月20日(水) 14:00」
        「2. 5月21日(木) 14:00」
        「3. 5月22日(金) 14:00」
   ↓
[会員] 「2」
   ↓
[AI Bot] 「📅 5月21日(木) 14:00 で予約完了しました」
   ↓
[Slack] FPへ通知
```

**注意**：Week 4のシンプル実装は、候補生成 → 番号選択方式。
将来的には Flex Message でカレンダー風UI、空き枠連動などに拡張可能。

### 3. 朝の市況配信（本実装） ✅

承認済みの市況サマリを Member/Client プラン会員に自動配信。

**ファイル**：
- `src/app/api/cron/morning-deliver/route.ts` - 配信Cron
- `src/lib/db/queries/delivery.ts` - 配信先取得

**スケジュール**：
| 時刻 | 処理 |
|---|---|
| 22:00 JST | AI で翌日分ドラフト生成 |
| 07:00 JST | 未承認なら担当者へ再通知 |
| **07:30 JST** | **承認済みなら一斉配信** |

### 4. 退会会員の30日自動削除 ✅

個人情報保護法対応。Cron で毎日0時に実行。

**ファイル**：`src/app/api/cron/cleanup-deleted-members/route.ts`

**処理**：
1. `deleted_at` から30日経過した会員を取得
2. Storage上の資料を削除
3. members レコードを物理削除（CASCADE で messages・documents も削除）

### 5. プラポリ・利用規約テンプレ ✅

**ファイル**：
- `legal/privacy-policy.md` - プライバシーポリシー
- `legal/terms-of-service.md` - 利用規約

⚠️ **必ず顧問弁護士のレビューを受けてから公開**してください。

主要ポイント：
- 国外データ転送（Anthropic 米国）の同意取得
- AI の役割範囲の明示
- 個別商品判断の免責
- 30日以内削除の明記

### 6. デプロイガイド ✅

**ファイル**：`docs/deployment.md`

Vercel への本番デプロイ手順を完全網羅：
- GitHub 連携
- 環境変数設定
- LINE Webhook URL 切替
- Supabase Auth リダイレクトURL設定
- Cron 動作確認
- 監視・運用

### 7. 運用手順書 ✅

**ファイル**：`docs/operations.md`

担当者ローテーション、朝のチェック手順、Lv.3 案件対応、月次レビュー、経費精算など、運用に必要な手順を一通りカバー。

---

## 🎯 Vercel Cron スケジュール一覧

```
00:00 JST  → cleanup-deleted-members  (退会30日後削除)
22:00 JST  → morning-draft            (AI生成)
07:00 JST  → morning-reminder         (未承認再通知)
07:30 JST  → morning-deliver          (一斉配信)
```

vercel.json に4つのCron設定済み。

---

## 📋 Week 4 完了チェックリスト

### コード関連
- [ ] 新規ファイルが正しく取り込まれた
- [ ] `npm install` で型エラーなし
- [ ] middleware.ts が機能している（未ログインで `/admin` →ログイン画面へ）
- [ ] `npm run build` がエラーなし

### Supabase設定
- [ ] Authentication で管理者ユーザーをInvite
- [ ] Authentication → URL Configuration でリダイレクトURL設定
- [ ] Email Templates が有効

### 動作確認
- [ ] LINEで「FP相談予約」と送ると候補日時が表示される
- [ ] 「2」と返信すると予約完了メッセージが届く
- [ ] Slackに予約完了通知が届く
- [ ] `/admin/appointments` に予約が記録される
- [ ] `/admin/login` でマジックリンク認証ができる

### 本番準備
- [ ] プラポリ・規約を顧問弁護士に送付済み
- [ ] Vercel Pro プラン契約済み
- [ ] 経費精算ルール（月次BD請求）合意済み
- [ ] 真武さん・FPと運用手順書を共有済み

---

## 🚀 ベータリリースまでの最終ステップ

### ステップ1: 顧問弁護士の確認（1-2週間）
- プラポリ・規約をレビュー
- 業法チェック（保険業法・金商法）
- 修正反映

### ステップ2: Vercel本番デプロイ
- `docs/deployment.md` の手順通り

### ステップ3: 社内テスト（1週間）
- 新もと・真武さん・もう1人のFPでテスト
- 様々な質問パターンで動作確認
- NG検出の調整
- FAQ の本物への差し替え

### ステップ4: 限定ベータ（2週間）
- 信頼できる会員10名でテスト
- フィードバック収集
- 必要に応じて微調整

### ステップ5: 全会員公開 🎉
- 真武さんから案内
- LINE 公式アカウントの公開QRコード配布
- 月次レビュー開始

---

## 🎁 Week 5 以降（任意）

リリース後の機能拡張アイデア：

| 機能 | 内容 |
|---|---|
| Flex Message UI | 予約画面をリッチUIに |
| カレンダー連携 | Google Calendar / FP の予定と同期 |
| Stripe決済 | サブスク自動課金 |
| ライフプラン概算 | 入力フォーム → AI試算 |
| ベクトル検索FAQ | pgvector で意味検索 |
| 多言語対応 | 英語 / 中国語 |
| 音声メッセージ対応 | LINEボイス → 文字起こし |
| 分析ダッシュボード | 会員行動分析 |

---

## 🎊 完成！

Week 1-4 で **51ファイル超** の本格的な LINE AI コンシェルジュが完成しました。

```
構成サマリ
├─ コード: TypeScript 45ファイル
├─ DB:    7テーブル + Cleanup Cron
├─ 管理画面: 8ページ
├─ Cron: 4ジョブ
└─ ドキュメント: 7ファイル
```

「判断するのではなく、準備するAI」のコンセプトを、技術で完全実現できる土台が整いました。

あとは：
1. 法務確認
2. Vercelデプロイ
3. テスト
4. リリース 🚀

頑張ってください！何か困ったら聞いてくださいね。

---

© Beautiful Days
