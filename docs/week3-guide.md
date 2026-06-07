# Week 3 機能ガイド

Week 2 のコア実装に、Week 3 で実装した「実運用機能」を追加しました。

---

## ✨ 追加された機能

### 1. イベント管理 ✅

`events` / `event_attendances` テーブルに対応する管理画面とクエリ。

- `/admin/events` でパーティ・修学旅行を確認
- 参加者数（yes回答）も表示
- 過去イベントはグレーアウト

**会員様への案内例**：
LINE で「次のパーティはいつ?」と聞かれたら、`getNextEvent()` で取得して返信できる仕組みが整いました。
（実際の応答ロジックに組み込むのは次のステップで）

### 2. 資料お預かり窓口（本実装） ✅

`src/lib/line/document-intake.ts` を本実装に：

- LINE Content API で画像/ファイルを取得
- Supabase Storage の `member-documents` バケットに会員別フォルダで保存
- `documents` テーブルにメタデータ登録
- FP に Slack 通知（受領完了）
- 会員様には「受け取りました」のみ返信（中身は読まない）

**必要なSupabase設定**：
```sql
-- Storage バケット作成
INSERT INTO storage.buckets (id, name, public)
VALUES ('member-documents', 'member-documents', false);

-- RLS で service_role のみアクセス可
```

### 3. FP通知連携（Slack Webhook） ✅

`src/lib/notify/fp.ts` で以下のタイミングに通知：

- **資料お預かり時**：「○○様から資料を受領しました」
- **Lv.3案件発生時**：「個別商品名を含む相談が来ました」
- **市況ドラフト準備完了**：「明日のブリーフが準備できました」
- **承認漏れ警告**：「朝の市況がまだ未承認です」

Slack の Block Kit 形式で見やすく送信。

### 4. 市況配信スケジューラ ✅

Vercel Cron で2つのジョブ：

| 時刻 | 処理 |
|---|---|
| **22:00 JST (毎日)** | AI で翌日分のドラフト生成 → FP通知 |
| **07:00 JST (毎日)** | 未承認なら再通知 |

`vercel.json` の `crons` 設定で自動実行。

**動作確認用URL**（手動テスト時）：
```
GET /api/cron/morning-draft
Authorization: Bearer {CRON_SECRET}
```

### 5. 市況配信レビュー画面 ✅

`/admin/morning-brief` で：

- AI生成ドラフトを左に表示
- 編集可能なテキストエリア
- チェック項目リスト
- 「承認して配信予約」ボタン
- 承認後ステータスを `approved` に更新

承認 → 朝の配信処理（後日実装：Bot送信）でステータス `sent` に。

### 6. FP相談予約 ✅

- `fp_appointments` テーブル対応
- `/admin/appointments` で予約一覧
- 事前ヒアリング要約も表示
- 会員プラン情報も併記

予約作成は Week 4 で LINE 経由の予約フロー実装予定。

### 7. お預かり資料一覧画面 ✅

`/admin/documents` で：

- 全ての預かり資料一覧
- 「要確認」「確認済」のラベル
- 取扱注意の警告表示

---

## 🔧 必要な環境変数追加

```env
# Vercel Cronの認証（推奨）
CRON_SECRET=your-secret-here

# Slack通知（推奨）
ADMIN_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
```

---

## 📋 セットアップ手順

### Supabase Storage バケット作成

1. Supabase ダッシュボード → Storage
2. 「New bucket」をクリック
3. 名前：`member-documents`
4. **Public bucket: OFF**（重要！個人情報を含む）
5. 作成後、RLS Policy を設定（service_role のみアクセス可）

### Slack Webhook 取得

1. Slack の管理者から、ワークスペースに Incoming Webhooks アプリを追加
2. 通知を受け取るチャンネルを選択
3. Webhook URL をコピー → `.env.local` の `ADMIN_WEBHOOK_URL` に設定

### Vercel Cron の有効化

Vercel にデプロイ時、`vercel.json` を読み取って自動的にCronが登録されます。
**Cron は Vercel Pro プラン以降で動作します。**

---

## 🚀 動作確認手順

### A. 資料お預かり

1. LINE で画像を送る
2. 数秒後に「資料を受け取りました」と返信が来る
3. Slack に通知が来る（ADMIN_WEBHOOK_URL設定時）
4. `/admin/documents` で確認できる

### B. Lv.3案件

1. LINE で「日本生命の保険、解約すべき?」と送る
2. 「担当 FP が直接お答えする内容です」と返信
3. Slack に「個別商品名を含む相談」通知が来る
4. `/admin/messages` で `lv3` ラベル付きで記録

### C. 市況配信ドラフト生成（手動テスト）

ローカルで動作確認する場合：

```bash
# .env.local に CRON_SECRET=test を設定後
curl -H "Authorization: Bearer test" \
     http://localhost:3000/api/cron/morning-draft
```

`/admin/morning-brief` でドラフトが表示される。

### D. 承認フロー

1. `/admin/morning-brief` を開く
2. AIドラフトを確認・編集
3. チェック項目を確認
4. 「承認して配信予約」をクリック
5. ステータスが `approved` に変わる

---

## 📊 Week 3 完了チェックリスト

- [ ] 新規ファイルが取り込まれた
- [ ] `npm install` で型エラーなし
- [ ] Supabase Storage に `member-documents` バケット作成
- [ ] LINE で画像を送ると `/admin/documents` に記録される
- [ ] Slack Webhook が設定され通知が届く
- [ ] LINE で「日本生命」と送ると Slack 通知
- [ ] 手動Cronテストでドラフトが生成される
- [ ] `/admin/morning-brief` で編集→承認できる
- [ ] `/admin/appointments` `/admin/events` が表示される

---

## 🎯 Week 4: ベータ公開前の最終調整

Week 4 では以下を予定：

- **管理画面の認証**（Supabase Auth）
- **LINE経由の予約フロー**（会員→AI→予約確定）
- **配信処理（市況承認→朝の自動送信）**
- **退会30日後の自動削除（pg_cron）**
- **本番環境（Vercel）へのデプロイ**
- **規約・プラポリの整備**
- **社内ベータテスト**

---

© Beautiful Days
