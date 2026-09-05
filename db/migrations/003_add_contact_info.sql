-- fp_appointments に contact_info カラムを追加
-- 予約確定時にお客様から受け取った電話番号/メールアドレスを保存し、
-- FPが当日連絡・Zoom URL送付に使用する
ALTER TABLE fp_appointments ADD COLUMN IF NOT EXISTS contact_info TEXT;
