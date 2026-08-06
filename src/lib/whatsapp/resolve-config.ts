// ============================================================
// Shared "which WhatsApp number does this send use?" resolver.
//
// Before multi-number support (migration 039), every send path did
// its own `.from('whatsapp_config').select('*').eq('account_id',
// accountId).single()` — safe when an account could only ever have
// one config row. Now that an account can have several, every one of
// those call sites needs to resolve a *specific* row instead: the
// one a conversation/broadcast is pinned to, falling back to the
// account's `is_default` number when nothing more specific is known
// (new conversation, legacy row with no whatsapp_config_id yet, an
// account that still only has one number).
//
// Centralising this in one helper means the fallback behaviour only
// has to be gotten right once, and every call site stays a one-liner.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export class WhatsAppConfigNotFoundError extends Error {
  constructor(message = 'WhatsApp not configured. Please set up your WhatsApp integration first.') {
    super(message);
    this.name = 'WhatsAppConfigNotFoundError';
  }
}

/**
 * Resolve a specific `whatsapp_config` row for an account.
 *
 * - If `whatsappConfigId` is given, fetch that exact row (still
 *   account-scoped — a caller can't reach into another account's
 *   config by guessing an id).
 * - Otherwise fetch the account's default row (`is_default = true`).
 * - Throws `WhatsAppConfigNotFoundError` if nothing matches — same
 *   condition every call site already handled, just centralised.
 *
 * `db` may be an RLS-scoped user client or the service-role client;
 * the explicit `.eq('account_id', ...)` keeps tenancy correct either
 * way.
 */
export async function resolveWhatsAppConfig(
  db: SupabaseClient,
  accountId: string,
  whatsappConfigId?: string | null
) {
  const query = db.from('whatsapp_config').select('*').eq('account_id', accountId);

  const { data, error } = whatsappConfigId
    ? await query.eq('id', whatsappConfigId).maybeSingle()
    : await query.eq('is_default', true).maybeSingle();

  if (error || !data) {
    throw new WhatsAppConfigNotFoundError();
  }

  return data;
}
