import { useEffect, useState } from 'react'
import { ArrowBendUpLeft, EyeSlash } from '@phosphor-icons/react'
import { Stars } from './Stars.jsx'
import { partnerReviews, replyToReview, reviewError } from '../../lib/reviews.js'
import { PortalCard } from '../portal/PortalShell.jsx'

const C = {
  vi: {
    title: 'Đánh giá của khách', average: 'Điểm trung bình', count: (n) => `${n} đánh giá hiển thị`,
    none: 'Chưa có đánh giá. Khách được mời đánh giá một ngày sau khi trả phòng hoặc sau khi tour kết thúc.',
    reply: 'Trả lời', editReply: 'Sửa câu trả lời', yourReply: 'Câu trả lời của bạn (hiển thị công khai)',
    placeholder: 'Cảm ơn khách, giải thích hoặc cho biết bạn sẽ cải thiện điều gì…',
    save: 'Đăng câu trả lời', saving: 'Đang lưu…', cancel: 'Huỷ', remove: 'Xoá câu trả lời',
    hidden: (note) => `FoodTrip đã ẩn đánh giá này${note ? `: ${note}` : ''}.`, unanswered: 'Chưa trả lời',
    tip: 'Trả lời lịch sự và cụ thể — du khách sau đọc cả đánh giá lẫn câu trả lời của bạn.',
    loading: 'Đang tải đánh giá…',
  },
  en: {
    title: 'Guest reviews', average: 'Average', count: (n) => `${n} visible reviews`,
    none: 'No reviews yet. Guests are invited to review the day after check-out or after the tour.',
    reply: 'Reply', editReply: 'Edit reply', yourReply: 'Your reply (public)',
    placeholder: 'Thank the guest, explain, or say what you will improve…',
    save: 'Post reply', saving: 'Saving…', cancel: 'Cancel', remove: 'Remove reply',
    hidden: (note) => `FoodTrip hid this review${note ? `: ${note}` : ''}.`, unanswered: 'Not answered',
    tip: 'Reply politely and specifically — future travellers read your answers too.',
    loading: 'Loading reviews…',
  },
}

const when = (iso, lang) => new Date(iso).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', { day: '2-digit', month: '2-digit', year: 'numeric' })

/** A partner portal's reviews section: a property's ('stay', property id) or an operator's ('tour', operator id). */
export default function PartnerReviews({ kind, ownerId, lang }) {
  const c = C[lang]
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let active = true
    partnerReviews(kind, ownerId)
      .then((result) => { if (active) { setData(result); setError('') } })
      .catch((err) => { if (active) setError(reviewError(err, lang)) })
    return () => { active = false }
  }, [kind, ownerId, tick, lang])

  const items = data?.items ?? []
  const unanswered = items.filter((r) => !r.reply && !r.hidden).length

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <div className="font-utility text-micro uppercase tracking-wide text-ink-faint">{c.average}</div>
          <div className="mt-1.5 flex items-center gap-2"><span className="font-utility text-2xl font-bold">{data?.rating != null ? Number(data.rating).toFixed(1) : '—'}</span>{data?.rating != null && <Stars value={data.rating} />}</div>
          <div className="mt-0.5 text-2xs text-ink-muted">{c.count(Number(data?.review_count ?? 0))}</div>
        </div>
        <div className={`rounded-2xl border bg-surface p-4 ${unanswered ? 'border-chili/50' : 'border-line'}`}>
          <div className="font-utility text-micro uppercase tracking-wide text-ink-faint">{c.unanswered}</div>
          <div className={`mt-1.5 font-utility text-2xl font-bold ${unanswered ? 'text-chili' : ''}`}>{unanswered}</div>
        </div>
        <p className="self-center text-sm text-ink-muted">{c.tip}</p>
      </div>
      <PortalCard title={c.title}>
        {error && <p role="alert" className="text-sm text-chili">{error}</p>}
        {!data && !error && <p className="text-sm text-ink-muted">{c.loading}</p>}
        {data && items.length === 0 && <p className="text-sm text-ink-muted">{c.none}</p>}
        <div className="flex flex-col divide-y divide-line">
          {items.map((review) => <ReviewRow key={review.id} review={review} c={c} lang={lang} onChanged={() => setTick((n) => n + 1)} />)}
        </div>
      </PortalCard>
    </div>
  )
}

function ReviewRow({ review, c, lang, onChanged }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(review.reply ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(value) {
    setBusy(true); setError('')
    try {
      await replyToReview(review.id, value)
      setEditing(false)
      onChanged()
    } catch (err) {
      setError(reviewError(err, lang))
    }
    setBusy(false)
  }

  return (
    <article className={`py-4 first:pt-0 last:pb-0 ${review.hidden ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm"><span className="font-semibold">{review.author || '—'}</span><span className="text-ink-faint"> · {[review.tour_title, review.context, when(review.created_at, lang)].filter(Boolean).join(' · ')}</span></div>
        <Stars value={review.rating} />
      </div>
      {review.comment && <p className="mt-2 whitespace-pre-line text-sm text-ink-muted">{review.comment}</p>}
      {review.hidden && <p className="mt-1 flex items-center gap-1 text-xs text-chili"><EyeSlash size={12} />{c.hidden(review.hidden_note)}</p>}
      {review.reply && !editing && (
        <div className="mt-2 rounded-lg border-l-2 border-herb bg-paper-2 px-3 py-2 text-sm text-ink-muted">{review.reply}</div>
      )}
      {editing ? (
        <form className="mt-2 space-y-2" onSubmit={(e) => { e.preventDefault(); save(text) }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} rows={3} placeholder={c.placeholder} aria-label={c.yourReply}
            className="w-full rounded-lg border-[1.5px] border-line-strong bg-paper px-3 py-2 text-sm outline-none focus:border-chili" />
          {error && <p role="alert" className="text-xs text-chili">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button disabled={busy || !text.trim()} className="rounded-full bg-chili px-4 py-1.5 font-utility text-xs font-semibold text-chili-ink disabled:opacity-60">{busy ? c.saving : c.save}</button>
            <button type="button" onClick={() => { setEditing(false); setText(review.reply ?? '') }} className="rounded-full border border-line px-4 py-1.5 font-utility text-xs font-semibold">{c.cancel}</button>
            {review.reply && <button type="button" disabled={busy} onClick={() => save('')} className="font-utility text-xs text-ink-faint hover:text-chili">{c.remove}</button>}
          </div>
        </form>
      ) : !review.hidden && (
        <button type="button" onClick={() => setEditing(true)} className="mt-2 inline-flex items-center gap-1 font-utility text-xs font-semibold text-chili hover:underline">
          <ArrowBendUpLeft size={12} /> {review.reply ? c.editReply : c.reply}
        </button>
      )}
    </article>
  )
}
