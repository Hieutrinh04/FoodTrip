// FoodTrip's reply to a reading of a message: the intent's answer, or — when a
// FAQ entry fits the question well enough — that entry's more specific answer,
// with closer questions offered to tap ("Có thể bạn muốn hỏi"). Shared by the
// Edge Function and the browser's offline fallback.

import { intentById } from './intents.js'
import { FAQ, faqById, faqRetrieve } from './faq.js'

// Word matching answers outright only when it is this sure (86% right on
// faq_test at ≥ 0.5); a trained retriever brings its own threshold.
export const WORDS_DIRECT = 0.5
export const RELATED_MIN = 0.2
// Intents answered by the planner or by computing, not from the FAQ.
const NOT_FAQ = new Set(['plan_trip', 'estimate_cost', 'ask_weather', 'place_info', 'find_food', 'greeting', 'thanks'])

const linksOf = (list, lang) => (list ?? []).map((l) => ({ to: l.to, label: l[lang] }))

/**
 * @param reading { intent, … } from the model or the rules
 * @param hits    [{ id, score }] best first — the trained retriever's, or null to match words here
 * @param threshold the retriever's own "answer outright" score (when `hits` came from it)
 */
export function composeReply(message, reading, lang = 'vi', { hits = null, threshold = WORDS_DIRECT } = {}) {
  const intent = intentById(reading.intent)
  const found = NOT_FAQ.has(intent.id) ? [] : (hits ?? faqRetrieve(message, { top: 3 })).filter((h) => faqById(h.id))
  const best = found[0]
  const direct = best && best.score >= threshold ? faqById(best.id) : null
  const related = found.filter((h) => h.id !== direct?.id && h.score >= RELATED_MIN).slice(0, 2)
    .map((h) => ({ id: h.id, question: faqById(h.id).q[0] }))

  if (intent.id === 'plan_trip') {
    return { intent: intent.id, label: intent.label, faq: null, related: [], action: { type: 'plan', request: message },
      reply: { text: lang === 'vi' ? 'Mình đã đọc yêu cầu của bạn. Kiểm tra thông tin bên dưới rồi mở trang Lịch trình để FoodTrip xếp lịch cho bạn.' : 'Got it. Check the details below, then open the planner and FoodTrip will build the itinerary.', links: [] } }
  }
  if (direct) {
    // A sure FAQ match also settles the intent ("bạn có phải chatgpt không" is not out of scope).
    const own = intentById(direct.intent)
    return { intent: own.id, label: own.label, faq: direct.id, related, action: null, reply: { text: direct.a[lang], links: linksOf(direct.links, lang) } }
  }
  return { intent: intent.id, label: intent.label, faq: null, related, action: null, reply: { text: intent.answer?.[lang] ?? '', links: linksOf(intent.links, lang) } }
}

/** A FAQ entry's own answer, when a person taps one of the related questions. */
export function faqReply(id, lang = 'vi') {
  const e = faqById(id)
  if (!e) return null
  const own = intentById(e.intent)
  return { intent: own.id, label: own.label, faq: e.id, related: [], action: null, reply: { text: e.a[lang], links: linksOf(e.links, lang) } }
}

export const FAQ_IDS = FAQ.map((e) => e.id)
