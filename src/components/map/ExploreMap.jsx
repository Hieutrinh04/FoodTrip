import { useEffect, useRef, useState } from 'react'
import { Map as MapLibreMap, Marker, NavigationControl, LngLatBounds } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../../lib/maplibreSetup.js'
import { MapPin, Warning } from '@phosphor-icons/react'
import { hasMapsKey, hideBasemapPoiLayers, loadMapStyle, mapRequestTransform } from '../../lib/trackAsia.js'
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
const BADGE_LAYER = 'explore-places-badge'
const LABEL_LAYER = 'explore-places-label'

const ROUTE_SOURCE_ID = 'explore-route'
const ROUTE_CASING_LAYER = 'explore-route-casing'
const ROUTE_LAYER = 'explore-route-line'

const EMPTY_COLLECTION = { type: 'FeatureCollection', features: [] }

// Shared by the initial paint and the selection highlight so the two can never
// drift apart — they did once, leaving selected markers the wrong size.
const radiusExpression = (selectedId) => [
  'case',
  ['==', ['get', 'id'], selectedId ?? ''], 15,
  ['==', ['get', 'hasBadge'], 1], 13,
  8,
]
const colorExpression = (selectedId) => ['case', ['==', ['get', 'id'], selectedId ?? ''], HERB, CHILI]

function toFeatureCollection(plotted, criterion, lang) {
  return {
    type: 'FeatureCollection',
    features: plotted.map(({ place, location }) => {
      // The list computes one figure per place for the active criterion; the
      // marker shows that same figure so a pin never disagrees with its card.
      const communityScore = scoreForCriterion(place, criterion)
      const shown = place.displayScore !== undefined
        ? place.displayScore
        : place.suitability ?? communityScore
      const badge = shown != null ? shown.toFixed(1) : ''
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [location.lng, location.lat] },
        properties: {
          id: place.id,
          name: place.name[lang] ?? place.name.vi,
          badge,
          // A place with nothing scorable at all falls back to a plain dot.
          hasBadge: badge ? 1 : 0,
        },
      }
    }),
  }
}

export default function ExploreMap({ places, criterion, selectedId, onSelect, onAreaSelect, userLocation, onLocationsResolved, routeGeometry = null, className = '' }) {
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
  const didFitRef = useRef(false)
  const [mapReady, setMapReady] = useState(false)
  const [plotted, setPlotted] = useState([])
  const [resolving, setResolving] = useState(true)
  const [failed, setFailed] = useState(false)
  // Derived rather than stored: an explicit status variable had to be set from
  // several effects, and one missed assignment left the map stuck on a spinner.
  const status = !hasMapsKey ? 'no-key'
    : failed ? 'empty'
    : resolving || !mapReady ? 'loading'
    : plotted.length ? 'ready' : 'empty'
  const placesKey = places.map((place) => `${place.id}:${place.displayScore ?? place.suitability ?? place.matchScore ?? ''}`).join('|')

  // Rebuilding the map is expensive — a fresh style, sprite sheet, glyph atlas
  // and every tile again — and it used to happen on every data change, three
  // times over for a single filter click. The map is therefore built once and
  // only its GeoJSON source is updated afterwards.
  useEffect(() => {
    if (!hasMapsKey || !containerRef.current) return undefined
    let cancelled = false
    let map = null

    loadMapStyle()
      .then((style) => {
        if (cancelled || !containerRef.current) return
        map = new MapLibreMap({
          container: containerRef.current,
          style,
          transformRequest: mapRequestTransform,
          // A placeholder view: the data effect fits real bounds the moment
          // coordinates arrive, without animating on that first fit.
          center: [108.2, 15.9],
          zoom: 4,
        })
        mapRef.current = map
        map.addControl(new NavigationControl({ showCompass: false }), 'top-right')

        map.on('load', () => {
          if (cancelled) return

          // Only FoodTrip's own scored markers should appear here, so the
          // basemap's hotel/restaurant icons come off: with them on, filtering
          // to cafés still showed a map full of unrelated, unscored pins.
          hideBasemapPoiLayers(map)

          // The route goes in before the markers so the line always runs
          // underneath them — a road drawn over a pin hides the score the pin
          // exists to show. Added empty: the geometry arrives later, when a
          // place is selected.
          map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data: EMPTY_COLLECTION })
          map.addLayer({
            id: ROUTE_CASING_LAYER,
            type: 'line',
            source: ROUTE_SOURCE_ID,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#ffffff', 'line-width': 9, 'line-opacity': 0.9 },
          })
          map.addLayer({
            id: ROUTE_LAYER,
            type: 'line',
            source: ROUTE_SOURCE_ID,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': CHILI, 'line-width': 4.5 },
          })

          // Drawn as a GPU-rendered layer rather than one DOM node per place:
          // a live search returns dozens to hundreds of results, and that many
          // DOM markers makes panning stutter.
          map.addSource(SOURCE_ID, { type: 'geojson', data: EMPTY_COLLECTION })

          map.addLayer({
            id: CIRCLE_LAYER,
            type: 'circle',
            source: SOURCE_ID,
            paint: {
              // Wide enough to hold a score like "8.2"; plain dots for the rare
              // place that has nothing to score.
              'circle-radius': radiusExpression(null),
              'circle-color': colorExpression(null),
              'circle-stroke-width': 2.5,
              'circle-stroke-color': '#ffffff',
            },
          })

          // The score sits inside its circle, the way a maps app puts a rating
          // on the pin itself.
          map.addLayer({
            id: BADGE_LAYER,
            type: 'symbol',
            source: SOURCE_ID,
            filter: ['==', ['get', 'hasBadge'], 1],
            layout: {
              'text-field': ['get', 'badge'],
              'text-font': FONT,
              'text-size': 11,
              'text-allow-overlap': true,
              'text-ignore-placement': true,
            },
            paint: { 'text-color': '#ffffff' },
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
              'text-offset': [0, 1.35],
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

          // Handlers read through refs, so they stay valid for the map's whole
          // life and never need rebinding when a prop changes.
          //
          // A place is three separate layers — the circle, the score badge and
          // the name label below it. A tap on any of them, or just beside one,
          // must select that place; only a tap on genuinely empty map should
          // search the area. Both handlers therefore look across all three
          // layers within a small pixel radius of the tap, and the marker
          // handler marks the event handled so the map-click handler skips it.
          const MARKER_LAYERS = [CIRCLE_LAYER, BADGE_LAYER, LABEL_LAYER]
          const HIT_SLOP = 8
          const markerFeatureAt = (point) => {
            const box = [
              [point.x - HIT_SLOP, point.y - HIT_SLOP],
              [point.x + HIT_SLOP, point.y + HIT_SLOP],
            ]
            const layers = MARKER_LAYERS.filter((layer) => map.getLayer(layer))
            return map.queryRenderedFeatures(box, { layers })[0] ?? null
          }

          map.on('click', (event) => {
            const feature = markerFeatureAt(event.point)
            if (feature) {
              const id = feature.properties?.id
              if (id) onSelectRef.current?.(id)
              return
            }
            onAreaSelectRef.current?.({ lat: event.lngLat.lat, lng: event.lngLat.lng })
          })

          const setPointerCursor = (event) => {
            map.getCanvas().style.cursor = markerFeatureAt(event.point) ? 'pointer' : ''
          }
          map.on('mousemove', setPointerCursor)
          map.on('mouseout', () => { map.getCanvas().style.cursor = '' })

          setMapReady(true)
        })
      })
      .catch(() => { if (!cancelled) setFailed(true) })

    return () => {
      cancelled = true
      map?.remove()
      mapRef.current = null
      setMapReady(false)
    }
  }, [])

  // Resolving coordinates is independent of the map, so it runs on its own and
  // does not hold the map back from appearing.
  useEffect(() => {
    let cancelled = false
    setResolving(true)

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
      .then((results) => {
        if (cancelled) return
        const located = results.filter(Boolean)
        locationsRef.current = new Map(located.map(({ place, location }) => [place.id, location]))
        onLocationsResolvedRef.current?.(Object.fromEntries(locationsRef.current))
        setPlotted(located)
        setResolving(false)
      })
      .catch(() => { if (!cancelled) { setFailed(true); setResolving(false) } })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesKey])

  // Pushes the current results into the existing map, replacing what used to be
  // a full teardown and rebuild.
  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map) return
    map.getSource(SOURCE_ID)?.setData(toFeatureCollection(plotted, criterion, lang))
    if (!plotted.length) return

    const bounds = new LngLatBounds()
    plotted.forEach(({ location }) => bounds.extend([location.lng, location.lat]))
    if (userLocation) bounds.extend([userLocation.lng, userLocation.lat])
    if (plotted.length > 1) {
      // The very first fit jumps rather than flies: animating away from the
      // placeholder view would be a long, pointless swoop across the country.
      map.fitBounds(bounds, { padding: 70, maxZoom: 15, duration: didFitRef.current ? 600 : 0 })
      didFitRef.current = true
    }
    // Depending on the coordinates rather than the object keeps a re-rendered
    // parent from refitting the camera on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plotted, criterion, lang, mapReady, userLocation?.lat, userLocation?.lng])

  // The road route to whichever place is selected. Drawing it is separate from
  // fetching it: the parent owns the lookup, so the map stays a renderer and a
  // failed or missing route simply clears the line.
  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map?.getSource?.(ROUTE_SOURCE_ID)) return
    if (!routeGeometry) {
      map.getSource(ROUTE_SOURCE_ID).setData(EMPTY_COLLECTION)
      return
    }
    map.getSource(ROUTE_SOURCE_ID).setData({ type: 'Feature', geometry: routeGeometry, properties: {} })

    // Frame the whole route, since one end of it is usually off screen — the
    // traveller is looking at the places, not at where they are standing.
    const bounds = new LngLatBounds()
    for (const [lng, lat] of routeGeometry.coordinates ?? []) bounds.extend([lng, lat])
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 80, maxZoom: 16, duration: 600 })
  }, [routeGeometry, mapReady])

  // The traveller's own position is a single DOM marker, kept in sync without
  // touching the results layers.
  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map || !userLocation) return undefined

    const element = document.createElement('div')
    element.title = copy.you
    element.style.cssText =
      'width:18px;height:18px;border-radius:50%;background:#2583d8;border:4px solid #fff;box-shadow:0 0 0 5px rgba(37,131,216,.22),0 3px 10px rgba(0,0,0,.25)'
    const marker = new Marker({ element, anchor: 'center' }).setLngLat([userLocation.lng, userLocation.lat]).addTo(map)
    return () => marker.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, userLocation?.lat, userLocation?.lng, copy.you])

  // Highlight the selected place without rebuilding the map.
  useEffect(() => {
    const map = mapRef.current
    if (!map?.getLayer?.(CIRCLE_LAYER)) return
    map.setPaintProperty(CIRCLE_LAYER, 'circle-radius', radiusExpression(selectedId))
    map.setPaintProperty(CIRCLE_LAYER, 'circle-color', colorExpression(selectedId))
    const location = selectedId ? locationsRef.current.get(selectedId) : null
    if (location) map.easeTo({ center: [location.lng, location.lat], zoom: Math.max(map.getZoom(), 14), duration: 550 })
  }, [selectedId, mapReady])

  // The container stays mounted in every state. Swapping it out for a message
  // would detach the ref, and the effect — which bails without a container —
  // could then never rebuild the map once results did arrive.
  return (
    <div className={`relative h-full min-h-[420px] bg-paper-2 lg:min-h-0 ${className}`}>
      <div ref={containerRef} className="h-full min-h-[420px] w-full lg:min-h-0" />
      {status === 'loading' && (
        <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full bg-surface/95 px-4 py-2 font-utility text-xs font-semibold text-ink-muted shadow-soft">
          {copy.loading}
        </div>
      )}
      {(status === 'no-key' || status === 'empty') && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-paper-2 p-8 text-center text-md text-ink-muted">
          <div className="flex max-w-[34ch] flex-col items-center gap-3">
            {status === 'no-key' ? <Warning size={24} className="text-lantern" /> : <MapPin size={24} className="text-ink-faint" />}
            {status === 'no-key' ? copy.noKey : copy.empty}
          </div>
        </div>
      )}
    </div>
  )
}
