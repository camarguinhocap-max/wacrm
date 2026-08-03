-- ============================================================
-- 038_ai_groq_provider.sql — allow 'groq' as an AI provider
--
-- Adds Groq as a third bring-your-own-key provider alongside OpenAI
-- and Anthropic. Groq's Chat Completions API is OpenAI-compatible
-- (same request/response shape, different base URL), so this is a
-- config-level addition, not a new integration.
--
-- Widens the CHECK constraints on `ai_configs.provider` and
-- `ai_usage_log.provider` — both previously locked to
-- ('openai', 'anthropic') — to also accept 'groq'.
--
-- Idempotent — safe to run multiple times (drops the constraint by
-- name before re-adding it, rather than erroring if it's already gone).
-- ============================================================

ALTER TABLE ai_configs
  DROP CONSTRAINT IF EXISTS ai_configs_provider_check;

ALTER TABLE ai_configs
  ADD CONSTRAINT ai_configs_provider_check
  CHECK (provider IN ('openai', 'anthropic', 'groq'));

ALTER TABLE ai_usage_log
  DROP CONSTRAINT IF EXISTS ai_usage_log_provider_check;

ALTER TABLE ai_usage_log
  ADD CONSTRAINT ai_usage_log_provider_check
  CHECK (provider IN ('openai', 'anthropic', 'groq'));
