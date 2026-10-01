import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchRouteDetails } from '../lib/trackAsia.js'
import { bearingDegrees, distanceMeters, locateOnRoute } from '../lib/routeProgress.js'

// A fix further than this from the route (or than its own accuracy, if worse)
// counts as off the route. Two in a row trigger a new route, so a single
// jittery fix near a junction does not.
const OFF_ROUTE_METERS = 35
const OFF_ROUTE_FIXES = 2
// At most one re-route per this long: each is a routing API call.
const REROUTE_COOLDOWN_MS = 10000
// Within this distance of the destination the trip is over.
const ARRIVAL_METERS = 30
// Movement needed before a heading is worked out from two fixes; under it,
// GPS drift would spin the arrow while the traveller stands still.
const HEADING_MIN_MOVE_METERS = 4

const IDLE = {
  status: 'idle', // idle | locating | navigating | rerouting | arrived | error
  position: null,
  accuracy: null,
  heading: null,
  route: null,
  located: null,
  remainingMeters: null,
  remainingSeconds: null,
  error: null, // denied | unsupported | weak-signal
}

/**
 * Follows the traveller to `destination` the way a maps app does: GPS is
 * watched continuously, each fix is placed on the route, the remaining
 * distance and time shrink as they go, and leaving the route fetches a new one
 * from where they are. The screen is kept awake while it runs, where the
 * browser allows.
 *
 * `initialRoute` is the route already on screen, reused so starting costs no
 * extra request; without one, the first fix fetches it.
 *
 * With `autoStart` (the traveller has already shared their location), it
 * starts by itself as soon as there is a route, the way a maps app keeps your
 * dot and the route live without being asked. Ending it with `end()` keeps it
 * off for that destination; picking another destination resets it.
 */
export function useLiveNavigation({ destination, transport, initialRoute, autoStart = false }) {
  const [nav, setNav] = useState(IDLE)
  const watchRef = useRef(null)
  const routeRef = useRef(null)
  const lastPointRef = useRef(null)
  const lastHeadingPointRef = useRef(null)
  const headingRef = useRef(null)
  const offRouteFixesRef = useRef(0)
  const lastRerouteRef = useRef(0)
  const reroutingRef = useRef(false)
  const wakeLockRef = useRef(null)
  const destinationRef = useRef(destination)
  const transportRef = useRef(transport)
  destinationRef.current = destination
  transportRef.current = transport

  const releaseWakeLock = () => {
    wakeLockRef.current?.release?.().catch(() => {})
    wakeLockRef.current = null
  }
  const requestWakeLock = async () => {
    try { wakeLockRef.current = await navigator.wakeLock?.request('screen') } catch { /* not allowed here */ }
  }

  const clearWatch = () => {
    if (watchRef.current != null) navigator.geolocation?.clearWatch(watchRef.current)
    watchRef.current = null
  }

  const stop = useCallback(() => {
    clearWatch()
    releaseWakeLock()
    routeRef.current = null
    setNav(IDLE)
  }, [])

  // The traveller's own "end" — unlike a stop caused by picking another
  // place, it must not be undone by autoStart a moment later.
  const destinationKey = destination ? `${destination.lat.toFixed(6)},${destination.lng.toFixed(6)}` : ''
  const endedForRef = useRef(null)
  const end = useCallback(() => {
    endedForRef.current = destinationKey
    stop()
  }, [destinationKey, stop])

  const reroute = useCallback((from) => {
    const to = destinationRef.current
    if (!to || reroutingRef.current) return
    reroutingRef.current = true
    lastRerouteRef.current = Date.now()
    setNav((s) => ({ ...s, status: 'rerouting' }))
    fetchRouteDetails([from, to], transportRef.current)
      .then((next) => {
        if (watchRef.current == null) return // stopped meanwhile
        if (next?.geometry) {
          routeRef.current = next
          offRouteFixesRef.current = 0
          const located = locateOnRoute(next.geometry.coordinates, from)
          setNav((s) => ({
            ...s, status: 'navigating', route: next, located,
            remainingMeters: next.distanceMeters, remainingSeconds: next.durationSeconds,
          }))
        } else {
          setNav((s) => ({ ...s, status: 'navigating' }))
        }
      })
      .finally(() => { reroutingRef.current = false })
  }, [])

  const onFix = useCallback((position) => {
    const { latitude, longitude, accuracy, heading: gpsHeading, speed } = position.coords
    const point = { lat: latitude, lng: longitude }
    const destination = destinationRef.current
    lastPointRef.current = point

    // Heading: the device's own while moving, otherwise from the last two fixes.
    if (Number.isFinite(gpsHeading) && (speed ?? 0) > 0.5) {
      headingRef.current = gpsHeading
    } else if (lastHeadingPointRef.current && distanceMeters(lastHeadingPointRef.current, point) >= HEADING_MIN_MOVE_METERS) {
      headingRef.current = bearingDegrees(lastHeadingPointRef.current, point)
    }
    if (!lastHeadingPointRef.current || distanceMeters(lastHeadingPointRef.current, point) >= HEADING_MIN_MOVE_METERS) {
      lastHeadingPointRef.current = point
    }

    if (destination && distanceMeters(point, destination) <= ARRIVAL_METERS) {
      clearWatch()
      releaseWakeLock()
      setNav((s) => ({ ...s, status: 'arrived', position: point, accuracy, heading: headingRef.current, remainingMeters: 0, remainingSeconds: 0, error: null }))
      return
    }

    const route = routeRef.current
    const located = route?.geometry ? locateOnRoute(route.geometry.coordinates, point) : null
    const tolerance = Math.max(OFF_ROUTE_METERS, Math.min(accuracy ?? 0, 100))
    const offRoute = !located || located.offRouteMeters > tolerance
    offRouteFixesRef.current = offRoute ? offRouteFixesRef.current + 1 : 0

    const needsRoute = !route?.geometry
    const wandered = offRouteFixesRef.current >= OFF_ROUTE_FIXES && Date.now() - lastRerouteRef.current > REROUTE_COOLDOWN_MS
    if (destination && (needsRoute || wandered)) reroute(point)

    const remainingMeters = located ? located.totalMeters - located.alongMeters : (destination ? distanceMeters(point, destination) : null)
    const remainingSeconds = located && route?.durationSeconds && located.totalMeters > 0
      ? route.durationSeconds * (remainingMeters / located.totalMeters)
      : null

    setNav((s) => ({
      ...s,
      status: reroutingRef.current ? 'rerouting' : 'navigating',
      position: point,
      accuracy,
      heading: headingRef.current,
      located: offRoute ? null : located,
      remainingMeters,
      remainingSeconds,
      error: null,
    }))
  }, [reroute])

  const onError = useCallback((error) => {
    if (error.code === error.PERMISSION_DENIED) {
      clearWatch()
      releaseWakeLock()
      setNav({ ...IDLE, status: 'error', error: 'denied' })
    } else {
      // Timeouts and lost signal are temporary: keep watching, say so.
      setNav((s) => ({ ...s, error: 'weak-signal' }))
    }
  }, [])

  const start = useCallback(() => {
    if (!navigator.geolocation) {
      setNav({ ...IDLE, status: 'error', error: 'unsupported' })
      return
    }
    clearWatch()
    routeRef.current = initialRoute?.geometry ? initialRoute : null
    offRouteFixesRef.current = 0
    lastRerouteRef.current = 0
    lastHeadingPointRef.current = null
    headingRef.current = null
    setNav({ ...IDLE, status: 'locating', route: routeRef.current })
    watchRef.current = navigator.geolocation.watchPosition(onFix, onError, {
      enableHighAccuracy: true,
      maximumAge: 2000,
      timeout: 20000,
    })
    requestWakeLock()
  }, [initialRoute, onFix, onError])

  // A new means of transport needs a new route, from wherever they are now.
  useEffect(() => {
    if (watchRef.current != null && lastPointRef.current) reroute(lastPointRef.current)
  }, [transport, reroute])

  // The screen lock is dropped whenever the page is hidden; take it back.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible' && watchRef.current != null) requestWakeLock() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  useEffect(() => () => { clearWatch(); releaseWakeLock() }, [])

  const active = nav.status !== 'idle' && nav.status !== 'error'
  // A different destination: the old trip is over.
  useEffect(() => {
    endedForRef.current = null
    stop()
  }, [destinationKey, stop])

  useEffect(() => {
    if (!autoStart || !destinationKey || !initialRoute?.geometry) return
    if (nav.status !== 'idle' || endedForRef.current === destinationKey) return
    // Right after another place is picked, the route on screen is still the
    // old one for a moment; only a route that ends at this destination will do.
    const end = initialRoute.geometry.coordinates?.at(-1)
    if (!end || distanceMeters({ lng: end[0], lat: end[1] }, destinationRef.current) > 300) return
    start()
  }, [autoStart, destinationKey, initialRoute, nav.status, start])

  return { ...nav, active, start, stop, end }
}
