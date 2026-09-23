import { useState } from 'react'
import { MagnifyingGlass, ArrowSquareOut } from '@phosphor-icons/react'
import { findHotelListings } from '../../lib/hotelListingSearch.js'
import { useLanguage } from '../../i18n/LanguageContext.jsx'

const C = {
  vi: {
    compare: 'So sánh giá trên Agoda / Traveloka', searching: 'Đang tìm…',
    exactNote: 'Tìm thấy đúng khách sạn này', fallbackNote: 'Không chắc trùng khớp — mở kết quả tìm kiếm Google',
  },
  en: {
    compare: 'Compare price on Agoda / Traveloka', searching: 'Searching…',
    exactNote: 'Found this exact hotel', fallbackNote: "Couldn't confirm an exact match — opens a Google search instead",
  },
}

/** Small inline widget: on click, looks up the real Agoda/Traveloka listing for a hotel and shows both as external links. */
export default function HotelExternalLinks({ hotelName, cityName }) {
  const { lang } = useLanguage()
  const c = C[lang]
  const [status, setStatus] = useState('idle') // idle | searching | ready
  const [links, setLinks] = useState(null)

  async function handleClick(e) {
    e.stopPropagation()
    if (status !== 'idle') return
    setStatus('searching')
    const result = await findHotelListings({ hotelName, cityName })
    setLinks(result)
    setStatus('ready')
  }

  if (status === 'ready' && links) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={links.agodaUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 font-utility text-xs font-semibold text-chili hover:underline"
        >
          Agoda <ArrowSquareOut size={12} />
        </a>
        <a
          href={links.travelokaUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 font-utility text-xs font-semibold text-chili hover:underline"
        >
          Traveloka <ArrowSquareOut size={12} />
        </a>
        <span className="font-utility text-2xs text-ink-faint">{links.exact ? c.exactNote : c.fallbackNote}</span>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status === 'searching'}
      className="inline-flex items-center gap-1.5 font-utility text-xs font-semibold text-ink-muted hover:text-chili transition-colors disabled:opacity-60"
    >
      <MagnifyingGlass size={13} /> {status === 'searching' ? c.searching : c.compare}
    </button>
  )
}
