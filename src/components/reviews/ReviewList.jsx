import { useEffect, useState } from 'react'
import { ChatCircleText, SealCheck } from '@phosphor-icons/react'
import { Stars } from './Stars.jsx'
import { reviewsFor } from '../../lib/reviews.js'

const PAGE = 6

const C = {
  vi: {
    titleStay: 'Đánh giá của khách đã ở', titleTour: 'Đánh giá của khách đã đi tour',
    verified: 'Chỉ khách đã ở hoặc đã đi tour qua FoodTrip mới đánh giá được.',
    count: (n) => `${n} đánh giá`,
    none: 'Chưa có đánh giá nào. Khách đặt qua FoodTrip sẽ được mời đánh giá sau chuyến đi.',
    more: 'Xem thêm đánh giá', loading: 'Đang tải đánh giá…', error: 'Chưa tải được đánh giá.',
    reply: (who) => `${who} trả lời`, hotel: 'Khách sạn', operator: 'Đơn vị tour', edited: 'đã sửa',
  },
  en: {
    titleStay: 'Reviews from guests who stayed', titleTour: 'Reviews from guests who went',
    verified: 'Only guests who stayed or toured through FoodTrip can review.',
    count: (n) => (n === 1 ? '1 review' : `${n} reviews`),
    none: 'No reviews yet. Guests who book through FoodTrip are invited to review after their trip.',
    more: 'More reviews', loading: 'Loading reviews…', error: 'Could not load reviews.',
    reply: (who) => `Reply from ${who.toLowerCase()}`, hotel: 'The hotel', operator: 'The operator', edited: 'edited',
  },
}

const when = (iso, lang) => new Date(iso).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', { month: 'long', year: 'numeric' })

/**
 * The public reviews of a partner hotel ('stay', hotel id) or a tour ('tour',
 * tour id): the average with its spread, then the reviews newest first with
 * the partner's answers.
 */
export default function ReviewList({ kind, target, lang, className = '' }) {
  const c = C[lang]
  const [data, setData] = useState(null)
  const [items, setItems] = useState([])
  const [status, setStatus] = useState('loading')
  const [more, setMore] = useState(false)

  useEffect(() => {
    if (!target) return undefined
    let active = true
    setStatus('loading')
    reviewsFor(kind, target, { limit: PAGE })
      .then((result) => { if (active) { setData(result); setItems(result.items ?? []); setStatus('ready') } })
      .catch(() => { if (active) setStatus('error') })
    return () => { active = false }
  }, [kind, target])

  async function loadMore() {
    setMore(true)
    try {
      const result = await reviewsFor(kind, target, { limit: PAGE, offset: items.length })
      setItems((old) => [...old, ...(result.items ?? [])])
    } catch { /* the button stays for another try */ }
    setMore(false)
  }

  const count = Number(data?.review_count ?? 0)
  const breakdown = data?.breakdown ?? {}

  return (
    <section className={className}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xl font-bold"><ChatCircleText size={20} className="text-chili" />{kind === 'stay' ? c.titleStay : c.titleTour}</h2>
        <span className="flex items-center gap-1 text-xs text-ink-faint"><SealCheck size={13} className="text-herb" />{c.verified}</span>
      </div>
      {status === 'loading' && <p className="text-sm text-ink-muted">{c.loading}</p>}
      {status === 'error' && <p className="text-sm text-ink-muted">{c.error}</p>}
      {status === 'ready' && count === 0 && <p className="rounded-xl border border-dashed border-line-strong px-4 py-5 text-sm text-ink-muted">{c.none}</p>}
      {status === 'ready' && count > 0 && (
        <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
          <div className="self-start rounded-xl border border-line bg-surface p-4">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold tabular">{Number(data.rating).toFixed(1)}</span>
              <span className="text-sm text-ink-faint">/ 5</span>
            </div>
            <Stars value={data.rating} size={15} className="mt-1" />
            <div className="mt-1 text-sm text-ink-muted">{c.count(count)}</div>
            <div className="mt-3 flex flex-col gap-1">
              {[5, 4, 3, 2, 1].map((n) => {
                const k = Number(breakdown[n] ?? 0)
                return (
                  <div key={n} className="flex items-center gap-2 text-xs text-ink-muted">
                    <span className="w-3 tabular">{n}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-2"><span className="block h-full rounded-full bg-lantern" style={{ width: `${(k / count) * 100}%` }} /></span>
                    <span className="w-5 text-right tabular">{k}</span>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            {items.map((review) => (
              <article key={review.id} className="rounded-xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-paper-2 font-bold text-ink-muted">{(review.author?.[0] ?? '?').toUpperCase()}</span>
                    <div>
                      <div className="text-sm font-semibold">{review.author || '—'}</div>
                      <div className="text-micro text-ink-faint">{[review.context, when(review.created_at, lang)].filter(Boolean).join(' · ')}{review.updated_at && review.updated_at !== review.created_at && new Date(review.updated_at) - new Date(review.created_at) > 60000 ? ` · ${c.edited}` : ''}</div>
                    </div>
                  </div>
                  <Stars value={review.rating} />
                </div>
                {review.comment && <p className="mt-2.5 whitespace-pre-line text-sm leading-relaxed text-ink-muted">{review.comment}</p>}
                {review.reply && (
                  <div className="mt-3 rounded-lg border-l-2 border-herb bg-paper-2 px-3 py-2 text-sm">
                    <div className="mb-0.5 font-utility text-2xs font-bold uppercase tracking-wide text-herb">{c.reply(kind === 'stay' ? c.hotel : c.operator)}</div>
                    <p className="whitespace-pre-line text-ink-muted">{review.reply}</p>
                  </div>
                )}
              </article>
            ))}
            {items.length < count && (
              <button type="button" disabled={more} onClick={loadMore} className="self-start rounded-full border-[1.5px] border-line-strong px-4 py-2 font-utility text-sm font-semibold hover:border-chili hover:text-chili disabled:opacity-60">{c.more}</button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
