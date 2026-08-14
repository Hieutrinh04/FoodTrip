import { NavLink } from 'react-router-dom'
import { CompassRose } from '@phosphor-icons/react'
import { useLanguage } from '../i18n/LanguageContext.jsx'

const C = {
  vi: { title: 'Lạc đường rồi!', body: 'Trang bạn tìm không tồn tại — quay lại và để FoodTrip dẫn đường.', cta: 'Về trang chủ' },
  en: { title: 'You’ve wandered off the map!', body: 'That page doesn’t exist — head back and let FoodTrip guide the way.', cta: 'Back to home' },
}

export default function NotFound() {
  const { lang } = useLanguage()
  const c = C[lang]
  return (
    <div className="max-w-[1180px] mx-auto px-5 md:px-8 py-28 text-center flex flex-col items-center gap-5">
      <CompassRose size={56} className="text-chili" weight="duotone" />
      <h1 className="text-[32px]">{c.title}</h1>
      <p className="text-ink-muted max-w-[46ch]">{c.body}</p>
      <NavLink to="/" className="inline-flex items-center gap-2 font-utility font-semibold text-[14px] px-6 py-[13px] rounded-full bg-chili text-chili-ink shadow-soft">
        {c.cta}
      </NavLink>
    </div>
  )
}
