import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChatCircleDots, X, PaperPlaneRight, ThumbsUp, ThumbsDown, MapTrifold, SpinnerGap, Info, ArrowCounterClockwise, Headset, Star } from '@phosphor-icons/react'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import { useAuth } from '../../auth/AuthContext.jsx'
import { useGuestBarVisible } from '../auth/GuestLoginBar.jsx'
import AuthModal from '../auth/AuthModal.jsx'
import { askAssistant, faqAnswer, handOff, rateAnswer } from '../../lib/assistant.js'
import { askedPlace, estimateCost, findFoodAnswer, placeInfoAnswer, requestFromTrip, tripInContext, weatherAnswer } from '../../lib/assistantAnswers.js'
import { ACCOUNT_INTENTS, accountAnswer } from '../../lib/assistantAccount.js'
import { suggestionsFor } from '../../lib/assistantSuggestions.js'
import { planTurn, resolveChatTurn, startsNewTrip } from '../../lib/assistantConversation.js'
import { repairReply } from '../../../supabase/functions/_shared/assistant/conversation.js'
import { normalise as toMapPlace } from '../../lib/mapAreaSearch.js'
import PlaceDetailsDrawer from '../map/PlaceDetailsDrawer.jsx'
import { getCity, TAGS, TRANSPORT } from '../../data/destinations.js'

const C = {
  vi: {
    open: 'Trợ lý FoodTrip', title: 'Trợ lý FoodTrip', close: 'Đóng trợ lý', restart: 'Cuộc trò chuyện mới',
    subtitle: 'Lên lịch và giải đáp về FoodTrip. Có thể hiểu sai — hãy kiểm tra trước khi dùng.',
    hello: 'Chào bạn! Bạn đang tính đi đâu, hay cần tìm một quán ăn ngon? Kể mình nghe ý định của bạn nhé.',
    placeholder: 'Nhập câu hỏi hoặc yêu cầu lên lịch…', send: 'Gửi', thinking: 'Đang đọc câu của bạn…',
    privacy: 'Tin nhắn được lưu ẩn danh (bỏ số điện thoại, email) để cải thiện trợ lý.',
    helpful: 'Câu trả lời hữu ích', notHelpful: 'Câu trả lời chưa đúng', thanks: 'Cảm ơn góp ý của bạn!',
    planTitle: 'Thông tin mình đọc được', openPlanner: 'Mở trang Lịch trình', nothingRead: 'Mình chưa đọc được điểm đến hay số ngày — trang Lịch trình sẽ hỏi thêm.',
    dest: 'Điểm đến', days: 'Số ngày', people: 'Số người', budget: 'Ngân sách/người', transport: 'Phương tiện', prefs: 'Sở thích', dates: 'Thời gian', foods: 'Món muốn ăn',
    daysN: (n) => `${n} ngày`, peopleN: (n) => `${n} người`, model: 'mô hình FoodTrip', rules: 'quy tắc',
    updated: 'Cập nhật chuyến đi', placeDetails: 'Xem chi tiết quán', details: 'Chi tiết', related: 'Có thể bạn muốn hỏi:', faqSource: 'hỏi–đáp',
    yours: 'Đơn của bạn', signIn: 'Đăng nhập để mình xem trực tiếp đơn của bạn.', signInCta: 'Đăng nhập',
    human: 'Gặp nhân viên hỗ trợ', humanOffer: 'Chưa đúng ý bạn? Gửi câu hỏi cho nhân viên FoodTrip.',
    handTitle: 'Gửi cho nhân viên FoodTrip', handHint: 'Cuộc trò chuyện này được gửi kèm để nhân viên hiểu bạn cần gì. FoodTrip trả lời qua email.',
    name: 'Tên của bạn', email: 'Email nhận trả lời', note: 'Bạn cần giúp gì?', cancel: 'Thôi', submit: 'Gửi cho nhân viên', sending: 'Đang gửi…',
    tooShort: 'Viết rõ hơn một chút (ít nhất 10 ký tự).', badEmail: 'Email chưa đúng.', sendError: 'Chưa gửi được. Thử lại, hoặc dùng trang Liên hệ.',
    sent: (email) => `Đã gửi cho đội FoodTrip. Nhân viên sẽ trả lời qua ${email}.`, sentLabel: 'Đã chuyển nhân viên', contactPage: 'Trang Liên hệ',
    chatError: 'Mình chưa trả lời được tin nhắn này. Bạn thử gửi lại nhé.', retry: 'Thử lại',
  },
  en: {
    open: 'FoodTrip assistant', title: 'FoodTrip assistant', close: 'Close the assistant', restart: 'New conversation',
    subtitle: 'Plans trips and answers questions about FoodTrip. It can misread — check before relying on it.',
    hello: 'Hi! Where are you thinking of going, or what would you like to eat? Tell me what you have in mind.',
    placeholder: 'Ask a question or describe a trip…', send: 'Send', thinking: 'Reading your message…',
    privacy: 'Messages are kept anonymously (phone numbers and emails removed) to improve the assistant.',
    helpful: 'Helpful answer', notHelpful: 'Wrong answer', thanks: 'Thanks for the feedback!',
    planTitle: 'What I read', openPlanner: 'Open the planner', nothingRead: 'I could not read a destination or length — the planner will ask.',
    dest: 'Destination', days: 'Days', people: 'People', budget: 'Budget/person', transport: 'Transport', prefs: 'Interests', dates: 'When', foods: 'Dishes',
    daysN: (n) => `${n} day${n > 1 ? 's' : ''}`, peopleN: (n) => `${n} ${n > 1 ? 'people' : 'person'}`, model: 'FoodTrip model', rules: 'rules',
    updated: 'Trip updated', placeDetails: 'Place details', details: 'Details', related: 'You may want to ask:', faqSource: 'FAQ',
    yours: 'Your bookings', signIn: 'Sign in and I can look at your own bookings.', signInCta: 'Sign in',
    human: 'Talk to a person', humanOffer: 'Not what you needed? Send your question to FoodTrip’s team.',
    handTitle: 'Send to FoodTrip’s team', handHint: 'This conversation is attached so the team knows what you need. FoodTrip replies by email.',
    name: 'Your name', email: 'Email for the reply', note: 'What do you need help with?', cancel: 'Cancel', submit: 'Send to the team', sending: 'Sending…',
    tooShort: 'Say a little more (at least 10 characters).', badEmail: 'That email does not look right.', sendError: 'Could not send. Try again, or use the Contact page.',
    sent: (email) => `Sent to FoodTrip’s team. They will reply to ${email}.`, sentLabel: 'Sent to the team', contactPage: 'Contact page',
    chatError: 'I could not answer this message. Please try again.', retry: 'Try again',
  },
}

const STORE = 'foodtrip:assistant:v1'
const KEEP = 40
const vnd = (n) => `${Math.round(n).toLocaleString('vi-VN')}đ`

/** The conversation kept for this tab, so a reload or another page does not lose it. */
function restore() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE) ?? 'null')
    return saved && Array.isArray(saved.messages) ? saved : null
  } catch { return null }
}

/** The planner fields read from a trip request, and the button that plans it. */
function PlanCard({ trip, lang, c, onPlan }) {
  const f = trip
  const rows = [
    [c.dest, f.cityId ? getCity(f.cityId)?.name[lang] : f.destinationQuery],
    [c.days, f.duration && c.daysN(f.duration)],
    [c.dates, f.mentioned.dates.join(', ')],
    [c.people, f.people && c.peopleN(f.people)],
    [c.budget, f.budgetPerPerson && vnd(f.budgetPerPerson)],
    [c.transport, f.transport && TRANSPORT[f.transport]?.[lang]],
    [c.prefs, f.prefs.map((t) => TAGS[t]?.[lang] ?? t).join(', ')],
    [c.foods, f.mentioned.foods.join(', ')],
  ].filter(([, v]) => v)
  return <div className="mt-2 rounded-xl border border-line bg-paper p-3 text-sm">
    <div className="eyebrow text-ink-faint">{c.planTitle}</div>
    {rows.length ? <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">{rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-ink-faint">{k}</dt><dd className="font-semibold text-ink">{v}</dd></div>)}</dl>
      : <p className="mt-1 text-ink-muted">{c.nothingRead}</p>}
    <button type="button" onClick={() => onPlan(f)} className="mt-3 inline-flex items-center gap-2 rounded-full bg-chili px-4 py-2 font-utility text-xs font-semibold text-chili-ink"><MapTrifold size={14} />{c.openPlanner}</button>
  </div>
}

/** The person's own bookings, as the assistant read them. */
function AccountCard({ account, c, onLeave }) {
  return <div className="mt-2 rounded-xl border border-line bg-paper p-3 text-sm">
    <div className="eyebrow text-ink-faint">{c.yours}</div>
    <ul className="mt-2 space-y-1.5">{account.lines.map((l) => <li key={l} className="leading-snug">{l}</li>)}</ul>
    {account.more && <p className="mt-1 text-xs text-ink-faint">{account.more}</p>}
    <div className="mt-2 flex flex-wrap gap-2">{account.links.map((l) => <Link key={l.to} to={l.to} onClick={onLeave} className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold text-chili hover:border-chili">{l.label} →</Link>)}</div>
  </div>
}

/** Places found for a dish, each opening its details. */
function PlaceList({ places, c, onOpen }) {
  return <ul className="mt-2 space-y-1.5">{places.map((p) => <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-paper px-2.5 py-1.5">
    <div className="min-w-0"><div className="truncate text-xs font-semibold">{p.name.vi}</div>
      <div className="flex items-center gap-1 text-2xs text-ink-faint"><Star size={11} weight="fill" className="text-lantern" />{p.googleRating} · {(p.googleRatingCount ?? 0).toLocaleString('vi-VN')}{p.address.vi ? ` · ${p.address.vi}` : ''}</div></div>
    <button type="button" onClick={() => onOpen(p)} className="shrink-0 rounded-full border border-line-strong px-2.5 py-1 text-2xs font-semibold hover:border-chili"><Info size={12} className="mr-1 inline" />{c.details}</button>
  </li>)}</ul>
}

/** The question, with the conversation, sent to a person at FoodTrip. */
function HandOffForm({ c, user, messages, page, onSent, onCancel }) {
  const lastAsked = [...messages].reverse().find((m) => m.from === 'user')?.text ?? ''
  const [form, setForm] = useState({ name: user?.user_metadata?.full_name ?? '', email: user?.email ?? '', note: lastAsked })
  const [state, setState] = useState({ busy: false, error: null })
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  async function submit(e) {
    e.preventDefault()
    if (form.note.trim().length < 10) return setState({ busy: false, error: c.tooShort })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setState({ busy: false, error: c.badEmail })
    setState({ busy: true, error: null })
    try {
      await handOff({ name: form.name.trim() || form.email.split('@')[0], email: form.email, note: form.note, messages, page, userId: user?.id ?? null })
      onSent(form.email.trim())
    } catch {
      setState({ busy: false, error: c.sendError })
    }
  }
  const field = 'w-full rounded-lg border border-line-strong bg-paper px-3 py-2 text-sm outline-none focus:border-chili'
  return <form onSubmit={submit} className="rounded-xl border border-chili/40 bg-surface p-3 text-sm">
    <div className="flex items-center gap-2 font-semibold"><Headset size={16} className="text-chili" />{c.handTitle}</div>
    <p className="mt-1 text-xs text-ink-muted">{c.handHint}</p>
    <div className="mt-2 grid gap-2">
      <input value={form.name} onChange={set('name')} maxLength={120} placeholder={c.name} aria-label={c.name} className={field} />
      <input value={form.email} onChange={set('email')} maxLength={200} type="email" required placeholder={c.email} aria-label={c.email} className={field} />
      <textarea value={form.note} onChange={set('note')} maxLength={3000} rows={3} required placeholder={c.note} aria-label={c.note} className={field} />
    </div>
    {state.error && <p role="alert" className="mt-2 text-xs text-chili">{state.error} {state.error === c.sendError && <Link to="/contact" className="underline">{c.contactPage}</Link>}</p>}
    <div className="mt-2 flex justify-end gap-2">
      <button type="button" onClick={onCancel} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold">{c.cancel}</button>
      <button type="submit" disabled={state.busy} className="rounded-full bg-chili px-3 py-1.5 text-xs font-semibold text-chili-ink disabled:opacity-60">{state.busy ? c.sending : c.submit}</button>
    </div>
  </form>
}

/** The floating assistant: a button on every page, and the conversation panel it opens. */
export default function AssistantChat() {
  const { lang } = useLanguage()
  const c = C[lang]
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user } = useAuth()
  const guestBar = useGuestBarVisible()
  const [saved] = useState(restore)
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState(saved?.messages ?? [])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  // The trip being talked about (planner fields): follow-ups like "chi phí bao nhiêu"
  // or "3 người thì sao" are about it.
  const [trip, setTrip] = useState(saved?.trip ?? null)
  // The question the assistant asked back ("Bạn đi đâu?"): the next message may answer it.
  const [pending, setPending] = useState(saved?.pending ?? null)
  const [handing, setHanding] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [detail, setDetail] = useState(null)
  const closeDetail = useCallback(() => setDetail(null), [])
  const listRef = useRef(null)
  const inputRef = useRef(null)
  const sendingRef = useRef(false)

  useEffect(() => { if (open) inputRef.current?.focus() }, [open])
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, busy, handing])
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  useEffect(() => {
    try { sessionStorage.setItem(STORE, JSON.stringify({ messages: messages.slice(-KEEP), trip, pending })) } catch { /* private mode: the chat still works */ }
  }, [messages, trip, pending])

  async function send(text, retry = false) {
    const message = text.replace(/\s+/g, ' ').trim().slice(0, 600)
    if (!message || sendingRef.current) return
    sendingRef.current = true
    setDraft('')
    setHanding(false)
    if (retry) setMessages((prev) => prev.filter((m) => !m.error))
    else setMessages((prev) => [...prev, { from: 'user', text: message }])
    setBusy(true)
    try {
      const repair = repairReply(message, lang)
      const answer = repair ? null : await askAssistant(message, lang, retry ? messages.slice(0, -2) : messages)
      const reply = repair ? { intent: 'clarify', reply: repair } : await respond(message, answer)
      setMessages((prev) => {
        // Twice in a row out of scope: offer a person instead of a third guess.
        const lastBot = [...prev].reverse().find((m) => m.from === 'bot')
        const stuck = reply.intent === 'out_of_scope' && lastBot?.intent === 'out_of_scope'
        return [...prev, { from: 'bot', ...reply, offerHuman: reply.offerHuman || stuck }]
      })
    } catch {
      setMessages((prev) => [...prev, { from: 'bot', error: true, retryText: message, reply: { text: c.chatError, links: [] } }])
    } finally {
      sendingRef.current = false
      setBusy(false)
    }
  }

  /** FoodTrip's reply to one reading: the written answer, or one computed for the trip being talked about. */
  async function respond(message, reading) {
    const vi = lang === 'vi'
    const { answer, follow, updatePlan: shouldPlan } = resolveChatTurn(message, reading, { trip, pending, lang })
    setPending(null)
    const { intent, slots } = answer
    const current = tripInContext(message, slots, follow ? pending.trip ?? trip : trip)
    const updatePlan = () => {
      const turn = planTurn(message, slots, startsNewTrip(message) ? null : trip, follow ? pending : null, lang)
      setTrip(turn.trip)
      if (turn.need) setPending({ intent: 'plan_trip', need: turn.need, trip: turn.trip })
      return { ...answer, intent: 'plan_trip', faq: null, related: [], reply: turn.reply, plan: turn.trip }
    }
    if (shouldPlan) return updatePlan()
    const ask = (reply, extra = {}) => {
      if (reply.need) setPending({ intent, need: reply.need, message: extra.message ?? message, slots: extra.slots ?? slots, trip: current })
      else if (current.cityId || current.destinationQuery) setTrip(current)
      return { ...answer, reply, ...extra.out }
    }
    try {
      if (intent === 'estimate_cost') return ask(await estimateCost(current, lang))
      if (intent === 'ask_weather') return ask(await weatherAnswer(current, lang))
      if (intent === 'place_info') {
        const name = follow ? message.replace(/[?!.]+$/g, '').trim() : askedPlace(message, slots)
        const found = await placeInfoAnswer(name, current, lang)
        return ask(found, { out: { place: found.place ?? null } })
      }
      if (intent === 'find_food' && !answer.faq) {
        const source = follow ? pending : { message, slots }
        const found = await findFoodAnswer(source.message, source.slots, current, lang)
        return ask(found, { message: source.message, slots: source.slots, out: { places: found.places ?? null } })
      }
    } catch {
      return { ...answer, reply: { text: vi ? 'Mình chưa lấy được dữ liệu lúc này, thử lại sau nhé.' : 'I could not get the data right now — try again later.', links: [] } }
    }
    if (ACCOUNT_INTENTS.has(intent)) {
      if (!user) return intent === 'tour_info' ? answer : { ...answer, signIn: true }
      const account = await accountAnswer(intent, user.id, lang).catch(() => null)
      return account ? { ...answer, account } : answer
    }
    if (intent === 'contact_support') return { ...answer, offerHuman: true }
    return answer
  }

  /** A related question tapped: its own answer, straight from the FAQ. */
  function openFaq({ id, question }) {
    if (sendingRef.current) return
    const answer = faqAnswer(id, lang)
    if (!answer) return
    setPending(null)
    setMessages((prev) => [...prev, { from: 'user', text: question }, { from: 'bot', ...answer, source: 'faq' }])
  }

  function rate(index, helpful) {
    const m = messages[index]
    if (!m?.id || m.rated != null) return
    rateAnswer(m.id, helpful)
    setMessages((prev) => prev.map((x, i) => (i === index ? { ...x, rated: helpful, offerHuman: x.offerHuman || !helpful } : x)))
  }

  function handedOff(email) {
    setHanding(false)
    setMessages((prev) => [...prev, { from: 'bot', label: c.sentLabel, source: 'faq', handedOff: true, reply: { text: c.sent(email), links: [] } }])
  }

  function restart() {
    if (sendingRef.current) return
    setMessages([]); setTrip(null); setPending(null); setHanding(false)
  }

  function plan(fields) {
    setOpen(false)
    navigate('/plan', { state: { assistantRequest: { text: requestFromTrip(fields, lang), at: Date.now() } } })
  }

  const handedOffAlready = messages.some((m) => m.handedOff)
  const bottom = guestBar ? 'bottom-40 md:bottom-28' : 'bottom-5'
  return <div className="no-print">
    {!open && <button type="button" onClick={() => setOpen(true)} aria-label={c.open}
      className={`fixed right-4 ${bottom} z-[60] inline-flex items-center gap-2 rounded-full bg-chili px-4 py-3 font-utility text-sm font-semibold text-chili-ink shadow-lifted transition-transform hover:-translate-y-0.5`}>
      <ChatCircleDots size={20} weight="fill" /><span className="hidden sm:inline">{c.open}</span>
    </button>}
    {open && <section role="dialog" aria-label={c.title}
      className={`fixed right-2 sm:right-4 ${bottom} z-[60] flex h-[min(620px,78dvh)] w-[min(400px,calc(100vw-1rem))] flex-col overflow-hidden rounded-2xl border border-line bg-paper shadow-lifted`}>
      <header className="flex items-start justify-between gap-3 border-b border-line bg-surface px-4 py-3">
        <div><h2 className="font-bold">{c.title}</h2><p className="mt-0.5 text-xs text-ink-faint">{c.subtitle}</p></div>
        <div className="flex shrink-0 gap-1.5">
          {messages.length > 0 && <button type="button" onClick={restart} disabled={busy} aria-label={c.restart} title={c.restart} className="rounded-full border border-line p-1.5 text-ink-muted hover:border-chili hover:text-chili disabled:opacity-40"><ArrowCounterClockwise size={14} /></button>}
          <button type="button" onClick={() => setOpen(false)} aria-label={c.close} className="rounded-full border border-line p-1.5 text-ink-muted hover:border-chili hover:text-chili"><X size={14} /></button>
        </div>
      </header>
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
        <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-surface px-3 py-2 text-sm">{c.hello}</div>
        {!messages.length && <div className="flex flex-wrap gap-2">{suggestionsFor(pathname, lang).map((s) => <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-line-strong px-3 py-1.5 text-left text-xs font-semibold hover:border-chili">{s}</button>)}</div>}
        {messages.map((m, i) => m.from === 'user'
          ? <div key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-chili px-3 py-2 text-sm text-chili-ink">{m.text}</div>
          : <div key={i} className="max-w-[95%]">
            <div className="rounded-2xl rounded-tl-sm bg-surface px-3 py-2 text-sm">
              <p className="whitespace-pre-line">{m.reply?.text}</p>
              {m.error && i === messages.length - 1 && <button type="button" disabled={busy} onClick={() => send(m.retryText, true)} className="mt-2 rounded-full border border-line-strong px-3 py-1 text-xs font-semibold text-chili disabled:opacity-40">{c.retry}</button>}
              {m.reply?.links?.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{m.reply.links.map((l) => l.href
                ? <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold text-chili hover:border-chili">{l.label} ↗</a>
                : <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold text-chili hover:border-chili">{l.label} →</Link>)}</div>}
              {m.account && <AccountCard account={m.account} c={c} onLeave={() => setOpen(false)} />}
              {m.signIn && !user && <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-paper p-2.5 text-xs">
                <span className="text-ink-muted">{c.signIn}</span>
                <button type="button" onClick={() => setAuthOpen(true)} className="rounded-full bg-chili px-3 py-1 font-semibold text-chili-ink">{c.signInCta}</button>
              </div>}
              {m.plan && <PlanCard trip={m.plan} lang={lang} c={c} onPlan={plan} />}
              {m.places?.length > 0 && <PlaceList places={m.places} c={c} onOpen={setDetail} />}
              {m.related?.length > 0 && <div className="mt-2 border-t border-line pt-2">
                <div className="text-2xs text-ink-faint">{c.related}</div>
                <div className="mt-1 flex flex-col items-start gap-1">{m.related.map((r) => <button key={r.id} type="button" disabled={busy} onClick={() => openFaq(r)} className="text-left text-xs font-semibold text-chili hover:underline disabled:opacity-40">{r.question} →</button>)}</div>
              </div>}
              {m.place?.location && <button type="button" onClick={() => setDetail(toMapPlace(m.place))} className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:border-chili"><Info size={13} />{c.placeDetails}</button>}
              {m.offerHuman && !handedOffAlready && !handing && i === messages.length - 1 && <div className="mt-2 border-t border-line pt-2 text-xs">
                <span className="text-ink-muted">{c.humanOffer}</span>{' '}
                <button type="button" onClick={() => setHanding(true)} className="font-semibold text-chili hover:underline">{c.human} →</button>
              </div>}
            </div>
            <div className="mt-1 flex items-center gap-2 pl-1 text-2xs text-ink-faint">
              <span>FoodTrip</span>
              {m.id && (m.rated == null
                ? <><button type="button" onClick={() => rate(i, true)} aria-label={c.helpful} className="hover:text-herb"><ThumbsUp size={13} /></button><button type="button" onClick={() => rate(i, false)} aria-label={c.notHelpful} className="hover:text-chili"><ThumbsDown size={13} /></button></>
                : <span>{c.thanks}</span>)}
            </div>
          </div>)}
        {busy && <div className="flex items-center gap-2 text-sm text-ink-muted"><SpinnerGap size={14} className="animate-spin" />{c.thinking}</div>}
        {handing && <HandOffForm c={c} user={user} messages={messages} page={pathname} onSent={handedOff} onCancel={() => setHanding(false)} />}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(draft) }} className="border-t border-line bg-surface p-3">
        <div className="flex gap-2">
          <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={600} placeholder={c.placeholder} aria-label={c.placeholder}
            className="min-w-0 flex-1 rounded-full border border-line-strong bg-paper px-4 py-2 text-sm outline-none focus:border-chili" />
          <button type="submit" disabled={busy || !draft.trim()} aria-label={c.send} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-chili text-chili-ink disabled:opacity-50"><PaperPlaneRight size={16} weight="fill" /></button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-2xs text-ink-faint">
          <p>{c.privacy}</p>
          {!handing && <button type="button" onClick={() => setHanding(true)} className="inline-flex shrink-0 items-center gap-1 font-semibold text-chili hover:underline"><Headset size={12} />{c.human}</button>}
        </div>
      </form>
    </section>}
    {detail && <PlaceDetailsDrawer place={detail} onClose={closeDetail} />}
    {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
  </div>
}
