-- ========================================
-- bd-ai-concierge データベーススキーマ v1
-- ========================================
-- Supabase の SQL Editor で実行してください
-- 必ず東京リージョンで作成すること
--
-- © Beautiful Days
-- ========================================

-- ----------------------------------------
-- members : 会員マスタ
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id TEXT UNIQUE NOT NULL,
  display_name TEXT,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'member', 'client')),
  email TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,  -- 退会日（NULL = アクティブ）
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_members_line_user_id ON members(line_user_id);
CREATE INDEX idx_members_plan ON members(plan) WHERE deleted_at IS NULL;

COMMENT ON TABLE members IS '会員マスタ';
COMMENT ON COLUMN members.plan IS 'free / member / client';
COMMENT ON COLUMN members.deleted_at IS '退会日。退会から30日後に自動削除';


-- ----------------------------------------
-- messages : メッセージログ（全件保存）
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  content TEXT NOT NULL,
  filter_level TEXT CHECK (filter_level IN ('lv1', 'lv2', 'lv3')),
  ai_model TEXT,
  ng_detected BOOLEAN DEFAULT false,
  ng_words TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_member_created ON messages(member_id, created_at DESC);
CREATE INDEX idx_messages_filter_level ON messages(filter_level) WHERE filter_level IS NOT NULL;
CREATE INDEX idx_messages_ng_detected ON messages(ng_detected) WHERE ng_detected = true;

COMMENT ON TABLE messages IS '全会話ログ。週次レビューに使用';
COMMENT ON COLUMN messages.direction IS 'in = ユーザー→AI / out = AI→ユーザー';
COMMENT ON COLUMN messages.filter_level IS '判定された3段階フィルターのレベル';


-- ----------------------------------------
-- documents : 資料お預かり
-- ----------------------------------------
-- 重要：AI は内容を読まない。FP が相談時に確認するのみ
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  line_message_id TEXT,
  file_url TEXT NOT NULL,  -- Supabase Storage のパス（暗号化）
  file_type TEXT,           -- 'image' / 'pdf' など
  file_size INT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  forwarded_to_fp_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_documents_member ON documents(member_id, received_at DESC);
CREATE INDEX idx_documents_unreviewed ON documents(member_id) WHERE reviewed_at IS NULL;

COMMENT ON TABLE documents IS '会員様からお預かりした資料。AIは内容を読まない';


-- ----------------------------------------
-- morning_briefs : 毎朝の市況配信
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS morning_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publish_date DATE NOT NULL,
  ai_draft TEXT NOT NULL,                    -- AI 生成原文
  ai_generated_at TIMESTAMPTZ NOT NULL,
  human_reviewed TEXT,                       -- 人間がチェック・修正後
  reviewer_id UUID REFERENCES members(id),   -- TODO: reviewers テーブルに移行
  reviewed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'reviewing', 'approved', 'sent', 'rejected')
  ),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX idx_morning_briefs_date ON morning_briefs(publish_date);
CREATE INDEX idx_morning_briefs_status ON morning_briefs(status);

COMMENT ON TABLE morning_briefs IS '毎朝の市況配信。AI生成→人間チェック→配信のフロー';


-- ----------------------------------------
-- events : パーティ・イベント
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  location TEXT,
  capacity INT,
  member_priority BOOLEAN DEFAULT false,  -- Memberプラン優先案内
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_starts ON events(starts_at);


-- ----------------------------------------
-- event_attendances : イベント出欠
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS event_attendances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('yes', 'no', 'maybe')),
  responded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, member_id)
);

CREATE INDEX idx_attendances_event ON event_attendances(event_id);


-- ----------------------------------------
-- fp_appointments : FP相談予約
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS fp_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INT DEFAULT 30,
  hearing_summary TEXT,  -- AIによる事前ヒアリング要約
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (
    status IN ('scheduled', 'completed', 'cancelled', 'no_show')
  ),
  fp_name TEXT,
  notes TEXT,            -- FP記入欄
  google_event_id TEXT,  -- Google Calendar イベントID（キャンセル時に使用）
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_appointments_member ON fp_appointments(member_id);
CREATE INDEX idx_appointments_schedule ON fp_appointments(scheduled_at);


-- ----------------------------------------
-- Row Level Security (RLS) 設定
-- ----------------------------------------
-- まずは全テーブルでRLSを有効化し、デフォルトで全拒否にする
-- 本実装時に member 自身のデータのみアクセス可能なポリシーを追加

ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE morning_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_attendances ENABLE ROW LEVEL SECURITY;
ALTER TABLE fp_appointments ENABLE ROW LEVEL SECURITY;

-- TODO: 適切なRLSポリシーを追加（Week 1後半）


-- ----------------------------------------
-- 自動削除トリガ（退会30日後）
-- ----------------------------------------
-- TODO: pg_cron を使った定期削除ジョブを Week 2 で追加
