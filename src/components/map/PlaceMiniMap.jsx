import { useEffect, useRef } from 'react'
import { Map as MapLibreMap, Marker, NavigationControl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../../lib/maplibreSetup.js'
import { hasMapsKey, loadMapStyle, mapRequestTransform } from '../../lib/trackAsia.js'
import { useLanguage } from '../../i18n/LanguageContext.jsx'

const C = {
  vi: { noKey: 'Cần cấu hình Track-Asia API key để xem bản đồ.' },
  en: { noKey: 'A Track-Asia API key is required to show the map.' },
}

function resolveCssColor(varName, fallback) {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  return value || fallback
}

/** A small single-marker map for one confirmed location (e.g. a community video review). */
export default function PlaceMiniMap({ location, title, className = '' }) {
  const { lang } = useLanguage()
  const c = C[lang]
  const mapElRef = useRef(null)
  const lat = location?.lat
  const lng = location?.lng

  useEffect(() => {
    if (!hasMapsKey || lat == null || lng == null || !mapElRef.current) return
    let cancelled = false
    let map = null

    loadMapStyle()
      .then((style) => {
        if (cancelled || !mapElRef.current) return
        map = new MapLibreMap({
          container: mapElRef.current,
          style,
          transformRequest: mapRequestTransform,
          center: [lng, lat],
          zoom: 16,
        })
        map.addControl(new NavigationControl({ showCompass: false }), 'top-right')

        const el = document.createElement('div')
        el.title = title ?? ''
        const chili = resolveCssColor('--chili', '#d8481f')
        el.style.cssText = `width:22px;height:22px;border-radius:50%;background:${chili};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)`
        new Marker({ element: el }).setLngLat([lng, lat]).addTo(map)
      })
      .catch(() => {
        // Style unavailable — the container simply stays empty.
      })

    return () => {
      cancelled = true
      map?.remove()
    }
  }, [lat, lng, title])

  if (!hasMapsKey || !location) {
    return (
      <div className={`flex items-center justify-center rounded-xl border border-line-strong bg-paper-2 p-4 text-sm text-ink-muted ${className}`}>
        {c.noKey}
      </div>
    )
  }

  return <div ref={mapElRef} className={`rounded-xl border border-line-strong bg-paper-2 overflow-hidden ${className}`} />
}
