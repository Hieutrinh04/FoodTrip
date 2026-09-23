import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowRight, BookmarkSimple, Star, Buildings, Bridge, Waves, Storefront, Mountains, Boat,
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
    eyebrow: 'Trợ lý ẩm thực & du lịch AI',
    h1a: 'Ăn ngon, đi vui,', h1b: 'lịch trình', h1c: 'vừa ý.',
    bridge: 'Đóng gói xong xuôi — còn thiếu mỗi lịch trình ăn ngon.',
    sub: 'FoodTrip gom hết quán ngon, điểm đến đáng đi và review thật từ cộng đồng — rồi để AI xếp thành một lịch trình khớp giờ mở cửa, khớp khoảng cách, khớp cả ngân sách của bạn.',
    trust: 'Hơn 41.000 tín đồ ẩm thực Việt đang dùng FoodTrip',
    stats: [
      { to: 26, suffix: '+', label: 'Quán & điểm đến' },
      { to: 6, label: 'Tỉnh thành nổi bật' },
      { to: 180, suffix: 'K+', label: 'Lịch trình đã tạo' },
      { to: 4.8, label: 'Từ 9.200 đánh giá', decimal: true },
    ],
    stepsEyebrow: 'Cách FoodTrip hoạt động',
    stepsTitle: 'Bốn bước, một lịch trình vừa khít.',
    stepsSub: 'Không cần tự dò bản đồ hay tính giờ mở cửa — bạn chỉ chọn, AI lo phần còn lại.',
    steps: [
      { t: 'Chọn điểm đến', d: 'Từ Hà Nội đến Cà Mau — gõ tên là ra quán ngon, điểm check-in được người thật đánh giá.' },
      { t: 'Set thời gian & ngân sách', d: 'Bao nhiêu ngày, đi mấy người, chi bao nhiêu — AI tính toán vừa khít, không đội chi phí.' },
      { t: 'Chọn khẩu vị & phương tiện', d: 'Thích hải sản hay ăn chay, đi xe máy hay ô tô — lịch trình bám sát sở thích của bạn.' },
      { t: 'Nhận lịch trình hoàn chỉnh', d: 'Giờ mở cửa, khoảng cách di chuyển, thứ tự ghé quán — mọi thứ đã được sắp vừa vặn.' },
    ],
    ticketEyebrow: 'Lịch trình mẫu',
    ticketTitle: 'Một vé lịch trình, đủ cả ăn lẫn đi.',
    ticketSub: 'Đây là lịch trình FoodTrip AI vừa tạo cho chuyến Hội An 2 ngày 1 đêm.',
    ticketCta: 'Tự tạo lịch trình của bạn',
    destEyebrow: 'Địa điểm nổi bật',
    destTitle: 'Đi đâu cũng có quán để mê.',
    reviewsEyebrow: 'Đánh giá & lưu địa điểm',
    reviewsTitle: 'Review thật, sổ tay của riêng bạn.',
    reviewsSub: 'Mỗi đánh giá đến từ người đã ăn thật, đi thật — và mọi nơi bạn thích đều có thể lưu lại cho chuyến sau.',
    reviewCardTitle: 'Đánh giá thật từ người đi thật',
    reviewQuote: '"Quán bún bò trong hẻm nhỏ mà FoodTrip gợi ý ngon hơn hẳn mấy chỗ nổi tiếng trên mạng. Giá cũng rất sinh viên."',
    reviewTags: ['Ngon', 'Giá tốt', 'View đẹp'],
    saveCardTitle: 'Sổ tay ẩm thực của riêng bạn',
    saveItems: [
      { t: 'Bánh xèo miền Trung', s: 'Đã lưu · Đà Nẵng' },
      { t: 'Cà phê muối', s: 'Đã lưu · Huế' },
      { t: 'Nem lụi sông Hàn', s: 'Đã lưu · Đà Nẵng' },
    ],
    saveFooter: 'Đã lưu 24 địa điểm tại Đà Nẵng',
    testiEyebrow: 'Người dùng nói gì',
    testiTitle: 'Bớt lo lịch trình, thêm vui chuyến đi.',
    testimonials: [
      { q: 'Đi Đà Lạt 3 ngày mà không cãi nhau lần nào về việc ăn gì, đi đâu — lần đầu tiên luôn.', who: 'An, 24 tuổi — TP.HCM' },
      { q: 'Tôi hay đi một mình, FoodTrip giúp tôi tin tưởng chọn quán lạ mà không sợ hớ giá.', who: 'Minh Thư, 27 tuổi — freelancer du lịch' },
      { q: 'Nhóm 4 đứa, ngân sách khác nhau, FoodTrip vẫn ra được lịch trình vừa túi tiền cả nhóm.', who: 'Nhóm bạn Hà Nội, 4 người' },
    ],
    ctaTitle: 'Chuyến đi tiếp theo, để FoodTrip lo phần lịch trình.',
    ctaPrimary: 'Bắt đầu miễn phí',
    ctaSecondary: 'Xem lịch trình mẫu',
    ctaNote: 'Không cần thẻ tín dụng · Sẵn sàng trong 2 phút',
  },
  en: {
    eyebrow: 'AI food & travel assistant',
    h1a: 'Eat well, travel happy,', h1b: 'itinerary', h1c: 'just right.',
    bridge: 'All packed — just missing the delicious itinerary.',
    sub: 'FoodTrip gathers great food, worthwhile destinations and real community reviews — then lets AI arrange them into a plan that matches opening hours, distances, and your budget.',
    trust: '41,000+ Vietnamese food lovers already use FoodTrip',
    stats: [
      { to: 26, suffix: '+', label: 'Places & destinations' },
      { to: 6, label: 'Featured cities' },
      { to: 180, suffix: 'K+', label: 'Itineraries generated' },
      { to: 4.8, label: 'From 9,200 reviews', decimal: true },
    ],
    stepsEyebrow: 'How FoodTrip works',
    stepsTitle: 'Four steps to a plan that fits.',
    stepsSub: 'No map-hunting or opening-hours math — you choose, AI handles the rest.',
    steps: [
      { t: 'Pick a destination', d: 'From Hanoi to Ca Mau — search a place and get real, community-reviewed spots.' },
      { t: 'Set time & budget', d: 'Days, group size, spend — AI fits it all without blowing your budget.' },
      { t: 'Choose taste & transport', d: 'Seafood or vegetarian, motorbike or car — the plan follows your preferences.' },
      { t: 'Get your full itinerary', d: 'Opening hours, travel distance, visiting order — everything already lines up.' },
    ],
    ticketEyebrow: 'Sample itinerary',
    ticketTitle: 'One ticket, both food and travel.',
    ticketSub: 'Here’s the itinerary FoodTrip AI just built for a 2-day, 1-night Hoi An trip.',
    ticketCta: 'Build your own itinerary',
    destEyebrow: 'Featured destinations',
    destTitle: 'Wherever you go, there’s something to fall for.',
    reviewsEyebrow: 'Reviews & saved places',
    reviewsTitle: 'Real reviews, your own notebook.',
    reviewsSub: 'Every review comes from someone who actually ate and traveled there — and any place you love can be saved for next time.',
    reviewCardTitle: 'Real reviews from real travelers',
    reviewQuote: '"That tiny alley bun bo place FoodTrip suggested was better than the famous spots online. And student-budget prices too."',
    reviewTags: ['Delicious', 'Good value', 'Great view'],
    saveCardTitle: 'Your own food notebook',
    saveItems: [
      { t: 'Central-style banh xeo', s: 'Saved · Da Nang' },
      { t: 'Salt coffee', s: 'Saved · Hue' },
      { t: 'Han river grilled skewers', s: 'Saved · Da Nang' },
    ],
    saveFooter: 'Saved 24 places in Da Nang',
    testiEyebrow: 'What travelers say',
    testiTitle: 'Less planning stress, more trip joy.',
    testimonials: [
      { q: '3 days in Da Lat and we never once argued about where to eat or go — a first for us.', who: 'An, 24 — Ho Chi Minh City' },
      { q: 'I travel solo a lot; FoodTrip lets me trust unfamiliar places without worrying about being overcharged.', who: 'Minh Thu, 27 — travel freelancer' },
      { q: 'Four of us, four different budgets — FoodTrip still built a plan that fit everyone.', who: 'A group of friends, Hanoi' },
    ],
    ctaTitle: 'Let FoodTrip handle the plan for your next trip.',
    ctaPrimary: 'Get started free',
    ctaSecondary: 'See a sample itinerary',
    ctaNote: 'No credit card · Ready in 2 minutes',
  },
}

const AVATAR_COLORS = ['bg-chili text-chili-ink', 'bg-herb text-herb-ink', 'bg-lantern text-lantern-ink']

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
        scrollHeight={1500}
        desktopVideo="/media/hero-travel.mp4"
        mobileImage="/media/hero-travel.png"
        poster="/media/hero-travel.png"
      >
        <motion.div
          variants={staggerContainer(0.12)}
          initial="hidden"
          animate="show"
          className="mx-6 max-w-[640px] text-center"
        >
          <motion.span variants={fadeUp} className="eyebrow eyebrow-tick text-[#FF9E6D]">
            {c.eyebrow}
          </motion.span>
          <motion.h1 variants={fadeUp} className="mt-4 text-3xl sm:text-4xl md:text-5xl leading-[1.08] tracking-tight font-bold text-white [text-shadow:0_2px_20px_rgba(0,0,0,0.4)]">
            {c.h1a}<br />
            <span>{c.h1b} </span>
            <em className="not-italic text-[#FF9E6D] italic">{c.h1c}</em>
          </motion.h1>
          <motion.p variants={fadeUp} className="mt-3 font-utility text-sm sm:text-md font-semibold text-white/80">
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
        <motion.div
          variants={staggerContainer(0.12)}
          initial="hidden"
          whileInView="show"
          viewport={viewportOnce}
          className="flex items-center gap-3 font-utility text-sm text-ink-muted justify-center mb-8"
        >
          <div className="flex">
            {['T', 'M', 'A'].map((letter, i) => (
              <span key={letter} className={`w-[26px] h-[26px] rounded-full border-2 border-paper flex items-center justify-center text-micro font-bold ${AVATAR_COLORS[i]} ${i > 0 ? '-ml-2' : ''}`}>
                {letter}
              </span>
            ))}
          </div>
          {c.trust}
        </motion.div>

        <HeroPlanner />
      </section>

      {/* STATS */}
      <section className="border-y border-line bg-paper-2">
        <div className="max-w-[1180px] mx-auto grid grid-cols-2 md:grid-cols-4">
          {c.stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial="hidden"
              whileInView="show"
              viewport={viewportOnce}
              variants={fadeUp}
              transition={{ delay: i * 0.08 }}
              className={`px-4 py-8 md:py-10 text-center border-line ${i < c.stats.length - 1 ? 'border-r border-dashed' : ''}`}
            >
              <div className="font-display font-bold text-2xl md:text-4xl text-chili">
                {s.decimal ? s.to.toFixed(1) : <CountUp to={s.to} suffix={s.suffix} />}
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
          className="grid gap-8 grid-cols-1 sm:grid-cols-2 md:grid-cols-4"
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
            <div className="bg-paper-2 rounded-[10px] p-5 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-chili text-chili-ink flex items-center justify-center font-utility font-bold">TN</div>
                <div>
                  <div className="font-bold text-md">Thảo Nguyên</div>
                  <div className="flex gap-0.5 text-lantern">
                    {Array.from({ length: 5 }).map((_, i) => <Star key={i} size={13} weight="fill" />)}
                  </div>
                </div>
              </div>
              <p className="text-md text-ink-muted">{c.reviewQuote}</p>
              <div className="flex flex-wrap gap-1.5">
                {c.reviewTags.map((t) => (
                  <span key={t} className="font-utility text-xs font-semibold px-2.5 py-1 rounded-full bg-paper text-ink-muted">{t}</span>
                ))}
              </div>
            </div>
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

      {/* TESTIMONIALS */}
      <section className="max-w-[1180px] mx-auto px-5 md:px-8 py-16 md:py-24">
        <SectionHead eyebrow={c.testiEyebrow} title={c.testiTitle} />
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={viewportOnce}
          variants={staggerContainer(0.12)}
          className="grid gap-6 grid-cols-1 sm:grid-cols-3"
        >
          {c.testimonials.map((t, i) => (
            <motion.div
              key={t.who}
              variants={fadeUp}
              whileHover={{ rotate: 0, scale: 1.02 }}
              style={{ rotate: [-1.5, 1, -0.5][i % 3] }}
              className="bg-surface border border-line rounded p-6 shadow-soft relative before:content-[''] before:absolute before:top-3.5 before:right-3.5 before:w-[26px] before:h-[26px] before:border-2 before:border-line-strong before:rounded-[3px]"
            >
              <p className="font-display text-lg leading-[1.5] mb-5">"{t.q}"</p>
              <div className="font-utility text-sm text-ink-muted border-t border-dashed border-line pt-3">{t.who}</div>
            </motion.div>
          ))}
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
