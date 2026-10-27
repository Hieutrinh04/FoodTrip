import { useEffect, useState } from 'react'
import { Eye, EyeSlash } from '@phosphor-icons/react'
import { Stars } from './Stars.jsx'
import { adminListReviews, adminSetReviewHidden, reviewError } from '../../lib/reviews.js'

const FILTERS = [['all', 'Tất cả', 'All'], ['low', '1–2 sao', '1–2 stars'], ['hidden', 'Đã ẩn', 'Hidden'], ['stay', 'Lưu trú', 'Stays'], ['tour', 'Tour', 'Tours']]

/** Admin moderation: every review, newest first; hide one (with a reason, logged) or restore it. */
export default function AdminReviews({ t, lang }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let active = true
    adminListReviews().then((data) => { if (active) { setRows(data ?? []); setError('') } }).catch((err) => { if (active) setError(reviewError(err, lang)) })
    return () => { active = false }
  }, [tick, lang])

  const match = (r) => filter === 'all' || (filter === 'low' && r.rating <= 2) || (filter === 'hidden' && r.hidden) || r.kind === filter
  const list = (rows ?? []).filter(match)

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">{t('Chỉ khách đã ở hoặc đã đi tour mới đánh giá được. Ẩn khi đánh giá vi phạm (quảng cáo, xúc phạm, thông tin cá nhân) — không ẩn chỉ vì điểm thấp.', 'Only guests who stayed or toured can review. Hide reviews that break the rules (ads, abuse, personal data) — not merely low scores.')}</p>
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map(([id, vi, en]) => (
          <button key={id} type="button" onClick={() => setFilter(id)} aria-pressed={filter === id}
            className={`rounded-full px-3.5 py-1.5 font-utility text-2xs font-semibold ${filter === id ? 'bg-ink text-paper' : 'border border-line text-ink-muted'}`}>
            {t(vi, en)}<span className="ml-1 opacity-60">{(rows ?? []).filter((r) => id === 'all' || (id === 'low' && r.rating <= 2) || (id === 'hidden' && r.hidden) || r.kind === id).length}</span>
          </button>
        ))}
      </div>
      {error && <p role="alert" className="text-sm text-chili">{error}</p>}
      {!rows && !error && <p className="text-sm text-ink-muted">{t('Đang tải…', 'Loading…')}</p>}
      {rows && !list.length && <p className="text-sm text-ink-muted">{t('Không có đánh giá nào ở mục này.', 'No reviews here.')}</p>}
      <div className="flex flex-col gap-3">
        {list.map((r) => <Row key={r.id} r={r} t={t} lang={lang} onDone={() => setTick((n) => n + 1)} />)}
      </div>
    </div>
  )
}

function Row({ r, t, lang, onDone }) {
  const [hiding, setHiding] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function set(hidden) {
    if (hidden && note.trim().length < 3) { setError(t('Ghi lý do ẩn (ít nhất 3 ký tự).', 'Give a reason (at least 3 characters).')); return }
    setBusy(true); setError('')
    try { await adminSetReviewHidden(r.id, hidden, note); setHiding(false); onDone() } catch (err) { setError(reviewError(err, lang)) }
    setBusy(false)
  }

  return (
    <article className={`rounded-xl border bg-surface p-4 ${r.hidden ? 'border-chili/40' : 'border-line'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          <span className="mr-2 rounded-full bg-paper-2 px-2 py-0.5 font-utility text-micro font-bold uppercase">{r.kind === 'stay' ? t('Lưu trú', 'Stay') : 'Tour'}</span>
          <b>{r.subject}</b><span className="text-ink-faint"> · {r.author} · {[r.context, new Date(r.created_at).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-GB')].filter(Boolean).join(' · ')}</span>
        </span>
        <Stars value={r.rating} />
      </div>
      {r.comment && <p className="mt-2 whitespace-pre-line text-sm text-ink-muted">{r.comment}</p>}
      {r.reply && <p className="mt-2 rounded-lg border-l-2 border-herb bg-paper-2 px-3 py-1.5 text-xs text-ink-muted">{r.reply}</p>}
      {r.hidden && <p className="mt-2 text-xs text-chili">{t('Đã ẩn', 'Hidden')}{r.hidden_note ? `: ${r.hidden_note}` : ''}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {r.hidden ? (
          <button type="button" disabled={busy} onClick={() => set(false)} className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1 font-utility text-2xs font-semibold hover:border-herb hover:text-herb"><Eye size={12} />{t('Hiện lại', 'Restore')}</button>
        ) : hiding ? (
          <>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={t('Lý do ẩn (đối tác và khách sẽ thấy)', 'Reason (the partner and guest will see it)')} className="min-w-[220px] flex-1 rounded-lg border border-line-strong bg-paper px-3 py-1.5 text-sm" />
            <button type="button" disabled={busy} onClick={() => set(true)} className="rounded-full bg-chili px-3 py-1 font-utility text-2xs font-semibold text-chili-ink">{t('Ẩn đánh giá', 'Hide review')}</button>
            <button type="button" onClick={() => setHiding(false)} className="font-utility text-2xs text-ink-faint">{t('Huỷ', 'Cancel')}</button>
          </>
        ) : (
          <button type="button" onClick={() => setHiding(true)} className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1 font-utility text-2xs font-semibold hover:border-chili hover:text-chili"><EyeSlash size={12} />{t('Ẩn…', 'Hide…')}</button>
        )}
        {error && <span className="text-xs text-chili">{error}</span>}
      </div>
    </article>
  )
}
