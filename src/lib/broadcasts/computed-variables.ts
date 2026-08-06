// ============================================================
// Computed broadcast template variables — values that neither come
// from a fixed static string nor a straight contact-field lookup, but
// are derived at send time (current hour, contact-name quality, …).
//
// Shared by:
//   - `Step3Personalize` (live preview while building the broadcast)
//   - `resolveVariables` in `useBroadcastSending` (the actual send,
//     re-evaluated per batch so the greeting reflects the real
//     moment each message goes out, not when the broadcast was
//     created — a large broadcast can take minutes to fan out).
// ============================================================

/**
 * Registry of computed variable kinds. Add new entries here (and to
 * `COMPUTED_FIELDS` below for the picker UI) rather than open-coding
 * new `value` strings at call sites.
 */
export const COMPUTED_FIELDS = [
  {
    value: 'greeting_name',
    labelKey: 'greetingName',
  },
] as const;

export type ComputedFieldValue = (typeof COMPUTED_FIELDS)[number]['value'];

/**
 * wacrm's contacts are all Brazilian WhatsApp numbers — pin the
 * greeting to America/Sao_Paulo regardless of the server's own TZ
 * (the VPS may run UTC) so "Bom dia" doesn't ship at 3am BRT.
 */
export function greetingByHour(date: Date = new Date()): 'Bom dia' | 'Boa tarde' | 'Boa noite' {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'America/Sao_Paulo',
    }).format(date),
  );
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

/**
 * True when a contact's name is a placeholder rather than something a
 * real person typed/sent — e.g. "Cliente OP 204" (the auto-generated
 * name for contacts created without one, such as a CSV import row
 * missing the name column) or a bare phone number. Addressing someone
 * as "Sr(a) Cliente OP 204" reads as broken, so callers should omit
 * the name portion of a greeting when this returns true.
 */
export function isGenericContactName(name: string | null | undefined): boolean {
  if (!name) return true;
  const trimmed = name.trim();
  if (!trimmed) return true;
  if (/^cliente\s*op\s*\d+$/i.test(trimmed)) return true;
  // Defensive: a bare phone-number-looking name (no letters at all).
  if (/^\+?[0-9()\s-]{6,}$/.test(trimmed)) return true;
  return false;
}

/**
 * "Bom dia, Sr(a) Maria!" when the contact has a real name, or just
 * "Boa tarde!" when it's a generic placeholder — see
 * `isGenericContactName`.
 */
export function computeGreetingName(
  contactName: string | null | undefined,
  date: Date = new Date(),
): string {
  const greeting = greetingByHour(date);
  if (isGenericContactName(contactName)) return `${greeting}!`;
  return `${greeting}, Sr(a) ${contactName!.trim()}!`;
}

/** Dispatches on `ComputedFieldValue`. Unknown values resolve to ''
 *  (mirrors how unmapped static/field variables already degrade). */
export function resolveComputedVariable(
  value: string,
  contactName: string | null | undefined,
): string {
  if (value === 'greeting_name') return computeGreetingName(contactName);
  return '';
}
