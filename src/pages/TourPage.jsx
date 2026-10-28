import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CalendarPlus, Compass, LinkSimple, ShareNetwork, Users } from '@phosphor-icons/react'
import TourDetail from '../components/tours/TourDetail.jsx'
import TourReservePanel from '../components/planner/TourReservePanel.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import Spinner from '../components/ui/Spinner.jsx'
import AuthModal from '../components/auth/AuthModal.jsx'
import { CITIES } from '../data/destinations.js'
import { tourDetail, tourError, tourDays, tourForItinerary, destinationNames, inDestination, vnDate } from '../lib/tours.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'

const C = {
  vi: {
    loading: 'Đang tải tour…', missing: 'Tour này không còn mở bán', missingHint: 'Đơn vị tổ chức có thể đã ẩn tour hoặc hết lịch khởi hành.',
    back: 'Xem các tour khác khi lên lịch trình', share: 'Chia sẻ', copied: 'Đã chép liên kết', copy: 'Chép liên kết',
    people: 'Số người', plan: 'Lên lịch trình quanh tour này',
    planHint: 'FoodTrip xếp tour vào lịch trình, rồi lo phần ăn uống, khách sạn và đường đi những giờ còn lại.',
    chosen: 'Đã chọn chuyến — gửi yêu cầu giữ chỗ bên dưới, hoặc lên cả lịch trình quanh tour.',
    reserveTitle: 'Gửi yêu cầu giữ chỗ',
    cta: { choose: 'Chọn chuyến này', chosen: 'Đã chọn chuyến', unchoose: 'Đổi chuyến' },
  },
  en: {
    loading: 'Loading the tour…', missing: 'This tour is no longer on sale', missingHint: 'The operator may have hidden it, or it has no departures left.',
    back: 'See other tours while planning a trip', share: 'Share', copied: 'Link copied', copy: 'Copy link',
    people: 'People', plan: 'Plan a trip around this tour',
    planHint: 'FoodTrip puts the tour in your itinerary and plans food, the hotel and getting around for the rest.',
    chosen: 'Departure chosen — send a reservation request below, or plan a whole trip around the tour.',
    reserveTitle: 'Request seats',
    cta: { choose: 'Choose a departure', chosen: 'Departure chosen', unchoose: 'Change' },
  },
}

/**
 * A tour's own page, to share: the full tour (photos, programme, departures,
 * policies, reviews), seats requested straight from here, or a whole trip
 * planned around it — the planner opens with the destination, dates and tour
 * already filled in.
 */
export default function TourPage() {
  const { id } = useParams()
  const { lang } = useLanguage()
  const c = C[lang]
  const { user } = useAuth()
  const navigate = useNavigate()
  const [state, setState] = useState({ status: 'loading' })
  const [people, setPeople] = useState(2)
  const [chosenId, setChosenId] = useState(null)
  const [copied, setCopied] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })
    tourDetail(id)
      .then((tour) => { if (active) setState({ status: 'ready', tour }) })
      .catch((error) => { if (active) setState({ status: 'error', error: tourError(error, lang) }) })
    return () => { active = false }
  }, [id, lang])

  const tour = state.tour
  useEffect(() => {
    if (tour) document.title = `${tour.title} — FoodTrip`
    return () => { document.title = 'FoodTrip — Ăn ngon, đi vui, lịch trình vừa ý' }
  }, [tour])

  // Choosing a departure (also from the sticky bar on phones) leads to the request form.
  useEffect(() => {
    if (chosenId) requestAnimationFrame(() => document.getElementById('tour-reserve')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }, [chosenId])

  const departure = tour?.departures?.find((d) => d.id === chosenId) ?? null
  const row = departure && { ...departure, tour_id: tour.id, title: tour.title, destination: tour.destination, operator_name: tour.operator_name, meeting_point: tour.meeting_point, cover_url: tour.cover_url }
  // The planner only knows its own destinations; a tour elsewhere can still be reserved here.
  const cityId = useMemo(() => tour && CITIES.find((city) => inDestination(tour, destinationNames(city, city.id)))?.id, [tour])

  async function share() {
    const url = window.location.href
    if (navigator.share) {
      try { await navigator.share({ title: tour.title, url }); return } catch { /* cancelled — fall back to copying */ }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch { /* clipboard blocked: the address bar still has the link */ }
  }

  function planAround() {
    const startDate = vnDate(row.starts_at)
    const { last } = tourDays(row, startDate)
    navigate('/plan', { state: { planTour: { cityId, startDate, duration: Math.max(2, last + 1), tour: tourForItinerary(row) } } })
  }

  if (state.status === 'loading') return <div className="mx-auto max-w-[1180px] px-5 py-10 md:px-8"><Spinner label={c.loading} /></div>
  if (state.status === 'error') {
    return (
      <div className="mx-auto max-w-[1180px] px-5 py-10 md:px-8">
        <EmptyState icon={Compass} title={c.missing} body={c.missingHint}
          action={<Link to="/plan" className="inline-flex items-center gap-2 rounded-full bg-chili px-6 py-[13px] font-utility text-md font-semibold text-chili-ink">{c.back}</Link>} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1180px] px-5 py-8 md:px-8 md:py-10">
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <label className="mr-auto inline-flex items-center gap-2 text-sm text-ink-muted">
          <Users size={16} className="text-herb" />{c.people}
          <input type="number" min={1} max={20} value={people} onChange={(e) => setPeople(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
            className="w-16 rounded-lg border border-line-strong bg-surface px-2 py-1 text-center font-semibold" />
        </label>
        <button type="button" onClick={share} className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-line-strong px-4 py-2 font-utility text-sm font-semibold hover:border-chili hover:text-chili">
          {copied ? <LinkSimple size={15} /> : <ShareNetwork size={15} />}{copied ? c.copied : c.share}
        </button>
      </div>

      <TourDetail tour={tour} lang={lang} people={people} chosenId={chosenId} onChoose={(d) => setChosenId(d?.id ?? null)} labels={c.cta} />

      {row && (
        <div id="tour-reserve" className="mt-10 scroll-mt-24">
          <p className="mx-auto mb-4 max-w-[880px] rounded-xl bg-herb/10 px-4 py-3 text-sm text-ink">{c.chosen}</p>
          {cityId && (
            <div className="mx-auto flex max-w-[880px] flex-col items-start gap-3 rounded-[16px] border border-line-strong bg-surface p-5 shadow-soft sm:flex-row sm:items-center">
              <div className="min-w-0 sm:flex-1">
                <div className="font-bold">{c.plan}</div>
                <p className="mt-0.5 text-sm text-ink-muted">{c.planHint}</p>
              </div>
              <button type="button" onClick={planAround} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-5 py-2.5 font-utility text-sm font-semibold text-paper">
                <CalendarPlus size={15} />{c.plan}
              </button>
            </div>
          )}
          <TourReservePanel key={`${row.id}-${people}`} tours={[row]} people={people} user={user} onLogin={() => setAuthOpen(true)} lang={lang} title={c.reserveTitle} />
        </div>
      )}

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </div>
  )
}
