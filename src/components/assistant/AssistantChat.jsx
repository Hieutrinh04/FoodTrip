import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChatCircleDots, X, PaperPlaneRight, ThumbsUp, ThumbsDown, MapTrifold, SpinnerGap, Info } from '@phosphor-icons/react'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import { useGuestBarVisible } from '../auth/GuestLoginBar.jsx'
import { askAssistant, faqAnswer, rateAnswer } from '../../lib/assistant.js'
import { askedPlace, changesTrip, estimateCost, placeInfoAnswer, requestFromTrip, tripInContext, weatherAnswer } from '../../lib/assistantAnswers.js'
import { normalise as toMapPlace } from '../../lib/mapAreaSearch.js'
import PlaceDetailsDrawer from '../map/PlaceDetailsDrawer.jsx'
import { getCity, TAGS, TRANSPORT } from '../../data/destinations.js'

const C = {
  vi: {
    open: 'Trợ lý FoodTrip', title: 'Trợ lý FoodTrip', close: 'Đóng trợ lý',
    subtitle: 'Lên lịch và giải đáp về FoodTrip. Có thể hiểu sai — hãy kiểm tra trước khi dùng.',
    hello: 'Chào bạn! Mình giúp lên lịch ăn chơi và trả lời về đặt phòng, thanh toán, hoàn tiền, tour, chia sẻ quán… Bạn cần gì?',
    suggestions: ['Lên lịch 2 ngày ở Đà Lạt, 2 người, 3 triệu', 'Đi Hội An 3 ngày 2 người hết bao nhiêu?', 'Thời tiết Đà Lạt cuối tuần này', 'Huỷ phòng có được hoàn tiền không?'],
    placeholder: 'Nhập câu hỏi hoặc yêu cầu lên lịch…', send: 'Gửi', thinking: 'Đang đọc câu của bạn…',
    privacy: 'Tin nhắn được lưu ẩn danh (bỏ số điện thoại, email) để cải thiện trợ lý.',
    helpful: 'Câu trả lời hữu ích', notHelpful: 'Câu trả lời chưa đúng', thanks: 'Cảm ơn góp ý của bạn!',
    planTitle: 'Thông tin mình đọc được', openPlanner: 'Mở trang Lịch trình', nothingRead: 'Mình chưa đọc được điểm đến hay số ngày — trang Lịch trình sẽ hỏi thêm.',
    dest: 'Điểm đến', days: 'Số ngày', people: 'Số người', budget: 'Ngân sách/người', transport: 'Phương tiện', prefs: 'Sở thích', dates: 'Thời gian', foods: 'Món muốn ăn',
    daysN: (n) => `${n} ngày`, peopleN: (n) => `${n} người`, model: 'mô hình FoodTrip', rules: 'quy tắc',
    updated: 'Cập nhật chuyến đi', placeDetails: 'Xem chi tiết quán', related: 'Có thể bạn muốn hỏi:', faqSource: 'hỏi–đáp',
  },
  en: {
    open: 'FoodTrip assistant', title: 'FoodTrip assistant', close: 'Close the assistant',
    subtitle: 'Plans trips and answers questions about FoodTrip. It can misread — check before relying on it.',
    hello: 'Hi! I can plan food trips and answer questions about bookings, payment, refunds, tours, sharing places… What do you need?',
    suggestions: ['Plan 2 days in Da Lat, 2 people, 3 million', 'How much for 3 days in Hoi An for 2?', 'Weather in Da Lat this weekend', 'Can I get a refund if I cancel?'],
    placeholder: 'Ask a question or describe a trip…', send: 'Send', thinking: 'Reading your message…',
    privacy: 'Messages are kept anonymously (phone numbers and emails removed) to improve the assistant.',
    helpful: 'Helpful answer', notHelpful: 'Wrong answer', thanks: 'Thanks for the feedback!',
    planTitle: 'What I read', openPlanner: 'Open the planner', nothingRead: 'I could not read a destination or length — the planner will ask.',
    dest: 'Destination', days: 'Days', people: 'People', budget: 'Budget/person', transport: 'Transport', prefs: 'Interests', dates: 'When', foods: 'Dishes',
    daysN: (n) => `${n} day${n > 1 ? 's' : ''}`, peopleN: (n) => `${n} ${n > 1 ? 'people' : 'person'}`, model: 'FoodTrip model', rules: 'rules',
    updated: 'Trip updated', placeDetails: 'Place details', related: 'You may want to ask:', faqSource: 'FAQ',
  },
}

const vnd = (n) => `${Math.round(n).toLocaleString('vi-VN')}đ`

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
  return <div className="mt-2 rounded-xl border border-line bg-surface p-3 text-sm">
    <div className="font-utility text-2xs font-bold uppercase tracking-wide text-ink-faint">{c.planTitle}</div>
    {rows.length ? <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">{rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-ink-faint">{k}</dt><dd className="font-semibold text-ink">{v}</dd></div>)}</dl>
      : <p className="mt-1 text-ink-muted">{c.nothingRead}</p>}
    <button type="button" onClick={() => onPlan(f)} className="mt-3 inline-flex items-center gap-2 rounded-full bg-chili px-4 py-2 font-utility text-xs font-semibold text-chili-ink"><MapTrifold size={14} />{c.openPlanner}</button>
  </div>
}

/** The floating assistant: a button on every page, and the conversation panel it opens. */
export default function AssistantChat() {
  const { lang } = useLanguage()
  const c = C[lang]
  const navigate = useNavigate()
  const guestBar = useGuestBarVisible()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  // The trip being talked about (planner fields): follow-ups like "chi phí bao nhiêu"
  // or "3 người thì sao" are about it.
  const [trip, setTrip] = useState(null)
  const [detail, setDetail] = useState(null)
  const closeDetail = useCallback(() => setDetail(null), [])
  const listRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { if (open) inputRef.current?.focus() }, [open])
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, busy])
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  async function send(text) {
    const message = text.replace(/\s+/g, ' ').trim().slice(0, 600)
    if (!message || busy) return
    setDraft('')
    setMessages((prev) => [...prev, { from: 'user', text: message }])
    setBusy(true)
    try {
      const answer = await askAssistant(message, lang)
      const reply = await respond(message, answer)
      setMessages((prev) => [...prev, { from: 'bot', ...reply }])
    } finally {
      setBusy(false)
    }
  }

  /** FoodTrip's reply to one reading: the written answer, or one computed for the trip being talked about. */
  async function respond(message, answer) {
    const { intent, slots } = answer
    const vi = lang === 'vi'
    const current = tripInContext(message, slots, trip)
    if (intent === 'plan_trip') {
      const fresh = tripInContext(message, slots, null)
      setTrip(fresh)
      return { ...answer, plan: fresh }
    }
    // A detail of the trip being talked about ("3 người thì sao", "đi xe máy"): the trip changes.
    if (trip && ['modify_plan', 'out_of_scope', 'find_food'].includes(intent) && changesTrip(message, slots)) {
      setTrip(current)
      return { ...answer, label: c.updated, reply: { text: vi ? 'Mình đã cập nhật chuyến đi:' : 'Trip updated:', links: [] }, plan: current }
    }
    try {
      if (intent === 'estimate_cost') {
        if (current.cityId || current.destinationQuery) setTrip(current)
        return { ...answer, reply: await estimateCost(current, lang) }
      }
      if (intent === 'ask_weather') return { ...answer, reply: await weatherAnswer(current, lang) }
      if (intent === 'place_info') {
        const found = await placeInfoAnswer(askedPlace(message, slots), current, lang)
        return { ...answer, reply: found, place: found.place ?? null }
      }
    } catch {
      return { ...answer, reply: { text: vi ? 'Mình chưa lấy được dữ liệu lúc này, thử lại sau nhé.' : 'I could not get the data right now — try again later.', links: [] } }
    }
    return answer
  }

  /** A related question tapped: its own answer, straight from the FAQ. */
  function openFaq({ id, question }) {
    const answer = faqAnswer(id, lang)
    if (!answer) return
    setMessages((prev) => [...prev, { from: 'user', text: question }, { from: 'bot', ...answer, source: 'faq' }])
  }

  function rate(index, helpful) {
    const m = messages[index]
    if (!m?.id || m.rated != null) return
    rateAnswer(m.id, helpful)
    setMessages((prev) => prev.map((x, i) => (i === index ? { ...x, rated: helpful } : x)))
  }

  function plan(fields) {
    setOpen(false)
    navigate('/plan', { state: { assistantRequest: { text: requestFromTrip(fields, lang), at: Date.now() } } })
  }

  const bottom = guestBar ? 'bottom-40 md:bottom-28' : 'bottom-5'
  return <div className="no-print">
    {!open && <button type="button" onClick={() => setOpen(true)} aria-label={c.open}
      className={`fixed right-4 ${bottom} z-[60] inline-flex items-center gap-2 rounded-full bg-chili px-4 py-3 font-utility text-sm font-semibold text-chili-ink shadow-lifted transition-transform hover:-translate-y-0.5`}>
      <ChatCircleDots size={20} weight="fill" /><span className="hidden sm:inline">{c.open}</span>
    </button>}
    {open && <section role="dialog" aria-label={c.title}
      className={`fixed right-2 sm:right-4 ${bottom} z-[60] flex h-[min(600px,75dvh)] w-[min(400px,calc(100vw-1rem))] flex-col overflow-hidden rounded-2xl border border-line bg-paper shadow-lifted`}>
      <header className="flex items-start justify-between gap-3 border-b border-line bg-surface px-4 py-3">
        <div><h2 className="font-bold">{c.title}</h2><p className="mt-0.5 text-xs text-ink-faint">{c.subtitle}</p></div>
        <button type="button" onClick={() => setOpen(false)} aria-label={c.close} className="rounded-full border border-line p-1.5 text-ink-muted hover:border-chili hover:text-chili"><X size={14} /></button>
      </header>
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
        <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-surface px-3 py-2 text-sm">{c.hello}</div>
        {!messages.length && <div className="flex flex-wrap gap-2">{c.suggestions.map((s) => <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-line-strong px-3 py-1.5 text-left text-xs font-semibold hover:border-chili">{s}</button>)}</div>}
        {messages.map((m, i) => m.from === 'user'
          ? <div key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-chili px-3 py-2 text-sm text-chili-ink">{m.text}</div>
          : <div key={i} className="max-w-[95%]">
            <div className="rounded-2xl rounded-tl-sm bg-surface px-3 py-2 text-sm">
              <p className="whitespace-pre-line">{m.reply?.text}</p>
              {m.reply?.links?.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{m.reply.links.map((l) => l.href
                ? <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold text-chili hover:border-chili">{l.label} ↗</a>
                : <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold text-chili hover:border-chili">{l.label} →</Link>)}</div>}
              {m.plan && <PlanCard trip={m.plan} lang={lang} c={c} onPlan={plan} />}
              {m.related?.length > 0 && <div className="mt-2 border-t border-line pt-2">
                <div className="text-2xs text-ink-faint">{c.related}</div>
                <div className="mt-1 flex flex-col items-start gap-1">{m.related.map((r) => <button key={r.id} type="button" onClick={() => openFaq(r)} className="text-left text-xs font-semibold text-chili hover:underline">{r.question} →</button>)}</div>
              </div>}
              {m.place?.location && <button type="button" onClick={() => setDetail(toMapPlace(m.place))} className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:border-chili"><Info size={13} />{c.placeDetails}</button>}
            </div>
            <div className="mt-1 flex items-center gap-2 pl-1 text-2xs text-ink-faint">
              <span>{m.label} · {m.source === 'faq' ? c.faqSource : m.source === 'model' ? c.model : c.rules}</span>
              {m.id && (m.rated == null
                ? <><button type="button" onClick={() => rate(i, true)} aria-label={c.helpful} className="hover:text-herb"><ThumbsUp size={13} /></button><button type="button" onClick={() => rate(i, false)} aria-label={c.notHelpful} className="hover:text-chili"><ThumbsDown size={13} /></button></>
                : <span>{c.thanks}</span>)}
            </div>
          </div>)}
        {busy && <div className="flex items-center gap-2 text-sm text-ink-muted"><SpinnerGap size={14} className="animate-spin" />{c.thinking}</div>}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(draft) }} className="border-t border-line bg-surface p-3">
        <div className="flex gap-2">
          <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={600} placeholder={c.placeholder} aria-label={c.placeholder}
            className="min-w-0 flex-1 rounded-full border border-line-strong bg-paper px-4 py-2 text-sm outline-none focus:border-chili" />
          <button type="submit" disabled={busy || !draft.trim()} aria-label={c.send} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-chili text-chili-ink disabled:opacity-50"><PaperPlaneRight size={16} weight="fill" /></button>
        </div>
        <p className="mt-2 text-2xs text-ink-faint">{c.privacy}</p>
      </form>
    </section>}
    {detail && <PlaceDetailsDrawer place={detail} onClose={closeDetail} />}
  </div>
}
