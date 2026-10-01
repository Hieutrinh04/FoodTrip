import { useEffect, useState } from 'react'
import { Compass } from '@phosphor-icons/react'
import { CITIES } from '../../data/destinations.js'
import { getCurrentTerms } from '../../lib/partner.js'
import { applyAsOperator, tourError, OPERATOR_TYPES } from '../../lib/tours.js'
import Spinner from '../ui/Spinner.jsx'

const INPUT = 'mt-1 block w-full rounded-xl border border-line-strong bg-paper px-3.5 py-2.5 text-md focus:border-chili'
const BUTTON = 'inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 font-utility text-sm font-semibold transition-colors hover:border-chili hover:text-chili'

/**
 * A tour operator's sign-up — the same four steps as a place to stay, the way
 * Agoda and Traveloka onboard experience partners: the operator, who is
 * applying and its papers, the tour partner terms, then a review. Profile,
 * photos and tours come after approval, in the publish checklist.
 */
export default function TourApplication({ rejected, onDone, lang = 'vi' }) {
  const t = (vi, en) => (lang === 'vi' ? vi : en)
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({
    name: '', operatorType: 'food_tour', cities: [], otherCity: '', website: '', description: '',
    contactName: '', contactRole: 'owner', phone: '', travelLicense: '', businessLicense: '', guideCard: '', taxCode: '',
  })
  const [terms, setTerms] = useState(null)
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  useEffect(() => { getCurrentTerms('tour').then(setTerms).catch(() => setTerms(null)) }, [])

  const STEPS = [t('Đơn vị', 'Operator'), t('Liên hệ & pháp lý', 'Contact & papers'), t('Điều khoản', 'Terms'), t('Xem lại & gửi', 'Review & send')]
  const toggleCity = (name) => setForm((f) => ({ ...f, cities: f.cities.includes(name) ? f.cities.filter((c) => c !== name) : [...f.cities, name].slice(0, 10) }))
  function addOtherCity() {
    const name = form.otherCity.trim()
    if (name.length >= 2 && !form.cities.includes(name)) setForm((f) => ({ ...f, cities: [...f.cities, name].slice(0, 10), otherCity: '' }))
  }

  function problem(at) {
    if (at === 0) {
      if (form.name.trim().length < 2) return t('Nhập tên đơn vị.', 'Enter the operator name.')
      if (!form.cities.length) return t('Chọn ít nhất một tỉnh / thành phố hoạt động.', 'Pick at least one city you operate in.')
      if (form.website.trim() && !/^https?:\/\//.test(form.website.trim())) return t('Website / fanpage phải bắt đầu bằng http:// hoặc https://', 'The website must start with http:// or https://')
    }
    if (at === 1) {
      if (form.contactName.trim().length < 2) return t('Nhập họ tên người liên hệ.', 'Enter the contact name.')
      if (form.phone.trim().length < 8) return t('Nhập số điện thoại để FoodTrip gọi xác minh.', 'Enter a phone number FoodTrip can call.')
      if (form.taxCode.trim() && !/^[0-9-]{10,14}$/.test(form.taxCode.trim())) return t('Mã số thuế gồm 10–14 chữ số.', 'A tax code has 10–14 digits.')
    }
    if (at === 2 && !agreed) return t('Hãy đọc và đồng ý điều khoản đối tác tour.', 'Please read and accept the tour partner terms.')
    return ''
  }
  function next() { const p = problem(step); setError(p); if (!p) setStep(step + 1) }

  async function submit() {
    const p = [0, 1, 2].map(problem).find(Boolean)
    if (p) { setError(p); return }
    setBusy(true); setError('')
    try {
      await applyAsOperator({
        name: form.name, operator_type: form.operatorType, cities: form.cities, website: form.website, description: form.description,
        contact_name: form.contactName, contact_role: form.contactRole, phone: form.phone,
        travel_license: form.travelLicense, business_license: form.businessLicense, guide_card: form.guideCard, tax_code: form.taxCode,
        terms_version: terms?.version,
      })
      onDone()
    } catch (err) {
      setError(tourError(err)); setBusy(false)
    }
  }

  const papers = [form.travelLicense && `${t('GP lữ hành', 'Travel licence')} ${form.travelLicense}`, form.businessLicense && `GPKD ${form.businessLicense}`,
    form.guideCard && `${t('Thẻ HDV', 'Guide card')} ${form.guideCard}`, form.taxCode && `MST ${form.taxCode}`].filter(Boolean).join(' · ')
  const review = [
    [t('Đơn vị', 'Operator'), `${form.name} · ${OPERATOR_TYPES[form.operatorType][lang]}`, 0],
    [t('Hoạt động tại', 'Operates in'), form.cities.join(', '), 0],
    [t('Người liên hệ', 'Contact'), `${form.contactName} (${form.contactRole === 'owner' ? t('chủ đơn vị', 'owner') : t('quản lý', 'manager')}) · ${form.phone}`, 1],
    [t('Pháp lý', 'Papers'), papers || t('Chưa khai', 'None given'), 1],
    [t('Điều khoản', 'Terms'), terms ? t(`Phiên bản ${terms.version} — hoa hồng ${Number(terms.commission_pct)}%, đã đồng ý`, `Version ${terms.version} — ${Number(terms.commission_pct)}% commission, accepted`) : '—', 2],
  ]

  return (
    <section className="mt-6 grid gap-8 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <div>
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface text-chili shadow-soft"><Compass size={24} weight="duotone" /></div>
        <h2 className="text-2xl font-bold">{t('Đưa tour của bạn vào lịch trình du khách', 'Put your tours into travellers’ itineraries')}</h2>
        <ol className="mt-4 space-y-3 text-md text-ink-muted">
          {[
            [t('Đăng ký (5 phút)', 'Sign up (5 minutes)'), t('Thông tin đơn vị, người liên hệ, giấy phép và đồng ý điều khoản.', 'Operator, contact, licences and the partner terms.')],
            [t('Xác minh', 'Verification'), t('FoodTrip gọi điện xác minh và duyệt trong 1–3 ngày làm việc.', 'FoodTrip calls to verify and approves within 1–3 working days.')],
            [t('Tạo tour', 'Build your tours'), t('Ảnh, giới thiệu, lịch trình từng ngày, bao gồm, chính sách huỷ, ngày khởi hành.', 'Photos, introduction, day-by-day programme, inclusions, cancellation policy, departures.')],
            [t('Công bố', 'Publish'), t('Tour hiện ở bước "Tự túc / Có tour" khi du khách lên lịch trình đúng nơi, đúng ngày.', 'Your tours appear in the "own way / tour" step for travellers there on those days.')],
          ].map(([title, body], i) => (
            <li key={title} className="flex gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-chili/10 font-utility text-sm font-bold text-chili">{i + 1}</span>
              <span><span className="block font-semibold text-ink">{title}</span>{body}</span>
            </li>
          ))}
        </ol>
        {rejected && (
          <p className="mt-5 rounded-xl bg-chili/10 px-4 py-3 text-sm text-chili">
            {t(`Hồ sơ trước cho "${rejected.name}" chưa được duyệt`, `Your last application for "${rejected.name}" was not approved`)}{rejected.review_note ? `: ${rejected.review_note}` : '.'} {t('Bạn có thể gửi lại.', 'You can apply again.')}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="text-lg font-bold">{t('Đăng ký đơn vị tổ chức tour', 'Register as a tour operator')}</h3>
        <ol className="mt-3 mb-5 grid grid-cols-4 gap-1.5" aria-label={t('Các bước', 'Steps')}>
          {STEPS.map((label, i) => (
            <li key={label} aria-current={i === step ? 'step' : undefined}>
              <span className={`block h-1.5 rounded-full ${i <= step ? 'bg-chili' : 'bg-line'}`} />
              <span className={`mt-1 block font-utility text-micro font-bold uppercase tracking-wide ${i === step ? 'text-chili' : 'text-ink-faint'}`}>{i + 1}. {label}</span>
            </li>
          ))}
        </ol>

        <div className="space-y-3">
          {step === 0 && (
            <>
              <label className="block text-sm font-semibold">{t('Tên đơn vị', 'Operator name')}<input maxLength={200} value={form.name} onChange={set('name')} className={INPUT} /></label>
              <label className="block text-sm font-semibold">{t('Loại hình', 'Type')}
                <select value={form.operatorType} onChange={set('operatorType')} className={INPUT}>
                  {Object.entries(OPERATOR_TYPES).map(([value, label]) => <option key={value} value={value}>{label[lang]}</option>)}
                </select>
              </label>
              <div>
                <div className="text-sm font-semibold">{t('Tỉnh / thành phố hoạt động', 'Cities you operate in')}</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {[...new Set([...CITIES.map((c) => c.name.vi), ...form.cities])].map((name) => (
                    <button key={name} type="button" aria-pressed={form.cities.includes(name)} onClick={() => toggleCity(name)}
                      className={`rounded-full border-[1.5px] px-3 py-1 text-sm ${form.cities.includes(name) ? 'border-herb bg-herb text-herb-ink' : 'border-line-strong hover:border-chili'}`}>{name}</button>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input value={form.otherCity} onChange={set('otherCity')} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOtherCity() } }} placeholder={t('Nơi khác…', 'Somewhere else…')} className={`${INPUT} !mt-0`} />
                  <button type="button" onClick={addOtherCity} className={BUTTON}>{t('Thêm', 'Add')}</button>
                </div>
              </div>
              <label className="block text-sm font-semibold">{t('Website / fanpage (tuỳ chọn)', 'Website / page (optional)')}<input maxLength={300} value={form.website} onChange={set('website')} placeholder="https://facebook.com/…" className={INPUT} /></label>
              <label className="block text-sm font-semibold">{t('Giới thiệu ngắn (tuỳ chọn)', 'A few words (optional)')}<textarea rows={3} maxLength={2000} value={form.description} onChange={set('description')} placeholder={t('Food tour nhóm nhỏ ở phố cổ Hội An từ 2018…', 'Small-group food tours in Hoi An since 2018…')} className={INPUT} /></label>
            </>
          )}

          {step === 1 && (
            <>
              <div className="grid gap-3 sm:grid-cols-[1fr_170px]">
                <label className="block text-sm font-semibold">{t('Họ tên người liên hệ', 'Contact name')}<input maxLength={120} value={form.contactName} onChange={set('contactName')} className={INPUT} /></label>
                <label className="block text-sm font-semibold">{t('Vai trò', 'Role')}
                  <select value={form.contactRole} onChange={set('contactRole')} className={INPUT}>
                    <option value="owner">{t('Chủ đơn vị', 'Owner')}</option>
                    <option value="manager">{t('Quản lý', 'Manager')}</option>
                  </select>
                </label>
              </div>
              <label className="block text-sm font-semibold">{t('Số điện thoại (FoodTrip sẽ gọi xác minh)', 'Phone (FoodTrip will call to verify)')}<input maxLength={20} inputMode="tel" value={form.phone} onChange={set('phone')} className={INPUT} /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-semibold">{t('Số giấy phép kinh doanh lữ hành', 'Travel business licence no.')}<input maxLength={50} value={form.travelLicense} onChange={set('travelLicense')} className={INPUT} /></label>
                <label className="block text-sm font-semibold">{t('Số giấy phép kinh doanh', 'Business licence no.')}<input maxLength={50} value={form.businessLicense} onChange={set('businessLicense')} className={INPUT} /></label>
                <label className="block text-sm font-semibold">{t('Số thẻ hướng dẫn viên', 'Guide card no.')}<input maxLength={30} value={form.guideCard} onChange={set('guideCard')} className={INPUT} /></label>
                <label className="block text-sm font-semibold">{t('Mã số thuế', 'Tax code')}<input maxLength={14} inputMode="numeric" value={form.taxCode} onChange={set('taxCode')} className={INPUT} /></label>
              </div>
              <p className="text-2xs text-ink-faint">{t('Công ty lữ hành nên khai giấy phép lữ hành; hướng dẫn viên tự do khai số thẻ hướng dẫn viên. Khai đủ giúp duyệt nhanh hơn. FoodTrip không yêu cầu tải ảnh giấy tờ tuỳ thân.', 'Travel agencies should give their travel licence; freelance guides their guide card. Complete details are approved faster. FoodTrip never asks for photos of ID documents.')}</p>
            </>
          )}

          {step === 2 && (
            terms ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-paper-2 px-4 py-3"><div className="font-utility text-2xs uppercase tracking-wide text-ink-faint">{t('Hoa hồng', 'Commission')}</div><div className="text-2xl font-bold text-chili">{Number(terms.commission_pct)}%</div><div className="text-2xs text-ink-muted">{t('trên mỗi đơn hoàn thành', 'per completed booking')}</div></div>
                  <div className="rounded-xl bg-paper-2 px-4 py-3"><div className="font-utility text-2xs uppercase tracking-wide text-ink-faint">{t('Thanh toán', 'Payment')}</div><div className="text-lg font-bold">{t('Đơn vị tự thu', 'You collect')}</div><div className="text-2xs text-ink-muted">{t('đối soát hoa hồng hằng tháng', 'commission settled monthly')}</div></div>
                </div>
                <div className="max-h-[220px] overflow-y-auto rounded-xl border border-line bg-paper px-4 py-3 text-sm leading-relaxed text-ink-muted">
                  <div className="mb-1 font-semibold text-ink">{t(`Điều khoản đối tác tour FoodTrip — phiên bản ${terms.version}`, `FoodTrip tour partner terms — version ${terms.version}`)}</div>
                  {terms.summary}
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={agreed} onChange={(e) => { setAgreed(e.target.checked); setError('') }} className="!mt-1 !inline-block !w-auto" />
                  <span>{t('Tôi là chủ hoặc người được đơn vị uỷ quyền, đã đọc và đồng ý điều khoản đối tác tour FoodTrip.', 'I own this operator or am authorised by it, and I accept the FoodTrip tour partner terms.')}</span>
                </label>
              </>
            ) : <Spinner label={t('Đang tải điều khoản…', 'Loading the terms…')} />
          )}

          {step === 3 && (
            <dl className="divide-y divide-line rounded-xl border border-line">
              {review.map(([label, value, at]) => (
                <div key={label} className="grid grid-cols-[110px_1fr_auto] items-start gap-2 px-3.5 py-2.5 text-sm">
                  <dt className="text-ink-faint">{label}</dt>
                  <dd className="min-w-0 break-words">{value}</dd>
                  <button type="button" onClick={() => setStep(at)} className="font-utility text-2xs font-semibold text-chili hover:underline">{t('Sửa', 'Edit')}</button>
                </div>
              ))}
            </dl>
          )}
        </div>

        {error && <p role="alert" className="mt-3 text-sm text-chili">{error}</p>}
        <div className="mt-5 flex items-center justify-between gap-3">
          {step > 0 ? <button type="button" onClick={() => { setError(''); setStep(step - 1) }} className={BUTTON}>{t('← Quay lại', '← Back')}</button> : <span />}
          {step < 3
            ? <button type="button" onClick={next} className="rounded-full bg-chili px-6 py-2.5 font-utility text-sm font-semibold text-chili-ink">{t('Tiếp tục →', 'Continue →')}</button>
            : <button type="button" onClick={submit} disabled={busy} className="rounded-full bg-chili px-6 py-2.5 font-utility text-sm font-semibold text-chili-ink disabled:opacity-60">{busy ? t('Đang gửi…', 'Sending…') : t('Gửi đăng ký', 'Send application')}</button>}
        </div>
      </div>
    </section>
  )
}
