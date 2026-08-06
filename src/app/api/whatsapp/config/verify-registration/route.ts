import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/whatsapp/encryption'
import {
  getSubscribedApps,
  verifyPhoneNumber,
} from '@/lib/whatsapp/meta-api'

/**
 * GET /api/whatsapp/config/verify-registration
 * GET /api/whatsapp/config/verify-registration?id=<config_id>
 *
 * Diagnostic endpoint — confirms the account's saved phone number(s)
 * are actually reachable on Meta's side. Solves the failure mode that
 * surfaced the multi-number bug originally: "UI says Connected but
 * Meta isn't delivering events."
 *
 * Without `id`, runs the diagnostic for every number on the account
 * (migration 039) and returns one entry per number — this is what
 * drives the "N of M numbers connected" status tile. With `id`, runs
 * it for just that one number (used by a per-row "Verify" action).
 *
 * Three checks run independently per number so the UI can show which
 * step passes and which fails:
 *
 *   1. phone_info  — GET /{phone_number_id} succeeds
 *   2. waba_subscription — our app appears in
 *                    GET /{waba_id}/subscribed_apps
 *   3. registered_at — local timestamp set by POST /config when
 *                    /register last succeeded; NULL means the
 *                    number was saved but never actually subscribed
 *
 * Returns 200 in every case so the UI can render diagnostic detail
 * rather than a generic error toast. Each entry's combined `live`
 * flag is what the UI badges on.
 */

type ConfigRow = {
  id: string
  phone_number_id: string
  waba_id: string | null
  label: string | null
  access_token: string
  registered_at: string | null
  last_registration_error: string | null
  subscribed_apps_at: string | null
}

type Diagnostic = {
  config_id: string
  phone_number_id: string
  label: string | null
  live: boolean
  checks: {
    config_exists: boolean
    token_decryptable: boolean
    phone_metadata_ok: boolean
    waba_subscribed_to_app: boolean | null
    locally_marked_registered: boolean
  }
  errors: string[]
  last_registration_error: string | null
  registered_at: string | null
  subscribed_apps_at: string | null
}

async function verifyConfigRegistration(config: ConfigRow): Promise<Diagnostic> {
  const base = {
    config_id: config.id,
    phone_number_id: config.phone_number_id,
    label: config.label,
    last_registration_error: config.last_registration_error ?? null,
    registered_at: config.registered_at ?? null,
    subscribed_apps_at: config.subscribed_apps_at ?? null,
  }

  let accessToken: string
  try {
    accessToken = decrypt(config.access_token)
  } catch {
    return {
      ...base,
      live: false,
      checks: {
        config_exists: true,
        token_decryptable: false,
        phone_metadata_ok: false,
        waba_subscribed_to_app: null,
        locally_marked_registered: config.registered_at != null,
      },
      errors: [
        "Stored access token can't be decrypted — likely ENCRYPTION_KEY changed. Remove and re-add this number to repair.",
      ],
    }
  }

  const checks = {
    config_exists: true,
    token_decryptable: true,
    phone_metadata_ok: false,
    waba_subscribed_to_app: null as boolean | null,
    locally_marked_registered: config.registered_at != null,
  }
  const errors: string[] = []

  // 1. Phone metadata
  try {
    await verifyPhoneNumber({
      phoneNumberId: config.phone_number_id,
      accessToken,
    })
    checks.phone_metadata_ok = true
  } catch (err) {
    errors.push(
      `Phone metadata check failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  // 2. WABA subscription — only meaningful if we have a waba_id
  if (config.waba_id) {
    try {
      const subs = await getSubscribedApps({
        wabaId: config.waba_id,
        accessToken,
      })
      // Meta returns the apps subscribed to this WABA. If the list
      // is non-empty, OUR app is in there (the access_token we used
      // belongs to our app — Meta wouldn't return data for an app
      // the token can't see). Treat any entry as success.
      checks.waba_subscribed_to_app = subs.length > 0
      if (!checks.waba_subscribed_to_app) {
        errors.push(
          'WABA has no subscribed apps. Re-save the configuration to subscribe.',
        )
      }
    } catch (err) {
      errors.push(
        `WABA subscription check failed: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  } else {
    errors.push(
      "No WABA ID on file — webhooks can't be wired without it. Add it in the form and re-save.",
    )
  }

  const live =
    checks.phone_metadata_ok &&
    (checks.waba_subscribed_to_app ?? false) &&
    checks.locally_marked_registered

  return { ...base, live, checks, errors }
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Resolve the caller's account_id so a teammate who joined an
  // existing account sees the same registration state as the admin
  // who set the number(s) up.
  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .maybeSingle()
  const accountId = profile?.account_id as string | undefined
  if (!accountId) {
    return NextResponse.json({
      live: false,
      checks: { config_exists: false },
      message: 'Your profile is not linked to an account.',
    })
  }

  const configId = new URL(request.url).searchParams.get('id')

  const query = supabase
    .from('whatsapp_config')
    .select(
      'id, phone_number_id, waba_id, label, access_token, registered_at, last_registration_error, subscribed_apps_at',
    )
    .eq('account_id', accountId)

  if (configId) {
    const { data: config } = await query.eq('id', configId).maybeSingle()
    if (!config) {
      return NextResponse.json({
        live: false,
        checks: { config_exists: false },
        message: 'This WhatsApp number was not found on your account.',
      })
    }
    const result = await verifyConfigRegistration(config as ConfigRow)
    return NextResponse.json(result)
  }

  const { data: configs } = await query.order('created_at', { ascending: true })

  if (!configs || configs.length === 0) {
    return NextResponse.json({
      live: false,
      checks: { config_exists: false },
      message: 'No WhatsApp configuration saved yet.',
      results: [],
    })
  }

  const results = await Promise.all(
    configs.map((c) => verifyConfigRegistration(c as ConfigRow)),
  )

  return NextResponse.json({
    // Back-compat top-level summary for single-number accounts /
    // callers that haven't moved to `results` yet.
    live: results.every((r) => r.live),
    results,
  })
}
