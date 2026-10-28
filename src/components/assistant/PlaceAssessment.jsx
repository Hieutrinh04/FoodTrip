import { useEffect, useRef, useState } from 'react'
import { Sparkle, SpinnerGap } from '@phosphor-icons/react'
import { assessPlace } from '../../lib/placeAssessment.js'

/** Inline so the report stays visible inside map drawers, above the floating chat. */
export default function PlaceAssessment({ place, details = null, lang = 'vi' }) {
  const [state, setState] = useState({ busy: false, result: null, error: false })
  const generation = useRef(0)
  const locked = useRef(false)
  const vi = lang === 'vi'
  useEffect(() => () => { generation.current++ }, [])
  async function analyze() {
    if (locked.current) return
    locked.current = true
    const request = ++generation.current
    setState({ busy: true, result: null, error: false })
    try {
      const result = await assessPlace(place, details, lang)
      if (request === generation.current) setState({ busy: false, result, error: false })
    } catch {
      if (request === generation.current) setState({ busy: false, result: null, error: true })
    } finally { locked.current = false }
  }
  return <section className="my-3 rounded-xl border border-chili/30 bg-paper p-3" aria-label={vi ? 'AI đánh giá quán' : 'AI place assessment'}>
    <button type="button" onClick={analyze} disabled={state.busy} aria-expanded={Boolean(state.result)} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-chili px-4 py-2.5 font-utility text-sm font-semibold text-chili-ink disabled:opacity-60">
      {state.busy ? <SpinnerGap size={17} className="animate-spin" /> : <Sparkle size={17} weight="fill" />}
      {state.busy ? (vi ? 'Đang đọc dữ liệu và nhận xét…' : 'Reading data and reviews…') : state.result ? (vi ? 'Phân tích lại quán này' : 'Analyze this place again') : (vi ? 'AI đánh giá quán' : 'Ask AI to assess this place')}
    </button>
    <p className="mt-2 text-xs leading-relaxed text-ink-muted">{vi ? 'Tổng hợp điểm Google, thông tin quán và nhận xét đã tải để giúp bạn cân nhắc trước khi đi.' : 'Analyze Google ratings, listing details and loaded reviews to help you decide before visiting.'}</p>
    <div aria-live="polite" aria-busy={state.busy}>
      {state.error && <p role="alert" className="mt-3 text-sm text-chili">{vi ? 'Chưa phân tích được. Bạn bấm lại để thử nhé.' : 'Could not analyze this place. Please try again.'}</p>}
      {state.result && <div className="mt-3 border-t border-line pt-3">
        <div className="mb-2 font-utility text-micro font-semibold text-ink-faint">{state.result.source === 'model' ? (vi ? 'AI phân tích từ dữ liệu quán' : 'AI analysis of place data') : (vi ? 'Tổng hợp từ dữ liệu hiện có' : 'Analysis of available data')}</div>
        <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{state.result.text}</p>
      </div>}
    </div>
  </section>
}
