import { useCallback, useEffect, useRef, useState } from 'react'
import { hasSupabase, supabase } from '../lib/supabaseClient.js'
import {
  cleanMemberName,
  createLiveMemberIdentity,
  flattenPresenceState,
  liveRoomChannelName,
  normalizeLiveRoomToken,
  rememberLiveMemberName,
} from '../lib/liveTripRoom.js'

const BROADCAST_INTERVAL_MS = 2000

function mergeLatestMembers(remoteMembers, localMember) {
  const merged = new Map(remoteMembers.map((member) => [member.id, member]))
  const remoteLocal = merged.get(localMember.id)
  if (!remoteLocal || localMember.updatedAt >= remoteLocal.updatedAt) merged.set(localMember.id, localMember)
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function useLiveTripRoom({ roomToken, suggestedName }) {
  const normalizedRoom = normalizeLiveRoomToken(roomToken)
  const identityRef = useRef(null)
  if (!identityRef.current && normalizedRoom) identityRef.current = createLiveMemberIdentity(normalizedRoom, suggestedName)

  const initialIdentity = identityRef.current ?? { id: 'offline', name: cleanMemberName(suggestedName), color: '#2f5d4e' }
  const channelRef = useRef(null)
  const watchIdRef = useRef(null)
  const lastBroadcastRef = useRef(0)
  const payloadRef = useRef({ ...initialIdentity, sharing: false, location: null, updatedAt: Date.now() })
  const [connectionStatus, setConnectionStatus] = useState(() => (!hasSupabase ? 'unavailable' : normalizedRoom ? 'connecting' : 'invalid'))
  const [sharingStatus, setSharingStatus] = useState('off')
  const [locationError, setLocationError] = useState(null)
  const [members, setMembers] = useState([payloadRef.current])

  const publish = useCallback((patch, force = false) => {
    const next = { ...payloadRef.current, ...patch, updatedAt: Date.now() }
    payloadRef.current = next
    setMembers((current) => mergeLatestMembers(current.filter((member) => member.id !== next.id), next))
    const channel = channelRef.current
    if (!channel || (!force && Date.now() - lastBroadcastRef.current < BROADCAST_INTERVAL_MS)) return
    lastBroadcastRef.current = Date.now()
    void channel.track(next)
  }, [])

  const stopSharing = useCallback(() => {
    if (watchIdRef.current != null && navigator.geolocation) navigator.geolocation.clearWatch(watchIdRef.current)
    watchIdRef.current = null
    setSharingStatus('off')
    publish({ sharing: false, location: null }, true)
  }, [publish])

  const startSharing = useCallback(() => {
    if (watchIdRef.current != null) return
    if (!navigator.geolocation) {
      setLocationError('unsupported')
      return
    }
    setLocationError(null)
    setSharingStatus('locating')
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setSharingStatus('sharing')
        const isFirstSharedLocation = !payloadRef.current.sharing
        publish({
          sharing: true,
          location: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            heading: position.coords.heading,
            speed: position.coords.speed,
          },
        }, isFirstSharedLocation)
      },
      (error) => {
        if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
        setSharingStatus('off')
        setLocationError(error.code === 1 ? 'denied' : error.code === 3 ? 'timeout' : 'unavailable')
        publish({ sharing: false, location: null }, true)
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 },
    )
  }, [publish])

  const updateMemberName = useCallback((value) => {
    const name = rememberLiveMemberName(value)
    publish({ name }, true)
    return name
  }, [publish])

  useEffect(() => {
    const channelName = liveRoomChannelName(normalizedRoom)
    if (!hasSupabase || !channelName || !identityRef.current) return

    let active = true
    const channel = supabase.channel(channelName, { config: { presence: { key: identityRef.current.id } } })
    channelRef.current = channel

    const syncMembers = () => {
      if (!active) return
      setMembers(mergeLatestMembers(flattenPresenceState(channel.presenceState()), payloadRef.current))
    }

    channel
      .on('presence', { event: 'sync' }, syncMembers)
      .on('presence', { event: 'join' }, syncMembers)
      .on('presence', { event: 'leave' }, syncMembers)
      .subscribe((status) => {
        if (!active) return
        if (status === 'SUBSCRIBED') {
          setConnectionStatus('connected')
          lastBroadcastRef.current = Date.now()
          void channel.track(payloadRef.current)
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnectionStatus('error')
        } else if (status === 'CLOSED') {
          setConnectionStatus('closed')
        }
      })

    return () => {
      active = false
      channelRef.current = null
      if (watchIdRef.current != null && navigator.geolocation) navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [normalizedRoom])

  return {
    member: payloadRef.current,
    members,
    connectionStatus,
    sharingStatus,
    locationError,
    startSharing,
    stopSharing,
    updateMemberName,
  }
}
