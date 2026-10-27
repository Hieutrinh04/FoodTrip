// The FoodTrip assistant: what a message asks for, and FoodTrip's answer.
//
// POST { message, lang? }            → { id, intent, confidence, source, slots, reply: { text, links }, faq, related, action, answeredBy }
// POST { feedback: { id, helpful } } → { ok }
//
// The message is read by the trained model (ml/assistant, on a Hugging Face
// Space at ASSISTANT_MODEL_URL) when it is configured, answers in time and is
// sure enough; otherwise by the rules (_shared/assistant/rules.js). The answer
// is FoodTrip's own text: the closest FAQ entry when the trained retriever (the
// Space's /answer) or word matching is sure enough (_shared/assistant/reply.js),
// else the intent's answer; a trip request is handed to the planner.
// Messages are kept anonymously (no user, phone numbers and emails removed) to
// label the next training round.

import { jsonResponse, handleOptions } from '../_shared/cors.ts'
import { INTENT_IDS, SLOTS } from '../_shared/assistant/intents.js'
import { ruleIntent } from '../_shared/assistant/rules.js'
import { composeReply, FAQ_IDS } from '../_shared/assistant/reply.js'

const MODEL_TIMEOUT_MS = 6000
// Below this the model's guess is not trusted over the rules'.
const MIN_MODEL_CONFIDENCE = 0.6

type Slot = { type: string; text: string }
type Reading = { intent: string; confidence: number; source: 'model' | 'rules'; slots: Slot[] }

function db() {
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  return url && key ? { url: `${url}/rest/v1/assistant_messages`, headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' } } : null
}

/** The trained model's reading, or null (not configured, asleep, slow, failing or unsure). */
async function modelReading(message: string): Promise<Reading | null> {
  const url = Deno.env.get('ASSISTANT_MODEL_URL'), token = Deno.env.get('ASSISTANT_MODEL_TOKEN')
  if (!url || !token) return null
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/predict`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ text: message }), signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const out = await res.json()
    if (!INTENT_IDS.includes(out?.intent) || typeof out.confidence !== 'number' || out.confidence < MIN_MODEL_CONFIDENCE) return null
    const slots = (Array.isArray(out.slots) ? out.slots : [])
      .filter((s: Slot) => SLOTS.includes(s?.type) && typeof s.text === 'string' && s.text.length <= 120)
      .map((s: Slot) => ({ type: s.type, text: s.text }))
    return { intent: out.intent, confidence: out.confidence, source: 'model', slots }
  } catch {
    return null
  }
}

/** What is stored: no phone numbers or email addresses. */
const redact = (text: string) => text.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]').replace(/(?:\+?84|0)(?:[\s.-]?\d){8,10}/g, '[phone]')

async function remember(message: string, lang: string, reading: Reading) {
  const api = db()
  if (!api) return null
  try {
    const res = await fetch(api.url, {
      method: 'POST', headers: { ...api.headers, prefer: 'return=representation' }, signal: AbortSignal.timeout(3000),
      body: JSON.stringify({ text: redact(message).slice(0, 600), lang, intent: reading.intent, confidence: Math.round(reading.confidence * 1000) / 1000, source: reading.source, slots: reading.slots }),
    })
    return res.ok ? (await res.json())?.[0]?.id ?? null : null
  } catch {
    return null
  }
}

Deno.serve(async (request) => {
  const preflight = handleOptions(request)
  if (preflight) return preflight
  if (request.method !== 'POST') return jsonResponse({ error: 'method-not-allowed' }, { status: 405 })
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return jsonResponse({ error: 'invalid-json' }, { status: 400 }) }

  // 👍 / 👎 on an answer: the label the next training round starts from.
  const feedback = body.feedback as { id?: unknown; helpful?: unknown } | undefined
  if (feedback) {
    const api = db()
    if (!api || typeof feedback.id !== 'string' || !/^[0-9a-f-]{36}$/.test(feedback.id) || typeof feedback.helpful !== 'boolean') return jsonResponse({ error: 'invalid-feedback' }, { status: 400 })
    await fetch(`${api.url}?id=eq.${feedback.id}`, { method: 'PATCH', headers: { ...api.headers, prefer: 'return=minimal' }, body: JSON.stringify({ helpful: feedback.helpful }), signal: AbortSignal.timeout(3000) }).catch(() => null)
    return jsonResponse({ ok: true })
  }

  const message = typeof body.message === 'string' ? body.message.replace(/\s+/g, ' ').trim() : ''
  if (!message || message.length > 600) return jsonResponse({ error: 'invalid-message' }, { status: 400 })
  const lang = body.lang === 'en' ? 'en' : 'vi'

  const [modelRead, retrieved] = await Promise.all([modelReading(message), retrieverHits(message)])
  const reading: Reading = modelRead ?? { ...ruleIntent(message), slots: [] } as Reading
  const composed = composeReply(message, reading, lang, retrieved ? { hits: retrieved.hits, threshold: retrieved.threshold } : {})
  // What is stored is what was answered: a sure FAQ match may settle the intent.
  const id = await remember(message, lang, { ...reading, intent: composed.intent })
  return jsonResponse({
    id, ...composed, confidence: reading.confidence, source: reading.source, slots: reading.slots,
    answeredBy: composed.faq ? (retrieved ? 'retriever' : 'words') : 'intent',
  })
})

/**
 * The trained retriever's closest FAQ entries (`/answer` on the same Space), with
 * the score it answers outright at (chosen on its held-out test), or null.
 */
async function retrieverHits(message: string): Promise<{ hits: { id: string; score: number }[]; threshold: number } | null> {
  const url = Deno.env.get('ASSISTANT_MODEL_URL'), token = Deno.env.get('ASSISTANT_MODEL_TOKEN')
  if (!url || !token) return null
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/answer`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ text: message }), signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const out = await res.json()
    const hits = (Array.isArray(out?.hits) ? out.hits : []).filter((h: { id?: unknown; score?: unknown }) => FAQ_IDS.includes(h?.id as string) && typeof h.score === 'number')
    return hits.length && typeof out.threshold === 'number' ? { hits, threshold: out.threshold } : null
  } catch {
    return null
  }
}
