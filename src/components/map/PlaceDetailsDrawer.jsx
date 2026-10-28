import { useEffect } from 'react'
import MapPlacePreview from './MapPlacePreview.jsx'
import PlaceMiniMap from './PlaceMiniMap.jsx'
import { useLanguage } from '../../i18n/LanguageContext.jsx'

/**
 * The detail panel Explore and Nearby show (photos, Google rating and reviews,
 * hours, Street View, related videos), for pages without a map of their own:
 * a drawer over a map of the venue. `place` is in the shape mapAreaSearch's
 * normalise() gives.
 */
export default function PlaceDetailsDrawer({ place, onClose }) {
  const { lang } = useLanguage()
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow }
  }, [onClose])

  return <div className="fixed inset-0 z-[70] flex justify-end" role="dialog" aria-modal="true" aria-label={place.name[lang]}>
    <button type="button" tabIndex={-1} aria-label={lang === 'vi' ? 'Đóng chi tiết quán' : 'Close place details'} className="absolute inset-0 bg-ink/40" onClick={onClose} />
    <div className="relative h-full w-full bg-paper-2 shadow-lifted sm:w-[480px]">
      {place.location && <PlaceMiniMap location={place.location} title={place.name[lang]} className="absolute inset-0 h-full w-full rounded-none border-0" />}
      <MapPlacePreview place={place} criterion="overall" onClose={onClose} showRoute={false} />
    </div>
  </div>
}
