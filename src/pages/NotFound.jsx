import { NavLink } from 'react-router-dom'
import { CompassRose } from '@phosphor-icons/react'
import { useLanguage } from '../i18n/LanguageContext.jsx'

const C = {
  vi: { code: 'Lỗi 404', title: 'Lạc đường rồi!', body: 'Trang bạn tìm không tồn tại — quay lại và để FoodTrip dẫn đường.', cta: 'Về trang chủ', explore: 'Khám phá địa điểm' },
  en: { code: 'Error 404', title: 'You’ve wandered off the map!', body: 'That page doesn’t exist — head back and let FoodTrip guide the way.', cta: 'Back to home', explore: 'Explore places' },
}

export default function NotFound() {
  const { lang } = useLanguage()
  const c = C[lang]
  return (
    <div className="max-w-[1180px] mx-auto px-5 md:px-8 py-28 text-center flex flex-col items-center gap-5">
      <CompassRose size={56} className="text-chili" weight="duotone" />
      <span className="eyebrow text-ink-faint">{c.code}</span>
      <h1 className="text-3xl font-bold -mt-2">{c.title}</h1>
      <p className="text-ink-muted max-w-[46ch]">{c.body}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <NavLink to="/" className="inline-flex items-center gap-2 font-utility font-semibold text-md px-6 py-[13px] rounded-full bg-chili text-chili-ink shadow-soft hover:shadow-lifted transition-shadow">
          {c.cta}
        </NavLink>
        <NavLink to="/explore" className="inline-flex items-center gap-2 font-utility font-semibold text-md px-6 py-[13px] rounded-full border-[1.5px] border-line-strong hover:border-chili hover:text-chili transition-colors">
          {c.explore}
        </NavLink>
      </div>
    </div>
  )
}
