import { useEffect, useRef, useState } from 'react'
import { Map as MapLibreMap, Marker, NavigationControl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../../lib/maplibreSetup.js'
import { hasMapsKey, loadMapStyle, mapRequestTransform } from '../../lib/trackAsia.js'

/**
 * A map to put one pin on: tap or click moves it, and the marker can be
 * dragged. Without a map key (or if the map fails) the caller's coordinate
 * fields still work — this only makes choosing them easier.
 */
export default function LocationPicker({ lat, lng, onChoose, lang = 'vi', className = 'h-[260px]' }) {
  const container = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const chooseRef = useRef(onChoose)
  chooseRef.current = onChoose
  const startRef = useRef({ lat, lng })
  const [status, setStatus] = useState(hasMapsKey ? 'loading' : 'error')

  useEffect(() => {
    if (!hasMapsKey) return undefined
    let cancelled = false
    let map
    const timeout = setTimeout(() => { if (!cancelled) setStatus('error') }, 12000)
    const choose = (point) => chooseRef.current?.({ lat: Number(point.lat.toFixed(6)), lng: Number(point.wrap().lng.toFixed(6)) })
    loadMapStyle({ lightweight: true }).then((style) => {
      if (cancelled || !container.current) return
      const { lat: startLat, lng: startLng } = startRef.current
      map = new MapLibreMap({ container: container.current, style, transformRequest: mapRequestTransform, center: [startLng, startLat], zoom: 15 })
      mapRef.current = map
      markerRef.current = new Marker({ color: '#d8481f', draggable: true }).setLngLat([startLng, startLat]).addTo(map)
      markerRef.current.on('dragend', () => choose(markerRef.current.getLngLat()))
      map.addControl(new NavigationControl({ showCompass: false }))
      map.on('load', () => { clearTimeout(timeout); if (!cancelled) setStatus('ready') })
      map.on('click', (event) => choose(event.lngLat))
    }).catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true; clearTimeout(timeout); map?.remove(); mapRef.current = null; markerRef.current = null }
  }, [])

  useEffect(() => {
    if (lat == null || lng == null) return
    markerRef.current?.setLngLat([lng, lat])
    mapRef.current?.easeTo({ center: [lng, lat], duration: 250 })
  }, [lat, lng])

  return (
    <div>
      <div ref={container} className={`${className} w-full overflow-hidden rounded-xl border border-line bg-paper-2`} aria-label={lang === 'vi' ? 'Bản đồ chọn vị trí' : 'Location map'} />
      <p className="mt-1.5 text-2xs text-ink-faint">
        {status === 'error'
          ? (lang === 'vi' ? 'Chưa tải được bản đồ — bạn vẫn có thể nhập toạ độ.' : 'Map unavailable — you can still type the coordinates.')
          : (lang === 'vi' ? 'Chạm lên bản đồ hoặc kéo ghim đến đúng cổng cơ sở của bạn.' : 'Tap the map or drag the pin to your front door.')}
      </p>
    </div>
  )
}
