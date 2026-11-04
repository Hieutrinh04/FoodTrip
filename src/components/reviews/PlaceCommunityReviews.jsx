import { useCallback, useEffect, useState } from 'react'
import { Star, BookmarkSimple } from '@phosphor-icons/react'
import { useAuth } from '../../auth/AuthContext.jsx'
import { useLoginPrompt } from '../../auth/LoginPromptContext.jsx'
import { deleteMyPlaceReview, fetchPlaceFacts, submitPlaceReview } from '../../lib/placeFacts.js'

const C = {
  vi: {
    title: 'Đánh giá của người dùng FoodTrip', unverified: 'Người viết chưa được xác minh đã đến quán.',
    saved: (n) => `${n.toLocaleString('vi-VN')} người đã lưu quán này`, summary: (r, n) => `${r.toLocaleString('vi-VN')}/5 · ${n} đánh giá`,
    none: 'Chưa có ai đánh giá trên FoodTrip.', anonymous: 'Người dùng FoodTrip',
    write: 'Viết đánh giá', edit: 'Sửa đánh giá của bạn', signIn: 'Đăng nhập để đánh giá', stars: (n) => `${n} sao`,
    comment: 'Nhận xét (không bắt buộc)', submit: 'Gửi', saving: 'Đang lưu…', remove: 'Xoá đánh giá', cancel: 'Thôi',
    pick: 'Chọn số sao.', failed: 'Chưa lưu được. Thử lại sau.', hidden: (note) => `Đánh giá của bạn đang bị ẩn${note ? `: ${note}` : '.'}`, edited: 'đã sửa',
  },
  en: {
    title: 'Reviews from FoodTrip users', unverified: 'Reviewers are not verified to have visited.',
    saved: (n) => `${n.toLocaleString('en-US')} ${n > 1 ? 'people' : 'person'} saved this place`, summary: (r, n) => `${r}/5 · ${n} review${n > 1 ? 's' : ''}`,
    none: 'No one has reviewed it on FoodTrip yet.', anonymous: 'FoodTrip user',
    write: 'Write a review', edit: 'Edit your review', signIn: 'Sign in to review', stars: (n) => `${n} star${n > 1 ? 's' : ''}`,
    comment: 'Comment (optional)', submit: 'Post', saving: 'Saving…', remove: 'Delete review', cancel: 'Cancel',
    pick: 'Choose a rating.', failed: 'Could not save. Try again later.', hidden: (note) => `Your review is hidden${note ? `: ${note}` : '.'}`, edited: 'edited',
  },
}

function Stars({ value, size = 13 }) {
  return <span className="inline-flex gap-0.5 text-lantern" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <Star key={i} size={size} weight={i < value ? 'fill' : 'regular'} />)}</span>
}

/**
 * FoodTrip's own word on a place: how many saved it and its users' reviews.
 * Renders nothing until the facts arrive, and nothing if they cannot.
 * `savedTick` changes when the person saves or unsaves, to refresh the count.
 */
export default function PlaceCommunityReviews({ placeId, lang, savedTick = 0 }) {
  const c = C[lang]
  const { user } = useAuth()
  const openLogin = useLoginPrompt()
  const [facts, setFacts] = useState(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ rating: 0, comment: '' })
  const [state, setState] = useState({ busy: false, error: null })

  const load = useCallback(() => fetchPlaceFacts(placeId).then(setFacts), [placeId])
  useEffect(() => { load() }, [load, user?.id, savedTick])

  if (!facts) return null
  const mine = facts.mine

  function start() {
    if (!user) return openLogin(c.signIn)
    setDraft({ rating: mine?.rating ?? 0, comment: mine?.comment ?? '' })
    setState({ busy: false, error: null })
    setEditing(true)
  }
  async function save(e) {
    e.preventDefault()
    if (!draft.rating) return setState({ busy: false, error: c.pick })
    setState({ busy: true, error: null })
    try { await submitPlaceReview(placeId, draft.rating, draft.comment.slice(0, 1000)); setEditing(false); await load() } catch { setState({ busy: false, error: c.failed }); return }
    setState({ busy: false, error: null })
  }
  async function remove() {
    setState({ busy: true, error: null })
    try { await deleteMyPlaceReview(placeId); setEditing(false); await load() } catch { setState({ busy: false, error: c.failed }); return }
    setState({ busy: false, error: null })
  }

  return (
    <section className="mx-auto mt-14 max-w-[1180px] px-5 md:px-8" aria-labelledby="ft-reviews-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="ft-reviews-title" className="text-xl font-bold">{c.title}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
            {facts.reviewCount > 0 && <span className="inline-flex items-center gap-1.5"><Stars value={Math.round(facts.rating)} />{c.summary(facts.rating, facts.reviewCount)}</span>}
            {facts.saved > 0 && <span className="inline-flex items-center gap-1"><BookmarkSimple size={13} weight="fill" className="text-herb" />{c.saved(facts.saved)}</span>}
          </p>
        </div>
        {!editing && <button type="button" onClick={start} className="rounded-full border-[1.5px] border-line-strong px-4 py-2 font-utility text-sm font-semibold hover:border-chili hover:text-chili">{!user ? c.signIn : mine ? c.edit : c.write}</button>}
      </div>
      <p className="mt-1 text-xs text-ink-faint">{c.unverified}</p>
      {mine?.hidden && <p className="mt-3 rounded-lg bg-chili/10 px-3 py-2 text-sm text-chili">{c.hidden(mine.hidden_note)}</p>}

      {editing && <form onSubmit={save} className="mt-4 rounded-xl border border-line bg-surface p-4">
        <fieldset><legend className="sr-only">{c.write}</legend>
          <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setDraft((d) => ({ ...d, rating: n }))} aria-label={c.stars(n)} aria-pressed={draft.rating === n} className="rounded p-1 text-lantern hover:scale-110">
              <Star size={24} weight={n <= draft.rating ? 'fill' : 'regular'} />
            </button>))}</div>
        </fieldset>
        <label className="mt-3 block text-sm font-semibold">{c.comment}
          <textarea value={draft.comment} onChange={(e) => setDraft((d) => ({ ...d, comment: e.target.value }))} rows={3} maxLength={1000} className="mt-1 w-full rounded-lg border border-line-strong bg-paper px-3 py-2 text-sm outline-none focus:border-chili" />
        </label>
        {state.error && <p role="alert" className="mt-2 text-sm text-chili">{state.error}</p>}
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {mine && <button type="button" disabled={state.busy} onClick={remove} className="mr-auto rounded-full border border-chili/40 px-4 py-2 font-utility text-sm font-semibold text-chili">{c.remove}</button>}
          <button type="button" onClick={() => setEditing(false)} className="rounded-full border border-line px-4 py-2 font-utility text-sm font-semibold">{c.cancel}</button>
          <button type="submit" disabled={state.busy} className="rounded-full bg-chili px-4 py-2 font-utility text-sm font-semibold text-chili-ink disabled:opacity-60">{state.busy ? c.saving : c.submit}</button>
        </div>
      </form>}

      {facts.items.length > 0
        ? <ul className="mt-4 grid gap-3 md:grid-cols-2">{facts.items.map((r) => (
          <li key={r.id} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-2"><span className="font-semibold">{r.author || c.anonymous}</span><Stars value={r.rating} /></div>
            {r.comment && <p className="mt-2 text-sm text-ink-muted">{r.comment}</p>}
            <div className="mt-2 text-2xs text-ink-faint">{new Date(r.created_at).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-GB')}{r.updated_at && r.updated_at !== r.created_at ? ` · ${c.edited}` : ''}</div>
          </li>))}</ul>
        : !editing && <p className="mt-4 text-sm text-ink-muted">{c.none}</p>}
    </section>
  )
}
