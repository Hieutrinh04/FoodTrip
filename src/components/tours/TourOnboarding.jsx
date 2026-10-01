import { useEffect, useState } from 'react'
import { CheckCircle, Circle, ImageSquare } from '@phosphor-icons/react'
import { CITIES } from '../../data/destinations.js'
import { getCurrentTerms } from '../../lib/partner.js'
import { acceptTourTerms, tourError, tourReadiness, updateOperatorProfile, uploadTourPhoto, OPERATOR_TYPES } from '../../lib/tours.js'
import Spinner from '../ui/Spinner.jsx'

const INPUT = 'mt-1 block w-full rounded-xl border border-line-strong bg-paper px-3.5 py-2.5 text-md focus:border-chili'
const SAVE = 'inline-flex items-center gap-1.5 rounded-full bg-chili px-4 py-2 font-utility text-sm font-semibold text-chili-ink disabled:opacity-50'
const BUTTON = 'inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-utility text-2xs font-semibold transition-colors hover:border-chili hover:text-chili disabled:opacity-50'

const Check = ({ ok, children, hint }) => (
  <li className={`flex items-start gap-2 text-sm ${ok ? 'text-herb' : 'text-ink-muted'}`}>
    {ok ? <CheckCircle size={17} weight="fill" className="mt-0.5 shrink-0" /> : <Circle size={17} className="mt-0.5 shrink-0" />}
    <span>{children}{!ok && hint && <span className="block text-2xs text-ink-faint">{hint}</span>}</span>
  </li>
)

/**
 * The operator's own profile — what travellers read about who runs the tour —
 * and the tour terms. Both are on every tour's publish checklist.
 */
export function OperatorChecklist({ operator, onSaved }) {
  const [form, setForm] = useState(() => ({
    description: operator.description ?? '', logoUrl: operator.logo_url ?? '', website: operator.website ?? '',
    operatorType: operator.operator_type ?? 'food_tour', cities: operator.cities ?? [],
  }))
  const [terms, setTerms] = useState(null)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState({ description: operator.description ?? '', terms: operator.terms_accepted_at })
  useEffect(() => { getCurrentTerms('tour').then(setTerms).catch(() => setTerms(null)) }, [])

  const profileOk = saved.description.trim().length >= 30
  const termsOk = Boolean(saved.terms)

  async function run(key, fn, after) {
    setBusy(key); setError('')
    try { await fn(); after?.(); onSaved?.() } catch (err) { setError(tourError(err)) }
    setBusy('')
  }
  async function uploadLogo(file) {
    if (!file) return
    setBusy('logo'); setError('')
    try { const url = await uploadTourPhoto(operator.id, file); setForm((f) => ({ ...f, logoUrl: url })) } catch (err) { setError(tourError(err)) }
    setBusy('')
  }
  const toggleCity = (name) => setForm((f) => ({ ...f, cities: f.cities.includes(name) ? f.cities.filter((c) => c !== name) : [...f.cities, name].slice(0, 10) }))

  return (
    <section className="tour-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {operator.logo_url || form.logoUrl ? <img src={form.logoUrl || operator.logo_url} alt="" className="h-12 w-12 rounded-full object-cover" /> : <span className="grid h-12 w-12 place-items-center rounded-full bg-paper-2 text-ink-faint"><ImageSquare size={22} /></span>}
          <div>
            <h2 className="!m-0">{operator.name}</h2>
            <p className="!m-0 text-sm text-ink-muted">{OPERATOR_TYPES[operator.operator_type]?.vi ?? 'Đơn vị tour'}{operator.cities?.length ? ` · ${operator.cities.join(', ')}` : ''}</p>
          </div>
        </div>
        {!editing && <button type="button" className={BUTTON} onClick={() => setEditing(true)}>Sửa hồ sơ đơn vị</button>}
      </div>
      <ul className="!mt-4 grid gap-2 sm:grid-cols-2">
        <Check ok={profileOk} hint="Viết giới thiệu đơn vị từ 30 ký tự (bấm Sửa hồ sơ đơn vị).">Hồ sơ đơn vị có giới thiệu</Check>
        <Check ok={termsOk} hint="Đồng ý điều khoản đối tác tour bên dưới.">Đã đồng ý điều khoản đối tác tour{termsOk && operator.terms_version ? ` (v${operator.terms_version})` : ''}</Check>
      </ul>

      {editing && (
        <form className="!mt-4 grid gap-3" onSubmit={(e) => { e.preventDefault(); run('profile', () => updateOperatorProfile(operator.id, { description: form.description, logo_url: form.logoUrl, website: form.website, operator_type: form.operatorType, cities: form.cities }), () => { setSaved((s) => ({ ...s, description: form.description })); setEditing(false) }) }}>
          <label className={`${BUTTON} cursor-pointer self-start`}>
            <ImageSquare size={13} />{busy === 'logo' ? 'Đang tải ảnh…' : 'Tải logo / ảnh đại diện (≤ 3 MB)'}
            <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { uploadLogo(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold">Loại hình
              <select value={form.operatorType} onChange={(e) => setForm((f) => ({ ...f, operatorType: e.target.value }))} className={INPUT}>
                {Object.entries(OPERATOR_TYPES).map(([value, label]) => <option key={value} value={value}>{label.vi}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold">Website / fanpage<input maxLength={300} value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} className={INPUT} /></label>
          </div>
          <div>
            <div className="text-sm font-semibold">Tỉnh / thành phố hoạt động</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[...new Set([...CITIES.map((c) => c.name.vi), ...form.cities])].map((name) => (
                <button key={name} type="button" aria-pressed={form.cities.includes(name)} onClick={() => toggleCity(name)}
                  className={`rounded-full border-[1.5px] px-3 py-1 text-sm ${form.cities.includes(name) ? 'border-herb bg-herb text-herb-ink' : 'border-line-strong hover:border-chili'}`}>{name}</button>
              ))}
            </div>
          </div>
          <label className="block text-sm font-semibold">{`Giới thiệu đơn vị (${form.description.trim().length}/30+ ký tự)`}<textarea rows={3} maxLength={2000} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className={INPUT} /></label>
          <div className="flex gap-2"><button className={SAVE} disabled={Boolean(busy)}>{busy === 'profile' ? 'Đang lưu…' : 'Lưu hồ sơ'}</button><button type="button" className={BUTTON} onClick={() => setEditing(false)}>Huỷ</button></div>
        </form>
      )}

      {!termsOk && (
        terms ? (
          <div className="!mt-4 grid gap-3">
            <p className="text-sm">Hoa hồng {Number(terms.commission_pct)}% trên mỗi đơn hoàn thành · đơn vị tự thu tiền tour, đối soát hằng tháng.</p>
            <div className="max-h-[160px] overflow-y-auto rounded-xl border border-line bg-paper px-4 py-3 text-sm text-ink-muted">{terms.summary}</div>
            <div><button type="button" className={SAVE} disabled={Boolean(busy)} onClick={() => run('terms', () => acceptTourTerms(operator.id, terms.version), () => setSaved((s) => ({ ...s, terms: new Date().toISOString() })))}>Tôi đồng ý điều khoản</button></div>
          </div>
        ) : <Spinner label="Đang tải điều khoản…" />
      )}
      {error && <p role="alert" className="tour-error">{error}</p>}
    </section>
  )
}

const TOUR_ITEMS = [
  ['photos', 'Ít nhất 3 ảnh', 'Thêm ảnh trong "Nội dung trang tour".'],
  ['summary', 'Giới thiệu ngắn từ 30 ký tự', 'Viết "Giới thiệu ngắn" trong "Nội dung trang tour".'],
  ['schedule', 'Lịch trình theo ngày / chặng', 'Điền ít nhất một ngày trong "Nội dung trang tour".'],
  ['includes', 'Tour bao gồm', 'Liệt kê dịch vụ bao gồm trong "Nội dung trang tour".'],
  ['cancel_policy', 'Chính sách huỷ tour', 'Điền "Chính sách huỷ tour" trong "Nội dung trang tour".'],
  ['departure', 'Có ngày khởi hành sắp tới đang mở', 'Bấm "Thêm lịch khởi hành".'],
  ['operator', 'Hồ sơ đơn vị & điều khoản', 'Hoàn thành mục "Hồ sơ đơn vị" ở đầu trang.'],
]

/**
 * A tour's publish checklist — the server refuses to publish until every item
 * is done; this shows which. `onReady` tells the parent whether it may offer
 * the publish button.
 */
export function TourChecklist({ tourId, refresh = 0, onReady }) {
  const [ready, setReady] = useState(null)
  useEffect(() => {
    let active = true
    tourReadiness(tourId).then((r) => { if (active) { setReady(r); onReady?.(TOUR_ITEMS.every(([key]) => r[key])) } }).catch(() => { if (active) setReady({}) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourId, refresh])
  if (!ready) return <p className="text-sm text-ink-muted">Đang kiểm tra hồ sơ tour…</p>
  const done = TOUR_ITEMS.filter(([key]) => ready[key]).length
  return (
    <div className="rounded-xl border border-line bg-paper px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold">Sẵn sàng công bố</span>
        <span className="font-utility text-sm font-bold text-chili">{done}/{TOUR_ITEMS.length}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper-2"><div className="h-full rounded-full bg-herb" style={{ width: `${(done / TOUR_ITEMS.length) * 100}%` }} /></div>
      <ul className="!mt-3 grid gap-1.5 sm:grid-cols-2">
        {TOUR_ITEMS.map(([key, label, hint]) => <Check key={key} ok={Boolean(ready[key])} hint={hint}>{label}</Check>)}
      </ul>
    </div>
  )
}
