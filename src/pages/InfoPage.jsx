import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, CheckCircle, EnvelopeSimple, MapTrifold, Question, ShieldCheck } from '@phosphor-icons/react'
import { hasSupabase, supabase } from '../lib/supabaseClient.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { fadeUp, staggerContainer } from '../motion/variants.js'

const PAGES = {
  about: {
    vi: { eyebrow: 'Về FoodTrip', title: 'Đi ăn ngon, không phải đoán mò.', intro: 'FoodTrip giúp người Việt khám phá quán ăn, so sánh dữ liệu thật và dựng lịch trình phù hợp với thời gian, ngân sách và sở thích.', sections: [['Chúng mình giải quyết điều gì?', 'Thông tin quán thường nằm rải rác giữa bản đồ, video và bài viết. FoodTrip gom các tín hiệu đó về một nơi, đồng thời nói rõ đâu là dữ liệu cộng đồng và đâu là điểm gợi ý của hệ thống.'], ['Nguyên tắc sản phẩm', 'Không bịa điểm cho địa điểm chưa có dữ liệu; luôn ghi nguồn khi dùng đánh giá bên ngoài; và để người dùng tự điều chỉnh lịch trình thay vì coi gợi ý AI là đáp án duy nhất.'], ['Phạm vi hiện tại', 'FoodTrip tập trung vào các điểm đến và trải nghiệm ẩm thực tại Việt Nam, với dữ liệu địa điểm được mở rộng dần theo nhu cầu tìm kiếm thực tế.']] },
    en: { eyebrow: 'About FoodTrip', title: 'Eat well without the guesswork.', intro: 'FoodTrip helps people discover places, compare real signals, and build itineraries that fit their time, budget, and preferences.', sections: [['The problem we solve', 'Place information is scattered across maps, videos, and articles. FoodTrip brings those signals together and clearly separates community data from system-generated guidance.'], ['Product principles', 'Never invent scores for places without data; identify external review sources; and let travellers edit every AI suggestion instead of treating it as the only answer.'], ['Current scope', 'FoodTrip focuses on food and travel experiences in Vietnam, with live place coverage expanding through real searches.']] },
  },
  careers: {
    vi: { eyebrow: 'Tuyển dụng', title: 'Cùng xây cách khám phá Việt Nam mới.', intro: 'FoodTrip quan tâm đến những người thích sản phẩm tử tế, dữ liệu minh bạch và trải nghiệm địa phương.', sections: [['Vị trí đang mở', 'Hiện chưa có vị trí tuyển dụng chính thức. Khi có đợt tuyển mới, thông tin vai trò, phạm vi công việc và quy trình ứng tuyển sẽ được công bố tại trang này.'], ['Chúng mình coi trọng', 'Khả năng tự chủ, giao tiếp rõ ràng, tôn trọng dữ liệu người dùng và sự tò mò với ẩm thực, bản đồ và du lịch Việt Nam.']] },
    en: { eyebrow: 'Careers', title: 'Help build a better way to explore Vietnam.', intro: 'FoodTrip values thoughtful product work, transparent data, and genuine local experiences.', sections: [['Open roles', 'There are no formal openings right now. New roles, responsibilities, and application steps will be published on this page when available.'], ['What we value', 'Ownership, clear communication, respect for user data, and curiosity about Vietnamese food, maps, and travel.']] },
  },
  blog: {
    vi: { eyebrow: 'Blog ẩm thực', title: 'Gợi ý cho chuyến đi ngon hơn.', intro: 'Bắt đầu từ những địa điểm được cộng đồng FoodTrip quan tâm.', sections: [['Phở Hà Nội: chọn quán theo khẩu vị', 'Phở tái lăn, nước dùng trong hay vị đậm? So sánh mô tả và đánh giá trước khi chọn quán phù hợp.'], ['Một ngày ăn quanh Hội An', 'Kết hợp món địa phương, cà phê và phố cổ thành lịch trình vừa đủ, không chạy điểm.'], ['Ăn ngon ở Đà Nẵng', 'Từ mì Quảng đến hải sản, hãy chọn theo khu vực và thời gian di chuyển thay vì chỉ nhìn điểm sao.']] },
    en: { eyebrow: 'Food blog', title: 'Ideas for a better-tasting trip.', intro: 'Start with destinations the FoodTrip community cares about.', sections: [['Choosing Hanoi pho for your taste', 'Stir-fried beef, clear broth, or a richer bowl? Compare descriptions and review signals before choosing.'], ['A day of eating around Hoi An', 'Combine local dishes, coffee, and the old town into a relaxed itinerary without rushing checkpoints.'], ['Eating well in Da Nang', 'From mi Quang to seafood, choose by area and travel time—not only by star rating.']] },
  },
  help: {
    vi: { eyebrow: 'Trung tâm trợ giúp', title: 'Dùng FoodTrip dễ hơn.', intro: 'Câu trả lời nhanh cho những thao tác thường gặp.', sections: [['Điểm FoodTrip khác đánh giá Google thế nào?', 'Đánh giá Google là dữ liệu từ người dùng Google. Điểm phù hợp FoodTrip là gợi ý tổng hợp từ những tiêu chí đang có dữ liệu như đánh giá, khoảng cách, ngân sách và độ phổ biến.'], ['Vì sao bản đồ hoặc tìm kiếm không hiện?', 'Hãy kiểm tra kết nối mạng, quyền vị trí của trình duyệt và khóa dịch vụ bản đồ trong cấu hình dự án. Trang sẽ hiển thị thông báo thay thế khi dịch vụ chưa sẵn sàng.'], ['Làm sao lưu dữ liệu?', 'Địa điểm có thể lưu ngay trên thiết bị. Đăng nhập để đồng bộ địa điểm, lịch trình và đặt phòng với tài khoản.'], ['Có thể sửa lịch trình AI không?', 'Có. Bạn có thể đổi thứ tự điểm dừng, thay địa điểm, chọn khách sạn và điều chỉnh phương tiện trước khi lưu hoặc chia sẻ.']] },
    en: { eyebrow: 'Help center', title: 'Get more from FoodTrip.', intro: 'Quick answers for the most common tasks.', sections: [['How is FoodTrip different from Google ratings?', 'Google ratings come from Google users. FoodTrip suitability is a guide combining available signals such as ratings, distance, budget, and popularity.'], ['Why is the map or search unavailable?', 'Check your connection, browser location permission, and the project map-service key. The page shows a fallback message whenever a service is unavailable.'], ['How is my data saved?', 'Places can be stored on the current device. Log in to sync places, itineraries, and bookings with your account.'], ['Can I edit an AI itinerary?', 'Yes. Reorder stops, replace places, select hotels, and change transport before saving or sharing.']] },
  },
  terms: {
    vi: { eyebrow: 'Điều khoản sử dụng', title: 'Dùng FoodTrip một cách minh bạch.', intro: 'Các nguyên tắc cơ bản áp dụng khi sử dụng website.', sections: [['Thông tin và gợi ý', 'Điểm số, lịch trình và nội dung tổng hợp chỉ nhằm hỗ trợ tham khảo. Hãy xác nhận giờ mở cửa, giá và điều kiện dịch vụ trực tiếp với đơn vị cung cấp trước khi đi.'], ['Tài khoản và nội dung', 'Bạn chịu trách nhiệm với thông tin tài khoản và nội dung mình chia sẻ. Không đăng nội dung vi phạm pháp luật, xâm phạm quyền riêng tư hoặc gây hiểu nhầm về địa điểm.'], ['Dữ liệu bên thứ ba', 'Bản đồ, đánh giá, video và thông tin khách sạn có thể đến từ dịch vụ bên thứ ba và chịu điều khoản riêng của họ.'], ['Thanh toán', 'Thanh toán VNPay chỉ được xác nhận sau khi chữ ký phản hồi được máy chủ kiểm tra. Chế độ demo luôn được ghi rõ và không phải giao dịch thật.']] },
    en: { eyebrow: 'Terms of use', title: 'Use FoodTrip with clarity.', intro: 'The basic rules that apply when using the website.', sections: [['Information and recommendations', 'Scores, itineraries, and aggregated content are guidance only. Confirm opening hours, prices, and service conditions directly with the provider before travelling.'], ['Accounts and content', 'You are responsible for your account information and submitted content. Do not share unlawful, privacy-invasive, or misleading material.'], ['Third-party data', 'Maps, ratings, videos, and hotel information may come from third-party services and remain subject to their terms.'], ['Payments', 'VNPay payments are confirmed only after the server verifies the callback signature. Demo mode is clearly labelled and is not a real transaction.']] },
  },
}

const CONTACT_COPY = {
  vi: { eyebrow: 'Liên hệ', title: 'Gửi lời nhắn cho FoodTrip.', intro: 'Báo lỗi dữ liệu, góp ý tính năng hoặc đề xuất hợp tác. Thông tin bạn gửi chỉ được dùng để phản hồi yêu cầu này.', name: 'Tên của bạn', email: 'Email', message: 'Nội dung', send: 'Gửi lời nhắn', sending: 'Đang gửi…', success: 'FoodTrip đã nhận được lời nhắn của bạn.', error: 'Chưa gửi được lời nhắn. Hãy thử lại sau.' },
  en: { eyebrow: 'Contact', title: 'Send FoodTrip a message.', intro: 'Report a data issue, suggest a feature, or propose a partnership. Your details are used only to respond to this request.', name: 'Your name', email: 'Email', message: 'Message', send: 'Send message', sending: 'Sending…', success: 'FoodTrip received your message.', error: 'Your message could not be sent. Please try again later.' },
}

export default function InfoPage({ page }) {
  const { lang } = useLanguage()
  const content = PAGES[page]?.[lang]
  if (page === 'contact') return <ContactPage />
  if (!content) return null

  return (
    <div className="mx-auto max-w-[900px] px-5 py-12 md:px-8 md:py-16">
      <motion.header initial="hidden" animate="show" variants={staggerContainer(0.08)} className="mb-10">
        <motion.span variants={fadeUp} className="eyebrow eyebrow-tick">{content.eyebrow}</motion.span>
        <motion.h1 variants={fadeUp} className="mt-3 text-3xl font-bold leading-tight md:text-4xl">{content.title}</motion.h1>
        <motion.p variants={fadeUp} className="mt-3 max-w-[65ch] text-base text-ink-muted">{content.intro}</motion.p>
      </motion.header>
      <div className="grid gap-4">
        {content.sections.map(([title, body], index) => (
          <motion.section key={title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className="rounded-xl border border-line bg-surface p-5">
            <h2 className="text-lg font-bold">{title}</h2>
            <p className="mt-2 leading-relaxed text-ink-muted">{body}</p>
          </motion.section>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/explore" className="inline-flex items-center gap-2 rounded-full bg-chili px-5 py-3 font-utility text-sm font-semibold text-chili-ink">{lang === 'vi' ? 'Khám phá địa điểm' : 'Explore places'}<ArrowRight size={14} /></Link>
        <Link to="/plan" className="inline-flex items-center gap-2 rounded-full border border-line-strong px-5 py-3 font-utility text-sm font-semibold hover:border-chili hover:text-chili"><MapTrifold size={14} />{lang === 'vi' ? 'Tạo lịch trình' : 'Plan a trip'}</Link>
      </div>
    </div>
  )
}

function ContactPage() {
  const { lang } = useLanguage()
  const c = CONTACT_COPY[lang]
  const [status, setStatus] = useState('idle')
  const [form, setForm] = useState({ name: '', email: '', message: '' })

  async function submit(event) {
    event.preventDefault()
    if (!hasSupabase) return setStatus('error')
    setStatus('sending')
    const { error } = await supabase.from('contact_messages').insert({
      name: form.name.trim(), email: form.email.trim(), message: form.message.trim(),
    })
    if (error) return setStatus('error')
    setForm({ name: '', email: '', message: '' })
    setStatus('success')
  }

  return (
    <div className="mx-auto max-w-[760px] px-5 py-12 md:px-8 md:py-16">
      <span className="eyebrow eyebrow-tick">{c.eyebrow}</span>
      <h1 className="mt-3 text-3xl font-bold md:text-4xl">{c.title}</h1>
      <p className="mt-3 text-base text-ink-muted">{c.intro}</p>
      <form onSubmit={submit} className="mt-8 grid gap-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <label className="grid gap-1.5 font-utility text-xs font-semibold text-ink-muted">{c.name}<input required maxLength={120} value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} className="rounded-xl border border-line-strong px-4 py-3 font-display text-md text-ink outline-none focus:border-chili" /></label>
        <label className="grid gap-1.5 font-utility text-xs font-semibold text-ink-muted">{c.email}<input required type="email" maxLength={200} value={form.email} onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))} className="rounded-xl border border-line-strong px-4 py-3 font-display text-md text-ink outline-none focus:border-chili" /></label>
        <label className="grid gap-1.5 font-utility text-xs font-semibold text-ink-muted">{c.message}<textarea required minLength={10} maxLength={3000} rows={6} value={form.message} onChange={(e) => setForm((v) => ({ ...v, message: e.target.value }))} className="resize-y rounded-xl border border-line-strong px-4 py-3 font-display text-md text-ink outline-none focus:border-chili" /></label>
        <button type="submit" disabled={status === 'sending'} className="inline-flex items-center justify-center gap-2 rounded-full bg-chili px-6 py-3 font-utility text-sm font-semibold text-chili-ink disabled:opacity-60 sm:justify-self-start"><EnvelopeSimple size={15} />{status === 'sending' ? c.sending : c.send}</button>
        {status === 'success' && <p role="status" className="flex items-center gap-2 text-sm text-herb"><CheckCircle size={16} />{c.success}</p>}
        {status === 'error' && <p role="alert" className="flex items-center gap-2 text-sm text-chili"><Question size={16} />{c.error}</p>}
        <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-faint"><ShieldCheck size={14} className="mt-0.5 shrink-0" />{c.intro}</p>
      </form>
    </div>
  )
}
