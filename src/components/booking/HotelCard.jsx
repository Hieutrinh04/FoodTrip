import { Bed, Star, CheckCircle } from '@phosphor-icons/react'
import { ACCENT_GRADIENT } from '../CityPattern.jsx'
import { hotelScoreBadge, PRICE_LEVEL_LABEL, hotelCardAccent } from '../../lib/hotelSearch.js'
import HotelExternalLinks from './HotelExternalLinks.jsx'
import { useLanguage } from '../../i18n/LanguageContext.jsx'

const C = {
  vi: { reviews: (n) => `${n} đánh giá`, selectHotel: 'Chọn khách sạn này', selected: 'Đã chọn' },
  en: { reviews: (n) => `${n} reviews`, selectHotel: 'Select this hotel', selected: 'Selected' },
}

/**
 * Agoda/Traveloka-style hotel card: photo (real Google Places photo when
 * available, a themed gradient placeholder otherwise), a 10-point score
 * badge converted from Google's 5-point rating, price tier, and a compare
 * link to the real Agoda/Traveloka listing. Used in the planner's hotel
 * step and can double as the booking page's hero.
 */
export default function HotelCard({ hotel, cityName, selected = false, onSelect, showCompareLinks = true }) {
  const { lang } = useLanguage()
  const c = C[lang]
  const badge = hotelScoreBadge(hotel.rating)

  return (
    <div
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={onSelect ? (e) => { if (e.key === 'Enter' || e.key === ' ') onSelect() } : undefined}
      className={`text-left rounded-xl overflow-hidden border-[1.5px] transition-colors ${onSelect ? 'cursor-pointer' : ''} ${selected ? 'border-chili' : 'border-line-strong hover:border-chili'}`}
    >
      <div className="relative h-[120px] w-full">
        {hotel.photoUrl ? (
          <img src={hotel.photoUrl} alt={hotel.name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div
            className="h-full w-full flex items-center justify-center"
            style={{ background: ACCENT_GRADIENT[hotelCardAccent(hotel.id)] }}
          >
            <Bed size={32} weight="duotone" className="text-white/85" />
          </div>
        )}
        {badge && (
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 bg-surface/95 rounded-lg px-2 py-1 shadow-soft">
            <span className="font-bold text-[13px] tabular">{badge.score.toFixed(1)}</span>
            <span className="font-utility text-[10px] font-semibold text-ink-muted">{badge.label[lang]}</span>
          </div>
        )}
        {selected && (
          <div className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 bg-chili text-chili-ink rounded-full px-2.5 py-1 font-utility text-[10.5px] font-bold">
            <CheckCircle size={12} weight="fill" /> {c.selected}
          </div>
        )}
      </div>

      <div className="p-3.5 bg-surface">
        <div className="font-semibold text-[13.5px] truncate">{hotel.name}</div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 font-utility text-[11.5px] text-ink-faint">
          {hotel.rating != null && (
            <span className="flex items-center gap-1 text-chili font-medium">
              <Star size={12} weight="fill" /> {hotel.rating.toFixed(1)}
              {hotel.userRatingCount ? ` · ${c.reviews(hotel.userRatingCount)}` : ''}
            </span>
          )}
          {hotel.priceLevel && PRICE_LEVEL_LABEL[hotel.priceLevel] && <span>{PRICE_LEVEL_LABEL[hotel.priceLevel][lang]}</span>}
        </div>
        {onSelect && (
          <div className={`inline-flex items-center gap-1.5 mt-2.5 font-utility text-[11px] font-semibold px-2.5 py-1 rounded-full ${selected ? 'bg-chili text-chili-ink' : 'border border-line-strong text-ink-muted'}`}>
            {selected ? c.selected : c.selectHotel}
          </div>
        )}
        {showCompareLinks && (
          <div className="mt-2.5" onClick={(e) => e.stopPropagation()}>
            <HotelExternalLinks hotelName={hotel.name} cityName={cityName} />
          </div>
        )}
      </div>
    </div>
  )
}
