import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Bed, Compass, CheckCircle, ArrowRight, Handshake, MapPinLine, Wallet, ChartLineUp } from '@phosphor-icons/react'
import { getCurrentTerms } from '../lib/partner.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { fadeUp, staggerContainer } from '../motion/variants.js'

/**
 * "Partner with FoodTrip" — the front door for hotels, homestays and tour
 * operators, the way Agoda's "List your property" and Traveloka's "Partner
 * with us" pages are: what joining gives you, how it works, what it costs,
 * and one button per kind of partner.
 */
export default function PartnerLanding() {
  const { lang } = useLanguage()
  const t = (vi, en) => (lang === 'vi' ? vi : en)
  const [terms, setTerms] = useState(null)
  useEffect(() => { getCurrentTerms().then(setTerms).catch(() => setTerms(null)) }, [])

  const kinds = [
    {
      icon: Bed, to: '/partner',
      title: t('Cơ sở lưu trú', 'Places to stay'),
      who: t('Khách sạn, nhà nghỉ, homestay, villa, hostel', 'Hotels, guesthouses, homestays, villas, hostels'),
      points: [
        t('Cơ sở chưa có trên bản đồ vẫn đăng ký được — FoodTrip cấp mã riêng', 'Not on any map? You can still join — FoodTrip gives you an id'),
        t('Tự quản lý loại phòng, giá theo ngày và số phòng trống', 'Manage your own room types, daily rates and availability'),
        t('Được gợi ý khi du khách lên lịch trình gần cơ sở', 'Suggested when travellers plan a trip nearby'),
      ],
      cta: t('Đăng ký cơ sở lưu trú', 'List your property'),
    },
    {
      icon: Compass, to: '/partner/tours',
      title: t('Đơn vị tổ chức tour', 'Tour operators'),
      who: t('Food tour, tour trải nghiệm, tour trong ngày và nhiều ngày', 'Food tours, experiences, day and multi-day tours'),
      points: [
        t('Trang tour đầy đủ: ảnh, lịch trình từng ngày, bao gồm, chính sách', 'A full tour page: photos, day-by-day programme, inclusions, policies'),
        t('Tour xuất hiện ngay trong bước lên lịch trình, đúng ngày khách đi', 'Your tours appear inside trip planning, on the days travellers are there'),
        t('Phân công hướng dẫn viên, xác nhận chỗ cho từng đoàn', 'Assign guides and confirm seats for each group'),
      ],
      cta: t('Đăng ký đơn vị tour', 'Register your tours'),
    },
  ]

  const steps = [
    [t('Đăng ký', 'Sign up'), t('Tài khoản FoodTrip + form 4 bước, khoảng 5 phút.', 'A FoodTrip account and a 4-step form, about 5 minutes.')],
    [t('Xác minh', 'Verification'), t('FoodTrip gọi điện xác minh và duyệt trong 1–3 ngày làm việc.', 'FoodTrip calls to verify and approves within 1–3 working days.')],
    [t('Hoàn thiện hồ sơ', 'Complete your listing'), t('Ảnh, tiện nghi, chính sách, phòng & giá, tài khoản nhận tiền.', 'Photos, facilities, policies, rooms & rates, payout account.')],
    [t('Mở bán', 'Go live'), t('Bấm "Mở bán" và bắt đầu nhận khách từ FoodTrip.', 'Press "Go live" and start welcoming FoodTrip guests.')],
  ]

  const why = [
    [MapPinLine, t('Khách đến đúng lúc lên kế hoạch', 'Reach travellers while they plan'), t('FoodTrip gợi ý chỗ ở và tour ngay trong lịch trình ăn uống của du khách — không phải trong một danh sách dài.', 'FoodTrip suggests stays and tours inside each traveller’s food itinerary — not in an endless list.')],
    [Wallet, t('Khách trả trước, bạn nhận đủ', 'Guests pay upfront'), terms ? t(`Khách chuyển khoản trước cho FoodTrip; bạn nhận tiền ${terms.payout_days} ngày làm việc sau khi khách trả phòng, trừ ${Number(terms.commission_pct)}% hoa hồng.`, `Guests pay FoodTrip upfront; you are paid ${terms.payout_days} working days after check-out, less ${Number(terms.commission_pct)}% commission.`) : t('Khách chuyển khoản trước cho FoodTrip; bạn chỉ đón khách đã thanh toán.', 'Guests pay FoodTrip upfront; you only host paid guests.')],
    [ChartLineUp, t('Không phí đăng ký', 'No sign-up fee'), t('Đăng ký, đăng tin và quản lý đều miễn phí. Chỉ trả hoa hồng khi có đơn hoàn thành.', 'Joining, listing and managing are free. You only pay commission on completed bookings.')],
  ]

  return (
    <div className="mx-auto max-w-[1180px] px-5 py-12 md:px-8 md:py-16">
      <motion.div initial="hidden" animate="show" variants={staggerContainer(0.08)} className="max-w-[760px]">
        <motion.span variants={fadeUp} className="eyebrow eyebrow-tick">{t('Hợp tác với FoodTrip', 'Partner with FoodTrip')}</motion.span>
        <motion.h1 variants={fadeUp} className="mt-3 text-3xl font-bold leading-[1.15] md:text-4xl">
          {t('Đón du khách yêu ẩm thực — ngay lúc họ lên lịch trình.', 'Welcome food-loving travellers — right when they plan.')}
        </motion.h1>
        <motion.p variants={fadeUp} className="mt-4 text-md text-ink-muted">
          {t('Chọn loại đối tác để bắt đầu. Bạn dùng chính tài khoản FoodTrip của mình; chưa có thì tạo miễn phí ở bước đăng ký.', 'Pick the kind of partner you are. You use your own FoodTrip account; if you have none, create one for free when you sign up.')}
        </motion.p>
      </motion.div>

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        {kinds.map(({ icon: Icon, to, title, who, points, cta }) => (
          <article key={to} className="flex flex-col rounded-2xl border border-line bg-surface p-6 shadow-soft">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-chili/10 text-chili"><Icon size={26} weight="duotone" /></span>
            <h2 className="mt-4 text-2xl font-bold">{title}</h2>
            <p className="mt-1 text-sm text-ink-muted">{who}</p>
            <ul className="mt-4 flex-1 space-y-2">
              {points.map((p) => <li key={p} className="flex items-start gap-2 text-md"><CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-herb" />{p}</li>)}
            </ul>
            <Link to={to} className="mt-6 inline-flex items-center justify-center gap-2 self-start rounded-full bg-chili px-6 py-3 font-utility text-md font-semibold text-chili-ink shadow-soft transition-shadow hover:shadow-lifted">
              {cta} <ArrowRight size={16} weight="bold" />
            </Link>
          </article>
        ))}
      </div>

      <section className="mt-14">
        <h2 className="text-2xl font-bold">{t('Bắt đầu trong 4 bước', 'Get started in 4 steps')}</h2>
        <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(([title, body], i) => (
            <li key={title} className="rounded-2xl border border-line bg-surface p-5">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-chili font-utility text-md font-bold text-chili-ink">{i + 1}</span>
              <div className="mt-3 font-bold">{title}</div>
              <p className="mt-1 text-sm text-ink-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-14 grid gap-5 md:grid-cols-3">
        {why.map(([Icon, title, body]) => (
          <div key={title} className="rounded-2xl bg-paper-2 p-5">
            <Icon size={26} className="text-herb" weight="duotone" />
            <div className="mt-3 font-bold">{title}</div>
            <p className="mt-1 text-sm text-ink-muted">{body}</p>
          </div>
        ))}
      </section>

      <p className="mt-12 flex items-center gap-2 text-sm text-ink-muted">
        <Handshake size={18} className="text-chili" />
        {t('Cần hỗ trợ đăng ký?', 'Need help signing up?')} <Link to="/contact" className="font-semibold text-chili hover:underline">{t('Liên hệ FoodTrip', 'Contact FoodTrip')}</Link>
      </p>
    </div>
  )
}
