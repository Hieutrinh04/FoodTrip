import { getCity, TAGS } from '../data/destinations.js'
import { normalizeVi } from './text.js'
import { answersPending, changesTrip, tripInContext } from './assistantAnswers.js'
import { ruleIntent } from '../../supabase/functions/_shared/assistant/rules.js'
import { composeReply } from '../../supabase/functions/_shared/assistant/reply.js'
import { intentById } from '../../supabase/functions/_shared/assistant/intents.js'

/** Resolve the turn before any planner state changes. Explicit questions beat old context. */
export function resolveChatTurn(message, reading, { trip = null, pending = null, lang = 'vi' } = {}) {
  let answer = reading
  // The browser may be talking to an older deployed classifier. A clear food
  // question must still reach search, rather than a stale plan/FAQ response.
  const local = ruleIntent(message)
  if (local.intent === 'find_food') answer = { ...reading, ...composeReply(message, local, lang), slots: reading.slots ?? [] }
  const follow = answersPending(pending, message, answer)
  if (follow) {
    const own = intentById(pending.intent)
    answer = { ...answer, intent: own.id, label: own.label, faq: null, related: [] }
  }
  const plannerFallback = ['modify_plan', 'out_of_scope'].includes(answer.intent)
  const updatePlan = answer.intent === 'plan_trip'
    || Boolean(plannerFallback && (startsNewTrip(message) || (!follow && trip && changesTrip(message, answer.slots))))
  return { answer, follow, updatePlan }
}

/** A new trip is explicit; a short correction keeps the other previously supplied fields. */
export function startsNewTrip(message) {
  return /\b(chuyen (di )?moi|lich trinh moi|bat dau lai|new trip|start over)\b/.test(normalizeVi(message))
}

export function planTurn(message, slots, before, pending, lang = 'vi') {
  let text = message
  const simple = normalizeVi(message).trim()
  if (pending?.intent === 'plan_trip' && /^\d{1,2}$/.test(simple)) {
    if (pending.need === 'duration') text = `${simple} ngày`
    if (pending.need === 'people') text = `${simple} người`
  }
  const trip = tripInContext(text, slots, before)
  // Match the planner's supported duration and reject accidental zero/huge inputs.
  if (trip.duration != null && (!Number.isInteger(trip.duration) || trip.duration < 1 || trip.duration > 14)) trip.duration = before?.duration ?? null
  if (trip.people != null && (!Number.isInteger(trip.people) || trip.people < 1 || trip.people > 50)) trip.people = before?.people ?? null
  const vi = lang === 'vi'
  const where = trip.cityId ? getCity(trip.cityId)?.name[lang] : trip.destinationQuery
  const details = [where, trip.duration && `${trip.duration} ${vi ? 'ngày' : 'days'}`, trip.people && `${trip.people} ${vi ? 'người' : 'people'}`].filter(Boolean)
  const prefs = trip.prefs.map((p) => TAGS[p]?.[lang]).filter(Boolean)
  const summary = details.length ? (vi ? `Mình đang lên chuyến ${details.join(', ')} cho bạn.` : `Let's plan ${details.join(', ')}.`) : ''
  const need = !where ? 'dest' : !trip.duration ? 'duration' : !trip.people ? 'people' : null
  const question = {
    dest: vi ? 'Bạn muốn đi đâu?' : 'Where would you like to go?',
    duration: vi ? `Bạn định ở ${where} mấy ngày?` : `How many days will you spend in ${where}?`,
    people: vi ? 'Chuyến này có mấy người đi cùng bạn?' : 'How many people are going?',
  }[need]
  const next = need ? question : vi
    ? 'Bạn có thể mở Lịch trình bên dưới để xếp các điểm dừng. Muốn mình ước tính chi phí hay tìm quán trước cũng được.'
    : 'Open the planner below to arrange your stops. I can also estimate costs or find food first.'
  const interest = prefs.length ? (vi ? `Mình ghi nhận bạn thích ${prefs.join(', ')}.` : `I'll keep your interests in mind: ${prefs.join(', ')}.`) : ''
  return { trip, need, reply: { text: [summary, interest, next].filter(Boolean).join('\n\n'), links: [] } }
}
