import { useEffect, useRef, useState } from 'react'
import { Map as MapLibreMap, Marker, NavigationControl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../../lib/maplibreSetup.js'
import { hasMapsKey, loadMapStyle, mapRequestTransform } from '../../lib/trackAsia.js'
import { useCommunityText } from './communityUi.js'

export default function CommunityMap({ lat, lng, onChoose }) {
  const t = useCommunityText()
  const container = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const chooseRef = useRef(onChoose)
  chooseRef.current = onChoose
  const pointRef = useRef({ lat, lng })
  pointRef.current = { lat, lng }
  const [status, setStatus] = useState(hasMapsKey ? 'loading' : 'error')

  useEffect(() => {
    if (!hasMapsKey) return
    let cancelled = false
    let map
    const timeout = setTimeout(() => { if (!cancelled) setStatus('error') }, 12000)
    loadMapStyle({ lightweight: true }).then((style) => {
      if (cancelled) return
      const point = pointRef.current
      map = new MapLibreMap({ container: container.current, style, transformRequest: mapRequestTransform,
        center: [point.lng, point.lat], zoom: 14, attributionControl: true })
      mapRef.current = map
      markerRef.current = new Marker({ color: '#d8481f' }).setLngLat([point.lng, point.lat]).addTo(map)
      map.addControl(new NavigationControl({ showCompass: false }))
      map.on('load', () => { clearTimeout(timeout); if (!cancelled) setStatus('ready') })
      map.on('click', (event) => chooseRef.current?.({ lat: Number(event.lngLat.lat.toFixed(6)), lng: Number(event.lngLat.wrap().lng.toFixed(6)) }))
    }).catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true; clearTimeout(timeout); map?.remove(); mapRef.current = null; markerRef.current = null }
  }, [])
  useEffect(() => {
    markerRef.current?.setLngLat([lng, lat])
    mapRef.current?.easeTo({ center: [lng, lat], duration: 250 })
  }, [lat, lng])

  return <div className="community-map-wrap">
    <div ref={container} className="community-map" aria-label={t('Bản đồ địa điểm', 'Place map')} />
    {status !== 'ready' && <p className="community-map-status" role="status">{status === 'loading' ? t('Đang tải bản đồ…', 'Loading map…') : t('Chưa tải được bản đồ. Bạn vẫn có thể nhập tọa độ hoặc mở chỉ đường.', 'Map unavailable. You can still enter coordinates or open directions.')}</p>}
    {onChoose && <p className="community-help">{t('Chạm lên bản đồ để đặt ghim. Kiểm tra lại địa chỉ trước khi đăng.', 'Tap the map to place the pin. Verify the address before posting.')}</p>}
  </div>
}
