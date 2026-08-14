import { useEffect, useRef, useState } from 'react'
import { Map as MapLibreMap, Marker, NavigationControl, LngLatBounds } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../../lib/maplibreSetup.js'
import { MapPin, Warning } from '@phosphor-icons/react'
import { hasMapsKey, loadMapStyle, mapRequestTransform } from '../../lib/trackAsia.js'
import { fetchPlaceEnrichment } from '../../lib/placesService.js'
import { scoreForCriterion } from '../../lib/foodTripScore.js'
import { useLanguage } from '../../i18n/LanguageContext.jsx'

const COPY = {
  vi: {
    noKey: 'Cần cấu hình Track-Asia API key để hiển thị bản đồ khám phá.',
    empty: 'Không có địa điểm đủ dữ liệu tọa độ để hiển thị.',
    loading: 'Đang định vị các địa điểm…',
  },
  en: {
    noKey: 'A Track-Asia API key is required to show the explore map.',
    empty: 'No places have enough location data to display.',
    loading: 'Locating places…',
  },
}

function markerElement(label, selected) {
  const element = document.createElement('button')
  element.type = 'button'
  element.setAttribute('aria-label', `FoodTrip ${label}`)
  element.style.cssText = `
    min-width:${selected ? 46 : 40}px;height:${selected ? 46 : 40}px;padding:0 8px;
    border-radius:999px;border:${selected ? 3 : 2}px solid #fff;
    background:${selected ? '#2f5d4e' : '#d8481f'};color:#fff7ee;
    display:flex;align-items:center;justify-content:center;font:700 12px system-ui,sans-serif;
    box-shadow:0 4px 14px rgba(32,25,20,.32);cursor:pointer;transition:.2s transform,.2s background;
  `
  element.textContent = label
  return element
}

export default function ExploreMap({ places, criterion, selectedId, onSelect, userLocation, onLocationsResolved, className = '' }) {
  const { lang } = useLanguage()
  const copy = COPY[lang]
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef(new Map())
  const selectedIdRef = useRef(selectedId)
  const onSelectRef = useRef(onSelect)
  const onLocationsResolvedRef = useRef(onLocationsResolved)
  selectedIdRef.current = selectedId
  onSelectRef.current = onSelect
  onLocationsResolvedRef.current = onLocationsResolved
  const [status, setStatus] = useState(hasMapsKey ? 'loading' : 'no-key')
  const placesKey = places.map((place) => place.id).join('|')
  const markerMetricKey = places.map((place) => `${place.id}:${place.matchScore ?? ''}`).join('|')

  useEffect(() => {
    if (!hasMapsKey || !containerRef.current) return undefined
    let cancelled = false
    let map = null
    setStatus('loading')

    Promise.all(
      places.slice(0, 30).map(async (place) => {
        if (place.location) return { place, location: place.location }
        const data = await fetchPlaceEnrichment({ name: place.name.vi, address: place.address.vi, city: place.city })
        return data?.location ? { place, location: data.location } : null
      })
    ).then(async (results) => {
      if (cancelled || !containerRef.current) return
      const plotted = results.filter(Boolean)
      if (!plotted.length) {
        setStatus('empty')
        return
      }
      const style = await loadMapStyle()
      if (cancelled || !containerRef.current) return
      map = new MapLibreMap({
        container: containerRef.current,
        style,
        transformRequest: mapRequestTransform,
        center: [plotted[0].location.lng, plotted[0].location.lat],
        zoom: 12,
      })
      mapRef.current = map
      map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
      const bounds = new LngLatBounds()
      markersRef.current.clear()

      onLocationsResolvedRef.current?.(Object.fromEntries(plotted.map(({ place, location }) => [place.id, location])))

      plotted.forEach(({ place, location }) => {
        const score = scoreForCriterion(place, criterion)
        const markerLabel = place.matchScore != null ? `${place.matchScore}%` : score.toFixed(1)
        const element = markerElement(markerLabel, place.id === selectedIdRef.current)
        element.title = `${place.name[lang]} · ${markerLabel}`
        element.addEventListener('click', () => onSelectRef.current?.(place.id))
        const marker = new Marker({ element, anchor: 'center' })
          .setLngLat([location.lng, location.lat])
          .addTo(map)
        markersRef.current.set(place.id, { marker, place, location })
        bounds.extend([location.lng, location.lat])
      })
      if (userLocation) {
        const userElement = document.createElement('div')
        userElement.title = lang === 'vi' ? 'Vị trí của bạn' : 'Your location'
        userElement.style.cssText = 'width:18px;height:18px;border-radius:50%;background:#2583d8;border:4px solid #fff;box-shadow:0 0 0 5px rgba(37,131,216,.22),0 3px 10px rgba(0,0,0,.25)'
        new Marker({ element: userElement, anchor: 'center' }).setLngLat([userLocation.lng, userLocation.lat]).addTo(map)
        bounds.extend([userLocation.lng, userLocation.lat])
      }
      if (plotted.length > 1) map.fitBounds(bounds, { padding: 70, maxZoom: 14 })
      setStatus('ready')
    }).catch(() => {
      if (!cancelled) setStatus('empty')
    })

    const markerStore = markersRef.current
    return () => {
      cancelled = true
      map?.remove()
      mapRef.current = null
      markerStore.clear()
    }
    // placesKey is the stable representation of the places collection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesKey, markerMetricKey, criterion, lang, userLocation?.lat, userLocation?.lng])

  useEffect(() => {
    markersRef.current.forEach(({ marker, place, location }) => {
      const selected = place.id === selectedId
      const element = marker.getElement()
      element.style.minWidth = selected ? '46px' : '40px'
      element.style.height = selected ? '46px' : '40px'
      element.style.borderWidth = selected ? '3px' : '2px'
      element.style.background = selected ? '#2f5d4e' : '#d8481f'
      element.style.transform = selected ? 'scale(1.08)' : 'scale(1)'
      if (selected) mapRef.current?.easeTo({ center: [location.lng, location.lat], zoom: Math.max(mapRef.current.getZoom(), 14), duration: 550 })
    })
  }, [selectedId])

  if (status !== 'ready' && status !== 'loading') {
    return (
      <div className={`flex h-full min-h-[420px] items-center justify-center bg-paper-2 p-8 text-center text-[13.5px] text-ink-muted ${className}`}>
        <div className="flex max-w-[34ch] flex-col items-center gap-3">
          {status === 'no-key' ? <Warning size={24} className="text-lantern" /> : <MapPin size={24} className="text-ink-faint" />}
          {status === 'no-key' ? copy.noKey : copy.empty}
        </div>
      </div>
    )
  }

  return (
    <div className={`relative h-full min-h-[420px] bg-paper-2 ${className}`}>
      <div ref={containerRef} className="h-full min-h-[420px] w-full" />
      {status === 'loading' && (
        <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full bg-surface/95 px-4 py-2 font-utility text-[11.5px] font-semibold text-ink-muted shadow-soft">
          {copy.loading}
        </div>
      )}
    </div>
  )
}
