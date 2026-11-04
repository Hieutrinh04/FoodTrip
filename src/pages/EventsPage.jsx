import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, MapPin, ArrowSquareOut, CalendarPlus, Plus, X } from '@phosphor-icons/react'
import { CITIES, getCity } from '../data/destinations.js'
import { eventPayload, eventSchedule, eventTitle, getEvent, isEventPartner, listEvents, myEvents, proposeEvent, withStatus, withdrawEvent, eventStatus } from '../lib/foodEvents.js'
import { placeMapUrl } from '../lib/trackAsia.js'
import { usePageMeta } from '../hooks/usePageMeta.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { useLoginPrompt } from '../auth/LoginPromptContext.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import ShareButton from '../components/ui/ShareButton.jsx'
import { EventCard, StatusBadge } from '../components/events/EventCard.jsx'
import Spinner from '../components/ui/Spinner.jsx'
import NotFound from './NotFound.jsx'

const C = {
  vi: {
    eyebrow: 'Sự kiện ẩm thực', title: 'Lễ hội, chợ đêm và phố ẩm thực',
    sub: 'Sự kiện do FoodTrip và đối tác đăng, được FoodTrip duyệt trước khi hiện ở đây. Giờ giấc theo giờ Việt Nam — hãy kiểm tra trang chính thức trước khi đi.',
    allCities: 'Mọi thành phố', showPast: 'Hiện cả sự kiện đã qua', loading: 'Đang tải sự kiện…', loadError: 'Chưa tải được sự kiện. Thử lại sau.',
    empty: 'Chưa có sự kiện nào được đăng ở đây.', partnerHint: 'Bạn là đối tác lưu trú hoặc tour? Đề xuất một sự kiện, FoodTrip sẽ duyệt.',
    free: 'Miễn phí', paid: 'Có thu phí', details: 'Xem chi tiết',
    propose: 'Đề xuất sự kiện', notPartner: 'Chỉ đối tác lưu trú hoặc tour đề xuất được sự kiện.', becomePartner: 'Hợp tác với FoodTrip', signIn: 'Đăng nhập để đề xuất',
    mine: 'Đề xuất của bạn', withdraw: 'Rút đề xuất', state: { pending: 'Chờ duyệt', published: 'Đã đăng', hidden: 'Không đăng' },
    form: {
      title: 'Đề xuất sự kiện mới', hint: 'Sự kiện vào trạng thái chờ duyệt; FoodTrip kiểm tra rồi mới đăng. Chỉ ghi giá nếu ban tổ chức đã công bố.',
      title_vi: 'Tên sự kiện (tiếng Việt)', title_en: 'Tên tiếng Anh (không bắt buộc)', summary: 'Mô tả ngắn', city_id: 'Thành phố', venue: 'Địa điểm', address: 'Địa chỉ (không bắt buộc)',
      kind: 'Loại lịch', once: 'Diễn ra một lần', weekly: 'Lặp hằng tuần (chợ đêm, phố đi bộ)', starts_at: 'Bắt đầu', ends_at: 'Kết thúc',
      weekly_days: 'Các ngày trong tuần', weekly_start: 'Mở cửa', weekly_end: 'Đóng cửa', valid_from: 'Áp dụng từ ngày (không bắt buộc)', valid_until: 'Đến ngày (không bắt buộc)',
      is_free: 'Vé vào cửa', unknown: 'Chưa rõ', price_note: 'Ghi chú giá do ban tổ chức công bố (không bắt buộc)', official_url: 'Trang chính thức (https://…)', image_url: 'Ảnh (https://…, không bắt buộc)',
      submit: 'Gửi đề xuất', sending: 'Đang gửi…', cancel: 'Thôi', sent: 'Đã gửi. Đề xuất đang chờ FoodTrip duyệt.', failed: 'Chưa gửi được. Kiểm tra lại thông tin hoặc quyền đối tác.',
      errors: { title_vi: 'Tên cần ít nhất 3 ký tự.', summary: 'Mô tả cần ít nhất 10 ký tự.', city_id: 'Chọn thành phố.', venue: 'Nhập địa điểm.', starts_at: 'Chọn thời gian bắt đầu.', ends_at: 'Kết thúc phải sau khi bắt đầu.', weekly_days: 'Chọn ít nhất một ngày.', weekly_time: 'Nhập giờ mở và đóng khác nhau.', valid_until: 'Ngày kết thúc phải sau ngày bắt đầu.', official_url: 'Đường dẫn phải bắt đầu bằng https://', image_url: 'Đường dẫn ảnh phải bắt đầu bằng https://' },
    },
    back: 'Tất cả sự kiện', where: 'Địa điểm', when: 'Thời gian', price: 'Vé', official: 'Trang chính thức', map: 'Xem bản đồ', plan: 'Lên lịch ở thành phố này', city: 'Về thành phố',
  },
  en: {
    eyebrow: 'Food events', title: 'Festivals, night markets and food streets',
    sub: 'Events posted by FoodTrip and its partners, reviewed by FoodTrip before they appear here. Times are Vietnam time — check the official page before you go.',
    allCities: 'All cities', showPast: 'Show past events too', loading: 'Loading events…', loadError: 'Could not load events. Try again later.',
    empty: 'No events have been posted here yet.', partnerHint: 'Run a stay or tours? Propose an event and FoodTrip will review it.',
    free: 'Free', paid: 'Paid entry', details: 'Details',
    propose: 'Propose an event', notPartner: 'Only stay and tour partners can propose events.', becomePartner: 'Partner with FoodTrip', signIn: 'Sign in to propose',
    mine: 'Your proposals', withdraw: 'Withdraw', state: { pending: 'Awaiting review', published: 'Published', hidden: 'Not published' },
    form: {
      title: 'Propose a new event', hint: 'It waits for review; FoodTrip checks it before publishing. Give a price only if the organiser has announced one.',
      title_vi: 'Event name (Vietnamese)', title_en: 'English name (optional)', summary: 'Short description', city_id: 'City', venue: 'Venue', address: 'Address (optional)',
      kind: 'Schedule', once: 'Happens once', weekly: 'Weekly (night market, walking street)', starts_at: 'Starts', ends_at: 'Ends',
      weekly_days: 'Days of the week', weekly_start: 'Opens', weekly_end: 'Closes', valid_from: 'From date (optional)', valid_until: 'Until date (optional)',
      is_free: 'Entry', unknown: 'Unknown', price_note: 'Price note as announced by the organiser (optional)', official_url: 'Official page (https://…)', image_url: 'Image (https://…, optional)',
      submit: 'Send proposal', sending: 'Sending…', cancel: 'Cancel', sent: 'Sent. Your proposal is waiting for FoodTrip’s review.', failed: 'Could not send. Check the details or your partner access.',
      errors: { title_vi: 'The name needs at least 3 characters.', summary: 'The description needs at least 10 characters.', city_id: 'Choose a city.', venue: 'Enter the venue.', starts_at: 'Choose the start.', ends_at: 'The end must be after the start.', weekly_days: 'Choose at least one day.', weekly_time: 'Enter different opening and closing times.', valid_until: 'The end date must be after the start date.', official_url: 'The link must start with https://', image_url: 'The image link must start with https://' },
    },
    back: 'All events', where: 'Where', when: 'When', price: 'Entry', official: 'Official page', map: 'See the map', plan: 'Plan a trip to this city', city: 'About the city',
  },
}
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]
const DAY_SHORT = { vi: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] }
/** /su-kien — published events, by city, ongoing first. */
export default function EventsPage() {
  const { lang } = useLanguage()
  const c = C[lang]
  const { user } = useAuth()
  const openLogin = useLoginPrompt()
  const [params, setParams] = useSearchParams()
  const cityId = getCity(params.get('city')) ? params.get('city') : ''
  const [showPast, setShowPast] = useState(false)
  const [state, setState] = useState({ status: 'loading', events: [] })
  const [partner, setPartner] = useState(false)
  const [mine, setMine] = useState([])
  const [proposing, setProposing] = useState(false)
  const [notice, setNotice] = useState('')

  usePageMeta({ title: c.eyebrow, description: c.sub })

  useEffect(() => {
    let live = true
    setState((s) => ({ ...s, status: 'loading' }))
    listEvents({ cityId: cityId || null })
      .then((events) => { if (live) setState({ status: 'ready', events: withStatus(events) }) })
      .catch(() => { if (live) setState({ status: 'error', events: [] }) })
    return () => { live = false }
  }, [cityId])

  const loadMine = useCallback(() => {
    if (!user) { setMine([]); setPartner(false); return }
    isEventPartner().then(setPartner)
    myEvents(user.id).then(setMine).catch(() => setMine([]))
  }, [user])
  useEffect(() => { loadMine() }, [loadMine])

  const shown = state.events.filter((e) => showPast || e.when.status !== 'past')

  return (
    <div className="mx-auto max-w-[1180px] px-5 py-12 md:px-8 md:py-16">
      <span className="eyebrow eyebrow-tick">{c.eyebrow}</span>
      <h1 className="mt-3 text-3xl font-bold leading-[1.15] md:text-4xl">{c.title}</h1>
      <p className="mt-3 max-w-[70ch] text-ink-muted">{c.sub}</p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <select value={cityId} onChange={(e) => setParams(e.target.value ? { city: e.target.value } : {}, { replace: true })} aria-label={c.allCities}
          className="rounded-full border-[1.5px] border-line-strong bg-paper px-4 py-2 font-utility text-sm font-semibold">
          <option value="">{c.allCities}</option>
          {CITIES.map((city) => <option key={city.id} value={city.id}>{city.name[lang]}</option>)}
        </select>
        <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />{c.showPast}</label>
        <div className="ml-auto">
          {!user ? <button type="button" onClick={() => openLogin(c.signIn)} className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-line-strong px-4 py-2 font-utility text-sm font-semibold hover:border-chili"><Plus size={14} />{c.signIn}</button>
            : partner ? <button type="button" onClick={() => { setProposing(true); setNotice('') }} className="inline-flex items-center gap-2 rounded-full bg-chili px-4 py-2 font-utility text-sm font-semibold text-chili-ink"><Plus size={14} />{c.propose}</button>
              : <span className="text-sm text-ink-muted">{c.notPartner} <Link to="/hop-tac" className="font-semibold text-chili hover:underline">{c.becomePartner} →</Link></span>}
        </div>
      </div>

      {notice && <p role="status" className="mt-4 rounded-xl bg-herb/10 px-4 py-3 text-sm text-herb">{notice}</p>}
      {proposing && <EventForm c={c} lang={lang} defaultCity={cityId} onCancel={() => setProposing(false)} onSent={() => { setProposing(false); setNotice(c.form.sent); loadMine() }} />}

      <section className="mt-8" aria-live="polite">
        {state.status === 'loading' && <Spinner label={c.loading} />}
        {state.status === 'error' && <p role="alert" className="text-sm text-chili">{c.loadError}</p>}
        {state.status === 'ready' && !shown.length && <p className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-ink-muted">{c.empty}<br />{c.partnerHint}</p>}
        {shown.length > 0 && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{shown.map((e) => <EventCard key={e.id} event={e} lang={lang} />)}</div>}
      </section>

      {mine.length > 0 && <section className="mt-12">
        <h2 className="text-xl font-bold">{c.mine}</h2>
        <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface">
          {mine.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0"><div className="font-semibold">{e.title_vi}</div><div className="text-ink-muted">{getCity(e.city_id)?.name[lang]} · {eventSchedule(e, lang)}</div>
                {e.review_note && <div className="mt-1 text-xs text-ink-faint">{e.review_note}</div>}</div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-paper-2 px-2.5 py-1 font-utility text-2xs font-semibold">{c.state[e.status]}</span>
                {e.status === 'pending' && <button type="button" onClick={() => withdrawEvent(e.id).then(loadMine).catch(() => null)} className="rounded-full border border-line px-3 py-1 font-utility text-2xs font-semibold hover:border-chili hover:text-chili">{c.withdraw}</button>}
              </div>
            </li>
          ))}
        </ul>
      </section>}
    </div>
  )
}

function EventForm({ c, lang, defaultCity, onCancel, onSent }) {
  const f = c.form
  const [form, setForm] = useState({ kind: 'once', city_id: defaultCity || '', weekly_days: [], is_free: '' })
  const [state, setState] = useState({ busy: false, error: null, field: null })
  const set = (key) => (e) => setForm((x) => ({ ...x, [key]: e.target.value }))
  const toggleDay = (d) => setForm((x) => ({ ...x, weekly_days: x.weekly_days.includes(d) ? x.weekly_days.filter((y) => y !== d) : [...x.weekly_days, d] }))
  async function submit(e) {
    e.preventDefault()
    const { row, error } = eventPayload(form)
    if (error) return setState({ busy: false, error: f.errors[error], field: error })
    setState({ busy: true, error: null, field: null })
    try { await proposeEvent(row); onSent() } catch { setState({ busy: false, error: f.failed, field: null }) }
  }
  const input = 'mt-1 w-full rounded-lg border border-line-strong bg-paper px-3 py-2 text-sm outline-none focus:border-chili'
  const field = (key, label, props = {}) => <label className="block text-sm font-semibold">{label}<input value={form[key] ?? ''} onChange={set(key)} aria-invalid={state.field === key || undefined} className={input} {...props} /></label>
  return (
    <form onSubmit={submit} className="mt-6 rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{f.title}</h2><p className="mt-1 text-sm text-ink-muted">{f.hint}</p></div>
        <button type="button" onClick={onCancel} aria-label={f.cancel} className="rounded-full border border-line p-1.5"><X size={14} /></button></div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {field('title_vi', f.title_vi, { required: true, maxLength: 200 })}
        {field('title_en', f.title_en, { maxLength: 200 })}
        <label className="block text-sm font-semibold md:col-span-2">{f.summary}<textarea value={form.summary ?? ''} onChange={set('summary')} rows={3} maxLength={2000} required aria-invalid={state.field === 'summary' || undefined} className={input} /></label>
        <label className="block text-sm font-semibold">{f.city_id}<select value={form.city_id} onChange={set('city_id')} required className={input}><option value="">—</option>{CITIES.map((city) => <option key={city.id} value={city.id}>{city.name[lang]}</option>)}</select></label>
        {field('venue', f.venue, { required: true, maxLength: 200 })}
        <div className="md:col-span-2">{field('address', f.address, { maxLength: 300 })}</div>
        <fieldset className="md:col-span-2"><legend className="text-sm font-semibold">{f.kind}</legend>
          <div className="mt-1 flex flex-wrap gap-4 text-sm">{['once', 'weekly'].map((k) => <label key={k} className="inline-flex items-center gap-2"><input type="radio" name="kind" value={k} checked={form.kind === k} onChange={set('kind')} />{f[k]}</label>)}</div>
        </fieldset>
        {form.kind === 'once' ? <>
          {field('starts_at', f.starts_at, { type: 'datetime-local', required: true })}
          {field('ends_at', f.ends_at, { type: 'datetime-local', required: true })}
        </> : <>
          <fieldset className="md:col-span-2"><legend className="text-sm font-semibold">{f.weekly_days}</legend>
            <div className="mt-1 flex flex-wrap gap-2">{WEEKDAY_ORDER.map((d) => <label key={d} className={`cursor-pointer rounded-full border px-3 py-1 font-utility text-xs font-semibold ${form.weekly_days.includes(d) ? 'border-chili bg-chili text-chili-ink' : 'border-line-strong'}`}><input type="checkbox" className="sr-only" checked={form.weekly_days.includes(d)} onChange={() => toggleDay(d)} />{DAY_SHORT[lang][d]}</label>)}</div>
          </fieldset>
          {field('weekly_start', f.weekly_start, { type: 'time', required: true })}
          {field('weekly_end', f.weekly_end, { type: 'time', required: true })}
          {field('valid_from', f.valid_from, { type: 'date' })}
          {field('valid_until', f.valid_until, { type: 'date' })}
        </>}
        <label className="block text-sm font-semibold">{f.is_free}<select value={form.is_free} onChange={set('is_free')} className={input}><option value="">{f.unknown}</option><option value="true">{c.free}</option><option value="false">{c.paid}</option></select></label>
        {field('price_note', f.price_note, { maxLength: 200 })}
        {field('official_url', f.official_url, { type: 'url', maxLength: 500 })}
        {field('image_url', f.image_url, { type: 'url', maxLength: 500 })}
      </div>
      {state.error && <p role="alert" className="mt-3 text-sm text-chili">{state.error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-full border border-line px-4 py-2 font-utility text-sm font-semibold">{f.cancel}</button>
        <button type="submit" disabled={state.busy} className="rounded-full bg-chili px-4 py-2 font-utility text-sm font-semibold text-chili-ink disabled:opacity-60">{state.busy ? f.sending : f.submit}</button>
      </div>
    </form>
  )
}

/** /su-kien/:id — one event. */
export function EventPage() {
  const { id } = useParams()
  const { lang } = useLanguage()
  const c = C[lang]
  const navigate = useNavigate()
  const [state, setState] = useState({ status: 'loading', event: null })
  useEffect(() => {
    let live = true
    getEvent(id).then((event) => { if (live) setState({ status: event ? 'ready' : 'missing', event }) }).catch(() => { if (live) setState({ status: 'missing', event: null }) })
    return () => { live = false }
  }, [id])
  const event = state.event
  usePageMeta({ title: event ? eventTitle(event, lang) : null, description: event?.summary, image: event?.image_url })
  if (state.status === 'loading') return <div className="mx-auto max-w-[900px] px-5 py-16"><Spinner label={c.loading} /></div>
  if (state.status === 'missing') return <NotFound />
  const city = getCity(event.city_id)
  const when = eventStatus(event)
  const location = event.lat != null ? { lat: event.lat, lng: event.lng } : null
  return (
    <div className="mx-auto max-w-[900px] px-5 py-10 md:px-8 md:py-14">
      <Link to="/su-kien" className="inline-flex items-center gap-2 font-utility text-sm font-semibold text-ink-muted hover:text-chili"><ArrowLeft size={16} />{c.back}</Link>
      {event.image_url && <img src={event.image_url} alt="" referrerPolicy="no-referrer" loading="eager" className="mt-5 h-56 w-full rounded-2xl object-cover md:h-72" />}
      <div className="mt-6 flex flex-wrap items-center gap-3"><StatusBadge status={when.status} lang={lang} />{city && <Link to={`/thanh-pho/${city.id}`} className="font-utility text-xs font-bold uppercase tracking-wide text-ink-faint hover:text-chili">{city.name[lang]}</Link>}</div>
      <h1 className="mt-3 text-3xl font-bold leading-tight md:text-4xl">{eventTitle(event, lang)}</h1>
      <p className="mt-4 whitespace-pre-line text-ink-muted">{event.summary}</p>
      <dl className="mt-6 grid gap-3 rounded-xl border border-line bg-surface p-5 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="font-semibold">{c.when}</dt><dd>{eventSchedule(event, lang)}</dd>
        <dt className="font-semibold">{c.where}</dt><dd>{[event.venue, event.address].filter(Boolean).join(', ')}</dd>
        {event.is_free != null && <><dt className="font-semibold">{c.price}</dt><dd>{event.is_free ? c.free : c.paid}{event.price_note ? ` — ${event.price_note}` : ''}</dd></>}
      </dl>
      <div className="mt-6 flex flex-wrap gap-3">
        <a href={placeMapUrl({ name: event.venue, address: [event.address, city?.name.vi].filter(Boolean).join(', '), location })} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-line-strong px-4 py-2 font-utility text-sm font-semibold hover:border-chili"><MapPin size={14} />{c.map} ↗</a>
        {event.official_url && <a href={event.official_url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-line-strong px-4 py-2 font-utility text-sm font-semibold hover:border-chili"><ArrowSquareOut size={14} />{c.official}</a>}
        {city && <button type="button" onClick={() => navigate('/plan', { state: { assistantRequest: { text: `đi ${city.name.vi}`, at: Date.now() } } })} className="inline-flex items-center gap-2 rounded-full bg-chili px-4 py-2 font-utility text-sm font-semibold text-chili-ink"><CalendarPlus size={14} />{c.plan}</button>}
        <ShareButton title={eventTitle(event, lang)} text={eventSchedule(event, lang)} />
      </div>
    </div>
  )
}
