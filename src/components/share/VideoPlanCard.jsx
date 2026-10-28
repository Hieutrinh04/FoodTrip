import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapTrifold, CheckCircle } from '@phosphor-icons/react'
import { TRANSPORT } from '../../data/destinations.js'
import { sameVenue } from '../../../supabase/functions/_shared/placeNames.js'
import { draftFromVideo, saveVideoPlan, stopKey, withDetails } from '../../lib/videoPlan.js'

const button = 'inline-flex items-center justify-center gap-2 rounded-full border border-line-strong px-4 py-2.5 text-sm font-utility font-semibold hover:border-chili disabled:opacity-50 disabled:cursor-not-allowed'
const field = 'w-full rounded-xl border border-line-strong bg-surface px-3 py-2.5 outline-none focus:border-chili'

/**
 * "This video is an itinerary": the days and stops read from it, each matched
 * to a suggested venue. The person keeps or drops each stop (a stop whose
 * venue name matches is kept to begin with), sets party size, budget and
 * transport, and saves a trip like theirs to /trips.
 */
export default function VideoPlanCard({ plan, places, cityName, userId, onOpenDetails, vi }) {
  const t = (vn, en) => (vi ? vn : en)
  const byId = useMemo(() => new Map(places.map((p) => [p.placeId, p])), [places])
  const [keep, setKeep] = useState(() => new Set(plan.days.flatMap((day, d) => day
    .filter((s) => s.placeId && byId.has(s.placeId) && sameVenue(s.said, byId.get(s.placeId).name))
    .map((s) => stopKey(d, s)))))
  const [people, setPeople] = useState(2)
  const [budget, setBudget] = useState('')
  const [transport, setTransport] = useState('bike')
  const [status, setStatus] = useState('idle') // idle | saving | saved | error
  const [savedId, setSavedId] = useState(null)
  const kept = plan.days.reduce((n, day, d) => n + day.filter((s) => keep.has(stopKey(d, s))).length, 0)

  function toggle(key) {
    setKeep((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next })
    setStatus('idle')
  }

  async function create() {
    const perPerson = Number(String(budget).replace(/\D/g, ''))
    if (!kept || !perPerson || people < 1) return
    setStatus('saving')
    try {
      const keptIds = new Set(plan.days.flatMap((day, d) => day.filter((s) => keep.has(stopKey(d, s))).map((s) => s.placeId)))
      const draft = draftFromVideo({ plan, places: await withDetails(places, keptIds), keep, transport })
      setSavedId(await saveVideoPlan({ userId, draft, cityName, people, budget: perPerson, transport }))
      setStatus('saved')
    } catch { setStatus('error') }
  }

  return <section className="rounded-xl border border-herb bg-surface p-4 space-y-4" aria-label={t('Lịch trình trong video', 'Itinerary in the video')}>
    <div>
      <h3 className="font-bold">{t(`Video này là lịch trình ${plan.duration} ngày`, `This video is a ${plan.duration}-day itinerary`)}</h3>
      <p className="text-sm text-ink-muted mt-1">{t('FoodTrip đọc ngày và buổi từ nội dung video. Kiểm tra từng điểm, bỏ chọn điểm không đúng rồi tạo kế hoạch giống vậy cho bạn.', 'FoodTrip read the days and times from the video. Check each stop, untick any that is wrong, then create a plan like it.')}</p>
    </div>
    {plan.days.map((day, d) => <div key={d}>
      <div className="font-utility text-2xs font-bold uppercase tracking-wide text-ink-faint">{t(`Ngày ${d + 1}`, `Day ${d + 1}`)}</div>
      <ul className="mt-2 space-y-2">
        {day.map((stop) => {
          const key = stopKey(d, stop)
          const place = stop.placeId ? byId.get(stop.placeId) : null
          return <li key={key} className="flex items-start gap-3 rounded-lg bg-paper-2 px-3 py-2">
            <input type="checkbox" className="mt-1" disabled={!place} checked={keep.has(key)} onChange={() => toggle(key)} aria-label={place?.name ?? stop.said} />
            <span className="font-utility font-bold tabular text-ink-muted w-12 shrink-0">{stop.time}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold break-words">{place?.name ?? stop.said}</span>
              <span className="block text-xs text-ink-muted break-words">{place ? place.address : t(`Chưa tìm thấy “${stop.said}” trên bản đồ`, `“${stop.said}” was not found on the map`)}</span>
              {place && !sameVenue(stop.said, place.name) && <span className="block text-xs text-chili">{t(`Video nói “${stop.said}” — kiểm tra đúng quán chưa`, `The video says “${stop.said}” — check it is the same place`)}</span>}
            </span>
            {place && <button type="button" className="text-xs font-semibold text-chili hover:underline shrink-0" onClick={() => onOpenDetails(place)}>{t('Chi tiết', 'Details')}</button>}
          </li>
        })}
      </ul>
    </div>)}
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="block space-y-1 text-sm"><span>{t('Số người', 'People')}</span><input type="number" min={1} max={20} className={field} value={people} onChange={(e) => { setPeople(Math.max(1, Math.min(20, Number(e.target.value) || 1))); setStatus('idle') }} /></label>
      <label className="block space-y-1 text-sm"><span>{t('Ngân sách mỗi người (đ)', 'Budget per person (VND)')}</span><input inputMode="numeric" className={field} value={budget} placeholder="1.500.000" onChange={(e) => { const n = e.target.value.replace(/\D/g, '').slice(0, 10); setBudget(n ? Number(n).toLocaleString('vi-VN') : ''); setStatus('idle') }} /></label>
      <label className="block space-y-1 text-sm"><span>{t('Phương tiện', 'Transport')}</span><select className={field} value={transport} onChange={(e) => { setTransport(e.target.value); setStatus('idle') }}>{Object.entries(TRANSPORT).map(([key, label]) => <option key={key} value={key}>{label[vi ? 'vi' : 'en'] ?? label}</option>)}</select></label>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className={`${button} bg-herb text-herb-ink border-herb`} disabled={!kept || !budget || status === 'saving'} onClick={create}><MapTrifold size={16} />{status === 'saving' ? t('Đang tạo kế hoạch…', 'Creating plan…') : t(`Tạo kế hoạch giống video (${kept} điểm)`, `Create a plan like this (${kept} stops)`)}</button>
      {!budget && <span className="text-xs text-ink-faint">{t('Nhập ngân sách để tạo kế hoạch.', 'Enter a budget to create the plan.')}</span>}
    </div>
    {status === 'saved' && <p role="status" className="flex flex-wrap items-center gap-2 text-herb"><CheckCircle size={16} weight="fill" />{t('Đã tạo kế hoạch trong “Chuyến đi của tôi”.', 'Plan created in My trips.')} <Link to={savedId ? `/trips?open=${savedId}` : '/trips'} className="font-semibold underline">{t('Mở kế hoạch', 'Open the plan')}</Link></p>}
    {status === 'error' && <p role="alert" className="text-chili">{t('Chưa tạo được kế hoạch. Kiểm tra kết nối rồi thử lại.', 'Could not create the plan. Check your connection and try again.')}</p>}
  </section>
}
