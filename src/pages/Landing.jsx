import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowRight, BookmarkSimple, Buildings, Bridge, Waves, Storefront, Mountains, Boat,
} from '@phosphor-icons/react'
import HeroPlanner from '../components/landing/HeroPlanner.jsx'
import SmoothScrollHero from '../components/ui/smooth-scroll-hero.jsx'
import ExpandingCards from '../components/ui/expanding-cards.jsx'
import CountUp from '../components/ui/CountUp.jsx'
import ItineraryTicket from '../components/ticket/ItineraryTicket.jsx'
import { CITIES, ITINERARY_TEMPLATES } from '../data/destinations.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { fadeUp, staggerContainer, viewportOnce } from '../motion/variants.js'

const CITY_VISUALS = {
  hanoi: { icon: Buildings, image: '/media/cities/hanoi.jpg' },
  hoian: { icon: Bridge, image: '/media/cities/hoian.jpg' },
  danang: { icon: Waves, image: '/media/cities/danang.jpg' },
  hcmc: { icon: Storefront, image: '/media/cities/hcmc.jpg' },
  dalat: { icon: Mountains, image: '/media/cities/dalat.jpg' },
  hue: { icon: Boat, image: '/media/cities/hue.jpg' },
}

const C = {
  vi: {
    eyebrow: 'Khám phá ẩm thực & du lịch',
    h1a: 'Ăn ngon, đi vui,', h1b: 'lịch trình', h1c: 'vừa ý.',
    bridge: 'Đóng gói xong xuôi — còn thiếu mỗi lịch trình ăn ngon.',
    sub: 'FoodTrip giúp tìm địa điểm trên bản đồ, lưu nơi yêu thích và gợi ý lịch trình theo thời gian, ngân sách và sở thích. Bạn có thể kiểm tra thông tin và chỉnh sửa từng điểm dừng.',
    stats: [
      { to: CITIES.length, label: 'Thành phố trong danh mục' },
      { value: 'Bản đồ', label: 'Khám phá địa điểm' },
      { value: 'Lịch trình', label: 'Tự chọn và chỉnh sửa' },
    ],
    stepsEyebrow: 'Cách FoodTrip hoạt động',
    stepsTitle: 'Bốn bước, một lịch trình vừa khít.',
    stepsSub: 'Chọn nhu cầu, xem gợi ý và điều chỉnh trước khi lưu chuyến đi.',
    steps: [
      { t: 'Chọn điểm đến', d: 'Tìm thành phố hoặc khu vực và xem các địa điểm có trong dữ liệu.' },
      { t: 'Set thời gian & ngân sách', d: 'Chọn số ngày, số người và ngân sách mỗi người để tham khảo gợi ý phù hợp.' },
      { t: 'Chọn khẩu vị & phương tiện', d: 'Thích hải sản hay ăn chay, đi xe máy hay ô tô — lịch trình bám sát sở thích của bạn.' },
      { t: 'Nhận lịch trình hoàn chỉnh', d: 'Xem thứ tự điểm dừng và thông tin hiện có; xác nhận giá, giờ mở cửa trước khi đi.' },
    ],
    ticketEyebrow: 'Lịch trình mẫu',
    ticketTitle: 'Một vé lịch trình, đủ cả ăn lẫn đi.',
    ticketSub: 'Ví dụ lịch trình Hội An 2 ngày 1 đêm để bạn tham khảo cách trình bày.',
    ticketCta: 'Tự tạo lịch trình của bạn',
    destEyebrow: 'Địa điểm nổi bật',
    destTitle: 'Đi đâu cũng có quán để mê.',
    reviewsEyebrow: 'Đánh giá & lưu địa điểm',
    reviewsTitle: 'Xem thông tin, lưu nơi bạn thích.',
    reviewsSub: 'Xem nguồn đánh giá khi có dữ liệu và lưu địa điểm vào tài khoản để tìm lại sau.',
    reviewCardTitle: 'Đọc đánh giá có nguồn',
    reviewHint: 'Địa điểm có thể có đánh giá Google hoặc đánh giá đặt chỗ trên FoodTrip. Dữ liệu mẫu được gắn nhãn riêng; không phải địa điểm nào cũng có nhận xét.',
    saveCardTitle: 'Sổ tay ẩm thực của riêng bạn',
    saveItems: [
      { t: 'Bánh xèo miền Trung', s: 'Đã lưu · Đà Nẵng' },
      { t: 'Cà phê muối', s: 'Đã lưu · Huế' },
      { t: 'Nem lụi sông Hàn', s: 'Đã lưu · Đà Nẵng' },
    ],
    saveFooter: 'Danh sách minh hoạ — không phải dữ liệu của một người dùng',
    ctaTitle: 'Chuyến đi tiếp theo, để FoodTrip lo phần lịch trình.',
    ctaPrimary: 'Bắt đầu miễn phí',
    ctaSecondary: 'Xem lịch trình mẫu',
    ctaNote: 'Đăng nhập để lưu và quản lý lịch trình',
  },
  en: {
    eyebrow: 'Food & travel discovery',
    h1a: 'Eat well, travel happy,', h1b: 'itinerary', h1c: 'just right.',
    bridge: 'All packed — just missing the delicious itinerary.',
    sub: 'FoodTrip helps you find places on a map, save favourites and build suggested itineraries around your time, budget and interests. Check the information and edit each stop before travelling.',
    stats: [
      { to: CITIES.length, label: 'Cities in the catalogue' },
      { value: 'Maps', label: 'Explore places' },
      { value: 'Itineraries', label: 'Choose and edit stops' },
    ],
    stepsEyebrow: 'How FoodTrip works',
    stepsTitle: 'Four steps to a plan that fits.',
    stepsSub: 'Choose your preferences, review suggestions and adjust your trip before saving.',
    steps: [
      { t: 'Pick a destination', d: 'Search a city or area and browse the available place data.' },
      { t: 'Set time & budget', d: 'Set days, group size and a per-person budget to guide the suggestions.' },
      { t: 'Choose taste & transport', d: 'Seafood or vegetarian, motorbike or car — the plan follows your preferences.' },
      { t: 'Get your full itinerary', d: 'Review the stop order and available information; confirm prices and opening hours before visiting.' },
    ],
    ticketEyebrow: 'Sample itinerary',
    ticketTitle: 'One ticket, both food and travel.',
    ticketSub: 'A sample 2-day, 1-night Hoi An itinerary showing how a trip is presented.',
    ticketCta: 'Build your own itinerary',
    destEyebrow: 'Featured destinations',
    destTitle: 'Wherever you go, there’s something to fall for.',
    reviewsEyebrow: 'Reviews & saved places',
    reviewsTitle: 'Explore information, save your favourites.',
    reviewsSub: 'Check review sources where data is available and save places to your account for later.',
    reviewCardTitle: 'Check the source of reviews',
    reviewHint: 'Places may have Google reviews or FoodTrip booking reviews. Sample data is labelled separately; some places have no reviews.',
    saveCardTitle: 'Your own food notebook',
    saveItems: [
      { t: 'Central-style banh xeo', s: 'Saved · Da Nang' },
      { t: 'Salt coffee', s: 'Saved · Hue' },
      { t: 'Han river grilled skewers', s: 'Saved · Da Nang' },
    ],
    saveFooter: 'Illustrative list — not a user’s saved data',
    ctaTitle: 'Let FoodTrip handle the plan for your next trip.',
    ctaPrimary: 'Get started free',
    ctaSecondary: 'See a sample itinerary',
    ctaNote: 'Sign in to save and manage itineraries',
  },
}

export default function Landing() {
  const { lang } = useLanguage()
  const c = C[lang]

  const hoianCity = CITIES.find((ci) => ci.id === 'hoian')
  const hoianDays = ITINERARY_TEMPLATES.hoian

  const cityCards = CITIES.filter((city) => CITY_VISUALS[city.id]).map((city) => ({
    id: city.id,
    title: city.name[lang],
    tagline: city.tagline[lang],
    image: CITY_VISUALS[city.id].image,
    icon: CITY_VISUALS[city.id].icon,
    linkHref: `/explore?city=${city.id}`,
  }))

  return (
    <>
      {/* CINEMATIC INTRO */}
      <SmoothScrollHero
        scrollHeight={320}
        desktopVideo="/media/hero-travel.mp4"
        mobileImage="/media/hero-travel.png"
        poster="/media/hero-travel.png"
      >
        <motion.div
          variants={staggerContainer(0.12)}
          initial="hidden"
          animate="show"
          className="mx-5 max-w-[640px] rounded-2xl bg-[#17130f]/95 px-5 py-6 text-center sm:px-8 sm:py-8"
        >
          <motion.span variants={fadeUp} className="eyebrow eyebrow-tick text-[#FF9E6D]">
            {c.eyebrow}
          </motion.span>
          <motion.h1 variants={fadeUp} className="mt-4 text-3xl sm:text-4xl md:text-5xl leading-[1.08] tracking-tight font-bold text-white [text-shadow:0_2px_20px_rgba(0,0,0,0.4)]">
            {c.h1a}<br />
            <span>{c.h1b} </span>
            <em className="not-italic text-[#FF9E6D] italic">{c.h1c}</em>
          </motion.h1>
          <Link to="/plan" className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#a02e10] px-6 py-3 font-utility text-sm font-semibold text-white">{c.ctaPrimary}<ArrowRight size={16} /></Link>
          <motion.p variants={fadeUp} className="mt-3 font-utility text-sm sm:text-md font-semibold text-white">
            {c.bridge}
          </motion.p>
        </motion.div>
      </SmoothScrollHero>

      {/* HERO PLANNER */}
      <section className="max-w-[1180px] mx-auto px-5 md:px-8 pt-14 md:pt-20 pb-16 md:pb-20">
        <motion.p
          initial="hidden"
          whileInView="show"
          viewport={viewportOnce}
          variants={fadeUp}
          className="text-base sm:text-lg text-ink-muted max-w-[56ch] mx-auto text-center mb-8"
        >
          {c.sub}
        </motion.p>

        <HeroPlanner />
      </section>

      {/* STATS */}
      <section className="border-y border-line bg-paper-2">
        <div className="max-w-[1180px] mx-auto grid grid-cols-1 sm:grid-cols-3">
          {c.stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial="hidden"
              whileInView="show"
              viewport={viewportOnce}
              variants={fadeUp}
              transition={{ delay: i * 0.08 }}
              className={`px-4 py-8 md:py-10 text-center border-line ${i < c.stats.length - 1 ? 'sm:border-r sm:border-dashed' : ''}`}
            >
              <div className="font-display font-bold text-2xl md:text-4xl text-chili">
                {s.value ?? <CountUp to={s.to} />}
              </div>
              <span className="font-utility text-xs uppercase tracking-wide text-ink-muted">{s.label}</span>
            </motion.div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="max-w-[1180px] mx-auto px-5 md:px-8 py-16 md:py-24">
        <SectionHead eyebrow={c.stepsEyebrow} title={c.stepsTitle} sub={c.stepsSub} />
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={viewportOnce}
          variants={staggerContainer(0.12)}
          className="grid gap-8 grid-cols-1 sm:grid-cols-1 sm:grid-cols-3"
        >
          {c.steps.map((step, i) => (
            <motion.div key={step.t} variants={fadeUp} className="pt-6 border-t-2 border-line-strong">
              <div className="w-[52px] h-[52px] rounded-full border-2 border-dashed border-line-strong flex items-center justify-center mb-4 font-display font-bold text-lg text-chili">
                {String(i + 1).padStart(2, '0')}
              </div>
              <h3 className="text-lg font-bold mb-2">{step.t}</h3>
              <p className="text-md text-ink-muted">{step.d}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ITINERARY TICKET SHOWCASE */}
      <section className="max-w-[1180px] mx-auto px-5 md:px-8 py-16 md:py-24">
        <SectionHead eyebrow={c.ticketEyebrow} title={c.ticketTitle} sub={c.ticketSub} />
        <ItineraryTicket city={hoianCity} days={hoianDays} people={2} budget={1500000} transport="bike" />
        <div className="flex justify-center mt-8">
          <Link to="/plan" className="inline-flex items-center gap-2 font-utility font-semibold text-md px-6 py-[14px] rounded-full border-[1.5px] border-line-strong hover:border-chili hover:text-chili transition-colors">
            {c.ticketCta} <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* DESTINATIONS */}
      <section className="py-16 md:py-24">
        <div className="max-w-[1180px] mx-auto px-5 md:px-8">
          <SectionHead eyebrow={c.destEyebrow} title={c.destTitle} />
          <motion.div initial="hidden" whileInView="show" viewport={viewportOnce} variants={fadeUp}>
            <ExpandingCards items={cityCards} defaultActiveIndex={0} />
          </motion.div>
        </div>
      </section>

      {/* REVIEWS & SAVE */}
      <section className="max-w-[1180px] mx-auto px-5 md:px-8 py-16 md:py-24">
        <SectionHead eyebrow={c.reviewsEyebrow} title={c.reviewsTitle} sub={c.reviewsSub} />
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={viewportOnce}
          variants={staggerContainer(0.14)}
          className="grid gap-6 grid-cols-1 md:grid-cols-2"
        >
          <motion.div variants={fadeUp} className="bg-surface border border-line rounded-[14px] p-6 shadow-soft flex flex-col gap-5">
            <h3 className="text-xl font-bold">{c.reviewCardTitle}</h3>
            <p className="text-md text-ink-muted">{c.reviewHint}</p>
          </motion.div>

          <motion.div variants={fadeUp} className="bg-surface border border-line rounded-[14px] p-6 shadow-soft flex flex-col gap-5">
            <h3 className="text-xl font-bold">{c.saveCardTitle}</h3>
            <div className="bg-paper-2 rounded-[10px] p-5 flex flex-col gap-1">
              {c.saveItems.map((item, i) => (
                <div key={item.t} className={`flex items-center gap-3 py-2.5 ${i < c.saveItems.length - 1 ? 'border-b border-dashed border-line' : ''}`}>
                  <div className="w-[38px] h-[38px] rounded-full border-2 border-herb text-herb flex items-center justify-center shrink-0">
                    <BookmarkSimple size={17} weight="fill" />
                  </div>
                  <div>
                    <div className="font-bold text-md">{item.t}</div>
                    <div className="text-sm text-ink-faint">{item.s}</div>
                  </div>
                </div>
              ))}
              <p className="text-sm text-ink-faint mt-2">{c.saveFooter}</p>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* FINAL CTA */}
      <section className="max-w-[1180px] mx-auto px-5 md:px-8 pb-20 md:pb-28">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={viewportOnce}
          variants={fadeUp}
          className="bg-herb text-herb-ink rounded-[18px] px-6 py-14 md:py-20 text-center flex flex-col items-center gap-5"
        >
          <h2 className="text-2xl md:text-4xl max-w-[20ch] font-bold">{c.ctaTitle}</h2>
          <div className="flex gap-3 flex-wrap justify-center">
            <Link to="/plan" className="inline-flex items-center gap-2 font-utility font-semibold text-md px-6 py-[14px] rounded-full bg-paper text-ink shadow-soft">
              {c.ctaPrimary}
            </Link>
            <Link to="/explore" className="inline-flex items-center gap-2 font-utility font-semibold text-md px-6 py-[14px] rounded-full border-[1.5px] border-white/50">
              {c.ctaSecondary}
            </Link>
          </div>
          <span className="font-utility text-sm opacity-80">{c.ctaNote}</span>
        </motion.div>
      </section>
    </>
  )
}

function SectionHead({ eyebrow, title, sub, noMargin = false }) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={viewportOnce}
      variants={staggerContainer(0.08)}
      className={`flex flex-col gap-3 max-w-[640px] ${noMargin ? '' : 'mb-10 md:mb-12'}`}
    >
      <motion.span variants={fadeUp} className="eyebrow eyebrow-tick">
        {eyebrow}
      </motion.span>
      <motion.h2 variants={fadeUp} className="text-2xl md:text-4xl leading-[1.15] font-bold">{title}</motion.h2>
      {sub && <motion.p variants={fadeUp} className="text-base text-ink-muted">{sub}</motion.p>}
    </motion.div>
  )
}
