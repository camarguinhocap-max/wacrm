-- ============================================================
-- TELEGRAM NOTIFICATIONS — per-agent chat id
-- ============================================================
-- Each teammate can link their own Telegram chat so the webhook can
-- push a "new message" alert even when nobody has the wacrm tab open.
-- Nullable: notifications are opt-in — an agent who never sets this
-- simply never gets pinged, no functional change for anyone else.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;

COMMENT ON COLUMN profiles.telegram_chat_id IS
  'Telegram chat id (from Bot API getUpdates) used to push new-message alerts. Set by the user themselves in Settings → Your profile.';
