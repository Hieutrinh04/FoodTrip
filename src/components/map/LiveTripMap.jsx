import { useEffect, useRef, useState } from 'react'
import { Map as MapLibreMap, Marker, NavigationControl, LngLatBounds } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../../lib/maplibreSetup.js'
import { NavigationArrow, Warning, X, FilmSlate, Play, Stop, ArrowCounterClockwise } from '@phosphor-icons/react'
import { hasMapsKey, loadMapStyle, mapRequestTransform, fetchRoute } from '../../lib/trackAsia.js'
import { buildRouteWalker, playRoute } from '../../lib/routeAnimation.js'
import { getPlace } from '../../data/destinations.js'
import { useVideoReviewsForPlace } from '../../hooks/useVideoReviewsForPlace.js'
import VideoReviewCard from '../video/VideoReviewCard.jsx'
import { useLanguage } from '../../i18n/LanguageContext.jsx'

const C = {
  vi: {
    noKey: 'Bản đồ trực tiếp cần cấu hình Track-Asia API key (xem .env.example).',
    noLocation: 'Chưa đủ dữ liệu vị trí thật để dựng bản đồ — thử tạo lại lịch trình.',
    mapError: 'Không thể tải bản đồ lúc này — vui lòng thử lại.',
    locate: 'Định vị tôi trên bản đồ',
    locating: 'Đang định vị…',
    locationDenied: 'Không lấy được vị trí — hãy cho phép quyền truy cập vị trí trên trình duyệt.',
    you: 'Vị trí của bạn',
    reviewsTitle: 'Video review từ mạng xã hội',
    noReviews: 'Chưa có video review nào cho quán này.',
    start: 'Điểm bắt đầu', end: 'Điểm kết thúc',
    play: 'Xem mô phỏng hành trình', stop: 'Dừng mô phỏng', reset: 'Xem toàn tuyến',
    estimatedRoute: 'Tuyến nối ước tính', liveRoute: 'Tuyến đường thực tế', overview: 'Tổng quan các ngày', loadingRoute: 'Đang tính tuyến',
  },
  en: {
    noKey: 'Live map needs a Track-Asia API key configured (see .env.example).',
    noLocation: 'Not enough real location data to build the map — try regenerating the itinerary.',
    mapError: 'The map could not be loaded — please try again.',
    locate: 'Locate me on the map',
    locating: 'Locating…',
    locationDenied: 'Could not get your location — please allow location access in your browser.',
    you: 'Your location',
    reviewsTitle: 'Video reviews from social media',
    noReviews: 'No video reviews for this place yet.',
    start: 'Start', end: 'Finish',
    play: 'Play trip animation', stop: 'Stop animation', reset: 'View full route',
    estimatedRoute: 'Estimated route', liveRoute: 'Live road route', overview: 'All-day overview', loadingRoute: 'Calculating route',
  },
}

function resolveCssColor(varName, fallback) {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  return value || fallback
}

/**
 * Stop marker — MapLibre takes a plain DOM node rather than a pin API. The
 * first and last stops get their own colour and a caption underneath so the
 * direction of travel is obvious at a glance; the rest are just numbered.
 */
function buildPinElement({ label, background, color, caption, emphasise }) {
  const wrap = document.createElement('div')
  wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;cursor:pointer'

  const size = emphasise ? 34 : 28
  const pin = document.createElement('div')
  pin.style.cssText = `width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${background};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.35)${emphasise ? ';border:2.5px solid #fff' : ''}`
  const inner = document.createElement('span')
  inner.textContent = label
  inner.style.cssText = `transform:rotate(45deg);color:${color};font-size:${emphasise ? 13 : 12}px;font-weight:700;font-family:system-ui,sans-serif`
  pin.appendChild(inner)
  wrap.appendChild(pin)

  if (caption) {
    const tag = document.createElement('span')
    tag.textContent = caption
    tag.style.cssText = `margin-top:3px;background:${background};color:${color};font-size:10px;font-weight:700;font-family:system-ui,sans-serif;padding:2px 7px;border-radius:99px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.25)`
    wrap.appendChild(tag)
  }
  return wrap
}

const VEHICLE_GLYPH = { bike: '🛵', car: '🚗', walk: '🚶', taxi: '🚕' }

/**
 * The moving marker for the trip playback. The badge itself stays upright so
 * the icon reads normally, while the arrow ring around it rotates to the
 * current heading — the same cue ride-hailing apps use.
 */
function buildVehicleElement(transport, accent) {
  const wrap = document.createElement('div')
  wrap.style.cssText = 'position:relative;width:40px;height:40px;pointer-events:none'

  const arrow = document.createElement('div')
  arrow.dataset.role = 'heading'
  arrow.style.cssText =
    `position:absolute;inset:0;display:flex;align-items:flex-start;justify-content:center;transition:transform .15s linear`
  const tip = document.createElement('div')
  tip.style.cssText = `width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:9px solid ${accent};margin-top:-3px`
  arrow.appendChild(tip)
  wrap.appendChild(arrow)

  const badge = document.createElement('div')
  badge.style.cssText =
    `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:30px;height:30px;border-radius:50%;background:#fff;border:2.5px solid ${accent};display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 3px 10px rgba(0,0,0,.35)`
  badge.textContent = VEHICLE_GLYPH[transport] ?? VEHICLE_GLYPH.car
  wrap.appendChild(badge)

  return wrap
}

export default function LiveTripMap({ stops = [], transport, className = '', showRoute = true, overviewRoutes = [] }) {
  const { lang } = useLanguage()
  const c = C[lang]
  const mapElRef = useRef(null)
  const mapRef = useRef(null)
  const userMarkerRef = useRef(null)
  const watchIdRef = useRef(null)

  const validStops = stops.filter((s) => s.location)
  // Stable identity for the map effect below: `validStops` is a brand-new array
  // on every render, so depending on it directly would tear the map down and
  // rebuild it constantly.
  const stopsKey = validStops.map((s) => `${s.placeId}@${s.location.lat},${s.location.lng}`).join('|')
  const overviewRoutesKey = overviewRoutes
    .map((route) => `${route.color}:${route.stops.map((s) => `${s.location?.lat},${s.location?.lng}`).join('|')}`)
    .join('::')

  const [status, setStatus] = useState(() => (!hasMapsKey ? 'no-key' : !validStops.length ? 'no-location' : 'loading'))
  const [tracking, setTracking] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [locError, setLocError] = useState(null)
  const routeCoordsRef = useRef(null)
  const vehicleMarkerRef = useRef(null)
  const stopAnimRef = useRef(null)
  const overviewBoundsRef = useRef(null)
  const [selectedStop, setSelectedStop] = useState(null)
  const [routeQuality, setRouteQuality] = useState(overviewRoutes.length ? 'overview' : 'loading')
  const selectedPlace = selectedStop ? getPlace(selectedStop.placeId) : null
  const selectedReviews = useVideoReviewsForPlace({
    googlePlaceId: selectedStop?.googlePlaceId,
    name: selectedPlace?.name?.[lang],
  })

  useEffect(() => {
    if (!hasMapsKey || !validStops.length || !mapElRef.current) return
    let cancelled = false

    const chili = resolveCssColor('--chili', '#d8481f')
    const chiliInk = resolveCssColor('--chili-ink', '#fff7ee')
    const herb = resolveCssColor('--herb', '#2f5d4e')
    const herbInk = resolveCssColor('--herb-ink', '#f2f7f4')

    let map = null

    loadMapStyle()
      .then((style) => {
        if (cancelled || !mapElRef.current) return
        map = new MapLibreMap({
          container: mapElRef.current,
          style,
          transformRequest: mapRequestTransform,
          center: [validStops[0].location.lng, validStops[0].location.lat],
          zoom: 13,
        })
        mapRef.current = map
        map.addControl(new NavigationControl({ showCompass: false }), 'top-right')

        const bounds = new LngLatBounds()
        const lastIndex = validStops.length - 1
        const stopMarkers = []
        let activeMarkerElement = null
        validStops.forEach((stop, i) => {
          if (stop.hideMarker) {
            bounds.extend([stop.location.lng, stop.location.lat])
            return
          }
          const place = getPlace(stop.placeId)
          const isHotel = stop.kind === 'hotel'
          const isStart = i === 0
          const isEnd = i === lastIndex && lastIndex > 0
          const el = buildPinElement({
            label: isHotel ? 'H' : String(stop.displayIndex ?? i + 1),
            background: isHotel ? herb : stop.markerColor ?? (isEnd ? '#2b2b2b' : chili),
            color: isHotel ? herbInk : chiliInk,
            caption: isHotel ? (lang === 'vi' ? 'Nơi lưu trú' : 'Hotel') : isStart ? c.start : isEnd ? c.end : null,
            emphasise: isHotel || isStart || isEnd,
          })
          el.title = isHotel ? stop.name : place ? `${stop.displayIndex ?? i + 1}. ${place.name[lang]}` : stop.time
          el.addEventListener('click', () => {
            if (activeMarkerElement) activeMarkerElement.style.filter = ''
            activeMarkerElement = el
            el.style.filter = 'drop-shadow(0 0 5px rgba(216,72,31,.75))'
            setSelectedStop(stop)
            map.easeTo({
              center: [stop.location.lng, stop.location.lat],
              zoom: Math.max(map.getZoom(), 15),
              duration: 650,
            })
          })
          const marker = new Marker({ element: el, anchor: 'bottom' })
            .setLngLat([stop.location.lng, stop.location.lat])
            .addTo(map)
          stopMarkers.push({ marker, location: stop.location })
          bounds.extend([stop.location.lng, stop.location.lat])
        })

        // Nearby stops can land on the same screen pixels at city-level zoom.
        // Spread only the marker artwork around its real coordinate so every
        // itinerary number remains visible; routing still uses the untouched
        // latitude/longitude values below.
        function spreadOverlappingMarkers() {
          const groups = []
          const claimed = new Set()

          stopMarkers.forEach((entry, index) => {
            if (claimed.has(index)) return
            const group = [entry]
            claimed.add(index)
            const origin = map.project([entry.location.lng, entry.location.lat])

            stopMarkers.forEach((candidate, candidateIndex) => {
              if (claimed.has(candidateIndex)) return
              const point = map.project([candidate.location.lng, candidate.location.lat])
              if (Math.hypot(point.x - origin.x, point.y - origin.y) < 36) {
                group.push(candidate)
                claimed.add(candidateIndex)
              }
            })
            groups.push(group)
          })

          groups.forEach((group) => {
            if (group.length === 1) {
              group[0].marker.setOffset([0, 0])
              return
            }
            const radius = Math.min(40, 20 + group.length * 3)
            group.forEach(({ marker }, index) => {
              const angle = -Math.PI / 2 + (index * Math.PI * 2) / group.length
              marker.setOffset([
                Math.round(Math.cos(angle) * radius),
                Math.round(Math.sin(angle) * radius),
              ])
            })
          })
        }

        map.on('zoomend', spreadOverlappingMarkers)

        overviewBoundsRef.current = validStops.length > 1 ? bounds : null

        map.on('load', async () => {
          if (cancelled) return
          if (validStops.length > 1) map.fitBounds(bounds, { padding: 64, maxZoom: 15 })
          map.once('idle', spreadOverlappingMarkers)

          if (overviewRoutes.length) {
            overviewRoutes.forEach((route, routeIndex) => {
              const coordinates = route.stops
                .filter((stop) => stop.location)
                .map((stop) => [stop.location.lng, stop.location.lat])
              if (coordinates.length < 2) return
              const sourceId = `overview-route-${routeIndex}`
              map.addSource(sourceId, {
                type: 'geojson',
                data: { type: 'Feature', geometry: { type: 'LineString', coordinates } },
              })
              map.addLayer({
                id: `${sourceId}-line`,
                type: 'line',
                source: sourceId,
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                  'line-color': route.color,
                  'line-width': 3.5,
                  'line-opacity': 0.72,
                  'line-dasharray': [1.5, 1.25],
                },
              })
            })
            setRouteQuality('overview')
            setStatus('ready')
            return
          }

          // Real route when the routing service answers; otherwise fall back to
          // a straight line connecting the stops in order.
          if (!showRoute || validStops.length < 2) {
            setStatus('ready')
            return
          }
          const geometry = await fetchRoute(validStops.map((s) => s.location), transport)
          if (cancelled || !mapRef.current) return
          const coordinates =
            geometry?.coordinates ?? validStops.map((s) => [s.location.lng, s.location.lat])
          setRouteQuality(geometry ? 'live' : 'estimated')
          routeCoordsRef.current = coordinates

          map.addSource('trip-route', {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'LineString', coordinates } },
          })
          map.addLayer({
            id: 'trip-route-line',
            type: 'line',
            source: 'trip-route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': herb, 'line-width': 4, 'line-opacity': 0.85 },
          })

          // Park the vehicle on the starting point right away, so the map shows
          // where the trip begins before playback is ever started.
          const walker = buildRouteWalker(coordinates)
          if (walker.totalKm) {
            const el = buildVehicleElement(transport, chili)
            const heading = el.querySelector('[data-role="heading"]')
            const startPoint = walker.at(0)
            if (heading) heading.style.transform = `rotate(${startPoint.bearing}deg)`
            vehicleMarkerRef.current = new Marker({ element: el }).setLngLat(startPoint.position).addTo(map)
          }
        })
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
      // Stop any playback first: its frames drive a marker on the map that is
      // about to be destroyed.
      stopAnimRef.current?.()
      stopAnimRef.current = null
      setPlaying(false)
      map?.remove()
      mapRef.current = null
      vehicleMarkerRef.current = null
      routeCoordsRef.current = null
      overviewBoundsRef.current = null
    }
    // `status` is deliberately NOT a dependency: this effect's cleanup destroys
    // the map, so reacting to a status change would tear down the map the
    // moment it finished loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopsKey, transport, lang, showRoute, overviewRoutesKey])

  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current)
      // Leave no animation frame running against a map that's being torn down.
      stopAnimRef.current?.()
      stopAnimRef.current = null
      vehicleMarkerRef.current = null
    }
  }, [])

  /** Pulls the camera back out to show the whole trip again after playback. */
  function showOverview() {
    const map = mapRef.current
    const bounds = overviewBoundsRef.current
    if (map && bounds) map.fitBounds(bounds, { padding: 64, maxZoom: 15, duration: 900 })
  }

  function stopPlayback({ resetToStart = true } = {}) {
    stopAnimRef.current?.()
    stopAnimRef.current = null
    setPlaying(false)

    // The vehicle stays on the map — it just returns to the starting point so
    // the next playback begins where the trip does.
    if (resetToStart) {
      const coordinates = routeCoordsRef.current
      const marker = vehicleMarkerRef.current
      if (marker && coordinates?.length >= 2) {
        const start = buildRouteWalker(coordinates).at(0)
        marker.setLngLat(start.position)
        const heading = marker.getElement().querySelector('[data-role="heading"]')
        if (heading) heading.style.transform = `rotate(${start.bearing}deg)`
      }
    }
    showOverview()
  }

  function handlePlayRoute() {
    const map = mapRef.current
    const coordinates = routeCoordsRef.current
    const marker = vehicleMarkerRef.current
    if (!map || !marker || !coordinates || coordinates.length < 2) return
    if (playing) return stopPlayback()

    const walker = buildRouteWalker(coordinates)
    if (!walker.totalKm) return

    // Pace the playback by route length so a long trip doesn't crawl and a
    // short one doesn't flash past — clamped to a watchable 6–20 seconds.
    const durationMs = Math.min(20000, Math.max(6000, walker.totalKm * 2200))
    const heading = marker.getElement().querySelector('[data-role="heading"]')

    // Zoom in to street level and follow the vehicle, the way a navigation
    // view does, instead of watching a dot creep across the whole-trip view.
    const start = walker.at(0)
    marker.setLngLat(start.position)
    map.easeTo({ center: start.position, zoom: 16, duration: 700 })

    setPlaying(true)
    stopAnimRef.current = playRoute({
      durationMs,
      onFrame: (progress) => {
        const { position, bearing } = walker.at(progress)
        marker.setLngLat(position)
        if (heading) heading.style.transform = `rotate(${bearing}deg)`
        // setCenter rather than easeTo: this already runs once per animation
        // frame, so an extra tween per frame would fight the motion.
        map.setCenter(position)
      },
      onDone: () => {
        stopAnimRef.current = null
        setPlaying(false)
        // Leave the vehicle at the destination and reveal the full trip again.
        showOverview()
      },
    })
  }

  function handleLocateMe() {
    if (!navigator.geolocation || !mapRef.current) return
    setTracking(true)
    setLocError(null)
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => placeUserMarker({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        setLocError(c.locationDenied)
        setTracking(false)
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    )
  }

  function placeUserMarker(loc) {
    const map = mapRef.current
    if (!map) return
    if (!userMarkerRef.current) {
      const el = document.createElement('div')
      el.title = c.you
      el.style.cssText =
        'width:16px;height:16px;border-radius:50%;background:#2e86d8;border:3px solid #fff;box-shadow:0 0 0 2px rgba(46,134,216,.4)'
      userMarkerRef.current = new Marker({ element: el }).setLngLat([loc.lng, loc.lat]).addTo(map)
    } else {
      userMarkerRef.current.setLngLat([loc.lng, loc.lat])
    }
    map.panTo([loc.lng, loc.lat])
  }

  if (status === 'no-key' || status === 'no-location' || status === 'error') {
    return (
      <div className={`flex items-center gap-2.5 rounded-xl border border-line-strong bg-paper-2 p-5 text-[13.5px] text-ink-muted ${className}`}>
        <Warning size={18} className="shrink-0 text-lantern" />
        {status === 'no-key' ? c.noKey : status === 'error' ? c.mapError : c.noLocation}
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="relative overflow-hidden rounded-xl border border-line-strong">
        <div ref={mapElRef} className="h-[420px] w-full bg-paper-2" />
        <div className="absolute left-3 top-3 z-10 rounded-full bg-surface/95 px-3 py-1.5 font-utility text-[10.5px] font-bold uppercase tracking-wide text-ink-muted shadow-soft backdrop-blur-sm">
          {routeQuality === 'overview' ? c.overview : routeQuality === 'estimated' ? c.estimatedRoute : routeQuality === 'loading' ? c.loadingRoute : c.liveRoute}
        </div>
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 flex-wrap justify-center px-3">
          {showRoute && routeQuality !== 'overview' && (
            <button
              onClick={handlePlayRoute}
              disabled={!routeCoordsRef.current}
              className={`inline-flex items-center gap-2 rounded-full px-5 py-3 font-utility text-[13px] font-semibold shadow-lifted transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${playing ? 'bg-chili text-chili-ink' : 'bg-surface hover:text-chili'}`}
            >
              {playing ? <Stop size={15} weight="fill" /> : <Play size={15} weight="fill" />}
              {playing ? c.stop : c.play}
            </button>
          )}
          <button
            onClick={showOverview}
            className="inline-flex items-center gap-2 rounded-full bg-surface px-4 py-3 font-utility text-[13px] font-semibold shadow-lifted hover:text-chili transition-colors"
          >
            <ArrowCounterClockwise size={16} /> {c.reset}
          </button>
          <button
            onClick={handleLocateMe}
            className="inline-flex items-center gap-2 rounded-full bg-surface px-5 py-3 font-utility text-[13px] font-semibold shadow-lifted hover:text-chili transition-colors"
          >
            <NavigationArrow size={16} weight="fill" className={tracking ? 'text-chili' : ''} />
            {tracking ? c.locating : c.locate}
          </button>
        </div>
        {locError && (
          <div className="absolute top-3 left-3 right-3 z-10 rounded-lg bg-surface/95 px-3.5 py-2.5 text-[12.5px] text-chili shadow-soft">
            {locError}
          </div>
        )}
      </div>

      {selectedStop && (
        <div className="mt-4 rounded-xl border border-line bg-surface p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <div className="font-bold text-[16px]">{selectedStop.kind === 'hotel' ? selectedStop.name : selectedPlace ? selectedPlace.name[lang] : selectedStop.time}</div>
              <div className="font-utility text-[11.5px] font-bold uppercase tracking-wide text-chili mt-1">
                {selectedStop.kind === 'hotel' ? (lang === 'vi' ? 'Điểm bắt đầu và kết thúc mỗi ngày' : 'Daily start and finish') : c.reviewsTitle}
              </div>
            </div>
            <button onClick={() => setSelectedStop(null)} aria-label="Close" className="shrink-0 p-1.5 text-ink-faint hover:text-chili transition-colors">
              <X size={18} />
            </button>
          </div>

          {selectedStop.kind === 'hotel' ? (
            <div className="flex items-start gap-2.5 rounded-lg bg-paper-2 px-4 py-3 text-[13.5px] text-ink-muted">
              <NavigationArrow size={17} className="mt-0.5 shrink-0 text-herb" />
              <span>{selectedStop.address || (lang === 'vi' ? 'Nơi lưu trú đã chọn cho chuyến đi.' : 'Selected accommodation for this trip.')}</span>
            </div>
          ) : selectedReviews.length > 0 ? (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              {selectedReviews.map((r) => (
                <VideoReviewCard key={r.id} review={r} />
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2.5 rounded-lg bg-paper-2 px-4 py-3 text-[13.5px] text-ink-muted">
              <FilmSlate size={17} className="shrink-0 text-ink-faint" />
              {c.noReviews}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
