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
    you: 'Vị trí của bạn',
  },
  en: {
    noKey: 'A Track-Asia API key is required to show the explore map.',
    empty: 'No places have enough location data to display.',
    loading: 'Locating places…',
    you: 'Your location',
  },
}

const CHILI = '#d8481f'
const HERB = '#2f5d4e'
// The style's glyph endpoint serves this stack; a font it doesn't have would
// silently drop every label.
const FONT = ['Noto Sans Regular']

const SOURCE_ID = 'explore-places'
const CIRCLE_LAYER = 'explore-places-circle'
const LABEL_LAYER = 'explore-places-label'

function toFeatureCollection(plotted, criterion, lang) {
  return {
    type: 'FeatureCollection',
    features: plotted.map(({ place, location }) => {
      const score = scoreForCriterion(place, criterion)
      const badge = place.matchScore != null ? `${place.matchScore}%` : score != null ? score.toFixed(1) : ''
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [location.lng, location.lat] },
        properties: {
          id: place.id,
          name: place.name[lang] ?? place.name.vi,
          badge,
          // Places with no community rating carry no score at all — the map
          // shows their name only, rather than a number nobody has earned.
          hasBadge: badge ? 1 : 0,
        },
      }
    }),
  }
}

export default function ExploreMap({ places, criterion, selectedId, onSelect, onAreaSelect, userLocation, onLocationsResolved, className = '' }) {
  const { lang } = useLanguage()
  const copy = COPY[lang]
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const locationsRef = useRef(new Map())
  const onSelectRef = useRef(onSelect)
  const onAreaSelectRef = useRef(onAreaSelect)
  const onLocationsResolvedRef = useRef(onLocationsResolved)
  onSelectRef.current = onSelect
  onAreaSelectRef.current = onAreaSelect
  onLocationsResolvedRef.current = onLocationsResolved
  const [status, setStatus] = useState(hasMapsKey ? 'loading' : 'no-key')
  const placesKey = places.map((place) => `${place.id}:${place.matchScore ?? ''}`).join('|')

  useEffect(() => {
    if (!hasMapsKey || !containerRef.current) return undefined
    let cancelled = false
    let map = null
    setStatus('loading')

    // Live results already carry coordinates; only curated seed entries need a
    // lookup, and those are few.
    Promise.all(
      places.map(async (place) => {
        if (place.location) return { place, location: place.location }
        // One failed lookup must not take the whole map down with it.
        const data = await fetchPlaceEnrichment({
          name: place.name.vi, address: place.address.vi, city: place.city,
        }).catch(() => null)
        return data?.location ? { place, location: data.location } : null
      })
    )
      .then(async (results) => {
        if (cancelled || !containerRef.current) return
        const plotted = results.filter(Boolean)
        if (!plotted.length) {
          setStatus('empty')
          return
        }

        locationsRef.current = new Map(plotted.map(({ place, location }) => [place.id, location]))
        onLocationsResolvedRef.current?.(Object.fromEntries(locationsRef.current))

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

        map.on('load', () => {
          if (cancelled) return

          // Drawn as a GPU-rendered layer rather than one DOM node per place:
          // a live search returns dozens to hundreds of results, and that many
          // DOM markers makes panning stutter.
          map.addSource(SOURCE_ID, { type: 'geojson', data: toFeatureCollection(plotted, criterion, lang) })

          map.addLayer({
            id: CIRCLE_LAYER,
            type: 'circle',
            source: SOURCE_ID,
            paint: {
              'circle-radius': ['case', ['==', ['get', 'id'], selectedId ?? ''], 11, 8],
              'circle-color': ['case', ['==', ['get', 'id'], selectedId ?? ''], HERB, CHILI],
              'circle-stroke-width': 2.5,
              'circle-stroke-color': '#ffffff',
            },
          })

          map.addLayer({
            id: LABEL_LAYER,
            type: 'symbol',
            source: SOURCE_ID,
            layout: {
              'text-field': ['get', 'name'],
              'text-font': FONT,
              'text-size': 11.5,
              'text-anchor': 'top',
              'text-offset': [0, 0.85],
              'text-max-width': 9,
              // Let MapLibre hide labels that would collide instead of
              // overlapping them into an unreadable mess.
              'text-allow-overlap': false,
              'text-optional': true,
            },
            paint: {
              'text-color': '#2b2118',
              'text-halo-color': '#ffffff',
              'text-halo-width': 1.4,
            },
          })

          map.on('click', CIRCLE_LAYER, (event) => {
            const id = event.features?.[0]?.properties?.id
            if (id) onSelectRef.current?.(id)
          })
          map.on('click', (event) => {
            if (map.queryRenderedFeatures(event.point, { layers: [CIRCLE_LAYER] }).length) return
            onAreaSelectRef.current?.({ lat: event.lngLat.lat, lng: event.lngLat.lng })
          })
          map.on('mouseenter', CIRCLE_LAYER, () => { map.getCanvas().style.cursor = 'pointer' })
          map.on('mouseleave', CIRCLE_LAYER, () => { map.getCanvas().style.cursor = '' })

          const bounds = new LngLatBounds()
          plotted.forEach(({ location }) => bounds.extend([location.lng, location.lat]))
          if (userLocation) {
            const userElement = document.createElement('div')
            userElement.title = copy.you
            userElement.style.cssText =
              'width:18px;height:18px;border-radius:50%;background:#2583d8;border:4px solid #fff;box-shadow:0 0 0 5px rgba(37,131,216,.22),0 3px 10px rgba(0,0,0,.25)'
            new Marker({ element: userElement, anchor: 'center' }).setLngLat([userLocation.lng, userLocation.lat]).addTo(map)
            bounds.extend([userLocation.lng, userLocation.lat])
          }
          if (plotted.length > 1) map.fitBounds(bounds, { padding: 70, maxZoom: 15 })

          setStatus('ready')
        })
      })
      .catch(() => {
        if (!cancelled) setStatus('empty')
      })

    return () => {
      cancelled = true
      map?.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesKey, criterion, lang, userLocation?.lat, userLocation?.lng])

  // Highlight the selected place without rebuilding the map.
  useEffect(() => {
    const map = mapRef.current
    if (!map?.getLayer?.(CIRCLE_LAYER)) return
    map.setPaintProperty(CIRCLE_LAYER, 'circle-radius', ['case', ['==', ['get', 'id'], selectedId ?? ''], 11, 8])
    map.setPaintProperty(CIRCLE_LAYER, 'circle-color', ['case', ['==', ['get', 'id'], selectedId ?? ''], HERB, CHILI])
    const location = selectedId ? locationsRef.current.get(selectedId) : null
    if (location) map.easeTo({ center: [location.lng, location.lat], zoom: Math.max(map.getZoom(), 14), duration: 550 })
  }, [selectedId, status])

  // The container stays mounted in every state. Swapping it out for a message
  // would detach the ref, and the effect — which bails without a container —
  // could then never rebuild the map once results did arrive.
  return (
    <div className={`relative h-full min-h-[420px] bg-paper-2 lg:min-h-0 ${className}`}>
      <div ref={containerRef} className="h-full min-h-[420px] w-full lg:min-h-0" />
      {status === 'loading' && (
        <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full bg-surface/95 px-4 py-2 font-utility text-[11.5px] font-semibold text-ink-muted shadow-soft">
          {copy.loading}
        </div>
      )}
      {(status === 'no-key' || status === 'empty') && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-paper-2 p-8 text-center text-[13.5px] text-ink-muted">
          <div className="flex max-w-[34ch] flex-col items-center gap-3">
            {status === 'no-key' ? <Warning size={24} className="text-lantern" /> : <MapPin size={24} className="text-ink-faint" />}
            {status === 'no-key' ? copy.noKey : copy.empty}
          </div>
        </div>
      )}
    </div>
  )
}
