import { useState } from 'react'
import {
  ArrowLeft, CaretDown, CaretLeft, CaretRight, CheckCircle, Compass, XCircle, MapPin, Clock, CalendarBlank, Bus, Flag, Users, Check,
} from '@phosphor-icons/react'
import { tourMoney, tourDurationLabel, vnDate, vnTime } from '../../lib/tours.js'

const C = {
  vi: {
    back: 'Quay lại danh sách tour', crumbs: 'Tour & trải nghiệm',
    facts: 'Điểm nổi bật của tour', route: 'Hành trình', duration: 'Thời gian', departs: 'Khởi hành', transport: 'Phương tiện',
    startPoint: 'Xuất phát', meeting: 'Điểm hẹn', code: 'Mã tour', operator: 'Đơn vị tổ chức',
    prices: 'Lịch khởi hành & giá', date: 'Ngày', time: 'Giờ', price: 'Giá / người', seats: 'Còn chỗ', notOnTrip: 'Ngoài ngày đi',
    noDepartures: 'Chưa có lịch khởi hành mở bán.',
    schedule: 'Lịch trình tour', day: (n) => `Ngày ${n}`, programme: 'Chương trình',
    includes: 'Tour bao gồm', excludes: 'Tour chưa bao gồm',
    child: 'Chính sách trẻ em', cancel: 'Chính sách huỷ tour', notes: 'Lưu ý khi tham gia',
    from: 'Giá từ', perPerson: '/người', forParty: (total, n) => `${total} cho ${n} người`,
    choose: 'Chọn tour này', chosen: 'Đã chọn cho lịch trình', unchoose: 'Bỏ chọn',
    chooseDeparture: 'Chọn', chosenDeparture: 'Đã chọn',
    notEnough: 'Không đủ chỗ cho nhóm bạn', highlights: 'Điểm nổi bật chương trình',
    onThisPage: 'Trên trang này', photo: (i, n) => `Ảnh ${i} / ${n}`, prev: 'Ảnh trước', next: 'Ảnh sau',
  },
  en: {
    back: 'Back to tours', crumbs: 'Tours & experiences',
    facts: 'Tour at a glance', route: 'Route', duration: 'Duration', departs: 'Departs', transport: 'Transport',
    startPoint: 'Starts from', meeting: 'Meeting point', code: 'Tour code', operator: 'Operator',
    prices: 'Departures & prices', date: 'Date', time: 'Time', price: 'Price / person', seats: 'Seats', notOnTrip: 'Outside your dates',
    noDepartures: 'No departures open for booking.',
    schedule: 'Programme', day: (n) => `Day ${n}`, programme: 'Programme',
    includes: 'Included', excludes: 'Not included',
    child: 'Children', cancel: 'Cancellation policy', notes: 'Good to know',
    from: 'From', perPerson: '/person', forParty: (total, n) => `${total} for ${n}`,
    choose: 'Choose this tour', chosen: 'Chosen for your trip', unchoose: 'Remove',
    chooseDeparture: 'Choose', chosenDeparture: 'Chosen',
    notEnough: 'Not enough seats for your group', highlights: 'Highlights',
    onThisPage: 'On this page', photo: (i, n) => `Photo ${i} of ${n}`, prev: 'Previous photo', next: 'Next photo',
  },
}

/**
 * A tour's full page, laid out like a travel agency's: photos, the facts at a
 * glance, departures with prices, the programme day by day, what the price
 * covers and the policies — with the price and the choose button kept in view.
 *
 * `fits(departure)` says whether a departure falls in the traveller's trip;
 * others are listed but cannot be chosen. Without `onChoose` (the partner
 * portal's preview) nothing can be chosen.
 */
export default function TourDetail({ tour, lang, people = 1, fits = () => true, chosenId = null, onChoose, onBack }) {
  const c = C[lang]
  const departures = tour.departures ?? []
  const bookable = departures.filter((d) => fits(d) && d.available >= people)
  const chosen = departures.find((d) => d.id === chosenId) ?? null
  const shown = chosen ?? bookable[0] ?? departures[0] ?? null
  // "From" counts only departures the traveller can take, so it matches the
  // group total beside it.
  const priced = bookable.length ? bookable : departures
  const fromPrice = chosen ? Number(chosen.price) : priced.length ? Math.min(...priced.map((d) => Number(d.price))) : null
  const photos = [...new Set([tour.cover_url, ...(tour.gallery ?? [])].filter(Boolean))]
  const schedule = tour.schedule ?? []

  const sections = [
    ['tour-facts', c.facts],
    ['tour-prices', c.prices],
    ['tour-schedule', c.schedule],
    ...((tour.includes?.length || tour.excludes?.length) ? [['tour-includes', `${c.includes} / ${c.excludes.toLowerCase()}`]] : []),
    ...((tour.child_policy || tour.cancel_policy || tour.notes) ? [['tour-policies', c.cancel]] : []),
  ]
  const jump = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const facts = [
    [Flag, c.route, tour.destination],
    [Clock, c.duration, shown ? tourDurationLabel(shown, lang) : null],
    [CalendarBlank, c.departs, shown ? `${formatDay(shown.starts_at, lang)} · ${vnTime(shown.starts_at)}` : null],
    [Bus, c.transport, tour.transport],
    [MapPin, c.startPoint, tour.start_point],
    [MapPin, c.meeting, tour.meeting_point],
    [Users, c.operator, tour.operator_name],
  ].filter(([, , value]) => value)

  const cta = onChoose && (
    chosen ? (
      <button type="button" onClick={() => onChoose(null)} className="w-full rounded-full border-[1.5px] border-herb bg-herb/10 px-5 py-3 font-utility text-sm font-bold text-herb">
        <Check size={15} className="mr-1 inline" />{c.chosen} · {c.unchoose}
      </button>
    ) : (
      <button type="button" disabled={!bookable.length} onClick={() => onChoose(bookable[0])} className="w-full rounded-full bg-chili px-5 py-3 font-utility text-sm font-bold text-chili-ink shadow-soft transition-shadow hover:shadow-lifted disabled:opacity-50">
        {bookable.length ? c.choose : c.notEnough}
      </button>
    )
  )

  return (
    <article className="pb-24 lg:pb-0">
      {onBack && (
        <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 font-utility text-sm font-semibold text-ink-muted hover:text-chili">
          <ArrowLeft size={15} /> {c.back}
        </button>
      )}
      <nav aria-label="breadcrumb" className="mb-2 flex flex-wrap items-center gap-1.5 text-sm text-ink-faint">
        <span>{c.crumbs}</span><CaretRight size={11} /><span>{tour.destination}</span><CaretRight size={11} /><span className="text-ink-muted">{tour.title}</span>
      </nav>
      <h2 className="text-2xl font-bold leading-tight md:text-3xl">{tour.title}</h2>
      <p className="mt-1 text-sm text-ink-muted">{tour.operator_name}{shown && ` · ${tourDurationLabel(shown, lang)}`}</p>

      <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-8">
          <Gallery photos={photos} title={tour.title} c={c} />

          <section id="tour-facts" className="scroll-mt-24">
            <SectionTitle icon={Compass}>{c.facts}</SectionTitle>
            <dl className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
              {facts.map(([Icon, label, value]) => (
                <div key={label} className="grid grid-cols-[130px_1fr] gap-3 px-4 py-2.5 text-sm sm:grid-cols-[160px_1fr]">
                  <dt className="flex items-center gap-1.5 text-ink-faint"><Icon size={14} className="shrink-0 text-herb" />{label}</dt>
                  <dd className="min-w-0 font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            {(tour.summary || tour.description) && <p className="mt-4 whitespace-pre-line text-md leading-relaxed text-ink-muted">{tour.summary || tour.description}</p>}
            {tour.highlights?.length > 0 && (
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {tour.highlights.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm"><CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-herb" />{item}</li>
                ))}
              </ul>
            )}
          </section>

          <section id="tour-prices" className="scroll-mt-24">
            <SectionTitle icon={CalendarBlank}>{c.prices}</SectionTitle>
            {departures.length === 0 ? <p className="text-sm text-ink-muted">{c.noDepartures}</p> : (
              <div className="overflow-x-auto rounded-xl border border-line bg-surface">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="bg-paper-2 font-utility text-2xs uppercase tracking-wide text-ink-faint">
                    <tr><th className="px-4 py-2.5">{c.date}</th><th className="px-4 py-2.5">{c.time}</th><th className="px-4 py-2.5">{c.price}</th><th className="px-4 py-2.5">{c.seats}</th>{onChoose && <th className="px-4 py-2.5" />}</tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {departures.map((d) => {
                      const ok = fits(d) && d.available >= people
                      return (
                        <tr key={d.id} className={d.id === chosenId ? 'bg-herb/10' : ''}>
                          <td className="px-4 py-2.5 font-medium">{formatDay(d.starts_at, lang)}</td>
                          <td className="px-4 py-2.5 tabular text-ink-muted">{vnTime(d.starts_at)}–{vnTime(d.ends_at)}</td>
                          <td className="px-4 py-2.5 font-bold tabular text-chili">{tourMoney(d.price)}</td>
                          <td className="px-4 py-2.5 tabular">{d.available}</td>
                          {onChoose && (
                            <td className="px-4 py-2.5 text-right">
                              {d.id === chosenId
                                ? <span className="font-utility text-xs font-bold text-herb">{c.chosenDeparture}</span>
                                : ok
                                  ? <button type="button" onClick={() => onChoose(d)} className="rounded-full border-[1.5px] border-line-strong px-3 py-1 font-utility text-xs font-semibold hover:border-chili hover:text-chili">{c.chooseDeparture}</button>
                                  : <span className="text-xs text-ink-faint">{fits(d) ? c.notEnough : c.notOnTrip}</span>}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section id="tour-schedule" className="scroll-mt-24">
            <SectionTitle icon={Clock}>{c.schedule}</SectionTitle>
            {schedule.length > 0 ? (
              <div className="flex flex-col gap-2">
                {schedule.map((item, i) => <ScheduleItem key={i} item={item} label={schedule.length > 1 ? c.day(i + 1) : c.programme} open={i === 0} />)}
              </div>
            ) : <p className="whitespace-pre-line text-md leading-relaxed text-ink-muted">{tour.description}</p>}
          </section>

          {(tour.includes?.length > 0 || tour.excludes?.length > 0) && (
            <section id="tour-includes" className="grid scroll-mt-24 gap-6 sm:grid-cols-2">
              <List title={c.includes} items={tour.includes} icon={<CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-herb" />} />
              <List title={c.excludes} items={tour.excludes} icon={<XCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-chili" />} />
            </section>
          )}

          {(tour.child_policy || tour.cancel_policy || tour.notes) && (
            <section id="tour-policies" className="flex scroll-mt-24 flex-col gap-5">
              {[[c.child, tour.child_policy], [c.cancel, tour.cancel_policy], [c.notes, tour.notes]].filter(([, text]) => text).map(([title, text]) => (
                <div key={title}>
                  <h3 className="mb-2 text-lg font-bold">{title}</h3>
                  <p className="whitespace-pre-line rounded-xl border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-ink-muted">{text}</p>
                </div>
              ))}
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="border-b border-line px-4 py-3 font-bold text-chili">{tour.title}</div>
            <dl className="divide-y divide-line text-sm">
              {[[c.code, tour.id.slice(0, 8).toUpperCase()], ...facts.slice(1, 5).map(([, label, value]) => [label, value])].map(([label, value]) => (
                <div key={label} className="grid grid-cols-[100px_1fr] gap-2 px-4 py-2"><dt className="text-ink-faint">{label}</dt><dd className="min-w-0 font-medium">{value}</dd></div>
              ))}
            </dl>
          </div>
          <div className="rounded-xl bg-chili px-4 py-3 text-chili-ink">
            <span className="text-sm opacity-90">{c.from} </span>
            <span className="text-2xl font-bold tabular">{fromPrice != null ? tourMoney(fromPrice) : '—'}</span>
            <span className="text-sm opacity-90">{c.perPerson}</span>
            {shown && people > 1 && <div className="text-sm opacity-90">{c.forParty(tourMoney(Number(shown.price) * people), people)}</div>}
          </div>
          {tour.highlights?.length > 0 && (
            <div className="rounded-xl border border-line bg-surface px-4 py-3">
              <div className="mb-2 font-bold">{c.highlights}</div>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-ink-muted">{tour.highlights.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          )}
          {cta && <div className="hidden lg:block">{cta}</div>}
          <nav aria-label={c.onThisPage} className="hidden rounded-xl border border-line bg-surface py-1 lg:block">
            {sections.map(([id, label]) => (
              <button key={id} type="button" onClick={() => jump(id)} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-ink-muted hover:text-chili">
                <CaretRight size={11} className="text-chili" />{label}
              </button>
            ))}
          </nav>
        </aside>
      </div>

      {cta && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-line bg-surface px-4 py-3 shadow-lifted lg:hidden">
          <div className="min-w-0 flex-1">
            <div className="text-2xs text-ink-faint">{c.from}</div>
            <div className="text-lg font-bold tabular text-chili">{fromPrice != null ? tourMoney(fromPrice) : '—'}<span className="text-xs font-medium text-ink-muted">{c.perPerson}</span></div>
          </div>
          <div className="w-[58%] max-w-[260px]">{cta}</div>
        </div>
      )}
    </article>
  )
}

function formatDay(iso, lang) {
  return new Date(`${vnDate(iso)}T12:00:00`).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
}

function SectionTitle({ icon: Icon, children }) {
  return <h3 className="mb-3 flex items-center gap-2 text-xl font-bold"><Icon size={20} className="text-chili" />{children}</h3>
}

function List({ title, items = [], icon }) {
  if (!items?.length) return <div />
  return (
    <div>
      <h3 className="mb-2 text-lg font-bold">{title}</h3>
      <ul className="flex flex-col gap-1.5">{items.map((item) => <li key={item} className="flex items-start gap-2 text-sm">{icon}{item}</li>)}</ul>
    </div>
  )
}

function ScheduleItem({ item, label, open: startOpen }) {
  const [open, setOpen] = useState(startOpen)
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="font-semibold">
          <span className="text-chili">{label}</span> | {item.title}
          {item.meals && <span className="font-normal text-ink-muted"> ({item.meals})</span>}
        </span>
        <CaretDown size={15} className={`shrink-0 text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && item.body && <p className="whitespace-pre-line border-t border-line px-4 py-3 text-sm leading-relaxed text-ink-muted">{item.body}</p>}
    </div>
  )
}

function Gallery({ photos, title, c }) {
  const [index, setIndex] = useState(0)
  if (!photos.length) {
    return (
      <div className="flex aspect-[16/9] items-center justify-center rounded-2xl bg-gradient-to-br from-herb/25 via-paper-2 to-chili/20">
        <Compass size={56} className="text-herb/70" />
      </div>
    )
  }
  const go = (step) => setIndex((i) => (i + step + photos.length) % photos.length)
  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl bg-paper-2">
        <img src={photos[index]} alt={`${title} — ${c.photo(index + 1, photos.length)}`} referrerPolicy="no-referrer" loading="eager" className="aspect-[16/9] w-full object-cover" />
        {photos.length > 1 && (
          <>
            <button type="button" aria-label={c.prev} onClick={() => go(-1)} className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-surface/90 shadow-soft hover:text-chili"><CaretLeft size={18} /></button>
            <button type="button" aria-label={c.next} onClick={() => go(1)} className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-surface/90 shadow-soft hover:text-chili"><CaretRight size={18} /></button>
            <span className="absolute bottom-3 right-3 rounded-full bg-ink/70 px-2.5 py-1 font-utility text-2xs text-paper">{index + 1} / {photos.length}</span>
          </>
        )}
      </div>
      {photos.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {photos.map((src, i) => (
            <button key={src} type="button" aria-label={c.photo(i + 1, photos.length)} onClick={() => setIndex(i)} className={`h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 ${i === index ? 'border-chili' : 'border-transparent opacity-75 hover:opacity-100'}`}>
              <img src={src} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
