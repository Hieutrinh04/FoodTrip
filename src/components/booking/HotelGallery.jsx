import { useEffect, useState } from 'react'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import RemoteImage from '../ui/RemoteImage.jsx'
import { useLanguage } from '../../i18n/LanguageContext.jsx'

const C = {
  vi: { prev: 'Ảnh trước', next: 'Ảnh sau', counter: (i, n) => `${i}/${n}`, pick: (i) => `Xem ảnh ${i}` },
  en: { prev: 'Previous photo', next: 'Next photo', counter: (i, n) => `${i}/${n}`, pick: (i) => `View photo ${i}` },
}

/**
 * The hotel's photos on the booking page: one large image with a thumbnail
 * strip under it.
 *
 * The large image loads eagerly — it is the page's hero, and a lazy image whose
 * box measures 0x0 at first paint is never fetched at all. Thumbnails stay lazy
 * so opening a page does not pull eight full photos at once.
 *
 * Falls back to whatever `fallback` renders when a hotel has no gallery, which
 * is the normal case for a property known only from Google Maps.
 */
export default function HotelGallery({ photos = [], alt = '', fallback = null, className = '' }) {
  const { lang } = useLanguage()
  const c = C[lang]
  const [index, setIndex] = useState(0)

  // A different hotel means a different set — never leave the index pointing
  // past the end of the new one.
  useEffect(() => setIndex(0), [photos])

  if (!photos.length) return fallback

  const current = photos[Math.min(index, photos.length - 1)]
  const step = (delta) => setIndex((i) => (i + delta + photos.length) % photos.length)

  return (
    <div className={className}>
      <div className="relative h-[200px] md:h-[320px] w-full rounded-xl overflow-hidden bg-paper-2">
        <RemoteImage
          src={current}
          alt={alt}
          loading="eager"
          className="h-full w-full object-cover"
        />
        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label={c.prev}
              className="absolute left-2 top-1/2 -translate-y-1/2 grid place-items-center h-8 w-8 rounded-full bg-surface/90 text-ink shadow-soft hover:bg-surface transition-colors"
            >
              <CaretLeft size={16} weight="bold" />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label={c.next}
              className="absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center h-8 w-8 rounded-full bg-surface/90 text-ink shadow-soft hover:bg-surface transition-colors"
            >
              <CaretRight size={16} weight="bold" />
            </button>
            <div className="absolute bottom-2 right-2 font-utility text-2xs font-semibold px-2 py-1 rounded-full bg-surface/90 text-ink-muted tabular">
              {c.counter(Math.min(index, photos.length - 1) + 1, photos.length)}
            </div>
          </>
        )}
      </div>

      {photos.length > 1 && (
        <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
          {photos.map((photo, i) => (
            <button
              key={photo}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={c.pick(i + 1)}
              aria-current={i === index}
              className={`shrink-0 h-14 w-20 rounded-lg overflow-hidden border-2 transition-colors ${i === index ? 'border-chili' : 'border-transparent hover:border-line-strong'}`}
            >
              <RemoteImage src={photo} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
