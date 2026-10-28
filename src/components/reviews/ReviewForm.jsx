import { useState } from 'react'
import { ChatCircleText, PencilSimple } from '@phosphor-icons/react'
import { Stars, StarInput } from './Stars.jsx'
import { submitReview, reviewError } from '../../lib/reviews.js'

const C = {
  vi: {
    write: 'Viết đánh giá', edit: 'Sửa đánh giá', yours: 'Đánh giá của bạn',
    placeholderStay: 'Phòng, vị trí, chủ nhà, bữa sáng… điều gì làm bạn hài lòng hoặc chưa?',
    placeholderTour: 'Hướng dẫn viên, món ăn, lịch trình… điều gì làm bạn hài lòng hoặc chưa?',
    public: 'Đánh giá được hiển thị công khai với tên viết tắt của bạn (ví dụ "Mai T.").',
    save: 'Gửi đánh giá', saving: 'Đang gửi…', cancel: 'Huỷ', pickStars: 'Hãy chọn số sao.',
    reply: (who) => `${who} trả lời:`, hotel: 'Khách sạn', operator: 'Đơn vị tour',
    hidden: 'Đánh giá này đang bị ẩn khỏi trang công khai.',
  },
  en: {
    write: 'Write a review', edit: 'Edit review', yours: 'Your review',
    placeholderStay: 'Room, location, host, breakfast… what did you like or not?',
    placeholderTour: 'Guide, food, schedule… what did you like or not?',
    public: 'Reviews are public, signed with your short name (e.g. "Mai T.").',
    save: 'Post review', saving: 'Posting…', cancel: 'Cancel', pickStars: 'Choose a star rating.',
    reply: (who) => `${who} replied:`, hotel: 'The hotel', operator: 'The operator',
    hidden: 'This review is hidden from the public page.',
  },
}

/**
 * The review of one stay ('stay', booking id) or one tour ('tour', reservation
 * id) on the traveller's booking card: a button to write it once the trip is
 * over, then the review itself, the partner's answer, and a way to edit it.
 */
export default function ReviewForm({ kind, refId, review, lang, onSaved }) {
  const c = C[lang]
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(review?.rating ?? 0)
  const [comment, setComment] = useState(review?.comment ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(event) {
    event.preventDefault()
    if (!rating) { setError(c.pickStars); return }
    setBusy(true); setError('')
    try {
      await submitReview(kind, refId, rating, comment)
      setOpen(false)
      onSaved?.()
    } catch (err) {
      setError(reviewError(err, lang))
    }
    setBusy(false)
  }

  if (open) {
    return (
      <form onSubmit={save} className="space-y-2.5 rounded-xl border border-line bg-paper p-3">
        <StarInput value={rating} onChange={(n) => { setRating(n); setError('') }} lang={lang} />
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder={kind === 'stay' ? c.placeholderStay : c.placeholderTour}
          aria-label={c.yours}
          className="w-full rounded-lg border-[1.5px] border-line-strong bg-surface px-3 py-2 text-sm outline-none focus:border-chili"
        />
        <p className="text-micro text-ink-faint">{c.public}</p>
        {error && <p role="alert" className="text-xs text-chili">{error}</p>}
        <div className="flex gap-2">
          <button disabled={busy} className="rounded-full bg-chili px-4 py-1.5 font-utility text-xs font-semibold text-chili-ink disabled:opacity-60">{busy ? c.saving : c.save}</button>
          <button type="button" onClick={() => { setOpen(false); setError('') }} className="rounded-full border border-line px-4 py-1.5 font-utility text-xs font-semibold">{c.cancel}</button>
        </div>
      </form>
    )
  }

  if (!review) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 self-start rounded-full bg-lantern/20 px-4 py-2 font-utility text-sm font-semibold text-ink transition-colors hover:bg-lantern/35">
        <ChatCircleText size={15} /> {c.write}
      </button>
    )
  }

  return (
    <div className="space-y-2 rounded-xl bg-paper-2 px-3 py-2.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-utility text-2xs font-bold uppercase tracking-wide text-ink-faint">{c.yours}</span>
        <Stars value={review.rating} />
      </div>
      {review.comment && <p className="whitespace-pre-line text-ink-muted">{review.comment}</p>}
      {review.hidden && <p className="text-xs text-chili">{c.hidden}</p>}
      {review.reply && (
        <div className="rounded-lg border-l-2 border-herb bg-surface px-3 py-2 text-xs">
          <div className="mb-0.5 font-semibold text-herb">{c.reply(kind === 'stay' ? c.hotel : c.operator)}</div>
          <p className="whitespace-pre-line text-ink-muted">{review.reply}</p>
        </div>
      )}
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 font-utility text-xs font-semibold text-chili hover:underline">
        <PencilSimple size={12} /> {c.edit}
      </button>
    </div>
  )
}
