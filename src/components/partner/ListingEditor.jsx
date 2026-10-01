import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, CaretDown, CheckCircle, Circle, ImageSquare, MapPin, RocketLaunch, Star, Trash } from '@phosphor-icons/react'
import * as partner from '../../lib/partner.js'
import { enableInventory } from '../../lib/inventory.js'
import Spinner from '../ui/Spinner.jsx'

const LocationPicker = lazy(() => import('../map/LocationPicker.jsx'))

const INPUT = 'w-full rounded-xl border border-line-strong bg-paper px-3.5 py-2.5 text-md focus:border-chili'
const BUTTON = 'inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-utility text-2xs font-semibold transition-colors hover:border-chili hover:text-chili disabled:opacity-50'
const SAVE = 'inline-flex items-center gap-1.5 rounded-full bg-chili px-4 py-2 font-utility text-sm font-semibold text-chili-ink disabled:opacity-50'

const draftOf = (p) => ({
  gallery: p.gallery?.length ? p.gallery : p.photo_url ? [p.photo_url] : [],
  description: p.description ?? '', propertyType: p.property_type ?? '', city: p.city ?? '',
  lat: p.lat ?? null, lng: p.lng ?? null, amenities: p.amenities ?? [],
  checkIn: p.check_in_time?.slice(0, 5) ?? '', checkOut: p.check_out_time?.slice(0, 5) ?? '',
  cancellation: p.cancellation_policy ?? '', houseRules: p.house_rules ?? '',
})

/**
 * The go-live checklist, as Agoda's and Traveloka's partner extranets run it:
 * six things a property completes before it can sell — photos & description,
 * facilities, policies, rooms & rates, where to be paid, the signed terms.
 * The database refuses to switch room inventory on until all six are done.
 */
export default function ListingEditor({ property, t, lang, explain, onSaved }) {
  const [draft, setDraft] = useState(() => draftOf(property))
  const [ready, setReady] = useState(null)
  const [terms, setTerms] = useState(null)
  const [payout, setPayout] = useState(null)
  const [payoutForm, setPayoutForm] = useState({ bank: '', account: '', holder: '' })
  const [open, setOpen] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(() => {
    partner.getReadiness(property.id).then(setReady).catch(() => setReady({}))
    partner.getPayout(property.id).then(setPayout).catch(() => setPayout(null))
  }, [property.id])
  useEffect(() => { setDraft(draftOf(property)); refresh() }, [property, refresh])
  useEffect(() => { partner.getCurrentTerms().then(setTerms).catch(() => setTerms(null)) }, [])

  async function run(key, fn) {
    setBusy(key); setError('')
    let ok = false
    try { await fn(); ok = true; refresh(); onSaved() } catch (err) { setError(explain(err)) }
    setBusy('')
    return ok
  }
  const saveListing = (key) => run(key, () => partner.updateListing(property.id, draft))

  async function upload(files) {
    setBusy('upload'); setError('')
    try {
      const added = []
      for (const file of [...files].slice(0, 12 - draft.gallery.length)) added.push(await partner.uploadPropertyPhoto(property.id, file))
      setDraft((d) => ({ ...d, gallery: [...d.gallery, ...added] }))
    } catch (err) { setError(explain(err)) }
    setBusy('')
  }
  const move = (i, step) => setDraft((d) => {
    const gallery = [...d.gallery]; const [item] = gallery.splice(i, 1); gallery.splice(Math.max(0, Math.min(gallery.length, i + step)), 0, item)
    return { ...d, gallery }
  })
  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }))

  const items = [
    { key: 'listing', title: t('Ảnh & giới thiệu', 'Photos & description'), hint: t('Tối thiểu 3 ảnh, giới thiệu từ 30 ký tự, có vị trí trên bản đồ.', 'At least 3 photos, a 30+ character description, a map pin.') },
    { key: 'amenities', title: t('Tiện nghi', 'Facilities'), hint: t('Chọn ít nhất một tiện nghi.', 'Tick at least one facility.') },
    { key: 'policies', title: t('Chính sách', 'Policies'), hint: t('Giờ nhận / trả phòng và chính sách huỷ.', 'Check-in / check-out times and the cancellation policy.') },
    { key: 'rooms', title: t('Loại phòng & giá', 'Rooms & rates'), hint: t('Tạo ít nhất một loại phòng ở mục "Kho phòng & giá theo ngày" bên dưới.', 'Add at least one room type under "Rooms & daily rates" below.') },
    { key: 'payout', title: t('Tài khoản nhận tiền', 'Payout account'), hint: t('Nơi FoodTrip chuyển tiền phòng sau khi khách trả phòng.', 'Where FoodTrip pays you after guests check out.') },
    { key: 'terms', title: t('Điều khoản đối tác', 'Partner terms'), hint: t('Hoa hồng và lịch thanh toán đã đồng ý.', 'The commission and payout schedule you accepted.') },
  ]
  const done = ready ? items.filter((i) => ready[i.key]).length : 0
  const allDone = ready && done === items.length

  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">{property.inventory_enabled ? t('Hồ sơ đối tác', 'Partner listing') : t('Hoàn thiện hồ sơ để mở bán', 'Complete your listing to go live')}</h3>
          <p className={`mt-0.5 text-sm ${property.inventory_enabled ? 'text-herb' : 'text-ink-muted'}`}>
            {property.inventory_enabled
              ? t('Đang mở bán — cơ sở được gợi ý cho du khách lên lịch trình gần đây.', 'Live — suggested to travellers planning nearby.')
              : t('Giống Agoda và Traveloka: hoàn thành đủ 6 mục rồi bấm Mở bán.', 'Like Agoda and Traveloka: finish all six items, then go live.')}
          </p>
        </div>
        <span className="font-utility text-sm font-bold text-chili">{ready ? `${done}/${items.length}` : '…'}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-paper-2"><div className="h-full rounded-full bg-herb transition-all" style={{ width: `${(done / items.length) * 100}%` }} /></div>

      <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
        {items.map((item) => {
          const ok = Boolean(ready?.[item.key])
          const isOpen = open === item.key
          return (
            <li key={item.key}>
              <button type="button" onClick={() => setOpen(isOpen ? null : item.key)} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                {ok ? <CheckCircle size={20} weight="fill" className="shrink-0 text-herb" /> : <Circle size={20} className="shrink-0 text-ink-faint" />}
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{item.title}</span>
                  <span className="block text-2xs text-ink-muted">{item.hint}</span>
                </span>
                <CaretDown size={14} className={`shrink-0 text-ink-faint transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="border-t border-line bg-paper/40 px-4 py-4">
                  {item.key === 'listing' && (
                    <div className="grid gap-3">
                      <div>
                        <div className="mb-1.5 text-sm font-semibold">{t(`Ảnh (${draft.gallery.length}/12) — ảnh đầu tiên là ảnh bìa`, `Photos (${draft.gallery.length}/12) — the first is the cover`)}</div>
                        {draft.gallery.length > 0 && (
                          <ul className="mb-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                            {draft.gallery.map((src, i) => (
                              <li key={src} className="relative overflow-hidden rounded-lg border border-line">
                                <img src={src} alt="" className="aspect-[4/3] w-full object-cover" />
                                {i === 0 && <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded-full bg-chili px-1.5 py-0.5 text-micro font-bold text-chili-ink"><Star size={9} weight="fill" />{t('Bìa', 'Cover')}</span>}
                                <div className="flex justify-between bg-surface px-1 py-0.5">
                                  <span className="flex">
                                    <button type="button" aria-label={t('Lên trước', 'Earlier')} disabled={i === 0} onClick={() => move(i, -1)} className="p-1 disabled:opacity-30"><ArrowUp size={12} /></button>
                                    <button type="button" aria-label={t('Xuống sau', 'Later')} disabled={i === draft.gallery.length - 1} onClick={() => move(i, 1)} className="p-1 disabled:opacity-30"><ArrowDown size={12} /></button>
                                  </span>
                                  <button type="button" aria-label={t('Xoá ảnh', 'Remove photo')} onClick={() => setDraft((d) => ({ ...d, gallery: d.gallery.filter((p) => p !== src) }))} className="p-1 text-chili"><Trash size={12} /></button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                        <label className={`${BUTTON} cursor-pointer`}>
                          <ImageSquare size={13} />{busy === 'upload' ? t('Đang tải ảnh…', 'Uploading…') : t('Tải ảnh lên (JPG/PNG/WebP, ≤ 3 MB)', 'Upload photos (JPG/PNG/WebP, ≤ 3 MB)')}
                          <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden disabled={busy === 'upload' || draft.gallery.length >= 12} onChange={(e) => { upload(e.target.files); e.target.value = '' }} />
                        </label>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-sm font-semibold">{t('Loại hình', 'Type')}
                          <select value={draft.propertyType} onChange={set('propertyType')} className={`${INPUT} mt-1`}>
                            <option value="">—</option>
                            {Object.entries(partner.PROPERTY_TYPES).map(([value, label]) => <option key={value} value={value}>{label[lang]}</option>)}
                          </select>
                        </label>
                        <label className="block text-sm font-semibold">{t('Tỉnh / thành phố', 'City / province')}<input maxLength={120} value={draft.city} onChange={set('city')} className={`${INPUT} mt-1`} /></label>
                      </div>
                      <label className="block text-sm font-semibold">{t(`Giới thiệu (${draft.description.trim().length}/30+ ký tự)`, `Description (${draft.description.trim().length}/30+ characters)`)}<textarea rows={3} maxLength={2000} value={draft.description} onChange={set('description')} className={`${INPUT} mt-1`} /></label>
                      <div>
                        <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold"><MapPin size={14} className="text-chili" />{t('Vị trí', 'Location')}
                          {draft.lat != null && <span className="font-utility text-2xs font-normal text-ink-faint">{Number(draft.lat).toFixed(5)}, {Number(draft.lng).toFixed(5)}</span>}
                        </div>
                        <Suspense fallback={<Spinner label={t('Đang tải bản đồ…', 'Loading map…')} />}>
                          <LocationPicker lang={lang} lat={draft.lat ?? 16.0471} lng={draft.lng ?? 108.2068} onChoose={({ lat, lng }) => setDraft((d) => ({ ...d, lat, lng }))} />
                        </Suspense>
                      </div>
                      <div><button type="button" disabled={Boolean(busy)} onClick={() => saveListing('listing')} className={SAVE}>{busy === 'listing' ? t('Đang lưu…', 'Saving…') : t('Lưu', 'Save')}</button></div>
                    </div>
                  )}

                  {item.key === 'amenities' && (
                    <div className="grid gap-3">
                      <div className="grid gap-2 sm:grid-cols-3">
                        {Object.entries(partner.AMENITIES).map(([code, label]) => (
                          <label key={code} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={draft.amenities.includes(code)} onChange={(e) => setDraft((d) => ({ ...d, amenities: e.target.checked ? [...d.amenities, code] : d.amenities.filter((a) => a !== code) }))} />
                            {label[lang]}
                          </label>
                        ))}
                      </div>
                      <div><button type="button" disabled={Boolean(busy)} onClick={() => saveListing('amenities')} className={SAVE}>{busy === 'amenities' ? t('Đang lưu…', 'Saving…') : t('Lưu', 'Save')}</button></div>
                    </div>
                  )}

                  {item.key === 'policies' && (
                    <div className="grid gap-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-sm font-semibold">{t('Giờ nhận phòng từ', 'Check-in from')}<input type="time" value={draft.checkIn} onChange={set('checkIn')} className={`${INPUT} mt-1`} /></label>
                        <label className="block text-sm font-semibold">{t('Giờ trả phòng trước', 'Check-out by')}<input type="time" value={draft.checkOut} onChange={set('checkOut')} className={`${INPUT} mt-1`} /></label>
                      </div>
                      <fieldset className="grid gap-1.5">
                        <legend className="mb-1 text-sm font-semibold">{t('Chính sách huỷ', 'Cancellation policy')}</legend>
                        {Object.entries(partner.CANCELLATION).map(([code, label]) => (
                          <label key={code} className="flex items-start gap-2 text-sm">
                            <input type="radio" name={`cancel-${property.id}`} checked={draft.cancellation === code} onChange={() => setDraft((d) => ({ ...d, cancellation: code }))} className="mt-1" />{label[lang]}
                          </label>
                        ))}
                      </fieldset>
                      <label className="block text-sm font-semibold">{t('Nội quy (tuỳ chọn)', 'House rules (optional)')}<textarea rows={2} maxLength={2000} value={draft.houseRules} onChange={set('houseRules')} placeholder={t('Giữ yên lặng sau 22h, không hút thuốc trong phòng…', 'Quiet after 10 pm, no smoking indoors…')} className={`${INPUT} mt-1`} /></label>
                      <div><button type="button" disabled={Boolean(busy)} onClick={() => saveListing('policies')} className={SAVE}>{busy === 'policies' ? t('Đang lưu…', 'Saving…') : t('Lưu', 'Save')}</button></div>
                    </div>
                  )}

                  {item.key === 'rooms' && (
                    <div className="flex flex-wrap items-center gap-3 text-sm text-ink-muted">
                      {ok ? t('Đã có loại phòng đang bán.', 'You have room types on sale.') : t('Chưa có loại phòng nào.', 'No room types yet.')}
                      <button type="button" className={BUTTON} onClick={() => document.getElementById('room-inventory')?.scrollIntoView({ behavior: 'smooth' })}>{t('Đến mục Kho phòng & giá ↓', 'Go to Rooms & rates ↓')}</button>
                    </div>
                  )}

                  {item.key === 'payout' && (
                    <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); run('payout', () => partner.setPayout(property.id, payoutForm)).then((ok) => ok && setPayoutForm({ bank: '', account: '', holder: '' })) }}>
                      {payout && <p className="text-sm text-herb">{t('Đang nhận tiền vào', 'Paid to')}: {payout.bank_name} · ••••{payout.account_number.slice(-4)} · {payout.account_holder}</p>}
                      <div className="grid gap-3 sm:grid-cols-3">
                        <label className="block text-sm font-semibold">{t('Ngân hàng', 'Bank')}<input required minLength={2} maxLength={100} value={payoutForm.bank} onChange={(e) => setPayoutForm((f) => ({ ...f, bank: e.target.value }))} placeholder="Vietcombank" className={`${INPUT} mt-1`} /></label>
                        <label className="block text-sm font-semibold">{t('Số tài khoản', 'Account number')}<input required inputMode="numeric" maxLength={24} value={payoutForm.account} onChange={(e) => setPayoutForm((f) => ({ ...f, account: e.target.value }))} className={`${INPUT} mt-1`} /></label>
                        <label className="block text-sm font-semibold">{t('Chủ tài khoản', 'Account holder')}<input required minLength={2} maxLength={100} value={payoutForm.holder} onChange={(e) => setPayoutForm((f) => ({ ...f, holder: e.target.value }))} placeholder="NGUYEN VAN A" className={`${INPUT} mt-1`} /></label>
                      </div>
                      <p className="text-2xs text-ink-faint">{t('Chỉ bạn và quản trị FoodTrip xem được. Nên dùng tài khoản đứng tên chủ cơ sở hoặc doanh nghiệp.', 'Only you and FoodTrip admins can see this. Use an account in the owner’s or the business’s name.')}</p>
                      <div><button type="submit" disabled={Boolean(busy)} className={SAVE}>{busy === 'payout' ? t('Đang lưu…', 'Saving…') : payout ? t('Đổi tài khoản', 'Change account') : t('Lưu', 'Save')}</button></div>
                    </form>
                  )}

                  {item.key === 'terms' && (
                    ok && property.terms_accepted_at
                      ? <p className="text-sm text-herb">{t(`Đã đồng ý phiên bản ${property.terms_version} lúc ${new Date(property.terms_accepted_at).toLocaleString('vi-VN')}.`, `Accepted version ${property.terms_version} on ${new Date(property.terms_accepted_at).toLocaleString('en-GB')}.`)}</p>
                      : terms
                        ? (
                          <div className="grid gap-3">
                            <p className="text-sm">{t(`Hoa hồng ${Number(terms.commission_pct)}% · nhận tiền ${terms.payout_days} ngày làm việc sau ngày khách trả phòng.`, `${Number(terms.commission_pct)}% commission · paid ${terms.payout_days} working days after check-out.`)}</p>
                            <div className="max-h-[180px] overflow-y-auto rounded-xl border border-line bg-paper px-4 py-3 text-sm text-ink-muted">{terms.summary}</div>
                            <div><button type="button" disabled={Boolean(busy)} onClick={() => run('terms', () => partner.acceptTerms(property.id, terms.version))} className={SAVE}>{t('Tôi đồng ý điều khoản', 'I accept the terms')}</button></div>
                          </div>
                        )
                        : <Spinner label={t('Đang tải điều khoản…', 'Loading the terms…')} />
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {error && <p role="alert" className="mt-3 text-sm text-chili">{error}</p>}
      {!property.inventory_enabled && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" disabled={!allDone || Boolean(busy)} onClick={() => run('live', () => enableInventory(property.id))}
            className="inline-flex items-center gap-2 rounded-full bg-herb px-5 py-2.5 font-utility text-sm font-semibold text-herb-ink disabled:cursor-not-allowed disabled:opacity-40">
            <RocketLaunch size={16} />{busy === 'live' ? t('Đang mở bán…', 'Going live…') : t('Mở bán trên FoodTrip', 'Go live on FoodTrip')}
          </button>
          {!allDone && <span className="text-2xs text-ink-faint">{t(`Còn ${items.length - done} mục cần hoàn thành.`, `${items.length - done} item(s) left.`)}</span>}
        </div>
      )}
    </section>
  )
}
