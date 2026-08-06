import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  registerPhoneNumber,
  subscribeWabaToApp,
  verifyPhoneNumber,
} from '@/lib/whatsapp/meta-api'
import { encrypt, decrypt } from '@/lib/whatsapp/encryption'
import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'

/**
 * Resolve the caller's account_id from their profile. Used by GET,
 * which wants to return shaped 200s for every non-auth failure mode
 * rather than throw — kept separate from `requireRole` (used by the
 * mutating handlers below) so read access doesn't require admin.
 */
async function resolveAccountId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data?.account_id) return null
  return data.account_id as string
}

// Lazy-initialised service-role client. We need it to detect a
// phone_number_id already claimed by a *different* account — under RLS,
// the caller's own session can't see other accounts' rows, so the
// conflict would be invisible without the service role.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminClient: any = null
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _adminClient
}

const CONFIG_LIST_FIELDS =
  'id, phone_number_id, waba_id, label, is_default, status, connected_at, registered_at, subscribed_apps_at, last_registration_error, created_at, updated_at'

/**
 * GET /api/whatsapp/config
 * GET /api/whatsapp/config?id=<config_id>
 *
 * No `id` — lists every WhatsApp number connected to the account
 * (migration 039: an account can have more than one), without
 * round-tripping to Meta for each one. Used to render the Settings
 * list and the "N of M numbers connected" status tile.
 *
 * With `id` — the "Test API Connection" action for one specific
 * number: decrypts its token and verifies it against Meta live.
 * Returns 200 in all non-auth cases so the UI can render diagnostic
 * detail rather than a generic error toast.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accountId = await resolveAccountId(supabase, user.id)
    if (!accountId) {
      return NextResponse.json(
        {
          connected: false,
          reason: 'no_account',
          message: 'Your profile is not linked to an account.',
        },
        { status: 200 },
      )
    }

    const configId = new URL(request.url).searchParams.get('id')

    if (!configId) {
      const { data: configs, error: listError } = await supabase
        .from('whatsapp_config')
        .select(CONFIG_LIST_FIELDS)
        .eq('account_id', accountId)
        .order('created_at', { ascending: true })

      if (listError) {
        console.error('Error listing whatsapp_config:', listError)
        return NextResponse.json(
          { error: 'Failed to fetch configuration' },
          { status: 500 },
        )
      }

      return NextResponse.json({ configs: configs ?? [] })
    }

    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('id, phone_number_id, access_token, status, label')
      .eq('account_id', accountId)
      .eq('id', configId)
      .maybeSingle()

    if (configError) {
      console.error('Error fetching whatsapp_config:', configError)
      return NextResponse.json(
        { connected: false, reason: 'db_error', message: 'Failed to fetch configuration' },
        { status: 200 }
      )
    }

    if (!config) {
      return NextResponse.json(
        {
          connected: false,
          reason: 'no_config',
          message: 'This WhatsApp number was not found on your account.',
        },
        { status: 200 }
      )
    }

    // Try to decrypt the stored token with the current ENCRYPTION_KEY.
    // If this fails, the key changed (or was never consistent across envs).
    let accessToken: string
    try {
      accessToken = decrypt(config.access_token)
    } catch (err) {
      console.error('[whatsapp/config GET] Token decryption failed:', err)
      return NextResponse.json(
        {
          connected: false,
          reason: 'token_corrupted',
          needs_reset: true,
          message:
            'The stored access token cannot be decrypted with the current ENCRYPTION_KEY. This usually means the key changed, or it differs between environments (local vs Hostinger vs Vercel). Remove this number below, then re-add it.',
        },
        { status: 200 }
      )
    }

    // Validate credentials against Meta
    try {
      const phoneInfo = await verifyPhoneNumber({
        phoneNumberId: config.phone_number_id,
        accessToken,
      })
      return NextResponse.json({ connected: true, config_id: config.id, phone_info: phoneInfo })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Meta API error'
      console.error('[whatsapp/config GET] Meta API verification failed:', message)
      return NextResponse.json(
        {
          connected: false,
          config_id: config.id,
          reason: 'meta_api_error',
          message: `Meta API rejected the credentials: ${message}`,
        },
        { status: 200 }
      )
    }
  } catch (error) {
    console.error('Error in WhatsApp config GET:', error)
    return NextResponse.json(
      { connected: false, reason: 'unknown', message: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/whatsapp/config
 *
 * Adds a new WhatsApp number to the account. Verifies credentials with
 * Meta first, then encrypts and inserts a new `whatsapp_config` row —
 * this NEVER updates an existing row (that's PATCH's job), since an
 * account can now hold several numbers side by side (migration 039).
 * The very first number an account adds becomes its default
 * automatically; later ones start as non-default (switch via PATCH
 * `set_default`).
 */
export async function POST(request: Request) {
  try {
    // Adding a number is settings-class + has an external Meta side
    // effect (register/subscribe) that RLS can't roll back, so — same
    // rationale as the template submit/sync routes — this requires
    // admin, not just account membership.
    const { supabase, accountId, userId } = await requireRole('admin')

    const body = await request.json()
    const { phone_number_id, waba_id, access_token, verify_token, pin, label } = body

    if (!access_token || !phone_number_id) {
      return NextResponse.json(
        { error: 'access_token and phone_number_id are required' },
        { status: 400 }
      )
    }

    if (pin !== undefined && pin !== null && pin !== '') {
      if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
        return NextResponse.json(
          { error: 'PIN must be exactly 6 digits.' },
          { status: 400 }
        )
      }
    }

    // Reject if another account has already claimed this phone_number_id.
    // wacrm is single-tenant-per-WhatsApp-number — letting two accounts
    // bind the same number causes phone_number_id-keyed webhook lookups
    // to throw PGRST116 ("multiple rows"), silently dropping every
    // inbound message. See issue #136.
    const { data: claimed, error: claimedError } = await supabaseAdmin()
      .from('whatsapp_config')
      .select('account_id')
      .eq('phone_number_id', phone_number_id)
      .neq('account_id', accountId)
      .maybeSingle()

    if (claimedError) {
      console.error('Error checking phone_number_id ownership:', claimedError)
      return NextResponse.json(
        { error: 'Failed to validate configuration' },
        { status: 500 }
      )
    }

    if (claimed) {
      return NextResponse.json(
        {
          error:
            'This WhatsApp phone number is already linked to another account on this instance. Each phone number can only be connected to one wacrm account.',
        },
        { status: 409 }
      )
    }

    // Within THIS account, adding the same number twice is a no-op
    // trap (two rows racing to own the same conversations/messages) —
    // point the user at the existing row instead.
    const { data: sameAccountExisting } = await supabase
      .from('whatsapp_config')
      .select('id, registered_at')
      .eq('account_id', accountId)
      .eq('phone_number_id', phone_number_id)
      .maybeSingle()

    // Verify credentials with Meta BEFORE saving
    let phoneInfo
    try {
      phoneInfo = await verifyPhoneNumber({
        phoneNumberId: phone_number_id,
        accessToken: access_token,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Meta API error'
      console.error('Meta API verification failed during save:', message)
      return NextResponse.json(
        { error: `Meta API error: ${message}` },
        { status: 400 }
      )
    }

    // Encrypt sensitive tokens before storing
    let encryptedAccessToken: string
    let encryptedVerifyToken: string | null
    try {
      encryptedAccessToken = encrypt(access_token)
      encryptedVerifyToken = verify_token ? encrypt(verify_token) : null
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown encryption error'
      console.error('Encryption failed:', message)
      return NextResponse.json(
        {
          error:
            'Failed to encrypt token. Check that ENCRYPTION_KEY is a valid 64-character hex string in your environment variables.',
        },
        { status: 500 }
      )
    }

    const sameNumber = sameAccountExisting?.registered_at != null

    // Step 1: register the phone number for inbound webhooks.
    //
    // Attempted on first save AND whenever the user supplies a fresh
    // PIN (e.g. they rotated the 2FA PIN in Meta Manager). Skipped
    // when the same number is already registered and no PIN was
    // supplied — re-registering an already-active number with a
    // stale PIN would actually fail and undo the active subscription.
    let registeredAt: string | null = sameAccountExisting?.registered_at ?? null
    let registrationError: string | null = null
    // True when registration was deliberately skipped because no PIN
    // was supplied (see below). Distinct from registrationError — this
    // is not a failure, just an incomplete-but-valid save.
    let registrationSkipped = false

    const needsRegistration = !sameNumber || (typeof pin === 'string' && pin.length > 0)
    if (needsRegistration) {
      if (!pin) {
        // No PIN provided. Meta TEST numbers (Developer Console) are
        // pre-registered by Meta and expose no two-step verification
        // PIN to set, so requiring one made them impossible to connect
        // (issue #242). The /register + PIN step only matters for
        // production numbers under a shared WABA (issue #136), so treat
        // it as best-effort: skip it, save the (already Meta-verified)
        // credentials as connected, and leave registered_at null. The
        // UI surfaces a separate "Not registered" banner with a path to
        // add a PIN later for users who do need inbound webhook routing.
        registrationSkipped = true
      } else {
        try {
          await registerPhoneNumber({
            phoneNumberId: phone_number_id,
            accessToken: access_token,
            pin,
          })
          registeredAt = new Date().toISOString()
        } catch (err) {
          registrationError =
            err instanceof Error ? err.message : 'Unknown Meta API error'
          console.error('Phone number /register failed:', registrationError)
          // We deliberately fall through and still save the row so the
          // user can retry without re-entering everything. The UI
          // surfaces `last_registration_error` so they see WHY it's
          // not actually live yet.
        }
      }
    }

    // Step 2: subscribe the WABA to this app. Idempotent on Meta's
    // side, so we call on every save and persist the timestamp.
    // Skipped only when there's no waba_id (legacy rows from before
    // we required it).
    let subscribedAppsAt: string | null = null
    if (waba_id) {
      try {
        await subscribeWabaToApp({
          wabaId: waba_id,
          accessToken: access_token,
        })
        subscribedAppsAt = new Date().toISOString()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.warn('WABA subscribed_apps failed (non-fatal):', message)
        // Subscription failures are rare once the App has the right
        // permissions; we don't block save on them — the diagnostic
        // endpoint surfaces this state too.
      }
    }

    const baseRow = {
      phone_number_id,
      waba_id: waba_id || null,
      access_token: encryptedAccessToken,
      verify_token: encryptedVerifyToken,
      status: registrationError ? 'disconnected' : 'connected',
      connected_at: registrationError ? null : new Date().toISOString(),
      registered_at: registrationError ? null : registeredAt,
      subscribed_apps_at: subscribedAppsAt ?? null,
      last_registration_error: registrationError,
      updated_at: new Date().toISOString(),
      label: typeof label === 'string' && label.trim() ? label.trim() : null,
    }

    let configId: string

    if (sameAccountExisting) {
      // Re-adding a number this account already has (e.g. retrying
      // after a failed /register) — update that row instead of
      // inserting a duplicate.
      const { error: updateError } = await supabase
        .from('whatsapp_config')
        .update(baseRow)
        .eq('id', sameAccountExisting.id)

      if (updateError) {
        console.error('Error updating whatsapp_config:', updateError)
        return NextResponse.json(
          { error: 'Failed to update configuration' },
          { status: 500 }
        )
      }
      configId = sameAccountExisting.id
    } else {
      // First number on the account becomes the default automatically
      // (nothing else could be sending yet); later numbers start as
      // non-default and are promoted explicitly via PATCH set_default.
      const { count } = await supabase
        .from('whatsapp_config')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId)
      const isFirstConfig = (count ?? 0) === 0

      const { data: inserted, error: insertError } = await supabase
        .from('whatsapp_config')
        .insert({
          account_id: accountId,
          user_id: userId,
          is_default: isFirstConfig,
          ...baseRow,
        })
        .select('id')
        .single()

      if (insertError || !inserted) {
        console.error('Error inserting whatsapp_config:', insertError)
        return NextResponse.json(
          { error: 'Failed to save configuration' },
          { status: 500 }
        )
      }
      configId = inserted.id
    }

    if (registrationError) {
      // Save succeeded but the number isn't actually live. Return
      // 200 with a structured error so the UI can show the specific
      // remediation step instead of a generic toast.
      return NextResponse.json({
        success: false,
        saved: true,
        config_id: configId,
        registered: false,
        registration_error: registrationError,
        phone_info: phoneInfo,
      })
    }

    return NextResponse.json({
      success: true,
      saved: true,
      config_id: configId,
      registered: registeredAt != null,
      // Credentials are valid and saved, but inbound webhook
      // registration was skipped because no PIN was supplied (e.g. a
      // Meta test number). The UI shows the "Not registered" banner
      // rather than claiming the number is fully live.
      registration_skipped: registrationSkipped,
      phone_info: phoneInfo,
    })
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    console.error('Error in WhatsApp config POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/whatsapp/config
 *
 * Body: { id: string, label?: string | null, set_default?: true }
 *
 * Two independent, narrow operations — kept on one verb rather than
 * adding more routes since neither touches Meta:
 *   - `label`: cosmetic rename, direct update.
 *   - `set_default`: promotes this number to the account's default via
 *     the `set_default_whatsapp_config` RPC (migration 039), which
 *     atomically unsets the old default and requires admin itself.
 */
export async function PATCH(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('admin')

    const body = await request.json()
    const { id, label, set_default } = body as {
      id?: string
      label?: string | null
      set_default?: boolean
    }

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    if (set_default) {
      const { error: rpcError } = await supabase.rpc('set_default_whatsapp_config', {
        target_account_id: accountId,
        target_config_id: id,
      })
      if (rpcError) {
        console.error('Error setting default whatsapp_config:', rpcError)
        return NextResponse.json(
          { error: rpcError.message || 'Failed to set default number' },
          { status: 400 }
        )
      }
    }

    if (label !== undefined) {
      const { error: updateError } = await supabase
        .from('whatsapp_config')
        .update({ label: typeof label === 'string' && label.trim() ? label.trim() : null })
        .eq('id', id)
        .eq('account_id', accountId)
      if (updateError) {
        console.error('Error updating whatsapp_config label:', updateError)
        return NextResponse.json(
          { error: 'Failed to update label' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    console.error('Error in WhatsApp config PATCH:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/whatsapp/config?id=<config_id>
 *
 * Removes one WhatsApp number from the account. `conversations`,
 * `messages`, and `broadcasts` reference the row with
 * ON DELETE SET NULL (migration 039), so history is preserved — those
 * rows just lose their "current number" pointer. If the removed number
 * was the account's default and other numbers remain, the oldest
 * remaining one is promoted so the account is never left without a
 * default (required by every send-path's `resolveWhatsAppConfig`
 * fallback).
 */
export async function DELETE(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('admin')

    const configId = new URL(request.url).searchParams.get('id')
    if (!configId) {
      return NextResponse.json({ error: 'id query param is required' }, { status: 400 })
    }

    const { data: target } = await supabase
      .from('whatsapp_config')
      .select('id, is_default')
      .eq('account_id', accountId)
      .eq('id', configId)
      .maybeSingle()

    if (!target) {
      return NextResponse.json({ error: 'WhatsApp number not found' }, { status: 404 })
    }

    const { error: deleteError } = await supabase
      .from('whatsapp_config')
      .delete()
      .eq('id', configId)
      .eq('account_id', accountId)

    if (deleteError) {
      console.error('Error deleting whatsapp_config:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete configuration' },
        { status: 500 }
      )
    }

    if (target.is_default) {
      const { data: remaining } = await supabase
        .from('whatsapp_config')
        .select('id')
        .eq('account_id', accountId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (remaining) {
        await supabase
          .from('whatsapp_config')
          .update({ is_default: true })
          .eq('id', remaining.id)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    console.error('Error in WhatsApp config DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
