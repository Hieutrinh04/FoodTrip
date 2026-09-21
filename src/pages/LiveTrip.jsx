import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  Broadcast,
  Check,
  LinkBreak,
  MapPin,
  MapTrifold,
  NavigationArrow,
  PencilSimple,
  ShareNetwork,
  ShieldCheck,
  Stop,
  UsersThree,
} from '@phosphor-icons/react'
import EmptyState from '../components/ui/EmptyState.jsx'
import Spinner from '../components/ui/Spinner.jsx'
import LiveTripMap from '../components/map/LiveTripMap.jsx'
import ItineraryTicket from '../components/ticket/ItineraryTicket.jsx'
import { getCity, getPlace, registerCustomPlaces } from '../data/destinations.js'
import { fetchCustomPlaces } from '../lib/customPlacesCache.js'
import { getPublicItinerary } from '../lib/itineraries.js'
import { normalizeLiveRoomToken } from '../lib/liveTripRoom.js'
import { shareOrCopyLink } from '../lib/shareLink.js'
import { useLiveTripRoom } from '../hooks/useLiveTripRoom.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'

const C = {
  vi: {
    eyebrow: 'Hành trình trực tiếp',
    title: 'Cả nhóm đang đi cùng nhau',
    subtitle: 'Xem tuyến đường và vị trí hiện tại của từng thành viên trong cùng một bản đồ.',
    loading: 'Đang mở phòng hành trình…',
    invalidTitle: 'Liên kết phòng không hợp lệ',
    invalidBody: 'Hãy mở đúng liên kết được người tạo chuyến đi chia sẻ.',
    notFoundTitle: 'Không mở được lịch trình',
    notFoundBody: 'Lịch trình có thể đã bị xoá hoặc không còn công khai.',
    plan: 'Tạo lịch trình mới',
    share: 'Mời thành viên', copied: 'Đã sao chép link', shared: 'Đã chia sẻ', shareError: 'Không thể chia sẻ liên kết.',
    members: 'Thành viên trong phòng', online: (n) => `${n} người đang trực tuyến`,
    noSharing: 'Chưa ai chia sẻ vị trí trực tiếp.',
    name: 'Tên hiển thị', saveName: 'Cập nhật',
    shareLocation: 'Chia sẻ vị trí trực tiếp', locating: 'Đang lấy vị trí…', stopSharing: 'Dừng chia sẻ vị trí',
    privacy: 'Tọa độ chỉ được truyền tạm thời cho người có link phòng; FoodTrip không lưu lịch sử vị trí.',
    connected: 'Đã kết nối trực tiếp', connecting: 'Đang kết nối…', connectionError: 'Mất kết nối — đang chờ thử lại.', unavailable: 'Chưa cấu hình Supabase Realtime.',
    locationDenied: 'Trình duyệt đã từ chối quyền vị trí. Hãy cho phép Location cho trang này rồi thử lại.',
    locationTimeout: 'Thiết bị chưa xác định được vị trí. Hãy bật GPS rồi thử lại.',
    locationUnavailable: 'Không lấy được vị trí hiện tại từ thiết bị.',
    locationUnsupported: 'Trình duyệt này không hỗ trợ định vị.',
    sharing: 'Đang chia sẻ', waiting: 'Đang ở trong phòng', accuracy: (meters) => `Độ chính xác khoảng ${Math.round(meters)} m`,
    follow: 'Theo dõi', following: 'Đang theo dõi', stopFollowing: 'Dừng theo dõi',
    day: (n) => `Ngày ${n}`,
    itinerary: 'Chi tiết lịch trình',
  },
  en: {
    eyebrow: 'Live journey',
    title: 'Your group is travelling together',
    subtitle: 'See the route and every member’s current location on one map.',
    loading: 'Opening the live journey room…',
    invalidTitle: 'Invalid room link', invalidBody: 'Open the exact invitation link shared by the trip organiser.',
    notFoundTitle: 'Cannot open itinerary', notFoundBody: 'The itinerary may have been deleted or is no longer public.',
    plan: 'Plan a new trip',
    share: 'Invite members', copied: 'Link copied', shared: 'Shared', shareError: 'Could not share the link.',
    members: 'Room members', online: (n) => `${n} online`, noSharing: 'No one is sharing a live location yet.',
    name: 'Display name', saveName: 'Update',
    shareLocation: 'Share live location', locating: 'Finding your location…', stopSharing: 'Stop sharing location',
    privacy: 'Coordinates are sent temporarily to people with the room link; FoodTrip does not store location history.',
    connected: 'Live connection active', connecting: 'Connecting…', connectionError: 'Connection lost — waiting to retry.', unavailable: 'Supabase Realtime is not configured.',
    locationDenied: 'Location permission was denied. Allow Location for this site and try again.',
    locationTimeout: 'Your device could not determine a location. Turn on GPS and try again.',
    locationUnavailable: 'The device could not provide its current location.',
    locationUnsupported: 'This browser does not support geolocation.',
    sharing: 'Sharing now', waiting: 'In the room', accuracy: (meters) => `Accuracy about ${Math.round(meters)} m`,
    follow: 'Follow', following: 'Following', stopFollowing: 'Stop following',
    day: (n) => `Day ${n}`, itinerary: 'Itinerary details',
  },
}

function tripCity(trip) {
  if (trip.city_id) return getCity(trip.city_id)
  return { id: 'custom', pattern: 'skyline', accent: 'chili', name: { vi: trip.custom_city_name, en: trip.custom_city_name } }
}

async function hydrateCustomPlaces(days) {
  const missingIds = new Set()
  for (const day of days ?? []) {
    for (const stop of day) if (!getPlace(stop.placeId)) missingIds.add(stop.placeId)
  }
  if (!missingIds.size) return
  registerCustomPlaces(await fetchCustomPlaces([...missingIds]))
}

function buildDayStops(trip, dayIndex) {
  const hotel = (trip.hotels ?? []).find((item) => item.selected) ?? null
  const places = (trip.days?.[dayIndex] ?? []).map((stop, index) => ({
    ...stop,
    displayIndex: index + 1,
    location: stop.location ?? getPlace(stop.placeId)?.location ?? null,
  }))
  if (!hotel?.location) return places
  const hotelStop = { kind: 'hotel', placeId: `hotel-${hotel.id}`, name: hotel.name, address: hotel.address, location: hotel.location }
  return [hotelStop, ...places, { ...hotelStop, hideMarker: true }]
}

function locationErrorText(code, c) {
  if (code === 'denied') return c.locationDenied
  if (code === 'timeout') return c.locationTimeout
  if (code === 'unsupported') return c.locationUnsupported
  return c.locationUnavailable
}

export default function LiveTrip() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const { lang } = useLanguage()
  const { user } = useAuth()
  const c = C[lang]
  const roomToken = normalizeLiveRoomToken(searchParams.get('room'))
  const suggestedName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || ''
  const live = useLiveTripRoom({ roomToken, suggestedName })
  const [status, setStatus] = useState(roomToken ? 'loading' : 'invalid')
  const [trip, setTrip] = useState(null)
  const [activeDay, setActiveDay] = useState(0)
  const [nameDraft, setNameDraft] = useState(live.member.name)
  const [shareStatus, setShareStatus] = useState('idle')
  const [followMemberId, setFollowMemberId] = useState(null)

  useEffect(() => {
    if (!roomToken) return
    let cancelled = false
    getPublicItinerary(id).then(async (data) => {
      if (cancelled) return
      if (!data) {
        setStatus('not-found')
        return
      }
      await hydrateCustomPlaces(data.days)
      if (cancelled) return
      setTrip(data)
      setStatus('ready')
    })
    return () => { cancelled = true }
  }, [id, roomToken])

  const mapStops = useMemo(() => (trip ? buildDayStops(trip, activeDay) : []), [trip, activeDay])
  const memberLocations = useMemo(
    () => live.members.filter((member) => member.sharing && member.location),
    [live.members],
  )

  useEffect(() => {
    if (followMemberId && !memberLocations.some((member) => member.id === followMemberId)) setFollowMemberId(null)
  }, [followMemberId, memberLocations])

  async function handleInvite() {
    const url = `${window.location.origin}/live/${id}?room=${encodeURIComponent(roomToken)}`
    const cityName = trip ? tripCity(trip).name[lang] : 'FoodTrip'
    const result = await shareOrCopyLink(url, {
      title: lang === 'vi' ? `Theo dõi hành trình ${cityName}` : `Follow the ${cityName} journey`,
      text: lang === 'vi' ? 'Mở link để xem lịch trình và chia sẻ vị trí trực tiếp cùng nhóm.' : 'Open this link to follow the itinerary and share live location with the group.',
    })
    setShareStatus(result === 'copied' || result === 'shared' ? result : result === 'cancelled' ? 'idle' : 'error')
  }

  function handleNameSubmit(event) {
    event.preventDefault()
    const savedName = live.updateMemberName(nameDraft)
    setNameDraft(savedName)
  }

  if (status === 'loading') return <div className="mx-auto max-w-[1180px] px-5 py-16"><Spinner label={c.loading} /></div>
  if (status === 'invalid' || status === 'not-found') {
    return (
      <div className="mx-auto max-w-[1180px] px-5 py-16">
        <EmptyState
          icon={LinkBreak}
          title={status === 'invalid' ? c.invalidTitle : c.notFoundTitle}
          body={status === 'invalid' ? c.invalidBody : c.notFoundBody}
          action={<Link to="/plan" className="inline-flex items-center gap-2 rounded-full bg-chili px-6 py-3 font-utility font-semibold text-chili-ink"><MapTrifold size={17} /> {c.plan}</Link>}
        />
      </div>
    )
  }

  const connectionText = live.connectionStatus === 'connected'
    ? c.connected
    : live.connectionStatus === 'connecting'
      ? c.connecting
      : live.connectionStatus === 'unavailable'
        ? c.unavailable
        : c.connectionError

  return (
    <div className="mx-auto max-w-[1180px] px-5 py-10 md:px-8 md:py-14">
      <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <span className="eyebrow eyebrow-tick">{c.eyebrow}</span>
          <h1 className="mt-3 text-3xl font-bold md:text-4xl">{c.title}</h1>
          <p className="mt-2 max-w-[65ch] text-ink-muted">{c.subtitle}</p>
        </div>
        <button onClick={handleInvite} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-chili px-6 py-3.5 font-utility font-semibold text-chili-ink shadow-soft hover:shadow-lifted">
          {shareStatus === 'copied' || shareStatus === 'shared' ? <Check size={17} /> : <ShareNetwork size={17} />}
          {shareStatus === 'copied' ? c.copied : shareStatus === 'shared' ? c.shared : c.share}
        </button>
      </div>
      {shareStatus === 'error' && <p className="mb-4 text-sm text-chili">{c.shareError}</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface shadow-soft">
          <div className="flex gap-2 overflow-x-auto border-b border-line p-4" role="tablist">
            {(trip.days ?? []).map((_, index) => (
              <button
                key={index}
                type="button"
                role="tab"
                aria-selected={activeDay === index}
                onClick={() => setActiveDay(index)}
                className={`shrink-0 rounded-full px-4 py-2 font-utility text-sm font-semibold ${activeDay === index ? 'bg-chili text-chili-ink' : 'bg-paper-2 text-ink-muted hover:text-chili'}`}
              >
                {c.day(index + 1)}
              </button>
            ))}
          </div>
          <LiveTripMap
            key={activeDay}
            stops={mapStops}
            transport={trip.transport}
            memberLocations={memberLocations}
            showLocateControl={false}
            followMemberId={followMemberId}
            className="[&>div:first-child]:rounded-none [&>div:first-child]:border-0"
          />
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 font-bold"><UsersThree size={20} className="text-chili" /> {c.members}</h2>
                <p className="mt-1 text-sm text-ink-muted">{c.online(live.members.length)}</p>
              </div>
              <span className={`mt-1 h-2.5 w-2.5 rounded-full ${live.connectionStatus === 'connected' ? 'bg-herb' : 'bg-lantern'}`} />
            </div>
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-paper-2 px-3 py-2 text-xs text-ink-muted" aria-live="polite">
              <Broadcast size={15} className={live.connectionStatus === 'connected' ? 'text-herb' : 'text-lantern'} /> {connectionText}
            </div>
            <div className="space-y-2">
              {live.members.map((member) => (
                <div key={member.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: member.color }}>
                    {member.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{member.name}{member.id === live.member.id ? (lang === 'vi' ? ' (bạn)' : ' (you)') : ''}</div>
                    <div className={`flex items-center gap-1 text-xs ${member.sharing ? 'text-herb' : 'text-ink-faint'}`}>
                      <MapPin size={12} weight={member.sharing ? 'fill' : 'regular'} /> {member.sharing ? c.sharing : c.waiting}
                    </div>
                    {member.sharing && member.location?.accuracy != null && <div className="mt-0.5 text-2xs text-ink-faint">{c.accuracy(member.location.accuracy)}</div>}
                  </div>
                  {member.sharing && (
                    <button
                      type="button"
                      aria-pressed={followMemberId === member.id}
                      aria-label={followMemberId === member.id ? c.stopFollowing : `${c.follow} ${member.name}`}
                      onClick={() => setFollowMemberId((current) => current === member.id ? null : member.id)}
                      className={`shrink-0 rounded-full px-2.5 py-1.5 font-utility text-2xs font-semibold transition-colors ${followMemberId === member.id ? 'bg-herb text-herb-ink' : 'bg-paper-2 text-ink-muted hover:text-chili'}`}
                    >
                      {followMemberId === member.id ? c.following : c.follow}
                    </button>
                  )}
                </div>
              ))}
            </div>
            {!memberLocations.length && <p className="mt-3 text-sm text-ink-faint">{c.noSharing}</p>}
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
            <form onSubmit={handleNameSubmit} className="mb-4">
              <label htmlFor="live-member-name" className="mb-1.5 block font-utility text-xs font-bold uppercase tracking-wide text-ink-muted">{c.name}</label>
              <div className="flex gap-2">
                <input id="live-member-name" value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} maxLength={40} className="min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm outline-none focus:border-chili" />
                <button type="submit" aria-label={c.saveName} className="grid w-10 place-items-center rounded-lg border border-line-strong hover:border-chili hover:text-chili"><PencilSimple size={16} /></button>
              </div>
            </form>
            {live.sharingStatus === 'sharing' ? (
              <button onClick={live.stopSharing} className="flex w-full items-center justify-center gap-2 rounded-full bg-ink px-4 py-3 font-utility text-sm font-semibold text-paper">
                <Stop size={16} weight="fill" /> {c.stopSharing}
              </button>
            ) : (
              <button onClick={live.startSharing} disabled={live.sharingStatus === 'locating' || live.connectionStatus !== 'connected'} className="flex w-full items-center justify-center gap-2 rounded-full bg-herb px-4 py-3 font-utility text-sm font-semibold text-herb-ink disabled:cursor-not-allowed disabled:opacity-60">
                <NavigationArrow size={16} weight="fill" /> {live.sharingStatus === 'locating' ? c.locating : c.shareLocation}
              </button>
            )}
            {live.locationError && <p className="mt-3 text-sm text-chili" role="alert">{locationErrorText(live.locationError, c)}</p>}
            <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-ink-faint"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-herb" /> {c.privacy}</p>
          </section>
        </aside>
      </div>

      <section className="mt-10">
        <h2 className="mb-5 text-xl font-bold">{c.itinerary}</h2>
        <ItineraryTicket
          city={tripCity(trip)}
          days={trip.days}
          hotels={trip.hotels ?? []}
          selectedHotelId={(trip.hotels ?? []).find((hotel) => hotel.selected)?.id ?? null}
          startDate={trip.start_date}
          people={trip.people}
          budget={trip.budget}
          transport={trip.transport}
          preferredTags={trip.prefs ?? []}
          animate="mount"
        />
      </section>
    </div>
  )
}
