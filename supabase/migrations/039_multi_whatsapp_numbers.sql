-- ============================================================
-- 039_multi_whatsapp_numbers.sql — Multiple WhatsApp numbers per account
--
-- Lifts the "one WhatsApp number per account" restriction introduced
-- in 017 (`whatsapp_config_account_id_key UNIQUE(account_id)`).
-- Accounts stay single-tenant for contacts/pipeline/inbox (per the
-- product decision: one shared conversation per contact, not one per
-- number) — this migration only adds the plumbing needed to track
-- WHICH number a conversation/message/broadcast/template belongs to.
--
-- What this migration does
--   1. Drops `whatsapp_config_account_id_key` — an account may now
--      have any number of `whatsapp_config` rows. `phone_number_id`
--      stays globally UNIQUE (013) — a real phone number can still
--      only be registered once, instance-wide.
--   2. Adds `is_default` + `label` to `whatsapp_config`, backfills
--      every existing row to `is_default = true` (today's implicit
--      "the" number), and adds a partial unique index enforcing at
--      most one default per account.
--   3. Adds a SECURITY DEFINER `set_default_whatsapp_config()` RPC so
--      "make this number the default" is one atomic statement instead
--      of a racy unset-then-set from the client.
--   4. Adds nullable `whatsapp_config_id` to `conversations`,
--      `messages`, and `broadcasts`, each `ON DELETE SET NULL` so
--      deleting a number never cascades into deleting history — it
--      just falls back to the account's default number at send time.
--      Backfills every existing row to the account's (now-default)
--      config, so single-number accounts see zero behavioural change.
--   5. Scopes `message_templates` per WABA: adds `waba_id` (the real
--      Meta ownership boundary — a template belongs to a WABA, and is
--      usable from every number on that WABA) + `whatsapp_config_id`
--      (audit: which config row synced/submitted it). Backfills only
--      where unambiguous (accounts with exactly one config row).
--      Replaces the legacy `UNIQUE(user_id, name, language)` index
--      (014 — pre-account-sharing, and already flagged as a
--      cross-teammate shadowing bug via a TODO in
--      templates/submit/route.ts) with
--      `UNIQUE(account_id, waba_id, name, language)`.
--
-- What this migration does NOT touch
--   - The `UNIQUE(account_id, contact_id)` index on `conversations`
--     (036) stays exactly as-is — one conversation per contact per
--     account, regardless of how many numbers exist. A contact who
--     messages two different numbers stays in the same thread; the
--     thread's `whatsapp_config_id` just moves to whichever number
--     they used most recently (application-level, in the webhook).
--   - The `flow_runs` one-active-run-per-(account_id, contact_id)
--     invariant (017) — same reasoning, unaffected by number count.
--   - RLS policies on `whatsapp_config` — the existing
--     `is_account_member(account_id, 'admin')` checks already work
--     correctly for multiple rows per account; nothing keyed off
--     "the" single row.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- 1. Drop the one-number-per-account constraint
-- ============================================================
ALTER TABLE whatsapp_config DROP CONSTRAINT IF EXISTS whatsapp_config_account_id_key;

-- ============================================================
-- 2. is_default + label, backfill, partial unique index
-- ============================================================
ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS label TEXT;

-- Every row that existed before this migration was implicitly "the"
-- number for its account (the UNIQUE(account_id) constraint we just
-- dropped guaranteed at most one). Mark them default so behaviour is
-- unchanged for every account that still has exactly one number.
UPDATE whatsapp_config SET is_default = true WHERE is_default = false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_config_one_default_per_account
  ON whatsapp_config(account_id) WHERE is_default;

-- Atomic "make this the default" — unsets any other default on the
-- same account and sets this one, in a single statement so the
-- partial unique index above is never transiently violated from two
-- separate client UPDATEs racing each other.
CREATE OR REPLACE FUNCTION set_default_whatsapp_config(
  target_account_id UUID,
  target_config_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_account_member(target_account_id, 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM whatsapp_config
    WHERE id = target_config_id AND account_id = target_account_id
  ) THEN
    RAISE EXCEPTION 'config not found for this account';
  END IF;

  UPDATE whatsapp_config SET is_default = false
  WHERE account_id = target_account_id AND id <> target_config_id AND is_default;

  UPDATE whatsapp_config SET is_default = true
  WHERE id = target_config_id;
END;
$$;

ALTER FUNCTION set_default_whatsapp_config(UUID, UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION set_default_whatsapp_config(UUID, UUID) TO authenticated, service_role;

-- ============================================================
-- 3. whatsapp_config_id on conversations / messages / broadcasts
-- ============================================================
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS whatsapp_config_id UUID REFERENCES whatsapp_config(id) ON DELETE SET NULL;
ALTER TABLE messages      ADD COLUMN IF NOT EXISTS whatsapp_config_id UUID REFERENCES whatsapp_config(id) ON DELETE SET NULL;
ALTER TABLE broadcasts    ADD COLUMN IF NOT EXISTS whatsapp_config_id UUID REFERENCES whatsapp_config(id) ON DELETE SET NULL;

-- Backfill existing rows to their account's default number. Historical
-- `messages` rows are left NULL on purpose (we don't actually know
-- which number sent a pre-migration message, and unlike conversations/
-- broadcasts there's no "current state" to fall back to — NULL here
-- just means "unknown", not "use the default").
UPDATE conversations c
SET whatsapp_config_id = wc.id
FROM whatsapp_config wc
WHERE wc.account_id = c.account_id AND wc.is_default AND c.whatsapp_config_id IS NULL;

UPDATE broadcasts b
SET whatsapp_config_id = wc.id
FROM whatsapp_config wc
WHERE wc.account_id = b.account_id AND wc.is_default AND b.whatsapp_config_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_whatsapp_config ON conversations(whatsapp_config_id);
CREATE INDEX IF NOT EXISTS idx_messages_whatsapp_config ON messages(whatsapp_config_id);
CREATE INDEX IF NOT EXISTS idx_broadcasts_whatsapp_config ON broadcasts(whatsapp_config_id);

-- ============================================================
-- 4. message_templates scoped per WABA
-- ============================================================
ALTER TABLE message_templates
  ADD COLUMN IF NOT EXISTS waba_id TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_config_id UUID REFERENCES whatsapp_config(id) ON DELETE SET NULL;

-- Backfill only while unambiguous: accounts that have exactly one
-- whatsapp_config row (the common case today). Accounts that already
-- have >1 config row by the time this runs are left with waba_id
-- NULL — the templates UI surfaces "needs re-sync" for those instead
-- of silently guessing which WABA a row belongs to.
UPDATE message_templates mt
SET waba_id = wc.waba_id,
    whatsapp_config_id = wc.id
FROM whatsapp_config wc
WHERE wc.account_id = mt.account_id
  AND mt.waba_id IS NULL
  AND (SELECT count(*) FROM whatsapp_config wc2 WHERE wc2.account_id = mt.account_id) = 1;

-- Replace the legacy pre-account-sharing unique index. This also
-- fixes the cross-teammate shadowing bug flagged by the
-- TODO(account-sharing) comment in templates/submit/route.ts — two
-- teammates on the same account creating a template with the same
-- name/language no longer silently collide/overwrite based on
-- user_id alone.
--
-- Guarded: if real duplicate (account_id, waba_id, name, language)
-- data exists (e.g. two config rows synced the same template name
-- independently before waba_id existed), fail loudly rather than
-- silently dropping rows — same pattern as migrations 013/014.
DO $$
BEGIN
  IF EXISTS (
    SELECT account_id, waba_id, name, language
    FROM message_templates
    WHERE waba_id IS NOT NULL
    GROUP BY account_id, waba_id, name, language
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate (account_id, waba_id, name, language) rows exist in message_templates — resolve manually before this migration can add the new unique index.';
  END IF;
END $$;

DROP INDEX IF EXISTS message_templates_user_name_language_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_message_templates_account_waba_name_language
  ON message_templates(account_id, waba_id, name, language);

CREATE INDEX IF NOT EXISTS idx_message_templates_whatsapp_config ON message_templates(whatsapp_config_id);
