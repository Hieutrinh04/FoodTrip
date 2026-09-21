import { Bed, Star, CheckCircle, CaretRight } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { ACCENT_GRADIENT } from '../../lib/visualTokens.js'
import { hotelScoreBadge, hotelCardAccent, hasRealPrice, rememberHotel } from '../../lib/hotelSearch.js'
import { cheapestPricePerNight } from '../../lib/roomTypes.js'
import RemoteImage from '../ui/RemoteImage.jsx'
import HotelExternalLinks from './HotelExternalLinks.jsx'
import { useLanguage } from '../../i18n/LanguageContext.jsx'

const C = {
  vi: {
    reviews: (n) => `${n} đánh giá`, selectHotel: 'Chọn khách sạn này', selected: 'Đã chọn',
    from: 'Từ', perNight: '/đêm', stars: (n) => `${n} sao`,
    estimated: 'giá ước tính', liveRate: 'giá thật',
    viewRooms: 'Xem phòng & đặt', roomCount: (n) => `${n} loại phòng`,
  },
  en: {
    reviews: (n) => `${n} reviews`, selectHotel: 'Select this hotel', selected: 'Selected',
    from: 'From', perNight: '/night', stars: (n) => `${n}-star`,
    estimated: 'estimated', liveRate: 'live rate',
    viewRooms: 'View rooms & book', roomCount: (n) => `${n} room types`,
  },
}

const money = (n) => n.toLocaleString('vi-VN') + 'đ'

/**
 * Agoda/Traveloka-style hotel card: photo (Hotelbeds' own, or Google Maps'
 * where the hotel matched a listing, else a themed gradient), a 10-point score
 * badge converted from Google's 5-point rating, a nightly price, and a link
 * into the room list.
 *
 * Every card carries a number rather than only a price band: a traveller
 * comparing a hotel against their budget cannot do anything with "Vừa phải
 * (ước tính)". Where Hotelbeds quoted a tariff the number is real and says so;
 * otherwise it is the same deterministic estimate the booking page uses, so
 * the two screens never disagree.
 */
export default function HotelCard({ hotel, cityName, selected = false, onSelect, showCompareLinks = true }) {
  const { lang } = useLanguage()
  const c = C[lang]
  const badge = hotelScoreBadge(hotel.rating)
  const realPrice = hasRealPrice(hotel)
  const price = realPrice ? hotel.priceFrom : cheapestPricePerNight(hotel)
  const roomCount = hotel.rooms?.length ?? 0

  return (
    <div
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={onSelect ? (e) => { if (e.key === 'Enter' || e.key === ' ') onSelect() } : undefined}
      className={`text-left rounded-xl overflow-hidden border-[1.5px] transition-colors ${onSelect ? 'cursor-pointer' : ''} ${selected ? 'border-chili' : 'border-line-strong hover:border-chili'}`}
    >
      <div className="relative h-[120px] w-full">
        <RemoteImage
          src={hotel.photoUrl}
          alt={hotel.name}
          sizeHint="w400-h240-k-no"
          className="h-full w-full object-cover"
          fallback={
            <div
              className="h-full w-full flex items-center justify-center"
              style={{ background: ACCENT_GRADIENT[hotelCardAccent(hotel.id)] }}
            >
              <Bed size={32} weight="duotone" className="text-white/85" />
            </div>
          }
        />
        {badge && (
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 bg-surface/95 rounded-lg px-2 py-1 shadow-soft">
            <span className="font-bold text-sm tabular">{badge.score.toFixed(1)}</span>
            <span className="font-utility text-micro font-semibold text-ink-muted">{badge.label[lang]}</span>
          </div>
        )}
        {selected && (
          <div className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 bg-chili text-chili-ink rounded-full px-2.5 py-1 font-utility text-2xs font-bold">
            <CheckCircle size={12} weight="fill" /> {c.selected}
          </div>
        )}
      </div>

      <div className="p-3.5 bg-surface">
        <div className="font-semibold text-md truncate">{hotel.name}</div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 font-utility text-xs text-ink-faint">
          {hotel.rating != null && (
            <span className="flex items-center gap-1 text-chili font-medium">
              <Star size={12} weight="fill" /> {hotel.rating.toFixed(1)}
              {hotel.userRatingCount ? ` · ${c.reviews(hotel.userRatingCount)}` : ''}
            </span>
          )}
          {hotel.stars != null && <span>{c.stars(hotel.stars)}</span>}
          {roomCount > 0 && <span>{c.roomCount(roomCount)}</span>}
        </div>
        {price != null && (
          <div className="mt-1.5 font-utility text-xs text-ink-faint">
            {c.from} <span className="font-bold text-md text-chili tabular">{money(price)}</span>
            {c.perNight}
            {' · '}
            <span className={realPrice ? 'text-herb font-semibold' : ''}>
              {realPrice ? c.liveRate : c.estimated}
            </span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 mt-2.5">
          {onSelect && (
            <div className={`inline-flex items-center gap-1.5 font-utility text-2xs font-semibold px-2.5 py-1 rounded-full ${selected ? 'bg-chili text-chili-ink' : 'border border-line-strong text-ink-muted'}`}>
              {selected ? c.selected : c.selectHotel}
            </div>
          )}
          {/* Selecting a hotel and inspecting its rooms are different
              intentions, so the card offers both instead of making the whole
              tile mean one of them. The hotel is cached on the way out because
              Hotelbeds prices a stay, not a property — the booking page cannot
              look this rate up again from the id alone. */}
          <Link
            to={`/booking/${hotel.id}`}
            state={{ hotel }}
            onClick={(e) => {
              e.stopPropagation()
              rememberHotel(hotel)
            }}
            className="inline-flex items-center gap-1 font-utility text-2xs font-semibold px-2.5 py-1 rounded-full bg-chili text-chili-ink hover:shadow-soft transition-shadow"
          >
            {c.viewRooms} <CaretRight size={11} weight="bold" />
          </Link>
        </div>
        {showCompareLinks && (
          <div className="mt-2.5" onClick={(e) => e.stopPropagation()}>
            <HotelExternalLinks hotelName={hotel.name} cityName={cityName} />
          </div>
        )}
      </div>
    </div>
  )
}
