// ============================================================
// Telegram push notifications
//
// Optional, best-effort alerting so an agent knows a WhatsApp message
// arrived even when nobody has the wacrm tab open. Bring-your-own-bot:
// the operator creates a bot via @BotFather, sets TELEGRAM_BOT_TOKEN,
// and each teammate links their own chat by pasting their chat id into
// Settings → Your profile (see profile-form.tsx).
//
// Every function here swallows its own errors. A Telegram outage, a
// missing token, or an agent who never linked their chat must never
// block webhook processing — this is a nice-to-have, not part of the
// message pipeline's correctness.
// ============================================================

const TELEGRAM_API_BASE = 'https://api.telegram.org'

/**
 * Escapes the handful of characters Telegram's HTML parse_mode treats
 * as markup. Deliberately narrow — HTML mode only reserves &, <, > —
 * unlike MarkdownV2's much larger escape set, which would mangle
 * ordinary customer message text (parentheses, dashes, dots, etc.).
 */
export function escapeTelegramHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * POST a message to a Telegram chat via the Bot API. No-ops silently
 * when TELEGRAM_BOT_TOKEN isn't configured or chatId is empty, so
 * callers don't need to gate on env-var presence themselves.
 */
export async function sendTelegramMessage(
  chatId: string,
  text: string,
  opts?: { buttonText?: string; buttonUrl?: string }
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token || !chatId) return

  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...(opts?.buttonUrl
          ? {
              reply_markup: {
                inline_keyboard: [
                  [{ text: opts.buttonText ?? 'Abrir', url: opts.buttonUrl }],
                ],
              },
            }
          : {}),
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[telegram] sendMessage failed:', res.status, body)
    }
  } catch (err) {
    console.error('[telegram] sendMessage request error:', err)
  }
}

/**
 * Builds the "new WhatsApp message" alert text. Kept separate from
 * the send call so the webhook route (and tests) can construct the
 * message without a network dependency.
 */
export function buildNewMessageAlertText(
  contactName: string,
  preview: string
): string {
  // Telegram messages cap at 4096 chars; a WhatsApp text body can't
  // exceed that anyway, but truncate defensively so a pathological
  // caption/location string can't blow the request.
  const trimmedPreview =
    preview.length > 500 ? `${preview.slice(0, 500)}…` : preview
  return `💬 <b>Nova mensagem</b> de ${escapeTelegramHtml(contactName)}\n\n${escapeTelegramHtml(trimmedPreview)}`
}
