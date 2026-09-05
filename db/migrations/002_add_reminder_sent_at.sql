-- fp_appointments に reminder_sent_at カラムを追加
-- 前日リマインドメールの二重送信を防ぐために使用
ALTER TABLE fp_appointments ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
