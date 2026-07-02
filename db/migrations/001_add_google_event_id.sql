-- fp_appointments に google_event_id カラムを追加
-- 予約キャンセル時に Google Calendar のイベントを削除するために必要
ALTER TABLE fp_appointments ADD COLUMN IF NOT EXISTS google_event_id TEXT;
