import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Buildings, CheckCircle, Clock, MapPin, SquaresFour, CalendarCheck, Bed, Wallet, UsersThree, DoorOpen, Lock, Phone, EnvelopeSimple, SignIn, SignOut, UserMinus, X, PencilSimple, Storefront, Hourglass, ChatCircleText,
} from '@phosphor-icons/react'
import * as partner from '../lib/partner.js'
import { FULFILLMENT } from '../lib/partner.js'
import EmptyState from '../components/ui/EmptyState.jsx'
import Spinner from '../components/ui/Spinner.jsx'
import AuthModal from '../components/auth/AuthModal.jsx'
import { useInputDialog } from '../components/ui/useInputDialog.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import RoomInventory from '../components/booking/RoomInventory.jsx'
import ListingEditor from '../components/partner/ListingEditor.jsx'
import PortalShell, { StatCard, PortalCard } from '../components/portal/PortalShell.jsx'
import PartnerReviews from '../components/reviews/PartnerReviews.jsx'
import { listRooms } from '../lib/inventory.js'
import { CITIES } from '../data/destinations.js'
import { searchPlaces } from '../lib/trackAsia.js'
import { destinationWeatherLocation } from '../lib/tripWeather.js'
import { normalizeVi } from '../lib/text.js'

const LocationPicker = lazy(() => import('../components/map/LocationPicker.jsx'))

const BUTTON = 'inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-utility text-2xs font-semibold transition-colors hover:border-chili hover:text-chili disabled:opacity-50'
const PRIMARY_SM = 'inline-flex items-center gap-1.5 rounded-full bg-chili px-3.5 py-1.5 font-utility text-2xs font-semibold text-chili-ink disabled:opacity-50'
const DANGER = 'inline-flex items-center gap-1.5 rounded-full border border-chili/40 px-3 py-1.5 font-utility text-2xs font-semibold text-chili transition-colors hover:bg-chili hover:text-chili-ink disabled:opacity-50'
const INPUT = 'w-full rounded-xl border border-line-strong bg-paper px-3.5 py-2.5 text-md focus:border-chili'

const formatVnd = (n) => `${Number(n ?? 0).toLocaleString('vi-VN')}đ`
const formatDay = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' }) : '—')

const PAYMENT = {
  pending: { vi: 'Chờ khách thanh toán', en: 'Awaiting payment', style: 'bg-lantern/20 text-lantern' },
  paid: { vi: 'Đã thanh toán', en: 'Paid', style: 'bg-herb text-herb-ink' },
  cancelled: { vi: 'Khách đã huỷ', en: 'Cancelled', style: 'bg-paper-2 text-ink-faint' },
  refunded: { vi: 'Đã hoàn tiền', en: 'Refunded', style: 'bg-paper-2 text-ink-faint' },
  failed: { vi: 'Thanh toán lỗi', en: 'Payment failed', style: 'bg-paper-2 text-ink-faint' },
}

const ERRORS = {
  'not-paid-yet': ['Khách chưa thanh toán — chưa thể xác nhận.', 'Not paid yet — cannot confirm.'],
  'before-check-in-date': ['Chưa đến ngày nhận phòng.', 'It is not the check-in date yet.'],
  'note-required': ['Hãy ghi lý do (ít nhất 3 ký tự) — khách sẽ thấy.', 'Give a reason (3+ characters) — the guest will see it.'],
  'transition-not-allowed': ['Đơn không ở trạng thái cho phép thao tác này.', 'That step is not possible from here.'],
  'booking-closed': ['Đơn đã huỷ hoặc hoàn tiền.', 'The booking was cancelled or refunded.'],
  'not-your-hotel': ['Đơn này không thuộc khách sạn của bạn.', 'That booking is not for your hotel.'],
  'owners-only': ['Chỉ chủ khách sạn mới sửa được thông tin này.', 'Only the owner can edit this.'],
  'application-pending': ['Bạn đã có một đơn đăng ký đang chờ duyệt.', 'You already have an application under review.'],
  'invalid-photo-type': ['Chỉ nhận ảnh JPG, PNG hoặc WebP.', 'Only JPG, PNG or WebP photos.'],
  'photo-too-large': ['Ảnh tối đa 3 MB.', 'Photos up to 3 MB.'],
  'invalid-photo-url': ['Ảnh phải là đường dẫn https.', 'The photo must be an https link.'],
  'terms-required': ['Hãy đồng ý điều khoản đối tác.', 'Please accept the partner terms.'],
  'listing-incomplete': ['Hồ sơ chưa đủ để mở bán — hoàn thành các mục còn trống trong danh sách.', 'The listing is not complete — finish the open checklist items.'],
  'account_number': ['Số tài khoản chỉ gồm 6–20 chữ số.', 'The account number must be 6–20 digits.'],
  'partner_applications_pin': ['Hãy ghim vị trí cơ sở trên bản đồ.', 'Please pin your place on the map.'],
}

export default function Partner() {
  const { lang } = useLanguage()
  const t = useCallback((vi, en) => (lang === 'vi' ? vi : en), [lang])
  const explain = (error) => {
    const key = Object.keys(ERRORS).find((k) => String(error?.message ?? '').includes(k))
    return key ? t(...ERRORS[key]) : t('Thao tác không thành công. Vui lòng thử lại.', 'That did not work. Please try again.')
  }
  const { user, loading: authLoading, hasAuth } = useAuth()
  const [state, setState] = useState({ status: 'loading', properties: [], applications: [] })
  const [authOpen, setAuthOpen] = useState(false)

  const load = useCallback(async () => {
    if (!user) { setState({ status: 'signed-out', properties: [], applications: [] }); return }
    setState((s) => ({ ...s, status: 'loading' }))
    try {
      const [properties, applications] = await Promise.all([partner.getMyProperties(user.id), partner.getMyApplications(user.id)])
      setState({ status: 'ready', properties, applications })
    } catch {
      setState({ status: 'error', properties: [], applications: [] })
    }
  }, [user])
  useEffect(() => { if (!authLoading) load() }, [authLoading, load])

  let body
  if (authLoading || state.status === 'loading') body = <Spinner label={t('Đang tải…', 'Loading…')} />
  else if (state.status === 'signed-out') {
    body = <EmptyState icon={Lock} title={t('Đăng nhập để vào cổng đối tác', 'Log in to the partner portal')}
      body={t('Dành cho chủ và nhân viên khách sạn, nhà nghỉ, homestay nhận khách qua FoodTrip.', 'For owners and staff of hotels, guesthouses and homestays that take FoodTrip bookings.')}
      action={hasAuth && <button type="button" onClick={() => setAuthOpen(true)} className="rounded-full bg-chili px-6 py-[13px] font-utility text-md font-semibold text-chili-ink">{t('Đăng nhập', 'Log in')}</button>} />
  } else if (state.status === 'error') {
    body = <EmptyState icon={Clock} title={t('Chưa tải được dữ liệu.', 'Could not load your data.')} action={<button type="button" onClick={load} className={BUTTON}>{t('Thử lại', 'Retry')}</button>} />
  } else if (!state.properties.length) {
    body = <Application t={t} lang={lang} applications={state.applications} onSubmitted={load} explain={explain} />
  } else {
    // A partner gets the portal itself, which carries its own header.
    return <Dashboard t={t} lang={lang} properties={state.properties} explain={explain} onPropertyChanged={load} />
  }

  return (
    <div className="mx-auto max-w-[1180px] px-5 py-12 md:px-8 md:py-16">
      <span className="eyebrow eyebrow-tick">{t('Đối tác lưu trú', 'Lodging partners')}</span>
      <h1 className="mb-8 mt-3 text-3xl font-bold leading-[1.15] md:text-4xl">{t('Quản lý khách sạn trên FoodTrip', 'Run your hotel on FoodTrip')}</h1>
      <Link to="/partner/tours" className="mb-6 inline-block font-semibold text-chili">{t('Chuyển sang cổng đối tác tour →', 'Tour partner portal →')}</Link>
      {body}
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </div>
  )
}

/**
 * Not a partner yet: where their application stands, or the sign-up — four
 * short steps the way Agoda and Traveloka run it: the property, who is
 * applying (with its papers, if any), the partner terms, then a review.
 * Photos, facilities, rooms and bank details come after approval, in the
 * go-live checklist.
 */
function Application({ t, lang, applications, onSubmitted, explain }) {
  const latest = applications[0]
  // Arriving from a hotel's page ("Own this hotel?"): the hotel is already
  // known, so its name, address and FoodTrip link are filled in — the link
  // carries the id the admin needs to approve in one click.
  const [params] = useSearchParams()
  const claim = params.get('claim')
  const [form, setForm] = useState(() => ({
    hotelName: (params.get('name') ?? '').slice(0, 200),
    address: (params.get('address') ?? '').slice(0, 500),
    phone: '',
    hotelLink: claim ? `${window.location.origin}/booking/${encodeURIComponent(claim)}?${new URLSearchParams({ name: (params.get('name') ?? '').slice(0, 200), address: (params.get('address') ?? '').slice(0, 500) })}` : '',
    message: '',
  }))
  // 'listed': the place is on FoodTrip already (search found it).
  // 'new': a homestay or guesthouse no search finds — it describes itself.
  const [mode, setMode] = useState('listed')
  const [listing, setListing] = useState({ propertyType: 'homestay', city: '', description: '', lat: null, lng: null })
  const [contact, setContact] = useState({ name: '', role: 'owner', roomCount: '', stars: '', license: '', taxCode: '' })
  const [terms, setTerms] = useState(null)
  const [agreed, setAgreed] = useState(false)
  const [step, setStep] = useState(0)
  const [locating, setLocating] = useState('idle') // idle | busy | none
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const setL = (key) => (e) => setListing((l) => ({ ...l, [key]: e.target.value }))
  const setC = (key) => (e) => setContact((c) => ({ ...c, [key]: e.target.value }))

  useEffect(() => { partner.getCurrentTerms().then(setTerms).catch(() => setTerms(null)) }, [])

  if (latest?.status === 'pending') {
    return <EmptyState icon={Hourglass} title={t('Đơn đăng ký đang chờ duyệt', 'Your application is under review')}
      body={t(`FoodTrip đang xem đơn cho "${latest.hotel_name}" và sẽ gọi số điện thoại bạn để lại để xác minh. Khi được duyệt, trang này hiện danh sách việc cần làm để bắt đầu nhận khách.`, `FoodTrip is reviewing "${latest.hotel_name}" and will call the number you gave to verify it. Once approved, this page lists what to do to start taking guests.`)} />
  }

  const STEPS = [t('Cơ sở', 'Property'), t('Liên hệ & pháp lý', 'Contact & papers'), t('Điều khoản', 'Terms'), t('Xem lại & gửi', 'Review & send')]
  const pin = listing.lat != null && listing.lng != null

  // What must be filled before moving on from a step (the database checks it again).
  function problem(at) {
    if (at === 0) {
      if (form.hotelName.trim().length < 2) return t('Nhập tên cơ sở.', 'Enter the property name.')
      if (form.address.trim().length < 5) return t('Nhập địa chỉ.', 'Enter the address.')
      if (mode === 'new' && listing.city.trim().length < 2) return t('Nhập tỉnh / thành phố.', 'Enter the city.')
      if (mode === 'new' && !pin) return t('Hãy ghim vị trí cơ sở trên bản đồ.', 'Please pin your place on the map.')
      if (!(Number(contact.roomCount) >= 1)) return t('Nhập số phòng của cơ sở.', 'Enter the number of rooms.')
    }
    if (at === 1) {
      if (contact.name.trim().length < 2) return t('Nhập họ tên người liên hệ.', 'Enter the contact name.')
      if (form.phone.trim().length < 8) return t('Nhập số điện thoại để FoodTrip gọi xác minh.', 'Enter a phone number FoodTrip can call.')
      if (contact.taxCode.trim() && !/^[0-9-]{10,14}$/.test(contact.taxCode.trim())) return t('Mã số thuế gồm 10–14 chữ số.', 'A tax code has 10–14 digits.')
    }
    if (at === 2 && !agreed) return t('Hãy đọc và đồng ý điều khoản đối tác.', 'Please read and accept the partner terms.')
    return ''
  }
  function next() {
    const p = problem(step)
    setError(p)
    if (!p) setStep(step + 1)
  }

  // The address typed so far, looked up on the map: the first match becomes
  // the pin, which the owner then moves to the exact door.
  async function locate() {
    setLocating('busy')
    try {
      const results = await searchPlaces([form.address, listing.city].filter(Boolean).join(', '), { limit: 1 })
      const found = results?.[0]?.location
      if (found) { setListing((l) => ({ ...l, lat: found.lat, lng: found.lng })); setLocating('idle') } else setLocating('none')
    } catch {
      setLocating('none')
    }
  }

  async function submit() {
    const p = [0, 1, 2].map(problem).find(Boolean)
    if (p) { setError(p); return }
    setStatus('busy'); setError('')
    try {
      await partner.submitApplication({ ...form, listing: mode === 'new' ? listing : null, contact, termsVersion: terms?.version })
      onSubmitted()
    } catch (err) {
      setError(explain(err)); setStatus('idle')
    }
  }

  const review = [
    [t('Cơ sở', 'Property'), `${form.hotelName} · ${(partner.PROPERTY_TYPES[listing.propertyType] ?? {})[lang] ?? ''}${contact.roomCount ? ` · ${contact.roomCount} ${t('phòng', 'rooms')}` : ''}${contact.stars ? ` · ${contact.stars}★` : ''}`],
    [t('Địa chỉ', 'Address'), `${form.address}${listing.city ? `, ${listing.city}` : ''}${mode === 'new' && pin ? ` (${listing.lat.toFixed(5)}, ${listing.lng.toFixed(5)})` : ''}`],
    [t('Trên FoodTrip', 'On FoodTrip'), mode === 'new' ? t('Chưa có — FoodTrip sẽ cấp mã mới', 'Not yet — FoodTrip will give it an id') : form.hotelLink || t('Chưa có link', 'No link')],
    [t('Người liên hệ', 'Contact'), `${contact.name} (${contact.role === 'owner' ? t('chủ cơ sở', 'owner') : t('quản lý', 'manager')}) · ${form.phone}`],
    [t('Pháp lý', 'Papers'), [contact.license && `${t('GPKD', 'Licence')} ${contact.license}`, contact.taxCode && `MST ${contact.taxCode}`].filter(Boolean).join(' · ') || t('Chưa khai (không bắt buộc với homestay)', 'None given (optional for homestays)')],
    [t('Điều khoản', 'Terms'), terms ? t(`Phiên bản ${terms.version} — hoa hồng ${Number(terms.commission_pct)}%, đã đồng ý`, `Version ${terms.version} — ${Number(terms.commission_pct)}% commission, accepted`) : '—'],
  ]

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <div>
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface text-chili shadow-soft"><Storefront size={24} weight="duotone" /></div>
        <h2 className="text-2xl font-bold">{t('Nhận khách từ FoodTrip', 'Take bookings from FoodTrip')}</h2>
        <ol className="mt-4 space-y-3 text-md text-ink-muted">
          {[
            [t('Đăng ký (5 phút)', 'Sign up (5 minutes)'), t('Thông tin cơ sở, người liên hệ và đồng ý điều khoản.', 'Property, contact and the partner terms.')],
            [t('Xác minh', 'Verification'), t('FoodTrip gọi điện xác minh và duyệt trong 1–3 ngày làm việc.', 'FoodTrip calls to verify and approves within 1–3 working days.')],
            [t('Hoàn thiện hồ sơ', 'Complete your listing'), t('Ảnh, tiện nghi, chính sách, loại phòng & giá, tài khoản nhận tiền.', 'Photos, facilities, policies, rooms & rates, payout account.')],
            [t('Mở bán', 'Go live'), t('Cơ sở hiện trong gợi ý khi du khách lên lịch trình gần đó và nhận đặt phòng.', 'Suggested to travellers planning nearby, and taking bookings.')],
          ].map(([title, body], i) => (
            <li key={title} className="flex gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-chili/10 font-utility text-sm font-bold text-chili">{i + 1}</span>
              <span><span className="block font-semibold text-ink">{title}</span>{body}</span>
            </li>
          ))}
        </ol>
        {latest?.status === 'rejected' && (
          <p className="mt-5 rounded-xl bg-chili/10 px-4 py-3 text-sm text-chili">
            {t(`Đơn trước cho "${latest.hotel_name}" chưa được duyệt`, `Your last application for "${latest.hotel_name}" was not approved`)}{latest.review_note ? `: ${latest.review_note}` : '.'} {t('Bạn có thể gửi lại.', 'You can apply again.')}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="text-lg font-bold">{t('Đăng ký làm đối tác', 'Apply to become a partner')}</h3>
        <ol className="mt-3 mb-5 grid grid-cols-4 gap-1.5" aria-label={t('Các bước', 'Steps')}>
          {STEPS.map((label, i) => (
            <li key={label} aria-current={i === step ? 'step' : undefined}>
              <span className={`block h-1.5 rounded-full ${i <= step ? 'bg-chili' : 'bg-line'}`} />
              <span className={`mt-1 block font-utility text-micro font-bold uppercase tracking-wide ${i === step ? 'text-chili' : 'text-ink-faint'}`}>{i + 1}. {label}</span>
            </li>
          ))}
        </ol>

        {claim && step === 0 && (
          <p className="mb-3 rounded-xl bg-herb/10 px-3.5 py-2.5 text-sm text-herb">
            {t(`Đã điền sẵn thông tin "${form.hotelName || claim}" từ trang khách sạn trên FoodTrip. Kiểm tra lại rồi tiếp tục.`, `Filled in from "${form.hotelName || claim}" on FoodTrip. Check it and continue.`)}
          </p>
        )}

        <div className="space-y-3">
          {step === 0 && (
            <>
              {!claim && (
                <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
                  {[
                    ['listed', t('Cơ sở đã có trên FoodTrip', 'Already on FoodTrip'), t('Tìm thấy khi tìm khách sạn', 'Shows up in hotel search')],
                    ['new', t('Chưa có — tự khai báo', 'Not listed — describe it'), t('Homestay, nhà nghỉ nhỏ…', 'Homestay, small guesthouse…')],
                  ].map(([value, label, hint]) => (
                    <button key={value} type="button" role="radio" aria-checked={mode === value} onClick={() => setMode(value)}
                      className={`rounded-xl border-[1.5px] px-3.5 py-2.5 text-left ${mode === value ? 'border-chili bg-chili/5' : 'border-line-strong hover:border-chili'}`}>
                      <span className="block text-sm font-bold">{label}</span>
                      <span className="block text-2xs text-ink-muted">{hint}</span>
                    </button>
                  ))}
                </div>
              )}
              <label className="block text-sm font-semibold">{t('Tên cơ sở', 'Property name')}<input required minLength={2} maxLength={200} value={form.hotelName} onChange={set('hotelName')} className={`${INPUT} mt-1`} /></label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-sm font-semibold">{t('Loại hình', 'Type')}
                  <select value={listing.propertyType} onChange={setL('propertyType')} className={`${INPUT} mt-1`}>
                    {Object.entries(partner.PROPERTY_TYPES).map(([value, label]) => <option key={value} value={value}>{label[lang]}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-semibold">{t('Số phòng', 'Rooms')}<input type="number" min={1} max={2000} value={contact.roomCount} onChange={setC('roomCount')} className={`${INPUT} mt-1`} /></label>
                <label className="block text-sm font-semibold">{t('Hạng sao', 'Stars')}
                  <select value={contact.stars} onChange={setC('stars')} className={`${INPUT} mt-1`}>
                    <option value="">{t('Không xếp hạng', 'Unrated')}</option>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} ★</option>)}
                  </select>
                </label>
              </div>
              <label className="block text-sm font-semibold">{t('Tỉnh / thành phố', 'City / province')}
                <input maxLength={120} list="partner-cities" value={listing.city} onChange={setL('city')} placeholder="Đà Lạt" className={`${INPUT} mt-1`} />
                <datalist id="partner-cities">{CITIES.map((city) => <option key={city.id} value={city.name.vi} />)}</datalist>
              </label>
              <label className="block text-sm font-semibold">{t('Địa chỉ', 'Address')}<input required minLength={5} maxLength={500} value={form.address} onChange={set('address')} className={`${INPUT} mt-1`} /></label>
              {mode === 'new' && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{t('Vị trí trên bản đồ', 'Location on the map')}</span>
                    <button type="button" onClick={locate} disabled={locating === 'busy' || form.address.trim().length < 5} className={BUTTON}>
                      <MapPin size={13} />{locating === 'busy' ? t('Đang tìm…', 'Finding…') : t('Tìm theo địa chỉ', 'Find from address')}
                    </button>
                    {pin && <span className="font-utility text-2xs text-herb">{listing.lat.toFixed(5)}, {listing.lng.toFixed(5)}</span>}
                  </div>
                  {locating === 'none' && <p className="text-2xs text-lantern">{t('Không tìm thấy địa chỉ này — hãy chạm lên bản đồ để ghim.', "Couldn't find that address — tap the map to pin it.")}</p>}
                  <Suspense fallback={<Spinner label={t('Đang tải bản đồ…', 'Loading map…')} />}>
                    <LocationPicker lang={lang} lat={listing.lat ?? cityCentre(listing.city).lat} lng={listing.lng ?? cityCentre(listing.city).lng}
                      onChoose={({ lat, lng }) => setListing((l) => ({ ...l, lat, lng }))} />
                  </Suspense>
                </div>
              )}
            </>
          )}

          {step === 1 && (
            <>
              <div className="grid gap-3 sm:grid-cols-[1fr_170px]">
                <label className="block text-sm font-semibold">{t('Họ tên người liên hệ', 'Contact name')}<input required minLength={2} maxLength={120} value={contact.name} onChange={setC('name')} className={`${INPUT} mt-1`} /></label>
                <label className="block text-sm font-semibold">{t('Vai trò', 'Role')}
                  <select value={contact.role} onChange={setC('role')} className={`${INPUT} mt-1`}>
                    <option value="owner">{t('Chủ cơ sở', 'Owner')}</option>
                    <option value="manager">{t('Quản lý', 'Manager')}</option>
                  </select>
                </label>
              </div>
              <label className="block text-sm font-semibold">{t('Số điện thoại (FoodTrip sẽ gọi xác minh)', 'Phone (FoodTrip will call to verify)')}<input required minLength={8} maxLength={20} inputMode="tel" value={form.phone} onChange={set('phone')} className={`${INPUT} mt-1`} /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-semibold">{t('Số giấy phép kinh doanh', 'Business licence no.')}<input maxLength={50} value={contact.license} onChange={setC('license')} className={`${INPUT} mt-1`} /></label>
                <label className="block text-sm font-semibold">{t('Mã số thuế', 'Tax code')}<input maxLength={14} inputMode="numeric" value={contact.taxCode} onChange={setC('taxCode')} className={`${INPUT} mt-1`} /></label>
              </div>
              <p className="-mt-1 text-2xs text-ink-faint">{t('Khách sạn, nhà nghỉ nên khai để duyệt nhanh hơn; homestay hộ gia đình có thể bỏ trống. FoodTrip không yêu cầu tải ảnh giấy tờ tuỳ thân.', 'Hotels and guesthouses should fill these in to be approved faster; family homestays may leave them blank. FoodTrip never asks for photos of ID documents.')}</p>
              {mode === 'listed'
                ? <label className="block text-sm font-semibold">{t('Link khách sạn trên FoodTrip hoặc Google Maps (nếu có)', 'Link to the hotel on FoodTrip or Google Maps (optional)')}<input maxLength={500} value={form.hotelLink} onChange={set('hotelLink')} placeholder="https://…" className={`${INPUT} mt-1`} /></label>
                : <label className="block text-sm font-semibold">{t('Giới thiệu ngắn cho du khách', 'A few words for travellers')}<textarea maxLength={2000} rows={3} value={listing.description} onChange={setL('description')} placeholder={t('Nhà gỗ giữa rừng thông, 5 phút đi bộ ra hồ, có bếp chung…', 'Wooden house in the pines, 5 minutes from the lake, shared kitchen…')} className={`${INPUT} mt-1`} /></label>}
              <label className="block text-sm font-semibold">{t('Lời nhắn cho FoodTrip (tuỳ chọn)', 'Message to FoodTrip (optional)')}<textarea maxLength={2000} rows={2} value={form.message} onChange={set('message')} className={`${INPUT} mt-1`} /></label>
            </>
          )}

          {step === 2 && (
            terms ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-paper-2 px-4 py-3"><div className="font-utility text-2xs uppercase tracking-wide text-ink-faint">{t('Hoa hồng', 'Commission')}</div><div className="text-2xl font-bold text-chili">{Number(terms.commission_pct)}%</div><div className="text-2xs text-ink-muted">{t('trên mỗi đơn hoàn thành', 'per completed booking')}</div></div>
                  <div className="rounded-xl bg-paper-2 px-4 py-3"><div className="font-utility text-2xs uppercase tracking-wide text-ink-faint">{t('Nhận tiền', 'Payout')}</div><div className="text-2xl font-bold">{terms.payout_days} {t('ngày', 'days')}</div><div className="text-2xs text-ink-muted">{t('làm việc sau ngày khách trả phòng', 'working days after check-out')}</div></div>
                </div>
                <div className="max-h-[220px] overflow-y-auto rounded-xl border border-line bg-paper px-4 py-3 text-sm leading-relaxed text-ink-muted">
                  <div className="mb-1 font-semibold text-ink">{t(`Điều khoản đối tác FoodTrip — phiên bản ${terms.version}`, `FoodTrip partner terms — version ${terms.version}`)}</div>
                  {terms.summary}
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={agreed} onChange={(e) => { setAgreed(e.target.checked); setError('') }} className="mt-1" />
                  <span>{t('Tôi là chủ hoặc người được chủ cơ sở uỷ quyền, đã đọc và đồng ý điều khoản đối tác FoodTrip.', 'I own this property or am authorised by its owner, and I accept the FoodTrip partner terms.')}</span>
                </label>
              </>
            ) : <Spinner label={t('Đang tải điều khoản…', 'Loading the terms…')} />
          )}

          {step === 3 && (
            <dl className="divide-y divide-line rounded-xl border border-line">
              {review.map(([label, value], i) => (
                <div key={label} className="grid grid-cols-[110px_1fr_auto] items-start gap-2 px-3.5 py-2.5 text-sm">
                  <dt className="text-ink-faint">{label}</dt>
                  <dd className="min-w-0 break-words">{value}</dd>
                  <button type="button" onClick={() => setStep(i < 3 ? 0 : i < 5 ? 1 : 2)} className="font-utility text-2xs font-semibold text-chili hover:underline">{t('Sửa', 'Edit')}</button>
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
            : <button type="button" onClick={submit} disabled={status === 'busy'} className="rounded-full bg-chili px-6 py-2.5 font-utility text-sm font-semibold text-chili-ink disabled:opacity-60">{status === 'busy' ? t('Đang gửi…', 'Sending…') : t('Gửi đăng ký', 'Send application')}</button>}
        </div>
      </div>
    </div>
  )
}

/** Where the map opens before there is a pin: the city typed, else central Vietnam. */
function cityCentre(cityName) {
  const city = CITIES.find((c) => normalizeVi(c.name.vi) === normalizeVi(cityName) || normalizeVi(c.name.en) === normalizeVi(cityName))
  return (city && destinationWeatherLocation(city.id)) || { lat: 16.0471, lng: 108.2068 }
}

const FILTERS = [
  { id: 'needs', vi: 'Cần xác nhận', en: 'To confirm' },
  { id: 'today', vi: 'Hôm nay', en: 'Today' },
  { id: 'upcoming', vi: 'Sắp tới', en: 'Upcoming' },
  { id: 'inhouse', vi: 'Đang ở', en: 'In house' },
  { id: 'history', vi: 'Lịch sử', en: 'History' },
  { id: 'all', vi: 'Tất cả', en: 'All' },
]
const OPEN_PAYMENT = ['pending', 'paid']

function matchesFilter(b, filter, today) {
  const open = OPEN_PAYMENT.includes(b.payment_status)
  switch (filter) {
    case 'needs': return b.payment_status === 'paid' && b.fulfillment_status === 'awaiting'
    case 'today': return open && ((b.check_in === today && ['awaiting', 'confirmed'].includes(b.fulfillment_status)) || (b.check_out === today && b.fulfillment_status === 'checked_in'))
    case 'upcoming': return open && b.check_in > today && ['awaiting', 'confirmed'].includes(b.fulfillment_status)
    case 'inhouse': return b.fulfillment_status === 'checked_in'
    case 'history': return !open || ['completed', 'no_show', 'rejected', 'guest_cancelled'].includes(b.fulfillment_status) || (b.check_out < today && b.fulfillment_status !== 'checked_in')
    default: return true
  }
}

function Dashboard({ t, lang, properties, explain, onPropertyChanged }) {
  const [propertyId, setPropertyId] = useState(properties[0].id)
  const property = properties.find((p) => p.id === propertyId) ?? properties[0]
  const owner = property.role === 'owner'
  const [bookings, setBookings] = useState(null)
  const [rooms, setRooms] = useState([])
  const [filter, setFilter] = useState('needs')
  const today = partner.vietnamToday()

  const load = useCallback(() => {
    setBookings(null)
    partner.getPropertyBookings(property.hotel_place_id).then(setBookings).catch(() => setBookings([]))
    listRooms(property.id).then(setRooms).catch(() => setRooms([]))
  }, [property.hotel_place_id, property.id])
  useEffect(load, [load])

  const needs = (bookings ?? []).filter((b) => matchesFilter(b, 'needs', today)).length
  const sections = [
    { id: 'overview', label: t('Tổng quan', 'Overview'), icon: SquaresFour },
    { id: 'bookings', label: t('Đặt phòng', 'Bookings'), icon: CalendarCheck, badge: needs || null },
    { id: 'rooms', label: t('Phòng & giá', 'Rooms & rates'), icon: Bed },
    { id: 'listing', label: t('Hồ sơ cơ sở', 'Property profile'), icon: Storefront, badge: !property.inventory_enabled && owner ? '!' : null },
    { id: 'reviews', label: t('Đánh giá', 'Reviews'), icon: ChatCircleText },
    ...(owner ? [
      { id: 'money', label: t('Doanh thu & đối soát', 'Revenue & payouts'), icon: Wallet },
      { id: 'team', label: t('Nhân sự', 'Team'), icon: UsersThree },
    ] : []),
  ]

  return (
    <PortalShell
      eyebrow={t('Cổng đối tác lưu trú', 'Lodging partner portal')}
      title={property.name}
      subtitle={`${property.address ?? ''}${property.role === 'owner' ? '' : ` · ${t('Bạn là nhân viên', 'You are staff')}`}`}
      switcher={properties.length > 1 && (
        <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} aria-label={t('Chọn cơ sở', 'Choose property')} className="rounded-full border border-line bg-surface px-4 py-2 font-utility text-sm font-semibold">
          {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      actions={<Link to={`/booking/${encodeURIComponent(property.hotel_place_id)}`} className={BUTTON}>{t('Xem trang đặt phòng ↗', 'View booking page ↗')}</Link>}
      sections={sections}
    >
      {(section, open) => (
        <div className="space-y-5">
          {!property.active && (
            <p role="alert" className="rounded-2xl border border-chili/40 bg-chili/10 px-4 py-3 text-sm text-chili">
              <strong>{t('Cơ sở đang bị tạm khoá — không nhận đơn mới.', 'This property is suspended — it takes no new bookings.')}</strong>
              {property.suspension_note ? ` ${t('Lý do', 'Reason')}: ${property.suspension_note}.` : ''} {t('Các đơn đã có vẫn cần được phục vụ. Liên hệ FoodTrip để mở lại.', 'Existing bookings must still be honoured. Contact FoodTrip to reopen.')}
            </p>
          )}
          {section === 'overview' && <HotelOverview t={t} lang={lang} property={property} bookings={bookings} rooms={rooms} today={today} owner={owner}
            openBookings={(f) => { setFilter(f); open('bookings') }} openListing={() => open('listing')} />}
          {section === 'bookings' && <HotelBookings t={t} lang={lang} bookings={bookings} filter={filter} setFilter={setFilter} today={today} explain={explain} reload={load} />}
          {section === 'rooms' && <RoomInventory key={property.id} property={property} onSaved={() => { onPropertyChanged(); load() }} />}
          {section === 'listing' && <>
            <PropertyCard property={property} t={t} explain={explain} onSaved={onPropertyChanged} />
            {owner
              ? <ListingEditor key={`listing-${property.id}`} property={property} t={t} lang={lang} explain={explain} onSaved={onPropertyChanged} onOpenRooms={() => open('rooms')} />
              : <p className="text-sm text-ink-muted">{t('Chỉ chủ cơ sở sửa được ảnh, tiện nghi, chính sách và tài khoản nhận tiền.', 'Only the owner can edit photos, facilities, policies and the payout account.')}</p>}
          </>}
          {section === 'reviews' && <PartnerReviews key={property.id} kind="stay" ownerId={property.id} lang={lang} />}
          {section === 'money' && owner && <HotelMoney t={t} lang={lang} property={property} openListing={() => open('listing')} />}
          {section === 'team' && owner && <HotelTeam t={t} property={property} explain={explain} />}
        </div>
      )}
    </PortalShell>
  )
}

/** Today at a glance: what needs doing, who arrives and leaves, how full the week is. */
function HotelOverview({ t, lang, property, bookings, rooms, today, owner, openBookings, openListing }) {
  if (bookings == null) return <Spinner label={t('Đang tải…', 'Loading…')} />
  const month = today.slice(0, 7)
  const live = (b) => OPEN_PAYMENT.includes(b.payment_status) && !['rejected', 'no_show', 'guest_cancelled'].includes(b.fulfillment_status)
  const arrivals = bookings.filter((b) => b.check_in === today && live(b) && ['awaiting', 'confirmed'].includes(b.fulfillment_status))
  const departures = bookings.filter((b) => b.check_out === today && b.fulfillment_status === 'checked_in')
  const revenue = bookings.filter((b) => b.payment_status === 'paid' && !['rejected', 'no_show'].includes(b.fulfillment_status) && b.check_in.slice(0, 7) === month).reduce((sum, b) => sum + Number(b.total_price), 0)
  const totalRooms = rooms.filter((r) => r.active).reduce((sum, r) => sum + r.quantity, 0)
  // The next 7 nights: rooms held by paid or pending bookings that cover the night.
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(`${today}T12:00:00Z`); day.setUTCDate(day.getUTCDate() + i)
    const iso = day.toISOString().slice(0, 10)
    const held = bookings.filter((b) => live(b) && b.check_in <= iso && b.check_out > iso).length
    return { iso, held }
  })

  return (
    <>
      {!property.inventory_enabled && owner && (
        <button type="button" onClick={openListing} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-lantern/50 bg-lantern/10 px-4 py-3 text-left text-sm">
          <span><strong>{t('Cơ sở chưa mở bán.', 'Not live yet.')}</strong> {t('Hoàn thiện hồ sơ (ảnh, tiện nghi, chính sách, phòng, tài khoản nhận tiền) rồi bấm Mở bán.', 'Finish your profile (photos, facilities, policies, rooms, payout account), then go live.')}</span>
          <span className="shrink-0 font-semibold text-chili">{t('Hoàn thiện hồ sơ →', 'Finish profile →')}</span>
        </button>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('Cần xác nhận', 'To confirm')} value={bookings.filter((b) => matchesFilter(b, 'needs', today)).length} alert={bookings.some((b) => matchesFilter(b, 'needs', today))} onClick={() => openBookings('needs')} />
        <StatCard label={t('Nhận phòng hôm nay', 'Arriving today')} value={arrivals.length} onClick={() => openBookings('today')} />
        <StatCard label={t('Đang ở', 'In house')} value={bookings.filter((b) => b.fulfillment_status === 'checked_in').length} onClick={() => openBookings('inhouse')} />
        <StatCard label={t('Doanh thu tháng này', 'Revenue this month')} value={formatVnd(revenue)} hint={t('đơn đã thanh toán, theo ngày nhận phòng', 'paid, by check-in date')} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <PortalCard title={t('Hôm nay', 'Today')}>
          {!arrivals.length && !departures.length && <p className="text-sm text-ink-muted">{t('Không có khách đến hay đi hôm nay.', 'No arrivals or departures today.')}</p>}
          <ul className="divide-y divide-line">
            {arrivals.map((b) => <li key={b.id} className="flex items-center justify-between gap-2 py-2 text-sm"><span><SignIn size={13} className="mr-1.5 inline text-herb" />{b.guest_name} · {b.room_name}</span><span className="text-2xs text-ink-faint">{FULFILLMENT[b.fulfillment_status]?.[lang]}</span></li>)}
            {departures.map((b) => <li key={b.id} className="flex items-center justify-between gap-2 py-2 text-sm"><span><SignOut size={13} className="mr-1.5 inline text-chili" />{b.guest_name} · {b.room_name}</span><span className="text-2xs text-ink-faint">{t('Trả phòng', 'Check-out')}</span></li>)}
          </ul>
        </PortalCard>
        <PortalCard title={t('Công suất 7 đêm tới', 'Next 7 nights')}>
          {totalRooms === 0 ? <p className="text-sm text-ink-muted">{t('Chưa có loại phòng nào đang bán.', 'No rooms on sale yet.')}</p> : (
            <ul className="space-y-1.5">
              {week.map(({ iso, held }) => {
                const pct = Math.min(100, Math.round((held / totalRooms) * 100))
                return (
                  <li key={iso} className="grid grid-cols-[96px_1fr_72px] items-center gap-2 text-xs">
                    <span className="whitespace-nowrap font-utility text-ink-muted">{formatDay(iso)}</span>
                    <span className="h-2.5 overflow-hidden rounded-full bg-paper-2"><span className={`block h-full rounded-full ${pct >= 90 ? 'bg-chili' : 'bg-herb'}`} style={{ width: `${pct}%` }} /></span>
                    <span className="whitespace-nowrap text-right font-utility tabular">{held}/{totalRooms} · {pct}%</span>
                  </li>
                )
              })}
            </ul>
          )}
        </PortalCard>
      </div>
    </>
  )
}

/** Every booking for the property, filtered and searchable, with the hotel's actions. */
function HotelBookings({ t, lang, bookings, filter, setFilter, today, explain, reload }) {
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')
  const [dialog, ask] = useInputDialog(t)
  const q = normalizeVi(query)
  const shown = (bookings ?? []).filter((b) => matchesFilter(b, filter, today))
    .filter((b) => !q || normalizeVi(`${b.guest_name} ${b.guest_phone ?? ''} ${b.guest_email ?? ''} ${b.payment_code ?? ''} ${b.room_name}`).includes(q))
  if (filter === 'history' || filter === 'all') shown.reverse()

  async function act(b, status, dialogOptions) {
    let note = ''
    if (dialogOptions) {
      note = await ask(dialogOptions)
      if (note == null) return
    }
    setBusyId(b.id); setError('')
    try { await partner.setFulfillment(b.id, status, note); reload() } catch (err) { setError(explain(err)) }
    setBusyId(null)
  }
  const reasonDialog = (title, body) => ({ title, body, label: t('Lý do (khách sẽ thấy)', 'Reason (the guest will see it)'), confirmLabel: t('Xác nhận', 'Confirm'), minLength: 3, danger: true })

  return (
    <PortalCard>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
          {FILTERS.map((f) => {
            const n = bookings ? bookings.filter((b) => matchesFilter(b, f.id, today)).length : null
            return (
              <button key={f.id} type="button" onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}
                className={`shrink-0 rounded-full px-3.5 py-1.5 font-utility text-2xs font-semibold ${filter === f.id ? 'bg-ink text-paper' : 'border border-line text-ink-muted'}`}>
                {f[lang]}{n != null && <span className="ml-1 opacity-60">{n}</span>}
              </button>
            )
          })}
        </div>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Tìm tên, SĐT, mã đơn…', 'Search name, phone, code…')} aria-label={t('Tìm đơn', 'Search bookings')} className={`${INPUT} md:max-w-[260px]`} />
      </div>
      {error && <p role="alert" className="mb-3 rounded-xl bg-chili/10 px-4 py-2.5 text-sm text-chili">{error}</p>}
      {bookings == null && <Spinner label={t('Đang tải đơn…', 'Loading bookings…')} />}
      {bookings != null && !shown.length && <p className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-ink-muted">{t('Không có đơn nào ở mục này.', 'Nothing here.')}</p>}
      <ul className="divide-y divide-line">
        {shown.map((b) => {
          const pay = PAYMENT[b.payment_status] ?? PAYMENT.pending
          const ful = FULFILLMENT[b.fulfillment_status] ?? FULFILLMENT.awaiting
          const open = OPEN_PAYMENT.includes(b.payment_status)
          const arrived = today >= b.check_in
          const busy = busyId === b.id
          return (
            <li key={b.id} className="flex flex-col gap-3 py-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-md font-bold">{b.guest_name}</span>
                  <span className={`rounded-full px-2 py-0.5 font-utility text-micro font-semibold ${ful.style}`}>{ful[lang]}</span>
                  <span className={`rounded-full px-2 py-0.5 font-utility text-micro font-semibold ${pay.style}`}>{pay[lang]}</span>
                  {b.payment_txn_ref === 'DEMO' && <span title={t('Thanh toán ở chế độ demo — không có tiền thật, không được đối soát.', 'Paid in demo mode — no real money, never paid out.')} className="rounded-full bg-paper-2 px-2 py-0.5 font-utility text-micro font-semibold text-ink-muted">Demo</span>}
                </div>
                <div className="text-sm text-ink-muted">{b.room_name} · {t(`${b.guests} khách`, `${b.guests} guests`)} · {formatVnd(b.total_price)}</div>
                <div className="font-utility text-xs"><SignIn size={12} className="mr-1 inline" />{formatDay(b.check_in)} <span className="text-ink-faint">→</span> <SignOut size={12} className="mx-1 inline" />{formatDay(b.check_out)} <span className="text-ink-faint">· {t(`${b.nights} đêm`, `${b.nights} nights`)} · {b.payment_code}</span></div>
                <div className="flex flex-wrap gap-x-4 text-xs">
                  {b.guest_phone && <a href={`tel:${b.guest_phone}`} className="inline-flex items-center gap-1 text-chili hover:underline"><Phone size={12} />{b.guest_phone}</a>}
                  {b.guest_email && <a href={`mailto:${b.guest_email}`} className="inline-flex items-center gap-1 text-ink-muted hover:underline"><EnvelopeSimple size={12} />{b.guest_email}</a>}
                </div>
                {b.hotel_note && <p className="text-2xs text-ink-faint">{t('Ghi chú', 'Note')}: {b.hotel_note}</p>}
                {b.fulfillment_status === 'guest_cancelled' && <p className="text-2xs text-ink-muted">{t(`Khách huỷ${b.cancel_reason ? ` (${b.cancel_reason})` : ''} — hoàn khách ${formatVnd(b.refund_amount)}, cơ sở giữ lại ${formatVnd(b.total_price - b.refund_amount)} (được đối soát).`, `Guest cancelled — refunded ${formatVnd(b.refund_amount)}, you keep ${formatVnd(b.total_price - b.refund_amount)} (paid out).`)}</p>}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2 md:justify-end">
                {open && b.fulfillment_status === 'awaiting' && (
                  b.payment_status === 'paid'
                    ? <button type="button" disabled={busy} className={PRIMARY_SM} onClick={() => act(b, 'confirmed')}><CheckCircle size={13} />{t('Xác nhận còn phòng', 'Confirm')}</button>
                    : <span className="self-center text-2xs text-ink-faint">{t('Chờ khách thanh toán mới xác nhận được', 'Can confirm once paid')}</span>
                )}
                {open && b.fulfillment_status === 'confirmed' && <>
                  <button type="button" disabled={busy || !arrived} title={arrived ? '' : t('Chưa đến ngày nhận phòng', 'Not the check-in date yet')} className={PRIMARY_SM} onClick={() => act(b, 'checked_in')}><DoorOpen size={13} />{t('Nhận phòng', 'Check in')}</button>
                  <button type="button" disabled={busy || !arrived} className={BUTTON} onClick={() => act(b, 'no_show', reasonDialog(t('Khách không đến', 'Guest did not arrive'), t('Đánh dấu khi đã quá giờ nhận phòng mà khách không đến.', 'After the check-in time has passed without the guest.')))}><UserMinus size={13} />{t('Không đến', 'No-show')}</button>
                </>}
                {open && ['awaiting', 'confirmed'].includes(b.fulfillment_status) && (
                  <button type="button" disabled={busy} className={DANGER} onClick={() => act(b, 'rejected', reasonDialog(t('Từ chối đơn đặt phòng', 'Reject booking'), t('Ví dụ hết phòng. Nếu khách đã trả tiền, FoodTrip sẽ hoàn tiền cho khách.', 'e.g. fully booked. If the guest paid, FoodTrip refunds them.')))}><X size={13} />{t('Từ chối', 'Reject')}</button>
                )}
                {b.fulfillment_status === 'checked_in' && <button type="button" disabled={busy} className={PRIMARY_SM} onClick={() => act(b, 'completed')}><SignOut size={13} />{t('Trả phòng', 'Check out')}</button>}
              </div>
            </li>
          )
        })}
      </ul>
      {dialog}
    </PortalCard>
  )
}

/**
 * What FoodTrip owes the property: stays that are over and not yet paid out,
 * money still to come, month by month, and every past payout with its bank
 * reference — what Agoda calls the finance page.
 */
function HotelMoney({ t, lang, property, openListing }) {
  const [statement, setStatement] = useState(null)
  const [payout, setPayout] = useState(undefined)
  const [error, setError] = useState('')
  useEffect(() => {
    partner.getStatement(property.id).then(setStatement).catch(() => setError(t('Chưa tải được số liệu.', 'Could not load the figures.')))
    partner.getPayout(property.id).then(setPayout).catch(() => setPayout(null))
  }, [property.id, t])
  if (error) return <p role="alert" className="text-sm text-chili">{error}</p>
  if (!statement) return <Spinner label={t('Đang tải số liệu…', 'Loading the figures…')} />
  const pct = Number(statement.commission_pct)
  const monthLabel = (ym) => new Date(`${ym}-15T12:00:00`).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-GB', { month: 'long', year: 'numeric' })
  const STATUS = { pending: [t('Chờ chuyển', 'Pending'), 'bg-lantern/20 text-lantern'], paid: [t('Đã chuyển', 'Paid'), 'bg-herb/15 text-herb'] }
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('Chờ đối soát', 'Awaiting payout')} value={formatVnd(statement.unsettled.net)} hint={t(`${statement.unsettled.count} đơn đã trả phòng`, `${statement.unsettled.count} finished stays`)} />
        <StatCard label={t('Sắp tới', 'Upcoming')} value={formatVnd(statement.upcoming.gross)} hint={t(`${statement.upcoming.count} đơn đã thanh toán, chưa trả phòng`, `${statement.upcoming.count} paid, stay not over`)} />
        {statement.demo > 0 && <p className="col-span-full rounded-xl bg-paper-2 px-4 py-2.5 text-sm text-ink-muted">{t(`${statement.demo} đơn được "thanh toán" ở chế độ demo (chưa có cổng thanh toán thật) — không tính vào doanh thu và không được đối soát.`, `${statement.demo} booking(s) were "paid" in demo mode (no real gateway yet) — not counted and never paid out.`)}</p>}
        <StatCard label={t('Hoa hồng FoodTrip', 'FoodTrip commission')} value={`${pct}%`} hint={t('theo điều khoản đã ký', 'per your signed terms')} />
        <StatCard label={t('Đã nhận', 'Paid out')} value={formatVnd(statement.settlements.filter((s) => s.status === 'paid').reduce((sum, s) => sum + Number(s.net), 0))} hint={t(`${statement.settlements.filter((s) => s.status === 'paid').length} lần chuyển`, `${statement.settlements.filter((s) => s.status === 'paid').length} transfers`)} />
      </div>
      <PortalCard title={t('Tài khoản nhận tiền', 'Payout account')}>
        {payout === undefined ? <Spinner label="…" /> : payout
          ? <p className="text-sm">{payout.bank_name} · ••••{payout.account_number.slice(-4)} · {payout.account_holder} <button type="button" onClick={openListing} className="ml-2 text-chili hover:underline">{t('Đổi', 'Change')}</button></p>
          : <p className="text-sm text-lantern">{t('Chưa khai tài khoản nhận tiền — FoodTrip chưa thể chuyển tiền cho bạn.', 'No payout account yet — FoodTrip cannot pay you.')} <button type="button" onClick={openListing} className="ml-1 font-semibold text-chili hover:underline">{t('Khai ngay →', 'Add one →')}</button></p>}
      </PortalCard>
      <PortalCard title={t('Theo tháng (đơn đã trả phòng)', 'By month (finished stays)')}>
        {!statement.months.length ? <p className="text-sm text-ink-muted">{t('Chưa có đơn nào hoàn thành.', 'No finished stays yet.')}</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[440px] text-sm">
            <thead className="text-left font-utility text-2xs uppercase tracking-wide text-ink-faint"><tr><th className="py-2">{t('Tháng', 'Month')}</th><th>{t('Đơn', 'Stays')}</th><th>{t('Tiền phòng', 'Room revenue')}</th><th>{t('Hoa hồng', 'Commission')}</th><th>{t('Thực nhận', 'You receive')}</th></tr></thead>
            <tbody className="divide-y divide-line">
              {statement.months.map((m) => <tr key={m.month}><td className="py-2 capitalize">{monthLabel(m.month)}</td><td className="tabular">{m.count}</td><td className="tabular">{formatVnd(m.gross)}</td><td className="tabular text-ink-muted">−{formatVnd(m.commission)}</td><td className="font-semibold tabular">{formatVnd(m.gross - m.commission)}</td></tr>)}
            </tbody>
          </table></div>
        )}
      </PortalCard>
      <PortalCard title={t('Các lần đối soát', 'Payouts')}>
        {!statement.settlements.length ? <p className="text-sm text-ink-muted">{t('FoodTrip lập bảng đối soát định kỳ cho các đơn đã trả phòng và chuyển tiền vào tài khoản của bạn.', 'FoodTrip settles finished stays periodically and transfers the money to your account.')}</p> : (
          <ul className="divide-y divide-line">
            {statement.settlements.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span>{t(`Đến ${formatDay(s.period_end)}`, `Up to ${formatDay(s.period_end)}`)} · {t(`${s.item_count} đơn`, `${s.item_count} stays`)} · <strong>{formatVnd(s.net)}</strong> <span className="text-2xs text-ink-faint">({formatVnd(s.gross)} − {Number(s.commission_pct)}%)</span></span>
                <span className="flex items-center gap-2">{s.reference && <span className="font-utility text-2xs text-ink-faint">{s.reference}</span>}<span className={`rounded-full px-2 py-0.5 font-utility text-micro font-semibold ${STATUS[s.status][1]}`}>{STATUS[s.status][0]}</span></span>
              </li>
            ))}
          </ul>
        )}
      </PortalCard>
    </>
  )
}

/** The owner's team: add staff by their FoodTrip email, remove them when they leave. */
function HotelTeam({ t, property, explain }) {
  const [team, setTeam] = useState(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const load = useCallback(() => { partner.getTeam(property.id).then(setTeam).catch(() => setTeam([])) }, [property.id])
  useEffect(load, [load])
  async function run(fn) {
    setBusy(true); setError('')
    try { await fn(); load(); setEmail('') } catch (err) { setError(explainTeam(err, t) ?? explain(err)) }
    setBusy(false)
  }
  return (
    <PortalCard title={t('Nhân sự', 'Team')}>
      <p className="mb-4 text-sm text-ink-muted">{t('Nhân viên xem và xử lý đơn đặt phòng (xác nhận, nhận phòng, trả phòng), nhưng không sửa giá, hồ sơ hay tài khoản nhận tiền và không xem doanh thu.', 'Staff see and handle bookings (confirm, check in, check out) but cannot change prices, the profile or the payout account, nor see revenue.')}</p>
      <form className="mb-4 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); run(() => partner.setStaff(property.id, email, true)) }}>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('Email tài khoản FoodTrip của nhân viên', 'Staff member’s FoodTrip email')} className={`${INPUT} max-w-[340px]`} />
        <button type="submit" disabled={busy} className={PRIMARY_SM}>{t('Thêm nhân viên', 'Add staff')}</button>
      </form>
      {error && <p role="alert" className="mb-3 text-sm text-chili">{error}</p>}
      {team == null ? <Spinner label="…" /> : (
        <ul className="divide-y divide-line">
          {team.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
              <span className="min-w-0 truncate">{m.email} <span className="text-2xs text-ink-faint">· {m.role === 'owner' ? t('chủ cơ sở', 'owner') : t('nhân viên', 'staff')}</span></span>
              {m.role === 'staff' && <button type="button" disabled={busy} onClick={() => run(() => partner.setStaff(property.id, m.email, false))} className={DANGER}>{t('Gỡ', 'Remove')}</button>}
            </li>
          ))}
        </ul>
      )}
    </PortalCard>
  )
}

function explainTeam(err, t) {
  const message = String(err?.message ?? '')
  if (message.includes('account-not-found')) return t('Email này chưa có tài khoản FoodTrip — nhờ nhân viên đăng ký trước.', 'No FoodTrip account with that email — ask them to sign up first.')
  if (message.includes('member-not-removable')) return t('Không gỡ được người này.', 'That person cannot be removed.')
  return null
}

/** The property's name and address, and the contact details its owner keeps current. */
function PropertyCard({ property, t, explain, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ phone: property.phone ?? '', email: property.email ?? '', note: property.note ?? '' })
  const [error, setError] = useState('')
  useEffect(() => { setForm({ phone: property.phone ?? '', email: property.email ?? '', note: property.note ?? '' }); setEditing(false) }, [property])

  async function save(e) {
    e.preventDefault(); setError('')
    try { await partner.updatePropertyContact(property.id, form); setEditing(false); onSaved() } catch (err) { setError(explain(err)) }
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-paper-2 text-chili"><Buildings size={22} weight="duotone" /></span>
          <div className="min-w-0">
            <h2 className="text-xl font-bold">{property.name}</h2>
            <p className="text-sm text-ink-muted">{property.address}</p>
            <p className="mt-1 text-2xs text-ink-faint">
              {property.role === 'owner' ? t('Bạn là chủ khách sạn', 'You own this property') : t('Bạn là nhân viên', 'You are staff here')} ·{' '}
              <Link to={`/booking/${encodeURIComponent(property.hotel_place_id)}`} className="text-chili hover:underline">{t('Trang đặt phòng', 'Booking page')}</Link>
            </p>
          </div>
        </div>
        {property.role === 'owner' && !editing && <button type="button" onClick={() => setEditing(true)} className={BUTTON}><PencilSimple size={13} />{t('Sửa liên hệ', 'Edit contact')}</button>}
      </div>
      {!editing && (property.phone || property.email || property.note) && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-muted">
          {property.phone && <span className="inline-flex items-center gap-1"><Phone size={13} />{property.phone}</span>}
          {property.email && <span className="inline-flex items-center gap-1"><EnvelopeSimple size={13} />{property.email}</span>}
          {property.note && <span>{property.note}</span>}
        </div>
      )}
      {editing && (
        <form onSubmit={save} className="mt-4 grid gap-3 sm:grid-cols-3">
          <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder={t('Số điện thoại lễ tân', 'Front desk phone')} className={INPUT} />
          <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email" className={INPUT} />
          <input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder={t('Ghi chú: giờ nhận phòng, chỗ để xe…', 'Note: check-in time, parking…')} className={INPUT} />
          {error && <p role="alert" className="text-sm text-chili sm:col-span-3">{error}</p>}
          <div className="flex gap-2 sm:col-span-3">
            <button type="submit" className={PRIMARY_SM}>{t('Lưu', 'Save')}</button>
            <button type="button" onClick={() => setEditing(false)} className={BUTTON}>{t('Huỷ', 'Cancel')}</button>
          </div>
        </form>
      )}
    </div>
  )
}
