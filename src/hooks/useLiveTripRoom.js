import { useCallback, useEffect, useRef, useState } from 'react'
import { cleanMemberName, createLiveMemberIdentity, freshLiveLocation, normalizeLiveRoomToken, normalizePresenceMember, rememberLiveMemberName } from '../lib/liveTripRoom.js'
import { getLiveTripState, joinLiveTrip, leaveLiveTrip, publishLiveLocation } from '../lib/liveTrips.js'

const POLL_MS = 3000
const PUBLISH_MS = 2000

/** Server-checked membership on every read/write. No public GPS channel. */
export function useLiveTripRoom({ roomToken, itineraryId, userId, suggestedName }) {
  const token = normalizeLiveRoomToken(roomToken)
  const [identity] = useState(() => ({ ...createLiveMemberIdentity(token ?? 'offline', suggestedName), id: userId, name: cleanMemberName(suggestedName) }))
  const payload = useRef({ ...identity, sharing: false, location: null, updatedAt: Date.now() })
  const roomRef = useRef(null)
  const watchRef = useRef(null)
  const pendingWrite = useRef(Promise.resolve())
  const lastPublish = useRef(0)
  const alive = useRef(false)
  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const [sharingStatus, setSharingStatus] = useState('off')
  const [locationError, setLocationError] = useState(null)
  const [error, setError] = useState(null)
  const [state, setState] = useState(null)
  const [revision, setRevision] = useState(0)

  const clearWatch = useCallback(() => {
    if (watchRef.current != null) navigator.geolocation?.clearWatch(watchRef.current)
    watchRef.current = null
    payload.current = { ...payload.current, sharing: false, location: null }
    setSharingStatus('off')
  }, [])

  const send = useCallback((force = false) => {
    const room = roomRef.current
    if (!room || (!force && Date.now()-lastPublish.current<PUBLISH_MS)) return Promise.resolve()
    lastPublish.current = Date.now()
    const { name } = payload.current
    const observedAt = payload.current.updatedAt
    const location = freshLiveLocation(payload.current.location,payload.current.updatedAt)
    // Serialize GPS updates and stop-sharing deletion so a delayed fix cannot
    // recreate the location after the traveller explicitly stops sharing.
    pendingWrite.current = pendingWrite.current.catch(() => {}).then(() => publishLiveLocation(room, name, freshLiveLocation(location,observedAt)))
    return pendingWrite.current.catch((err) => {
      if (alive.current) { clearWatch(); setState(null); setError(err); setConnectionStatus('error') }
      throw err
    })
  }, [clearWatch])

  const stopSharing = useCallback(() => {
    clearWatch()
    void send(true).catch(() => {})
  }, [clearWatch, send])

  const startSharing = useCallback(() => {
    if (!roomRef.current || connectionStatus !== 'connected' || watchRef.current != null) return
    if (!navigator.geolocation) { setLocationError('unsupported'); return }
    setLocationError(null); setSharingStatus('locating')
    watchRef.current = navigator.geolocation.watchPosition((position) => {
      payload.current = { ...payload.current, sharing: true, updatedAt: position.timestamp, location: {
        lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy,
        heading: position.coords.heading, speed: position.coords.speed,
      } }
      setSharingStatus('sharing')
      void send().catch(() => {})
    }, (err) => {
      setLocationError(err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable')
      stopSharing()
    }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 })
  }, [connectionStatus, send, stopSharing])

  const updateMemberName = useCallback((value) => {
    const name = rememberLiveMemberName(value)
    payload.current = { ...payload.current, name }
    void send(true).catch(() => {})
    return name
  }, [send])

  useEffect(() => {
    if (!token || !userId) { setConnectionStatus('invalid'); return undefined }
    let active = true; let timer; let joinedRoom
    alive.current = true; setError(null); setState(null); setConnectionStatus('connecting')
    const poll = async () => {
      try {
        const next = await getLiveTripState(joinedRoom)
        if (!active) return
        // Keep the itinerary reference stable: member polling must not rebuild
        // the route/map every three seconds.
        setState((previous) => ({ ...next, trip: previous && JSON.stringify(previous.trip) === JSON.stringify(next.trip) ? previous.trip : next.trip }))
        setError(null); setConnectionStatus('connected')
        if (payload.current.sharing) {
          // Never turn an old browser fix into a seemingly fresh position.
          if (!freshLiveLocation(payload.current.location,payload.current.updatedAt)) {
            payload.current = { ...payload.current, sharing: false, location: null }
            setSharingStatus('locating')
            await send(true)
          } else await send()
        }
      } catch (err) {
        if (!active) return
        clearWatch(); setError(err); setState(null); setConnectionStatus('error')
        return
      }
      if (active) timer = setTimeout(poll, POLL_MS)
    }
    joinLiveTrip(itineraryId, token, payload.current.name).then(async (room) => {
      if (!active) return
      joinedRoom = room.id; roomRef.current = room.id
      await poll()
    }).catch((err) => { if (active) { setError(err); setConnectionStatus('error') } })
    return () => {
      active = false; alive.current = false; clearTimeout(timer); clearWatch(); roomRef.current = null
      if (joinedRoom) void pendingWrite.current.catch(() => {}).then(() => leaveLiveTrip(joinedRoom)).catch(() => {})
    }
  }, [itineraryId, token, userId, revision, clearWatch, send])

  return {
    roomId: roomRef.current, member: payload.current,
    members: (state?.members ?? []).map((m) => ({ ...normalizePresenceMember(m), online: m.online })),
    trip: state?.trip ?? null, ownerId: state?.owner_id,
    connectionStatus, sharingStatus, locationError, error,
    startSharing, stopSharing, updateMemberName, retry: () => setRevision((v) => v+1),
  }
}
