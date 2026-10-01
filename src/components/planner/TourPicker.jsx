import { useEffect, useRef, useState } from 'react'
import { CalendarBlank, Check, CheckCircle, Compass, MapTrifold, Plus, Users, Warning } from '@phosphor-icons/react'
import TourDetail from '../tours/TourDetail.jsx'
import Spinner from '../ui/Spinner.jsx'
import {
  tourRpc, tourDetail, tourError, tourMoney, toursForTrip, toursOverlap, tourDays, tourForItinerary, tourDurationLabel,
  budgetAfterTours, vnDate, vnTime, destinationNames,
} from '../../lib/tours.js'

const C = {
  vi: {
    selfTitle: 'Tự túc',
    selfBody: 'FoodTrip xếp toàn bộ lịch trình: quán ăn, điểm tham quan và đường đi giữa các điểm.',
    tourTitle: 'Có tour dẫn đường',
    tourBody: (n) => (n ? `${n} tour trong những ngày bạn đi. Tour được xếp vào lịch trình, phần còn lại FoodTrip lo.` : 'Chưa có tour nào trong những ngày bạn đi.'),
    back: 'Quay lại danh sách tour',
    loading: 'Đang tìm tour trong những ngày bạn đi…',
    budgetLeft: (amount) => `Sau tiền tour, ngân sách còn ${amount}/người cho ăn uống, khách sạn và đi lại.`,
    overBudget: 'Tiền tour đã vượt ngân sách mỗi người — cân nhắc bỏ bớt tour hoặc tăng ngân sách.',
    otherDates: (n, city) => `${n} tour khác ở ${city} vào ngày khác — quay lại bước "Thời gian & ngân sách" để đổi ngày nếu muốn tham gia:`,
    day: (n) => `Ngày ${n}`,
    perPerson: '/người',
    forParty: (total, n) => `${total} cho ${n} người`,
    seatsLeft: (n) => `Còn ${n} chỗ`,
    notEnough: (n) => `Chỉ còn ${n} chỗ — không đủ cho nhóm bạn`,
    details: 'Xem chi tiết', choose: 'Chọn tour', chosen: 'Đã chọn',
    replaces: 'Trùng giờ với tour đã chọn — chọn tour này sẽ bỏ tour kia.',
  },
  en: {
    selfTitle: 'On your own',
    selfBody: 'FoodTrip plans the whole trip: where to eat, what to see and the routes between them.',
    tourTitle: 'With a guided tour',
    tourBody: (n) => (n ? `${n} tour(s) on your dates. The tour goes into your itinerary and FoodTrip plans the rest.` : 'No tours on your dates yet.'),
    back: 'Back to tours',
    loading: 'Looking for tours on your dates…',
    budgetLeft: (amount) => `After the tour, ${amount}/person is left for food, the hotel and getting around.`,
    overBudget: 'The tours already exceed the per-person budget — consider fewer tours or a bigger budget.',
    otherDates: (n, city) => `${n} other tour(s) in ${city} on other dates — go back to "Dates & budget" to change dates if you'd like to join:`,
    day: (n) => `Day ${n}`,
    perPerson: '/person',
    forParty: (total, n) => `${total} for ${n}`,
    seatsLeft: (n) => `${n} seats left`,
    notEnough: (n) => `Only ${n} seats left — not enough for your group`,
    details: 'View details', choose: 'Choose tour', chosen: 'Chosen',
    replaces: 'Overlaps a tour you chose — choosing this one drops the other.',
  },
}

/**
 * The planner's "on your own or with a tour" step. On your own is the
 * default; with a tour lists guided departures in the destination during the
 * trip as cards, each opening a full tour page inside the planner (so nothing
 * typed so far is lost). Choosing only puts the tour in the itinerary — seats
 * are requested from the finished plan.
 */
export default function TourPicker({ city, cityId, startDate, duration, people, budget, mode, onModeChange, selected, onChange, lang }) {
  const c = C[lang]
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState(null) // { status: 'loading' | 'ready' | 'error', tourId, tour?, error? }
  const topRef = useRef(null)

  useEffect(() => {
    let active = true
    setError('')
    tourRpc('tour_catalog')
      .then((data) => { if (active) setRows(data ?? []) })
      .catch((e) => { if (active) { setError(tourError(e)); setRows([]) } })
    return () => { active = false }
  }, [])

  const fitsTrip = (row) => {
    const { first, last } = tourDays(row, startDate)
    return first >= 0 && last < duration
  }
  const cityName = city.name[lang]
  const { onTrip, otherDates } = rows ? toursForTrip(rows, { names: destinationNames(city, cityId), startDate, duration }) : { onTrip: [], otherDates: [] }
  // One card per tour, showing its earliest departure in the trip.
  const cards = [...new Map(onTrip.map((row) => [row.tour_id ?? row.id, row])).values()]
  // A tour already shown as a card lists its other dates on its own page.
  const elsewhere = [...new Map(otherDates.filter((row) => !cards.some((card) => (card.tour_id ?? card.id) === (row.tour_id ?? row.id)))
    .map((row) => [row.tour_id ?? row.id, row])).values()]
  const chosenFor = (tourId) => selected.find((tour) => (tour.tour_id ?? tour.id) === tourId) ?? null
  const left = budgetAfterTours(budget, selected)

  function choose(row) {
    const tourId = row.tour_id ?? row.id
    const rest = selected.filter((tour) => (tour.tour_id ?? tour.id) !== tourId && !toursOverlap(tour, row))
    onChange([...rest, tourForItinerary(row)])
  }
  function unchoose(tourId) {
    onChange(selected.filter((tour) => (tour.tour_id ?? tour.id) !== tourId))
  }

  async function openDetail(row) {
    const tourId = row.tour_id ?? row.id
    setDetail({ status: 'loading', tourId })
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    try {
      setDetail({ status: 'ready', tourId, tour: await tourDetail(tourId) })
    } catch (e) {
      setDetail({ status: 'error', tourId, error: tourError(e) })
    }
  }
  function closeDetail() {
    const tourId = detail?.tourId
    setDetail(null)
    requestAnimationFrame(() => document.getElementById(`tour-card-${tourId}`)?.scrollIntoView({ block: 'center' }))
  }

  if (detail) {
    return (
      <div ref={topRef} className="scroll-mt-24">
        {detail.status === 'loading' && <Spinner label={c.loading} />}
        {detail.status === 'error' && (
          <div>
            <p className="mb-3 flex items-start gap-2 text-md text-chili"><Warning size={16} className="mt-0.5 shrink-0" />{detail.error}</p>
            <button type="button" onClick={closeDetail} className="font-utility text-sm font-semibold text-chili hover:underline">← {c.back}</button>
          </div>
        )}
        {detail.status === 'ready' && (
          <TourDetail
            tour={detail.tour}
            lang={lang}
            people={people}
            fits={fitsTrip}
            chosenId={chosenFor(detail.tour.id)?.id ?? null}
            onChoose={(departure) => {
              if (!departure) unchoose(detail.tour.id)
              else choose({ ...departure, tour_id: detail.tour.id, title: detail.tour.title, destination: detail.tour.destination, operator_name: detail.tour.operator_name, meeting_point: detail.tour.meeting_point, cover_url: detail.tour.cover_url })
            }}
            onBack={closeDetail}
          />
        )}
      </div>
    )
  }

  return (
    <div ref={topRef} className="flex scroll-mt-24 flex-col gap-5">
      <div role="radiogroup" className="grid gap-3 sm:grid-cols-2">
        <ModeCard active={mode === 'self'} onClick={() => { onModeChange('self'); onChange([]) }} icon={MapTrifold} title={c.selfTitle} body={c.selfBody} />
        <ModeCard
          active={mode === 'tour'}
          onClick={() => onModeChange('tour')}
          icon={Compass}
          title={c.tourTitle}
          body={rows ? c.tourBody(cards.length) : c.loading}
          badge={rows && cards.length > 0 ? cards.length : null}
        />
      </div>

      {mode === 'tour' && (
        <>
          {!rows && <Spinner label={c.loading} />}
          {error && <p className="flex items-start gap-2 text-md text-lantern"><Warning size={16} className="mt-0.5 shrink-0" />{error}</p>}
          {selected.length > 0 && (
            <p className={`max-w-[70ch] rounded-xl px-4 py-3 text-sm ${left > 0 ? 'bg-paper-2 text-ink-muted' : 'bg-chili/10 text-chili'}`}>
              {left > 0 ? c.budgetLeft(tourMoney(left)) : c.overBudget}
            </p>
          )}
          {cards.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map((row) => {
                const tourId = row.tour_id ?? row.id
                const chosen = chosenFor(tourId)
                return (
                  <TourCard
                    key={tourId}
                    row={chosen ? { ...row, ...chosen, available: row.available } : row}
                    c={c}
                    lang={lang}
                    people={people}
                    dayNumber={tourDays(chosen ?? row, startDate).first + 1}
                    chosen={Boolean(chosen)}
                    clashes={!chosen && selected.some((tour) => toursOverlap(tour, row))}
                    onChoose={() => (chosen ? unchoose(tourId) : choose(row))}
                    onDetails={() => openDetail(row)}
                  />
                )
              })}
            </div>
          )}
          {elsewhere.length > 0 && (
            <div className="text-sm text-ink-muted">
              <p>{c.otherDates(elsewhere.length, cityName)}</p>
              <ul className="mt-2 flex flex-col gap-1">
                {elsewhere.slice(0, 5).map((row) => (
                  <li key={row.id} className="flex flex-wrap gap-x-2">
                    <button type="button" onClick={() => openDetail(row)} className="font-semibold text-ink hover:text-chili hover:underline">{row.title}</button>
                    <span className="tabular">{new Date(`${vnDate(row.starts_at)}T12:00:00`).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US')} · {vnTime(row.starts_at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ModeCard({ active, onClick, icon: Icon, title, body, badge }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`flex items-start gap-3 rounded-2xl border-[1.5px] p-4 text-left transition-colors ${active ? 'border-chili bg-surface shadow-soft' : 'border-line-strong hover:border-chili'}`}
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${active ? 'bg-chili text-chili-ink' : 'bg-paper-2 text-ink-muted'}`}><Icon size={22} /></span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-base font-bold">
          {title}
          {badge != null && <span className="rounded-full bg-herb px-2 py-0.5 font-utility text-2xs font-bold text-herb-ink">{badge}</span>}
        </span>
        <span className="mt-0.5 block text-sm text-ink-muted">{body}</span>
      </span>
      <span className={`ml-auto mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${active ? 'border-chili bg-chili text-chili-ink' : 'border-line-strong'}`}>{active && <Check size={11} weight="bold" />}</span>
    </button>
  )
}

function TourCard({ row, c, lang, people, dayNumber, chosen, clashes, onChoose, onDetails }) {
  const enough = row.available >= people
  return (
    <article id={`tour-card-${row.tour_id ?? row.id}`} className={`flex flex-col overflow-hidden rounded-2xl border-[1.5px] bg-surface ${chosen ? 'border-chili shadow-soft' : 'border-line'}`}>
      <button type="button" onClick={onDetails} className="relative block text-left" aria-label={`${c.details}: ${row.title}`}>
        {row.cover_url ? (
          <img src={row.cover_url} alt="" referrerPolicy="no-referrer" loading="lazy" className="aspect-[4/3] w-full object-cover" />
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center bg-gradient-to-br from-herb/25 via-paper-2 to-chili/20"><Compass size={44} className="text-herb/70" /></div>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-ink/75 px-2.5 py-1 font-utility text-2xs font-bold text-paper">{tourDurationLabel(row, lang)}</span>
        {chosen && <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-herb px-2.5 py-1 font-utility text-2xs font-bold text-herb-ink"><Check size={11} weight="bold" />{c.chosen}</span>}
      </button>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="font-utility text-2xs font-bold uppercase tracking-wide text-chili">{row.destination}</div>
        <h3 className="line-clamp-2 text-base font-bold leading-snug">
          <button type="button" onClick={onDetails} className="text-left hover:text-chili">{row.title}</button>
        </h3>
        <div className="text-xs text-ink-faint">{row.operator_name}</div>
        {(row.summary || row.description) && <p className="line-clamp-2 text-sm text-ink-muted">{row.summary || row.description}</p>}
        {row.highlights?.length > 0 && (
          <ul className="flex flex-col gap-1">
            {row.highlights.slice(0, 3).map((item) => <li key={item} className="flex items-start gap-1.5 text-xs text-ink-muted"><CheckCircle size={13} weight="fill" className="mt-0.5 shrink-0 text-herb" /><span className="line-clamp-1">{item}</span></li>)}
          </ul>
        )}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
          <span className="flex items-center gap-1"><CalendarBlank size={13} className="text-herb" />{c.day(dayNumber)} · {vnTime(row.starts_at)}–{vnTime(row.ends_at)}</span>
          <span className="flex items-center gap-1"><Users size={13} className="text-herb" />{c.seatsLeft(row.available)}</span>
        </div>
        <div className="mt-auto pt-2">
          <div className="text-lg font-bold tabular text-chili">{tourMoney(row.price)}<span className="text-xs font-medium text-ink-muted">{c.perPerson}</span></div>
          <div className="text-xs text-ink-faint">{c.forParty(tourMoney(Number(row.price) * people), people)}</div>
        </div>
        {!enough && !chosen && <p className="text-xs text-lantern">{c.notEnough(row.available)}</p>}
        {clashes && enough && <p className="text-xs text-lantern">{c.replaces}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onDetails} className="flex-1 rounded-full border-[1.5px] border-line-strong px-3 py-2 font-utility text-xs font-semibold hover:border-chili hover:text-chili">{c.details}</button>
          <button
            type="button"
            onClick={onChoose}
            disabled={!enough && !chosen}
            aria-pressed={chosen}
            className={`inline-flex flex-1 items-center justify-center gap-1 rounded-full px-3 py-2 font-utility text-xs font-semibold disabled:opacity-50 ${chosen ? 'bg-herb text-herb-ink' : 'bg-chili text-chili-ink'}`}
          >
            {chosen ? <Check size={13} /> : <Plus size={13} />}{chosen ? c.chosen : c.choose}
          </button>
        </div>
      </div>
    </article>
  )
}
