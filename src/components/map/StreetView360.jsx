import { useEffect, useState } from 'react'
import { ArrowSquareOut, CaretDown, Panorama, SpinnerGap } from '@phosphor-icons/react'
import PanoramaViewer from './PanoramaViewer.jsx'
import { findNearbyPanorama } from '../../lib/kartaView.js'
import { streetViewEmbedUrl, streetViewExternalUrl } from '../../lib/streetView.js'
import { useLanguage } from '../../i18n/LanguageContext.jsx'

const C = {
  vi: {
    title: 'Xem đường phố 360°',
    hint: 'Kéo để xoay quanh vị trí quán',
    loading: 'Đang tìm ảnh 360° quanh đây…',
    none: 'Khu vực này chưa có ảnh 360° trong dữ liệu mở.',
    tooFar: (m) => `Ảnh 360° mở gần nhất cách quán tới ~${m} m — đã là con đường khác, nên không hiển thị.`,
    openOnGoogle: 'Mở 360° trên Google Maps',
    captured: (d) => `Chụp ${d}`,
    away: (m) => `cách ~${m} m`,
    noImagery: 'Nếu khu vực chưa được chụp, Google sẽ báo không có ảnh.',
  },
  en: {
    title: '360° street view',
    hint: 'Drag to look around the venue',
    loading: 'Looking for 360° imagery nearby…',
    none: 'No open 360° imagery covers this area yet.',
    tooFar: (m) => `The nearest open 360° frame is ~${m} m away — a different street, so it is not shown.`,
    openOnGoogle: 'Open 360° on Google Maps',
    captured: (d) => `Captured ${d}`,
    away: (m) => `~${m} m away`,
    noImagery: 'If this area has not been captured, Google will say there is no imagery.',
  },
}

/**
 * Collapsible 360° panorama for a place, from whichever source is available.
 *
 *   1. Google Street View — best Vietnamese coverage, but the Embed API needs a
 *      Cloud project with billing, so it only runs when a key is configured.
 *   2. KartaView — open imagery, no key at all, but roughly half the app's
 *      cities have none. This is the default path.
 *   3. A link out to Google Maps, which always works.
 *
 * The lookup runs on expand rather than on mount: KartaView's anonymous API
 * allows 100 requests an hour, and a traveller can open a dozen place previews
 * in a minute without ever wanting the panorama.
 */
export default function StreetView360({ location, name = '' }) {
  const { lang } = useLanguage()
  const c = C[lang]
  const [open, setOpen] = useState(false)
  const [karta, setKarta] = useState({ status: 'idle', pano: null })

  const embedUrl = streetViewEmbedUrl(location)
  const externalUrl = streetViewExternalUrl(location)
  const lat = location?.lat
  const lng = location?.lng
  const needsKartaView = open && !embedUrl && Boolean(externalUrl)

  useEffect(() => {
    if (!needsKartaView) return undefined
    const controller = new AbortController()
    setKarta({ status: 'loading', pano: null })
    findNearbyPanorama({ lat, lng }, { signal: controller.signal })
      .then((pano) => {
        if (!controller.signal.aborted) setKarta({ status: pano?.accurate ? 'ready' : 'empty', pano })
      })
      .catch(() => {
        if (!controller.signal.aborted) setKarta({ status: 'empty', pano: null })
      })
    return () => controller.abort()
  }, [needsKartaView, lat, lng])

  // Collapse again when the panel moves to a different place.
  useEffect(() => { setOpen(false); setKarta({ status: 'idle', pano: null }) }, [lat, lng])

  if (!externalUrl) return null

  const googleLink = (
    <a href={externalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-utility text-2xs font-semibold text-chili hover:underline">
      {c.openOnGoogle}<ArrowSquareOut size={11} />
    </a>
  )

  return (
    <section className="mt-3 overflow-hidden rounded-xl border border-line">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 bg-surface px-3 py-2.5 text-left transition-colors hover:text-chili"
      >
        <Panorama size={15} className="shrink-0 text-chili" />
        <span className="flex-1 font-utility text-xs font-semibold">{c.title}</span>
        <CaretDown size={12} className={`shrink-0 text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-line">
          {embedUrl ? (
            <>
              <iframe
                src={embedUrl}
                title={`${c.title} — ${name}`}
                loading="lazy"
                allowFullScreen
                referrerPolicy="no-referrer-when-downgrade"
                className="aspect-[4/3] w-full border-0 bg-paper-2"
              />
              <p className="px-3 py-2 text-micro leading-relaxed text-ink-faint">{c.hint} · {c.noImagery}</p>
            </>
          ) : karta.status === 'loading' ? (
            <p className="flex items-center gap-2 px-3 py-6 text-xs text-ink-muted">
              <SpinnerGap size={15} className="animate-spin text-chili" />{c.loading}
            </p>
          ) : karta.pano?.accurate ? (
            <>
              <PanoramaViewer
                imageUrl={karta.pano.imageUrl}
                heading={karta.pano.heading}
                className="aspect-[4/3] w-full"
                onError={() => setKarta({ status: 'empty', pano: null })}
              />
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-micro text-ink-faint">
                <span>{c.hint}</span>
                <span>·</span>
                {/* CC BY-SA requires crediting the source. */}
                <a href={karta.pano.pageUrl} target="_blank" rel="noreferrer" className="hover:text-chili hover:underline">
                  {karta.pano.attribution}
                </a>
                {karta.pano.capturedAt && <><span>·</span><span>{c.captured(karta.pano.capturedAt)}</span></>}
                <span>·</span><span>{c.away(karta.pano.distanceM)}</span>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-start gap-2 px-3 py-4">
              {/* "Too far" and "nothing at all" are different answers, and the
                  distance is the useful part — it tells the traveller whether
                  the area is covered at all. */}
              <p className="text-xs text-ink-muted">{karta.pano ? c.tooFar(karta.pano.distanceM) : c.none}</p>
              {googleLink}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
