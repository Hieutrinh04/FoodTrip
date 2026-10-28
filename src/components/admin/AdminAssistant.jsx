import { useCallback, useEffect, useState } from 'react'
import { ArrowsClockwise, DownloadSimple, ThumbsDown, ThumbsUp, Trash } from '@phosphor-icons/react'
import * as admin from '../../lib/admin.js'
import { INTENTS } from '../../../supabase/functions/_shared/assistant/intents.js'
import Spinner from '../ui/Spinner.jsx'

const BUTTON = 'inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-utility text-2xs font-semibold transition-colors hover:border-chili hover:text-chili disabled:opacity-50'
const pct = (n, of) => (of ? `${Math.round((n / of) * 100)}%` : '—')

/**
 * Admin → Trợ lý: what people asked the assistant and what it understood.
 * An administrator corrects the intent where it was wrong; corrected messages
 * export as the next training round's labelled data (ml/assistant).
 */
export default function AdminAssistant({ t, lang }) {
  const [show, setShow] = useState('wrong')
  const [pageIndex, setPageIndex] = useState(0)
  const [list, setList] = useState({ status: 'loading', rows: [], count: 0 })
  const [stats, setStats] = useState(null)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => { setPageIndex(0) }, [show])
  useEffect(() => {
    let live = true
    setList((l) => ({ ...l, status: 'loading' }))
    admin.listAssistantMessages({ show, pageIndex })
      .then((r) => { if (live) setList({ status: 'ready', ...r }) })
      .catch(() => { if (live) setList({ status: 'error', rows: [], count: 0 }) })
    admin.assistantStats().then((s) => { if (live) setStats(s) }).catch(() => { if (live) setStats(null) })
    return () => { live = false }
  }, [show, pageIndex, tick])

  async function act(id, action) {
    setBusy(id); setError('')
    try { await action(); reload() } catch { setError(t('Chưa lưu được — kiểm tra quyền quản trị và migration 20261028090000.', 'Could not save — check admin rights and migration 20261028090000.')) }
    setBusy(null)
  }

  async function exportJsonl() {
    setBusy('export')
    try {
      const text = await admin.reviewedAssistantJsonl()
      const url = URL.createObjectURL(new Blob([text], { type: 'application/x-ndjson;charset=utf-8' }))
      Object.assign(document.createElement('a'), { href: url, download: `assistant-reviewed-${new Date().toISOString().slice(0, 10)}.jsonl` }).click()
      URL.revokeObjectURL(url)
    } catch { setError(t('Chưa xuất được.', 'Export failed.')) }
    setBusy(null)
  }

  const rated = stats ? stats.helpful + stats.wrong : 0
  const pages = Math.max(1, Math.ceil(list.count / admin.PAGE_SIZE))
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 md:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{t('Tin nhắn gửi trợ lý', 'Assistant messages')}<span className="ml-2 font-utility text-sm font-semibold text-ink-faint">{list.count.toLocaleString('vi-VN')}</span></h2>
        <div className="flex flex-wrap items-center gap-2">
          <select value={show} onChange={(e) => setShow(e.target.value)} className="rounded-full border border-line bg-surface px-3 py-1.5 font-utility text-2xs font-semibold">
            <option value="wrong">{t('Bị đánh giá chưa đúng (👎)', 'Marked wrong (👎)')}</option>
            <option value="unsure">{t('Ngoài phạm vi / chưa chắc', 'Out of scope / unsure')}</option>
            <option value="unreviewed">{t('Chưa duyệt', 'Not reviewed')}</option>
            <option value="all">{t('Tất cả', 'All')}</option>
          </select>
          <button type="button" onClick={reload} className={BUTTON}><ArrowsClockwise size={14} />{t('Tải lại', 'Reload')}</button>
          <button type="button" onClick={exportJsonl} disabled={busy === 'export' || !stats?.reviewed} className={BUTTON}><DownloadSimple size={14} />{t('Xuất JSONL đã duyệt', 'Export reviewed JSONL')}</button>
        </div>
      </div>

      {stats && <dl className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[[t('Tin nhắn', 'Messages'), stats.total.toLocaleString('vi-VN')],
          [t('Hữu ích (trong số được chấm)', 'Helpful (of rated)'), `${pct(stats.helpful, rated)} · ${rated}`],
          [t('Mô hình đã đọc', 'Read by the model'), pct(stats.model, stats.total)],
          [t('Đã duyệt nhãn', 'Reviewed'), stats.reviewed.toLocaleString('vi-VN')]].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-line bg-paper px-3 py-2"><dt className="text-2xs text-ink-faint">{k}</dt><dd className="mt-0.5 font-bold tabular">{v}</dd></div>))}
      </dl>}

      {error && <p role="alert" className="mb-3 rounded-xl bg-chili/10 px-4 py-2.5 text-sm text-chili">{error}</p>}
      {list.status === 'loading' && !list.rows.length && <Spinner label={t('Đang tải…', 'Loading…')} />}
      {list.status === 'error' && <p role="alert" className="rounded-xl bg-chili/10 px-4 py-3 text-sm text-chili">{t('Không tải được — migration 20261028090000 đã được áp dụng chưa?', 'Could not load — has migration 20261028090000 been applied?')}</p>}
      {list.status === 'ready' && !list.rows.length && <p className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-ink-muted">{t('Không có tin nhắn nào trong mục này.', 'Nothing here.')}</p>}

      {list.rows.length > 0 && <ul className={`divide-y divide-line ${list.status === 'loading' ? 'opacity-60' : ''}`}>
        {list.rows.map((m) => (
          <li key={m.id} className="py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="min-w-0 flex-1 text-sm font-semibold">{m.text}</p>
              <span className="font-utility text-micro text-ink-faint">{new Date(m.created_at).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
              <span>{t('Hiểu là', 'Read as')} <b className="text-ink">{m.intent}</b> · {m.source === 'model' ? t('mô hình', 'model') : t('quy tắc', 'rules')} {m.confidence != null && `· ${Math.round(m.confidence * 100)}%`}</span>
              {m.helpful === true && <ThumbsUp size={13} className="text-herb" />}
              {m.helpful === false && <ThumbsDown size={13} className="text-chili" />}
              {m.slots?.length > 0 && <span className="text-ink-faint">{m.slots.map((s) => `${s.type}: ${s.text}`).join(' · ')}</span>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="text-xs text-ink-muted">{t('Ý định đúng', 'Correct intent')}
                <select value={m.reviewed_intent ?? ''} disabled={busy === m.id} onChange={(e) => act(m.id, () => admin.reviewAssistantMessage(m.id, e.target.value || null))}
                  className="ml-2 rounded-full border border-line bg-paper px-2.5 py-1 font-utility text-2xs font-semibold">
                  <option value="">{t('— chưa duyệt —', '— not reviewed —')}</option>
                  {INTENTS.map((i) => <option key={i.id} value={i.id}>{i.id} · {lang === 'vi' ? i.label : i.id.replace(/_/g, ' ')}</option>)}
                </select>
              </label>
              {!m.reviewed_intent && <button type="button" disabled={busy === m.id} onClick={() => act(m.id, () => admin.reviewAssistantMessage(m.id, m.intent))} className={BUTTON}>{t('Đúng rồi', 'It was right')}</button>}
              <button type="button" disabled={busy === m.id} onClick={() => window.confirm(t('Xoá tin nhắn này?', 'Delete this message?')) && act(m.id, () => admin.deleteAssistantMessage(m.id))}
                className="inline-flex items-center gap-1.5 rounded-full border border-chili/40 px-3 py-1.5 font-utility text-2xs font-semibold text-chili hover:bg-chili hover:text-chili-ink"><Trash size={13} />{t('Xoá', 'Delete')}</button>
            </div>
          </li>
        ))}
      </ul>}

      {pages > 1 && <div className="mt-4 flex items-center justify-end gap-2 font-utility text-xs">
        <button type="button" disabled={pageIndex === 0} onClick={() => setPageIndex((n) => n - 1)} className={BUTTON}>←</button>
        <span>{pageIndex + 1} / {pages}</span>
        <button type="button" disabled={pageIndex + 1 >= pages} onClick={() => setPageIndex((n) => n + 1)} className={BUTTON}>→</button>
      </div>}
    </div>
  )
}
