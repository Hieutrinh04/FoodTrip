import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowSquareOut, Article, CaretDown, Clock, FacebookLogo, Globe, InstagramLogo, MapPin, NavigationArrow, Phone, PlayCircle, SpinnerGap, Star, TiktokLogo, YoutubeLogo, X , Motorcycle, Car, PersonSimpleWalk } from '@phosphor-icons/react'
import { fetchYoutubeShorts } from '../../lib/youtubeShorts.js'
import { fetchTikTokAutoSuggestions } from '../../lib/tiktokAutoSearch.js'
import { fetchPlaceWebContent } from '../../lib/placeWebContent.js'
import { fetchPlaceDetails, isOpenNow, todayHours } from '../../lib/placeDetails.js'
import { getReviewsForPlace } from '../../lib/videoShare.js'
import { fetchPlaceReviews } from '../../lib/placeReviews.js'
import { FOODTRIP_CRITERIA, scoreForCriterion } from '../../lib/foodTripScore.js'
import { describeCriterion, summarisePlace } from '../../lib/placeScore.js'
import { isLivePlace } from '../../data/destinations.js'
import { primaryPlaceName, searchArea, cityFromAddress, textIsAboutPlace } from '../../lib/text.js'
import StreetView360 from './StreetView360.jsx'
import RemoteImage from '../ui/RemoteImage.jsx'
import VideoEmbed from '../video/VideoEmbed.jsx'
import { isEmbeddable } from '../../lib/videoEmbed.js'
import { useLanguage } from '../../i18n/LanguageContext.jsx'

// Auto-discovered content is only shown if it comes from a source we recognise
// — otherwise a relaxed Google query leaks unrelated help-centre pages in.
const ALLOWED_CONTENT_HOSTS = [
  'foody.vn', 'vnexpress.net', 'thanhnien.vn', 'tuoitre.vn', 'kenh14.vn', 'dantri.com.vn',
  'facebook.com', 'instagram.com', 'tiktok.com', 'youtube.com', 'youtu.be',
]

function hostAllowed(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return ALLOWED_CONTENT_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
  } catch {
    return false
  }
}

const COPY = {
  vi: { reviewsOnGoogle: (n) => `${n.toLocaleString('vi-VN')} bài đánh giá trên Google`, openNow: 'Đang mở cửa', closedNow: 'Đã đóng cửa', closesAt: (t) => `Đóng cửa vào ${t}`, hours: 'Giờ hoạt động', phone: 'Số điện thoại', website: 'Trang web', directions: 'Đường đi', routeTitle: 'Đường đi từ chỗ bạn', routeLoading: 'Đang tính đường…', routeError: 'Không tính được đường đi.', routeNeedsOrigin: 'Bấm “Gần tôi” hoặc chạm vào bản đồ để FoodTrip tính đường đi tới đây.', routeMinutes: (m) => `${m} phút`, routeHours: (h, m) => (m ? `${h} giờ ${m} phút` : `${h} giờ`), transportMode: { bike: 'Xe máy', car: 'Ô tô', walk: 'Đi bộ' }, onGoogleMaps: 'Xem trên Google Maps', noListing: 'Chưa có thông tin niêm yết cho quán này.', score: 'Điểm FoodTrip', assessment: 'Tổng quan về quán', howScored: 'Cách FoodTrip chấm điểm', suitability: 'Điểm phù hợp', strongPoint: 'Điểm nổi bật', consider: 'Nên cân nhắc', allPositive: (n) => `Các tiêu chí hiện có đều đạt từ ${n}/10.`, assessmentNote: 'FoodTrip tổng hợp các tiêu chí có dữ liệu và tự cân bằng lại trọng số khi thiếu thông tin. Đây là điểm gợi ý phù hợp, không phải đánh giá từ trải nghiệm trực tiếp.', googleReviews: 'Đánh giá trên Google Maps', seeAllOnGoogle: 'Xem tất cả', reviewSort: { mostRelevant: 'Liên quan nhất', newest: 'Mới nhất', highestRating: 'Cao nhất', lowestRating: 'Thấp nhất' }, reviewsLoading: 'Đang tải đánh giá…', reviewsEmpty: 'Quán chưa có đánh giá bằng chữ trên Google.', reviewsError: 'Chưa tải được đánh giá từ Google, thử lại sau nhé.', reviewsNoListing: 'Chưa tìm thấy quán này trên Google Maps.', readMore: 'Xem thêm', showLess: 'Thu gọn', ownerReply: 'Phản hồi của chủ quán', anonymous: 'Người dùng Google', authorReviews: (n) => `${n.toLocaleString('vi-VN')} bài đánh giá`, showMoreReviews: (n) => `Xem thêm ${n} đánh giá`, showFewerReviews: 'Thu gọn đánh giá', content: 'Review liên quan', loading: 'Đang tổng hợp nội dung…', empty: 'Chưa tìm thấy nội dung phù hợp.', detail: 'Xem chi tiết', all: 'Tất cả', youtube: 'YouTube', tiktok: 'TikTok', social: 'Facebook · IG', articles: 'Bài viết', open: 'Mở nội dung', play: 'Phát tại đây', closePlayer: 'Đóng trình phát', limited: 'TikTok, Facebook và bài báo sẽ xuất hiện khi cấu hình nguồn tìm kiếm web.' },
  en: { reviewsOnGoogle: (n) => `${n.toLocaleString('en-US')} reviews on Google`, openNow: 'Open now', closedNow: 'Closed', closesAt: (t) => `Closes at ${t}`, hours: 'Opening hours', phone: 'Phone', website: 'Website', directions: 'Directions', routeTitle: 'Route from you', routeLoading: 'Calculating route…', routeError: 'Could not work out a route.', routeNeedsOrigin: 'Use “Near me” or tap the map so FoodTrip can work out the route here.', routeMinutes: (m) => `${m} min`, routeHours: (h, m) => (m ? `${h} hr ${m} min` : `${h} hr`), transportMode: { bike: 'Motorbike', car: 'Car', walk: 'Walking' }, onGoogleMaps: 'View on Google Maps', noListing: 'No public listing found for this place.', score: 'FoodTrip score', assessment: 'At a glance', howScored: 'How FoodTrip scored this', suitability: 'Suitability score', strongPoint: 'Strongest point', consider: 'Worth considering', allPositive: (n) => `All available criteria score at least ${n}/10.`, assessmentNote: 'FoodTrip combines the criteria with available data and rebalances their weights when information is missing. This is a suitability guide, not a first-hand review.', googleReviews: 'Reviews on Google Maps', seeAllOnGoogle: 'See all', reviewSort: { mostRelevant: 'Most relevant', newest: 'Newest', highestRating: 'Highest', lowestRating: 'Lowest' }, reviewsLoading: 'Loading reviews…', reviewsEmpty: 'No written reviews on Google yet.', reviewsError: 'Could not load Google reviews — try again later.', reviewsNoListing: 'This place was not found on Google Maps.', readMore: 'Read more', showLess: 'Show less', ownerReply: 'Response from the owner', anonymous: 'Google user', authorReviews: (n) => `${n.toLocaleString('en-US')} reviews`, showMoreReviews: (n) => `Show ${n} more reviews`, showFewerReviews: 'Show fewer reviews', content: 'Related reviews', loading: 'Collecting content…', empty: 'No related content found.', detail: 'View details', all: 'All', youtube: 'YouTube', tiktok: 'TikTok', social: 'Facebook · IG', articles: 'Articles', open: 'Open content', play: 'Play here', closePlayer: 'Close player', limited: 'TikTok, Facebook and articles appear when web search is configured.' },
}

const PLATFORM_ICON = { youtube: YoutubeLogo, tiktok: TiktokLogo, facebook: FacebookLogo, instagram: InstagramLogo, article: Article }
const normalizeYoutube = (video) => ({ id: `youtube-${video.videoId}`, platform: 'youtube', contentType: 'video', title: video.title, thumbnailUrl: video.thumbnailUrl, videoId: video.videoId, url: `https://www.youtube.com/watch?v=${video.videoId}` })
const normalizeTikTok = (video) => ({ id: `tiktok-${video.videoUrl}`, platform: 'tiktok', contentType: 'video', title: video.title, thumbnailUrl: video.thumbnailUrl, url: video.videoUrl })
const normalizeCommunity = (review) => ({ id: `community-${review.id}`, platform: review.platform, contentType: 'video', title: review.placeName || 'Community review', thumbnailUrl: review.thumbnailUrl, url: review.videoUrl })

const TRANSPORT_MODES = [
  { id: 'bike', icon: Motorcycle },
  { id: 'car', icon: Car },
  { id: 'walk', icon: PersonSimpleWalk },
]

function routeDistance(meters) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`
}

function routeDuration(seconds, copy) {
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return copy.routeMinutes(minutes)
  return copy.routeHours(Math.floor(minutes / 60), minutes % 60)
}

/**
 * Distance and travel time along the real road route to this place, with the
 * mode of transport it was measured for.
 *
 * The mode is not a detail: the same 1km trip is three minutes by motorbike and
 * fifteen on foot, so a single figure would be wrong for most travellers. The
 * straight-line distance already shown elsewhere on the panel is left alone —
 * this is the road distance, which is always longer and is the one that matters
 * for deciding whether to go.
 */
function RouteBar({ route, status, hasOrigin, transport, onTransportChange, copy }) {
  if (!hasOrigin) {
    return (
      <p className="mt-3 rounded-xl border border-dashed border-line-strong px-3 py-2.5 text-xs text-ink-muted">
        {copy.routeNeedsOrigin}
      </p>
    )
  }

  return (
    <div className="mt-3 rounded-xl border border-line bg-paper-2 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-utility text-micro uppercase tracking-wide text-ink-faint">{copy.routeTitle}</div>
          <div className="mt-0.5 font-utility text-sm font-bold text-ink">
            {status === 'loading' && <span className="font-normal text-ink-muted">{copy.routeLoading}</span>}
            {status === 'error' && <span className="font-normal text-ink-muted">{copy.routeError}</span>}
            {status === 'ready' && route && (
              <>
                {routeDistance(route.distanceMeters ?? 0)}
                <span className="mx-1.5 text-ink-faint">·</span>
                {routeDuration(route.durationSeconds ?? 0, copy)}
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          {TRANSPORT_MODES.map(({ id, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onTransportChange?.(id)}
              aria-label={copy.transportMode[id]}
              aria-pressed={transport === id}
              className={`grid h-8 w-8 place-items-center rounded-lg border transition-colors ${transport === id ? 'border-chili bg-chili text-chili-ink' : 'border-line bg-surface text-ink-muted hover:border-chili hover:text-chili'}`}
            >
              <Icon size={15} weight={transport === id ? 'fill' : 'regular'} />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function MapPlacePreview({ place, criterion, onClose, route = null, routeStatus = 'idle', hasRouteOrigin = false, transport = 'bike', onTransportChange }) {
  const { lang } = useLanguage()
  const copy = COPY[lang]
  const [status, setStatus] = useState('loading')
  const [items, setItems] = useState([])
  const [activeTab, setActiveTab] = useState('all')
  const [playingUrl, setPlayingUrl] = useState(null)
  const [webSearchMissing, setWebSearchMissing] = useState(false)
  const [details, setDetails] = useState(null)
  const score = scoreForCriterion(place, criterion)
  // Live map results carry SEO-stuffed names and a country-tail address, both
  // useless for a content search — reduce them to the real name and a
  // "<ward>, <city>" area first so every source searches for the right thing.
  const cleanName = primaryPlaceName(place.name.vi)
  const area = searchArea(place.address?.vi ?? '')
  const cityHint = cityFromAddress(place.address?.vi ?? '') || area
  const query = [cleanName, area].filter(Boolean).join(' ').trim()

  useEffect(() => {
    let cancelled = false
    setStatus('loading'); setItems([]); setPlayingUrl(null); setActiveTab('all'); setDetails(null)
    // Independent of the review-content lookups below: the factual panel should
    // appear as soon as it resolves rather than waiting on video searches.
    fetchPlaceDetails({ name: cleanName, address: place.address?.vi ?? '', location: place.location })
      .then((result) => { if (!cancelled) setDetails(result) })
      .catch(() => { if (!cancelled) setDetails({ status: 'error', place: null }) })
    Promise.allSettled([
      fetchYoutubeShorts(query, cleanName, cityHint), fetchTikTokAutoSuggestions(query, cleanName, cityHint),
      fetchPlaceWebContent(query, cleanName), getReviewsForPlace({ name: cleanName }),
    ]).then(([youtubeResult, tiktokResult, webResult, communityResult]) => {
      if (cancelled) return
      const youtube = youtubeResult.status === 'fulfilled' ? (youtubeResult.value.videos || []).map(normalizeYoutube) : []
      const tiktok = tiktokResult.status === 'fulfilled' ? (tiktokResult.value.videos || []).map(normalizeTikTok) : []
      // Second line of defence: even if the backend's relevance filter is stale,
      // only keep web results from a known source that actually name the place.
      const web = (webResult.status === 'fulfilled' ? (webResult.value.items || []) : [])
        .filter((item) => hostAllowed(item.url) && textIsAboutPlace(`${item.title} ${item.snippet ?? ''}`, cleanName))
      const community = communityResult.status === 'fulfilled' ? communityResult.value.map(normalizeCommunity) : []
      setWebSearchMissing((tiktokResult.status === 'fulfilled' && tiktokResult.value.status === 'no-key') || (webResult.status === 'fulfilled' && webResult.value.status === 'no-key'))
      const seen = new Set()
      const combined = [...community, ...youtube, ...tiktok, ...web].filter((item) => { const key = item.url || item.id; if (!key || seen.has(key)) return false; seen.add(key); return true })
      setItems(combined); setStatus(combined.length ? 'ready' : 'empty')
    })
    return () => { cancelled = true }
    // cleanName/cityHint derive from the name+address deps already listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, place.name.vi, place.address?.vi, place.location?.lat, place.location?.lng])

  // One bucket per source so the traveller can see at a glance that the
  // suggestions span YouTube, TikTok, Facebook/Instagram and articles — not
  // just one platform.
  const bucketOf = (item) => {
    if (item.platform === 'youtube') return 'youtube'
    if (item.platform === 'tiktok') return 'tiktok'
    if (item.platform === 'facebook' || item.platform === 'instagram') return 'social'
    return 'articles'
  }
  const counts = useMemo(() => {
    const c = { all: items.length, youtube: 0, tiktok: 0, social: 0, articles: 0 }
    for (const item of items) c[bucketOf(item)]++
    return c
  }, [items])
  const filteredItems = useMemo(
    () => (activeTab === 'all' ? items : items.filter((item) => bucketOf(item) === activeTab)),
    [items, activeTab],
  )
  const tabs = [['all', copy.all], ['youtube', copy.youtube], ['tiktok', copy.tiktok], ['social', copy.social], ['articles', copy.articles]]
    .filter(([id]) => id === 'all' || counts[id] > 0)

  return <aside className="absolute inset-x-3 bottom-3 z-20 max-h-[calc(100%-24px)] overflow-y-auto rounded-2xl border border-line bg-surface/95 p-4 shadow-lifted backdrop-blur-md sm:left-4 sm:right-auto sm:w-[440px]" aria-label={place.name[lang]}>
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-lg font-bold">{place.name[lang]}</h2><p className="mt-1 line-clamp-2 flex items-start gap-1.5 text-xs text-ink-muted"><MapPin size={13} className="mt-0.5 shrink-0 text-chili" />{place.address?.[lang]}</p></div><button type="button" onClick={onClose} aria-label="Đóng" className="shrink-0 rounded-full border border-line p-1.5 text-ink-muted hover:border-chili hover:text-chili"><X size={15} /></button></div>
    <RouteBar route={route} status={routeStatus} hasOrigin={hasRouteOrigin} transport={transport} onTransportChange={onTransportChange} copy={copy} />
    <PlaceFacts details={details} copy={copy} lang={lang} place={place} />
    {/* Google's pin for the venue is more precise than the map provider's, so
        prefer it when the listing resolved — the panorama snaps to whichever
        captured street is nearest the point it is given. */}
    <StreetView360 location={details?.place?.location ?? place.location} name={place.name[lang]} />
    <div className="mt-3 flex items-center justify-between rounded-xl bg-paper-2 px-3 py-2.5"><div><div className="font-utility text-micro uppercase tracking-wide text-ink-faint">{criterion === 'overall' ? copy.score : FOODTRIP_CRITERIA[criterion]?.[lang]}</div><div className="mt-0.5 flex items-center gap-1 font-utility text-lg font-bold text-chili">{score?.toFixed(1) ?? '—'} <Star size={14} weight="fill" className="text-lantern" /></div></div>{place.distanceKm != null && <span className="rounded-full bg-surface px-2.5 py-1 font-utility text-2xs font-semibold text-ink-muted">{place.distanceKm < 1 ? `${Math.round(place.distanceKm * 1000)} m` : `${place.distanceKm.toFixed(1)} km`}</span>}{!isLivePlace(place) && <Link to={`/place/${place.id}`} className="inline-flex items-center gap-1 font-utility text-xs font-semibold text-chili hover:underline">{copy.detail}<ArrowSquareOut size={13} /></Link>}</div>
    <WebsiteAssessment place={place} copy={copy} lang={lang} />
    <GoogleReviews details={details} copy={copy} lang={lang} />
    <div className="mt-3"><div className="mb-2 flex items-center justify-between"><div className="font-utility text-2xs font-bold uppercase tracking-wide text-ink-muted">{copy.content}</div>{status === 'ready' && <span className="text-micro text-ink-faint">{items.length}</span>}</div>
      {(status === 'ready' || status === 'loading') && <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto">{tabs.map(([id, label]) => <button key={id} type="button" onClick={() => { setActiveTab(id); setPlayingUrl(null) }} className={`shrink-0 rounded-full px-3 py-1.5 font-utility text-2xs font-semibold ${activeTab === id ? 'bg-ink text-paper' : 'border border-line bg-surface text-ink-muted'}`}>{label}{counts[id] > 0 && <span className={activeTab === id ? 'ml-1 opacity-70' : 'ml-1 text-ink-faint'}>{counts[id]}</span>}</button>)}</div>}
      {status === 'loading' && <div className="flex items-center gap-2 rounded-xl border border-line px-3 py-5 text-xs text-ink-muted"><SpinnerGap size={16} className="animate-spin text-chili" />{copy.loading}</div>}
      {status === 'empty' && <div className="rounded-xl border border-dashed border-line-strong px-3 py-5 text-center text-xs text-ink-muted">{copy.empty}</div>}
      {status === 'ready' && playingUrl && <div className="relative mb-3"><VideoEmbed url={playingUrl} autoPlay title={copy.content} /><button type="button" onClick={() => setPlayingUrl(null)} aria-label={copy.closePlayer} className="absolute right-2 top-2 z-10 rounded-full bg-ink/70 p-1.5 text-paper backdrop-blur-sm transition-colors hover:bg-ink"><X size={13} /></button></div>}
      {status === 'ready' && !filteredItems.length && <div className="rounded-xl border border-dashed border-line-strong px-3 py-4 text-center text-xs text-ink-muted">{copy.empty}</div>}
      {status === 'ready' && filteredItems.length > 0 && <div className="no-scrollbar flex max-h-[230px] flex-col gap-2 overflow-y-auto pr-1">{filteredItems.map((item) => <ContentCard key={item.id} item={item} copy={copy} onPlay={setPlayingUrl} />)}</div>}
      {webSearchMissing && <p className="mt-2 text-micro leading-relaxed text-ink-faint">{copy.limited}</p>}
    </div>
  </aside>
}

const REVIEW_SORTS = ['mostRelevant', 'newest', 'highestRating', 'lowestRating']
const REVIEWS_SHOWN_FIRST = 3

function StarRow({ value, size = 12 }) {
  const full = Math.round(value ?? 0)
  return (
    <span className="inline-flex items-center gap-0.5 text-lantern" aria-label={`${value}/5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} weight={n <= full ? 'fill' : 'regular'} className={n <= full ? '' : 'text-line-strong'} />
      ))}
    </span>
  )
}

function ReviewCard({ review, copy }) {
  const [expanded, setExpanded] = useState(false)
  const [replyOpen, setReplyOpen] = useState(false)
  const long = (review.text?.length ?? 0) > 220
  const initial = (review.author?.[0] ?? '?').toUpperCase()

  return (
    <article className="rounded-xl border border-line bg-surface p-3">
      <div className="flex items-start gap-2.5">
        <RemoteImage
          src={review.authorAvatar}
          alt=""
          className="h-8 w-8 shrink-0 rounded-full object-cover"
          fallback={<span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-paper-2 font-utility text-xs font-bold text-ink-muted">{initial}</span>}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-semibold">{review.author ?? copy.anonymous}</span>
            <span className="shrink-0 font-utility text-micro text-ink-faint">{review.date}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            {review.rating != null && <StarRow value={review.rating} size={11} />}
            {review.authorReviewCount != null && (
              <span className="font-utility text-micro text-ink-faint">{copy.authorReviews(review.authorReviewCount)}</span>
            )}
          </div>
        </div>
      </div>

      {/* Google's text, unedited. Long reviews are clamped rather than cut, so
          nothing is lost — only folded. */}
      <p className={`mt-2 whitespace-pre-line text-xs leading-relaxed text-ink ${expanded ? '' : 'line-clamp-4'}`}>{review.text}</p>
      {long && (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-1 font-utility text-micro font-semibold text-chili hover:underline">
          {expanded ? copy.showLess : copy.readMore}
        </button>
      )}

      {review.photos?.length > 0 && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto">
          {review.photos.map((photo) => (
            <RemoteImage key={photo} src={photo} alt="" className="h-14 w-14 shrink-0 rounded-md object-cover" />
          ))}
        </div>
      )}

      {review.ownerReply && (
        <div className="mt-2">
          <button type="button" onClick={() => setReplyOpen((v) => !v)} aria-expanded={replyOpen} className="inline-flex items-center gap-1 font-utility text-micro font-semibold text-ink-muted hover:text-chili">
            {copy.ownerReply}
            <CaretDown size={10} className={`transition-transform ${replyOpen ? 'rotate-180' : ''}`} />
          </button>
          {replyOpen && (
            <p className="mt-1 whitespace-pre-line rounded-lg bg-paper-2 px-2.5 py-2 text-xs leading-relaxed text-ink-muted">{review.ownerReply}</p>
          )}
        </div>
      )}
    </article>
  )
}

/**
 * What people wrote about this place on Google Maps.
 *
 * Only runs once place-details has matched the venue to a Google listing: the
 * reviews are fetched by that listing's own id, so they are guaranteed to be
 * about this place rather than something with a similar name.
 */
function GoogleReviews({ details, copy, lang }) {
  const listing = details?.place ?? null
  const [sortBy, setSortBy] = useState('mostRelevant')
  const [state, setState] = useState({ status: 'idle', reviews: [] })
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    if (!listing) return undefined
    let cancelled = false
    setState({ status: 'loading', reviews: [] })
    setShowAll(false)
    fetchPlaceReviews({ mapsUrl: listing.mapsUrl, placeId: listing.placeId, sortBy })
      .then((result) => { if (!cancelled) setState(result) })
    return () => { cancelled = true }
  }, [listing?.mapsUrl, listing?.placeId, sortBy]) // eslint-disable-line react-hooks/exhaustive-deps

  // Still looking the place up — the section appears once there is a listing.
  if (!details) return null

  const shown = showAll ? state.reviews : state.reviews.slice(0, REVIEWS_SHOWN_FIRST)
  const header = (
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="font-utility text-2xs font-bold uppercase tracking-wide text-ink-muted">{copy.googleReviews}</div>
      {listing?.mapsUrl && (
        <a href={listing.mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-utility text-micro font-semibold text-chili hover:underline">
          {copy.seeAllOnGoogle} <ArrowSquareOut size={11} />
        </a>
      )}
    </div>
  )

  if (!listing) {
    return (
      <div className="mt-3">
        {header}
        <div className="rounded-xl border border-dashed border-line-strong px-3 py-4 text-center text-xs text-ink-muted">{copy.reviewsNoListing}</div>
      </div>
    )
  }

  return (
    <div className="mt-3">
      {header}

      {listing.rating != null && (
        <div className="mb-2.5 flex items-center gap-3 rounded-xl bg-paper-2 px-3 py-2.5">
          <span className="font-utility text-2xl font-bold leading-none">{listing.rating.toFixed(1)}</span>
          <div>
            <StarRow value={listing.rating} size={13} />
            {listing.ratingCount != null && (
              <div className="mt-0.5 font-utility text-micro text-ink-faint">{copy.reviewsOnGoogle(listing.ratingCount)}</div>
            )}
          </div>
        </div>
      )}

      <div className="no-scrollbar mb-2.5 flex gap-1.5 overflow-x-auto">
        {REVIEW_SORTS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setSortBy(id)}
            aria-pressed={sortBy === id}
            className={`shrink-0 rounded-full px-3 py-1.5 font-utility text-2xs font-semibold ${sortBy === id ? 'bg-ink text-paper' : 'border border-line bg-surface text-ink-muted'}`}
          >
            {copy.reviewSort[id]}
          </button>
        ))}
      </div>

      {state.status === 'loading' && (
        <div className="flex items-center gap-2 rounded-xl border border-line px-3 py-5 text-xs text-ink-muted">
          <SpinnerGap size={16} className="animate-spin text-chili" />{copy.reviewsLoading}
        </div>
      )}
      {state.status === 'ok' && !state.reviews.length && (
        <div className="rounded-xl border border-dashed border-line-strong px-3 py-4 text-center text-xs text-ink-muted">{copy.reviewsEmpty}</div>
      )}
      {(state.status === 'error' || state.status === 'provider-error' || state.status === 'no-key') && (
        <div className="rounded-xl border border-dashed border-line-strong px-3 py-4 text-center text-xs text-ink-muted">{copy.reviewsError}</div>
      )}
      {state.status === 'ok' && state.reviews.length > 0 && (
        <div className="flex flex-col gap-2">
          {shown.map((review) => <ReviewCard key={review.id} review={review} copy={copy} lang={lang} />)}
          {state.reviews.length > REVIEWS_SHOWN_FIRST && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="rounded-full border border-line py-2 font-utility text-2xs font-semibold text-ink-muted hover:border-chili hover:text-chili"
            >
              {showAll ? copy.showFewerReviews : copy.showMoreReviews(state.reviews.length - REVIEWS_SHOWN_FIRST)}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function WebsiteAssessment({ place, copy, lang }) {
  // Declared before the guard below: a hook after an early return would run in
  // a different order the moment a place arrives without a score.
  const [detailsOpen, setDetailsOpen] = useState(false)

  const parts = place.suitabilityParts ?? []
  if (place.suitability == null || !parts.length) return null

  const summary = summarisePlace(parts, lang)
  const described = parts.map((part) => describeCriterion(part, lang))

  // A criterion reads as a strength, a caveat, or neither. The bar is coloured
  // by that judgement rather than by a single accent, so the shape of the
  // assessment is visible before any of it is read.
  const toneOf = (value) => (value >= 0.7 ? 'good' : value >= 0.45 ? 'ok' : 'weak')
  const BAR = { good: 'bg-herb', ok: 'bg-lantern', weak: 'bg-chili' }
  const TEXT = { good: 'text-herb', ok: 'text-ink-muted', weak: 'text-chili' }

  return (
    <section className="mt-3 rounded-xl border border-lantern/30 bg-lantern/10 p-3" aria-labelledby="website-assessment-title">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="website-assessment-title" className="font-utility text-2xs font-bold uppercase tracking-wide text-ink-muted">{copy.assessment}</h3>
          {/* The verdict in words comes first; the number is a summary of it,
              not the other way round. */}
          <p className="mt-1 text-xs leading-relaxed text-ink">{summary}</p>
        </div>
        <div className="shrink-0 rounded-lg bg-surface px-2.5 py-2 text-center shadow-soft">
          <div className="font-utility text-lg font-bold leading-none text-chili">{place.suitability.toFixed(1)}</div>
          <div className="mt-1 font-utility text-micro text-ink-faint">/10</div>
        </div>
      </div>

      <div className="mt-3 space-y-2.5">
        {described.map((item) => {
          const tone = toneOf(item.value)
          return (
            <div key={item.key}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-utility text-micro font-semibold uppercase tracking-wide text-ink-faint">{item.label}</span>
                <span className="min-w-0 truncate text-right text-xs">
                  <span className={`font-semibold ${TEXT[tone]}`}>{item.verdict}</span>
                  {item.evidence && <span className="text-ink-muted"> · {item.evidence}</span>}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface" aria-hidden="true">
                <div className={`h-full rounded-full ${BAR[tone]}`} style={{ width: `${Math.round(item.value * 100)}%` }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* The per-criterion scores and the weighting are what a marker denotes,
          so they stay available — just not as the first thing anyone sees. */}
      <button
        type="button"
        onClick={() => setDetailsOpen((open) => !open)}
        aria-expanded={detailsOpen}
        className="mt-3 flex w-full items-center justify-between gap-2 border-t border-lantern/20 pt-2 font-utility text-micro font-semibold text-ink-muted hover:text-chili"
      >
        {copy.howScored}
        <CaretDown size={12} className={`transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
      </button>
      {detailsOpen && (
        <div className="mt-2 space-y-1">
          {described.map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-2 font-utility text-micro text-ink-muted">
              <span>{item.label}</span>
              <span className="tabular font-semibold text-ink">{(item.value * 10).toFixed(1)}/10</span>
            </div>
          ))}
          <p className="pt-1.5 text-micro leading-relaxed text-ink-faint">{copy.assessmentNote}</p>
        </div>
      )}
    </section>
  )
}

function ContentCard({ item, copy, onPlay }) {
  const Icon = PLATFORM_ICON[item.platform] || Article
  const playable = isEmbeddable(item.url)
  const body = <><div className="relative h-[68px] w-[96px] shrink-0 overflow-hidden rounded-lg bg-paper-2"><RemoteImage src={item.thumbnailUrl} alt="" sizeHint="w192-h136-k-no" className="h-full w-full object-cover" fallback={<span className="flex h-full items-center justify-center text-ink-faint"><Icon size={22} /></span>} />{playable && <PlayCircle size={23} weight="fill" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white drop-shadow" />}</div><div className="min-w-0 flex-1"><div className="mb-1 flex items-center gap-1.5 font-utility text-micro font-bold uppercase text-ink-faint"><Icon size={12} />{item.platform}</div><p className="line-clamp-2 text-xs font-semibold leading-snug">{item.title}</p><span className="mt-1 inline-flex items-center gap-1 text-micro text-chili">{playable ? <>{copy.play}<PlayCircle size={10} weight="fill" /></> : <>{copy.open}<ArrowSquareOut size={10} /></>}</span></div></>
  // TikTok, Instagram, Facebook and YouTube posts all have a keyless public
  // embed, so any of them opens in the inline player; articles stay links.
  if (playable) return <button type="button" onClick={() => onPlay(item.url)} className="flex w-full gap-3 rounded-xl border border-line bg-surface p-2 text-left transition-colors hover:border-chili">{body}</button>
  return <a href={item.url} target="_blank" rel="noreferrer" className="flex gap-3 rounded-xl border border-line bg-surface p-2 transition-colors hover:border-chili">{body}</a>
}

/**
 * The factual panel: photo, rating, price range, contact details and opening
 * hours, sourced from the place's public listing.
 *
 * Rendered only when a listing was actually found. Every field is optional —
 * small places routinely have a rating but no website, or hours but no phone —
 * so each row is dropped rather than shown empty.
 */
function PlaceFacts({ details, copy, lang, place }) {
  const [hoursOpen, setHoursOpen] = useState(false)
  const facts = details?.place
  if (!facts) return null

  const open = isOpenNow(facts.hours)
  const today = todayHours(facts.hours)
  const stars = facts.rating != null ? Math.round(facts.rating) : 0
  const directionsUrl = facts.location
    ? `https://www.google.com/maps/dir/?api=1&destination=${facts.location.lat},${facts.location.lng}`
    : null
  const priceLine = [facts.priceLevel, facts.category].filter(Boolean).join(' · ')

  return (
    <section className="mt-3 overflow-hidden rounded-xl border border-line">
      {facts.thumbnailUrl && (
        <RemoteImage src={facts.thumbnailUrl} alt={facts.name ?? place.name[lang]} sizeHint="w800-h320-k-no" loading="eager" className="h-32 w-full object-cover" />
      )}
      <div className="space-y-2 p-3">
        {facts.rating != null && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-utility text-md font-bold text-ink">{facts.rating.toFixed(1).replace('.', lang === 'vi' ? ',' : '.')}</span>
            <span className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} size={12} weight={n <= stars ? 'fill' : 'regular'} className={n <= stars ? 'text-lantern' : 'text-ink-faint'} />
              ))}
            </span>
            {facts.ratingCount != null && (
              <a href={facts.mapsUrl ?? '#'} target="_blank" rel="noreferrer" className="text-xs text-[#1769a8] hover:underline">
                {copy.reviewsOnGoogle(facts.ratingCount)}
              </a>
            )}
          </div>
        )}

        {priceLine && <p className="text-xs text-ink-muted">{priceLine}</p>}

        {open != null && (
          <p className="flex flex-wrap items-center gap-1.5 font-utility text-xs font-semibold">
            <span className={open ? 'text-herb' : 'text-chili'}>{open ? copy.openNow : copy.closedNow}</span>
            {today?.close && <span className="font-normal text-ink-muted">· {copy.closesAt(today.close)}</span>}
          </p>
        )}

        <FactRow icon={MapPin} value={facts.address} />
        {facts.phone && <FactRow icon={Phone} value={<a href={`tel:${facts.phone.replace(/\s/g, '')}`} className="text-[#1769a8] hover:underline">{facts.phone}</a>} />}
        {facts.website && (
          <FactRow
            icon={Globe}
            value={<a href={facts.website} target="_blank" rel="noreferrer" className="break-all text-[#1769a8] hover:underline">{facts.website.replace(/^https?:\/\/(www\.)?/, '')}</a>}
          />
        )}

        {facts.hours?.length > 0 && (
          <div>
            <button type="button" onClick={() => setHoursOpen((value) => !value)} className="flex w-full items-center gap-2 text-left text-xs text-ink-muted hover:text-chili">
              <Clock size={13} className="shrink-0 text-ink-faint" />
              <span className="flex-1">{copy.hours}</span>
              <CaretDown size={12} className={`shrink-0 transition-transform ${hoursOpen ? 'rotate-180' : ''}`} />
            </button>
            {hoursOpen && (
              <ul className="mt-1.5 space-y-0.5 border-t border-line pt-1.5">
                {facts.hours.map((row) => (
                  <li key={row.weekday} className={`flex justify-between text-2xs ${row.weekday === new Date().getDay() ? 'font-semibold text-ink' : 'text-ink-muted'}`}>
                    <span>{row.label}</span><span>{row.raw}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {directionsUrl && (
            <a href={directionsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-utility text-2xs font-semibold text-ink-muted hover:border-chili hover:text-chili">
              <NavigationArrow size={12} />{copy.directions}
            </a>
          )}
          {facts.mapsUrl && (
            <a href={facts.mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-utility text-2xs font-semibold text-ink-muted hover:border-chili hover:text-chili">
              <ArrowSquareOut size={12} />{copy.onGoogleMaps}
            </a>
          )}
        </div>
      </div>
    </section>
  )
}

function FactRow({ icon: Icon, value }) {
  if (!value) return null
  return (
    <p className="flex items-start gap-2 text-xs text-ink-muted">
      <Icon size={13} className="mt-0.5 shrink-0 text-ink-faint" />
      <span className="min-w-0 flex-1">{value}</span>
    </p>
  )
}
