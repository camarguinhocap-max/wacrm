import type { ProviderResult } from '../types'
import { generateOpenAiCompatible, type ProviderArgs } from './shared'

// Groq's Chat Completions API is OpenAI-compatible (same request and
// response shape) — only the base URL and key differ. See
// https://console.groq.com/docs/openai
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

/**
 * Call Groq's Chat Completions endpoint with the caller's own key.
 * Returns the raw assistant text + token usage (handoff parsing happens
 * in `generateReply`).
 */
export async function generateGroq(args: ProviderArgs): Promise<ProviderResult> {
  return generateOpenAiCompatible(args, { url: GROQ_URL, label: 'Groq' })
}
