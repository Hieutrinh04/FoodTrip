import { supabase, hasSupabase } from './supabaseClient.js'
import { parseTripRequestLocally } from './tripRequestLocal.js'
import { resolveDestination } from './knowledgeBase.js'
import { ruleIntent } from '../../supabase/functions/_shared/assistant/rules.js'
import { composeReply, faqReply } from '../../supabase/functions/_shared/assistant/reply.js'
import { contextualQuestion, conversationHistory } from '../../supabase/functions/_shared/assistant/conversation.js'

/**
 * Asks the FoodTrip assistant (Edge Function `assistant`): the message's intent,
 * the slots in it, FoodTrip's answer and, for a trip request, the action to
 * plan it. Without the backend it answers with the same rules in the browser.
 */
export async function askAssistant(message, lang = 'vi', messages = []) {
  const history = conversationHistory(messages)
  if (hasSupabase) {
    try {
      const { data, error } = await supabase.functions.invoke('assistant', { body: { message, lang, history }, signal: AbortSignal.timeout(18000) })
      if (!error && data?.intent && typeof data.reply?.text === 'string') return data
    } catch { /* answered locally below */ }
  }
  const question = contextualQuestion(message, history)
  const reading = ruleIntent(question)
  return { id: null, ...composeReply(question, reading, lang), confidence: reading.confidence, source: 'rules', slots: [], answeredBy: 'offline' }
}

/** The answer of a FAQ entry a person tapped ("Có thể bạn muốn hỏi"). */
export const faqAnswer = (id, lang = 'vi') => faqReply(id, lang)

/** 👍 / 👎 on an answer (best effort). */
export async function rateAnswer(id, helpful) {
  if (!hasSupabase || !id) return
  try { await supabase.functions.invoke('assistant', { body: { feedback: { id, helpful } } }) } catch { /* optional */ }
}

/**
 * The planner's fields from a trip request: the patterns of tripRequestLocal.js
 * on the whole message, and — for what they miss — the slots the trained model
 * found ("Pleiku" as the destination, "săn mây" as an interest), each read with
 * the same patterns. Never guesses a field neither found.
 */
export function planFields(message, slots = []) {
  const fields = parseTripRequestLocally(message)
  const of = (type) => slots.filter((s) => s.type === type).map((s) => s.text)
  const read = (text) => parseTripRequestLocally(text)
  if (!fields.cityId && !fields.destinationQuery && of('DEST').length) {
    const resolved = resolveDestination(of('DEST')[0])
    if (resolved?.type === 'curated') { fields.cityId = resolved.cityId; fields.destinationQuery = of('DEST')[0] }
    else fields.destinationQuery = of('DEST')[0]
  }
  if (!fields.duration && of('DURATION').length) fields.duration = read(of('DURATION')[0]).duration
  if (!fields.people && of('PEOPLE').length) fields.people = read(of('PEOPLE')[0]).people
  if (!fields.budgetPerPerson && of('BUDGET').length) fields.budgetPerPerson = read(`ngân sách ${of('BUDGET')[0]}`).budgetPerPerson
  if (!fields.transport && of('TRANSPORT').length) fields.transport = read(`đi ${of('TRANSPORT')[0]}`).transport
  const prefs = new Set(fields.prefs)
  for (const text of [...of('PREF'), ...of('FOOD')]) for (const tag of read(text).prefs) prefs.add(tag)
  fields.prefs = [...prefs]
  // What was said but has no planner field — shown to the person, not dropped silently.
  fields.mentioned = { dates: of('DATE'), foods: of('FOOD'), interests: of('PREF'), places: of('PLACE') }
  fields.empty = !(fields.cityId || fields.destinationQuery || fields.duration || fields.people || fields.budgetPerPerson || fields.transport || fields.prefs.length)
  return fields
}

/** The conversation as it is attached to a hand-off: who said what, newest last, kept short. */
export function transcriptOf(messages) {
  return messages.slice(-30).map((m) => ({
    from: m.from === 'user' ? 'user' : 'bot',
    text: String(m.from === 'user' ? m.text : m.reply?.text ?? '').slice(0, 500),
    ...(m.from === 'user' ? {} : { intent: m.intent ?? null }),
  })).filter((m) => m.text)
}

/**
 * Sends the person's question to FoodTrip's team, with the conversation: a
 * contact message (source 'assistant') the team answers by email.
 */
export async function handOff({ name, email, note, messages, page, userId = null }) {
  if (!hasSupabase) throw new Error('no-supabase')
  const { error } = await supabase.from('contact_messages').insert({
    name: name.trim().slice(0, 120), email: email.trim().slice(0, 200), message: note.trim().slice(0, 3000),
    source: 'assistant', user_id: userId, page: page?.slice(0, 200) ?? null, transcript: transcriptOf(messages),
  })
  if (error) throw error
}
