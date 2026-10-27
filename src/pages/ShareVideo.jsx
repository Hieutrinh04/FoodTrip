import { useCallback, useEffect, useRef, useState } from 'react'
import { MapPin, FilmSlate, Trash, PencilSimple, ShareNetwork, Info, SpinnerGap, MagnifyingGlass } from '@phosphor-icons/react'
import { useAuth } from '../auth/AuthContext.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import AuthModal from '../components/auth/AuthModal.jsx'
import GuestLoginWall from '../components/auth/GuestLoginWall.jsx'
import VideoReviewCard from '../components/video/VideoReviewCard.jsx'
import PlaceMiniMap from '../components/map/PlaceMiniMap.jsx'
import PlaceDetailsDrawer from '../components/map/PlaceDetailsDrawer.jsx'
import { normalise as toMapPlace } from '../lib/mapAreaSearch.js'
import VideoPlanCard from '../components/share/VideoPlanCard.jsx'
import { ActionProgress, ActionResult } from '../components/share/ActionStatus.jsx'
import { useElapsed } from '../hooks/useElapsed.js'
import { sameVenue } from '../../supabase/functions/_shared/placeNames.js'
import { sameHouse } from '../../supabase/functions/_shared/captionSignals.js'
import EmptyState from '../components/ui/EmptyState.jsx'
import { parseVideoUrl, fetchTikTokOEmbed, fetchYoutubeOEmbed, detectPlaceFromContent, verifyPlaceQuery, rememberSharedPlace, getVideoReviews, saveVideoReviews, updateVideoReview, deleteVideoReview, REVIEW_PAGE_SIZE } from '../lib/videoShare.js'

const emptyDraft = { videoUrl: '', placeName: '', address: '', note: '' }
const button = 'inline-flex items-center justify-center gap-2 rounded-full border border-line-strong px-4 py-2.5 text-sm font-utility font-semibold hover:border-chili disabled:opacity-50 disabled:cursor-not-allowed'
const field = 'w-full rounded-xl border border-line-strong bg-surface px-4 py-3 outline-none focus:border-chili'

function ReviewMedia({ review, vi, onLogin }) {
  const [open, setOpen] = useState(false)
  const { user } = useAuth()
  return <div>
    <button type="button" className={button} aria-expanded={Boolean(user && open)} onClick={() => user ? setOpen(!open) : onLogin?.()}><FilmSlate size={16} />{user && open ? (vi ? 'Ẩn video và bản đồ' : 'Hide video and map') : (vi ? 'Xem video và bản đồ' : 'View video and map')}</button>
    {user && open && <div className="mt-3 space-y-3"><VideoReviewCard review={review} />{review.location && <PlaceMiniMap location={review.location} title={review.placeName} className="h-[200px]" />}</div>}
  </div>
}

export default function ShareVideo() {
  const { lang } = useLanguage()
  const vi = lang === 'vi'
  const t = (vn, en) => vi ? vn : en
  const { user, loading: authLoading } = useAuth()
  const [authOpen, setAuthOpen] = useState(false)
  const [draft, setDraft] = useState(emptyDraft)
  const [editing, setEditing] = useState(null)
  const [candidates, setCandidates] = useState([])
  // Every venue the video names ("said" → suggestion), and its itinerary if it is one.
  const [mentions, setMentions] = useState([])
  const [plan, setPlan] = useState(null)
  const [selected, setSelected] = useState([])
  const [busy, setBusy] = useState('')
  const busyRef = useRef(false)
  const requestRef = useRef(0)
  // What the server read in the caption (names, city), kept to remember the confirmed venue.
  const signalsRef = useRef(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  // Where the last result or error shows: under the button that asked ('analyze' / 'search'), else at the top.
  const [anchor, setAnchor] = useState(null)
  // An analysis's step ('read' → 'find') and start time, and TikTok's suggested searches for the post.
  const [step, setStep] = useState(null)
  const [startedAt, setStartedAt] = useState(0)
  const [hints, setHints] = useState([])
  const elapsed = useElapsed(busy === 'analyze' || busy === 'search' ? startedAt : 0)
  const [reviews, setReviews] = useState([])
  const [listBusy, setListBusy] = useState(true)
  const [listError, setListError] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [mine, setMine] = useState(false)
  const [reload, setReload] = useState(0)
  const [deleteId, setDeleteId] = useState(null)
  // The venue whose details are open: the same panel as on Explore.
  const [detail, setDetail] = useState(null)
  const closeDetail = useCallback(() => setDetail(null), [])
  const listRequest = useRef(0)
  const [moreBusy, setMoreBusy] = useState(false)
  const mineId = mine ? user?.id : null

  useEffect(() => {
    if (authLoading) return undefined
    const requests = listRequest
    const token = ++requests.current
    setListBusy(true)
    setListError(false)
    setMoreBusy(false)
    getVideoReviews({ userId: mineId, limit: user ? REVIEW_PAGE_SIZE : 3 }).then((rows) => {
      if (token !== listRequest.current) return
      setReviews(rows)
      setHasMore(rows.length === REVIEW_PAGE_SIZE)
    }).catch(() => { if (token === listRequest.current) setListError(true) })
      .finally(() => { if (token === listRequest.current) setListBusy(false) })
    return () => { requests.current++ }
  }, [mineId, reload, user, authLoading])

  useEffect(() => {
    const requests = requestRef
    return () => { requests.current++ }
  }, [])

  function reset() {
    requestRef.current++
    setDraft(emptyDraft)
    setCandidates([])
    setSelected([])
    setMentions([])
    setPlan(null)
    setEditing(null)
    setError('')
    signalsRef.current = null
  }
  function change(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }))
    if (key !== 'note') { setCandidates([]); setSelected([]); setMentions([]); setPlan(null) }
    if (key === 'videoUrl') setHints([])
    setNotice('')
    setError('')
  }
  function begin(kind) {
    if (busyRef.current) return false
    busyRef.current = true
    setBusy(kind)
    setAnchor(kind === 'analyze' || kind === 'search' ? kind : null)
    setStartedAt(Date.now())
    setNotice('')
    setError('')
    return true
  }
  function finish() { busyRef.current = false; setBusy('') }
  function showError(err) {
    if (err.message === 'auth-required') {
      setAuthOpen(true)
      setError(t('Vui lòng đăng nhập rồi nhấn Đăng bài lại. Nội dung vẫn được giữ.', 'Please log in, then publish again. Your draft is preserved.'))
    } else if (err.message === 'duplicate') {
      setError(t('Bạn đã chia sẻ video này cho quán này. Mở “Bài của tôi” để chỉnh sửa.', 'You already shared this video for this place. Edit it under My posts.'))
    } else if (err.message === 'invalid-video') {
      setError(t('Link video không hợp lệ. Hãy dán link bài đăng từ nền tảng được hỗ trợ.', 'Invalid video link. Paste a post link from a supported platform.'))
    } else if (err.message === 'invalid-details') {
      setError(t('Vui lòng nhập tên quán; giới hạn tên 200 ký tự, địa chỉ 500 và cảm nhận 1.000 ký tự.', 'Enter a place name. Limits: name 200 characters, address 500, review 1,000.'))
    } else {
      setError(t('Không thể hoàn tất. Kiểm tra kết nối và thử lại; nội dung của bạn vẫn được giữ.', 'Could not complete this action. Check your connection and retry; your draft is preserved.'))
    }
  }
  function present(rows) {
    const unique = [...new Map((rows || []).filter((p) => p.placeId && p.name && p.location).map((p) => [p.placeId, p])).values()].slice(0, 16)
    setCandidates(unique)
    setSelected([])
    setNotice(unique.length
      ? t(`Tìm thấy ${unique.length} địa điểm gợi ý. Kiểm tra tên, địa chỉ và chọn đúng quán ở mục 2 bên dưới.`, `Found ${unique.length} suggested places. Check each name and address and select the right ones in step 2 below.`)
      : t('Chưa tìm thấy địa điểm phù hợp. Thêm tên quán, quận/thành phố rồi tìm lại, hoặc đăng thông tin tự nhập.', 'No suitable place found. Add a name and district/city and retry, or publish your manually entered details.'))
  }
  async function analyze() {
    const parsed = parseVideoUrl(draft.videoUrl)
    if (!parsed) { setAnchor('analyze'); setError(t('Hãy nhập link video/bài đăng hợp lệ từ TikTok, YouTube, Facebook hoặc Instagram.', 'Enter a valid TikTok, YouTube, Facebook or Instagram video/post link.')); return }
    if (!begin('analyze')) return
    const token = ++requestRef.current
    setStep('read'); setHints([])
    setCandidates([]); setSelected([]); setMentions([]); setPlan(null)
    setDraft((prev) => ({ ...prev, videoUrl: parsed.url }))
    try {
      if (!['tiktok', 'youtube'].includes(parsed.platform)) {
        setNotice(t('Với link này, hãy nhập tên quán và khu vực bên dưới để tìm địa điểm trên bản đồ.', 'For this link, enter the place name and area below to find it on the map.'))
        return
      }
      const meta = await (parsed.platform === 'tiktok' ? fetchTikTokOEmbed(parsed.url) : fetchYoutubeOEmbed(parsed.url))
      if (token !== requestRef.current) return
      setStep('find')
      setHints(Array.isArray(meta.hints) ? meta.hints : [])
      const caption = meta.title?.trim() || meta.description?.trim() || meta.location?.name || ''
      if (!caption) { present([]); return }
      const result = await detectPlaceFromContent({ caption, description: meta.description, location: meta.location, transcript: meta.transcript, area: meta.area, comments: meta.comments, author: meta.authorId, screenText: meta.screenText, videoUrl: parsed.url })
      if (token !== requestRef.current) return
      signalsRef.current = result.signals ?? null
      setMentions(result.mentions ?? [])
      setPlan(result.plan?.days?.length ? result.plan : null)
      const named = result.signals?.names?.[0]
      const city = meta.location?.address || meta.area || result.signals?.cities?.[0]
      // What the caption said is a head start for typing the venue in, never a choice made for the person.
      setDraft((prev) => ({ ...prev, placeName: prev.placeName || (result.places?.length ? '' : named ?? ''), address: prev.address || (result.places?.length ? '' : city ?? '') }))
      if (result.source === 'no-venue-signal') {
        setCandidates([]); setSelected([])
        setNotice(meta.isPhoto
          ? t('Đây là bài ảnh: tên quán thường chỉ nằm trên ảnh nên FoodTrip chưa đọc được. Bấm một từ khóa gợi ý bên dưới, hoặc nhập tên quán rồi bấm “Tìm địa điểm trên bản đồ”.', 'This is a photo post: place names are usually only on the photos, which FoodTrip cannot read. Try a suggested search below, or enter the place name and search the map.')
          : t('Caption không nêu tên quán cụ thể nên FoodTrip không đoán bừa. Nhập tên quán và khu vực bên dưới rồi bấm “Tìm địa điểm trên bản đồ”.', 'The caption names no specific place, so FoodTrip will not guess. Enter the place name and area below, then search the map.'))
      } else present(result.places)
    } catch {
      if (token === requestRef.current) setNotice(t('Chưa đọc được nội dung video. Bạn vẫn có thể nhập tên quán và tìm địa chỉ bên dưới.', 'Could not read this video. You can still enter the place name and search below.'))
    } finally { setStep(null); finish() }
  }
  // `name`: a suggested search the person picked; otherwise the name typed in.
  async function search(name) {
    const wanted = (typeof name === 'string' ? name : draft.placeName).trim()
    if (!wanted) { setAnchor('search'); setError(t('Nhập tên quán trước khi tìm.', 'Enter a place name first.')); return }
    if (!begin('search')) return
    if (typeof name === 'string') setDraft((prev) => ({ ...prev, placeName: wanted }))
    const token = ++requestRef.current
    setCandidates([]); setSelected([])
    try {
      const result = await verifyPlaceQuery([wanted, draft.address.trim()].filter(Boolean).join(', '))
      if (token === requestRef.current) present(result.places || (result.status === 'matched' ? [result] : []))
    } catch (err) { if (token === requestRef.current) showError(err) }
    finally { finish() }
  }
  async function publish(event) {
    event.preventDefault()
    if (!parseVideoUrl(draft.videoUrl)) { showError(new Error('invalid-video')); return }
    if (candidates.length && !selected.length) {
      setError(t('Chọn đúng quán ở trên, hoặc chọn “Không đúng, dùng thông tin tự nhập”.', 'Select a place above, or choose to use manually entered details.'))
      return
    }
    if (!selected.length && !draft.placeName.trim()) { showError(new Error('invalid-details')); return }
    if (!user) { setAuthOpen(true); return }
    if (!begin('save')) return
    try {
      const places = candidates.filter((p) => selected.includes(p.placeId))
      const entries = places.length ? places.map((p) => ({ ...draft, placeName: p.name, address: p.address, location: p.location, googlePlaceId: p.placeId })) : [{ ...draft, location: null, googlePlaceId: null }]
      if (editing) await updateVideoReview(editing, entries[0])
      else await saveVideoReviews(entries)
      // The next caption that names these venues gets them suggested without a map search.
      const said = [...(signalsRef.current?.names ?? []), draft.placeName]
      for (const place of places) rememberSharedPlace(place, { said, city: signalsRef.current?.cities?.[0] ?? null })
      reset()
      setNotice(t('Đã lưu bài chia sẻ. Mọi người có thể xem trong danh sách bên dưới.', 'Your post has been saved and is visible in the list below.'))
      setReload((n) => n + 1)
    } catch (err) { showError(err) }
    finally { finish() }
  }
  async function remove(id) {
    if (!begin('delete')) return
    try {
      await deleteVideoReview(id)
      setDeleteId(null)
      if (editing === id) reset()
      setNotice(t('Đã xóa bài chia sẻ.', 'Post deleted.'))
      setReload((n) => n + 1)
    } catch (err) { showError(err) }
    finally { finish() }
  }
  function edit(review) {
    reset()
    setNotice('')
    setDraft({ videoUrl: review.videoUrl, placeName: review.placeName || '', address: review.address || '', note: review.note })
    setEditing(review.id)
    if (review.location) {
      const p = { placeId: review.googlePlaceId || review.id, name: review.placeName, address: review.address, location: review.location }
      setCandidates([p]); setSelected([p.placeId])
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  async function loadMore() {
    if (!user) { setAuthOpen(true); return }
    if (moreBusy) return
    setMoreBusy(true); setListError(false)
    const token = listRequest.current
    try {
      const rows = await getVideoReviews({ offset: reviews.length, userId: mineId })
      if (token !== listRequest.current) return
      setReviews((prev) => [...new Map([...prev, ...rows].map((r) => [r.id, r])).values()])
      setHasMore(rows.length === REVIEW_PAGE_SIZE)
    } catch { if (token === listRequest.current) setListError(true) }
    finally { if (token === listRequest.current) setMoreBusy(false) }
  }
  async function share(review) {
    if (!user) { setAuthOpen(true); return }
    const safe = parseVideoUrl(review.videoUrl)
    if (!safe) return
    try {
      const text = [review.placeName, review.address, review.note].filter(Boolean).join('\n')
      if (navigator.share) await navigator.share({ title: review.placeName, text, url: safe.url })
      else {
        await navigator.clipboard.writeText(`${text}\n${safe.url}`)
        setNotice(t('Đã sao chép thông tin quán và link video.', 'Copied place details and video link.'))
      }
    } catch (err) { if (err.name !== 'AbortError') setError(t('Không sao chép được. Bạn có thể mở video và sao chép đường dẫn.', 'Could not copy. Open the video to copy its link.')) }
  }

  // Which words of the video a suggestion answers, and the suggestions whose name matches them.
  const mentionOf = (p) => mentions.find((m) => m.placeId === p.placeId) ?? null
  const saidFor = (p) => mentionOf(p)?.said ?? null
  // The video gives another address than this branch's (it may have moved, or be another branch).
  const otherAddress = (p) => { const at = mentionOf(p)?.address; return at && !sameHouse(at, p.address) ? at : null }
  const namedMatches = [...new Set(mentions.filter((m) => {
    const p = candidates.find((c) => c.placeId === m.placeId)
    return p && sameVenue(m.said, p.name)
  }).map((m) => m.placeId))]

  return <div className="max-w-[1000px] mx-auto px-5 md:px-8 py-12 md:py-16">
    <span className="eyebrow eyebrow-tick">{t('Chia sẻ quán từ video', 'Share a place from a video')}</span>
    <h1 className="text-3xl md:text-4xl font-bold mt-3">{t('Thấy quán hay? Chia sẻ cùng mọi người.', 'Found a great place? Share it with everyone.')}</h1>
    <p className="text-ink-muted mt-3 max-w-[70ch]">{t('Dán link TikTok, YouTube, Facebook hoặc Instagram. Tìm địa điểm từ tiêu đề, mô tả và thẻ vị trí của video, hoặc nhập tên quán, kiểm tra địa chỉ rồi đăng chia sẻ của bạn.', 'Paste a TikTok, YouTube, Facebook or Instagram link. Find suggestions from the video title, description and location tag, or enter a place name, check the address, then publish your post.')}</p>
    <p className="text-sm text-ink-faint mt-2">{t('Gợi ý từ nội dung video có thể chưa đầy đủ; tính năng này không xem toàn bộ video. Video riêng tư hoặc bị giới hạn có thể không phát được.', 'Suggestions from the video text may be incomplete; this feature does not watch the entire video. Private or restricted videos may not play.')}</p>

    {!anchor && <div className="mt-5 space-y-3"><ActionResult notice={notice} /><ActionResult error={error} /></div>}
    {user ? <form onSubmit={publish} className="mt-6 rounded-2xl border border-line bg-surface p-5 md:p-7 space-y-4" aria-busy={Boolean(busy)}>
      <h2 className="text-xl font-bold">{editing ? t('Chỉnh sửa bài chia sẻ', 'Edit your post') : t('1. Thêm video và tìm quán', '1. Add a video and find the place')}</h2>
      <fieldset disabled={Boolean(busy)} className="space-y-4">
        <label className="block space-y-2"><span>{t('Link video / bài đăng', 'Video / post link')}</span><input type="url" required maxLength={2048} className={field} value={draft.videoUrl} onChange={(e) => change('videoUrl', e.target.value)} placeholder="https://…" /></label>
        <button type="button" className={button} onClick={analyze}>{busy === 'analyze' ? <><SpinnerGap size={16} className="animate-spin" />{t('Đang tìm quán…', 'Finding places…')}</> : t('Tìm quán từ video', 'Find places from video')}</button>
        {busy === 'analyze'
          ? <ActionProgress vi={vi} elapsed={elapsed} hint={elapsed >= 6 ? t('video nhắc nhiều quán có thể mất 10–20 giây', 'a video naming many places can take 10–20 seconds') : null} steps={[
              { label: t('Đọc nội dung video: tiêu đề, mô tả, lời nói, thẻ vị trí, bình luận', 'Reading the video: title, description, speech, location tag, comments'), state: step === 'read' ? 'active' : 'done' },
              { label: t('Tìm các quán được nhắc tới trên bản đồ', 'Finding the places it names on the map'), state: step === 'find' ? 'active' : 'todo' },
            ]} />
          : anchor === 'analyze' && <><ActionResult notice={notice} /><ActionResult error={error} /></>}
        {busy !== 'analyze' && hints.length > 0 && <div className="rounded-xl border border-line p-3 text-sm">
          <p className="text-ink-muted">{t('TikTok gợi ý tìm cho bài này — có thể là tên quán trong ảnh/video. Bấm để tìm:', 'TikTok suggests these searches for this post — they may name places shown in it. Tap to search:')}</p>
          <div className="mt-2 flex flex-wrap gap-2">{hints.map((h) => <button key={h} type="button" className={`${button} py-1.5`} onClick={() => search(h)}><MagnifyingGlass size={14} />{h}</button>)}</div>
        </div>}
        {parseVideoUrl(draft.videoUrl) && <ReviewMedia key={draft.videoUrl} review={{ videoUrl: draft.videoUrl, placeName: draft.placeName, platform: parseVideoUrl(draft.videoUrl).platform }} vi={vi} />}
        <div className="grid md:grid-cols-2 gap-4">
          <label className="block space-y-2"><span>{t('Tên quán', 'Place name')}</span><input required={!selected.length} maxLength={200} className={field} value={draft.placeName} onChange={(e) => change('placeName', e.target.value)} placeholder={t('Ví dụ: The Orange Coffee', 'Example: The Orange Coffee')} /></label>
          <label className="block space-y-2"><span>{t('Địa chỉ / quận / thành phố', 'Address / district / city')}</span><input maxLength={500} className={field} value={draft.address} onChange={(e) => change('address', e.target.value)} placeholder={t('Nhập khu vực để tránh nhầm chi nhánh', 'Add an area to find the right branch')} /></label>
        </div>
        <button type="button" className={button} onClick={search}>{busy === 'search' ? <><SpinnerGap size={16} className="animate-spin" />{t('Đang tìm…', 'Searching…')}</> : <><MapPin size={16} />{t('Tìm địa điểm trên bản đồ', 'Search the map')}</>}</button>
        {busy === 'search'
          ? <ActionProgress vi={vi} elapsed={elapsed} steps={[{ label: t(`Tìm “${draft.placeName}” trên bản đồ`, `Searching the map for “${draft.placeName}”`), state: 'active' }]} />
          : anchor === 'search' && <><ActionResult notice={notice} /><ActionResult error={error} /></>}
        {candidates.length > 0 && <section className="rounded-xl bg-paper-2 p-4 space-y-3">
          <h3 className="font-bold">{t('2. Chọn đúng địa điểm trong video', '2. Select the correct places in the video')}</h3>
          {!editing && namedMatches.length >= 2 && <div className="flex flex-wrap items-center gap-3 text-sm"><span>{t(`Video nhắc tới ${mentions.length} địa điểm.`, `The video names ${mentions.length} places.`)}</span><button type="button" className={`${button} py-1.5`} onClick={() => setSelected(namedMatches)}>{t(`Chọn ${namedMatches.length} quán khớp tên`, `Select the ${namedMatches.length} name matches`)}</button></div>}
          {candidates.map((p) => <div key={p.placeId} className="rounded-xl border border-line bg-surface p-3">
            <label className="flex gap-3 cursor-pointer"><input type={editing ? 'radio' : 'checkbox'} name="place" checked={selected.includes(p.placeId)} onChange={() => setSelected((prev) => editing ? [p.placeId] : prev.includes(p.placeId) ? prev.filter((id) => id !== p.placeId) : [...prev, p.placeId])} /><span>{saidFor(p) && <span className="block text-xs text-ink-faint">{t(`Video nhắc: “${saidFor(p)}”`, `The video says: “${saidFor(p)}”`)}</span>}<span className="block font-semibold">{p.name}</span><span className="text-sm text-ink-muted">{p.address}</span>{otherAddress(p) && <span className="block text-xs text-chili">{t(`Video ghi địa chỉ khác: ${otherAddress(p)} — quán có thể đã chuyển hoặc đây là chi nhánh khác`, `The video gives another address: ${otherAddress(p)} — the place may have moved, or this is another branch`)}</span>}{p.rating != null && <span className="block text-xs text-ink-faint">★ {p.rating}{p.ratingCount ? ` · ${p.ratingCount.toLocaleString(vi ? 'vi-VN' : 'en-US')} ${t('đánh giá', 'reviews')}` : ''}{p.category ? ` · ${p.category}` : ''}</span>}</span></label>
            <button type="button" className={`${button} mt-2 py-1.5`} onClick={() => setDetail(toMapPlace(p))}><Info size={16} />{t('Xem chi tiết quán', 'Place details')}</button>
            {selected.includes(p.placeId) && <div className="mt-3"><PlaceMiniMap location={p.location} title={p.name} className="h-[180px]" /><a className="text-sm underline inline-block mt-2" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name} ${p.address || ''}`)}`}>{t('Đối chiếu trên Google Maps', 'Check on Google Maps')}</a></div>}
          </div>)}
          <button type="button" className={button} onClick={() => { setCandidates([]); setSelected([]) }}>{t('Không đúng, dùng thông tin tự nhập', 'Use manually entered details instead')}</button>
        </section>}
        <label className="block space-y-2"><span>{t('Cảm nhận / món nên thử (không bắt buộc)', 'Your review / recommended dishes (optional)')}</span><textarea rows={3} maxLength={1000} className={field} value={draft.note} onChange={(e) => change('note', e.target.value)} /></label>
        <div className="rounded-xl bg-paper-2 p-4 text-sm">
          {selected.length ? t(`Sẽ đăng ${selected.length} địa điểm đã chọn, kèm video và bản đồ.`, `${selected.length} selected places will be published with the video and map.`) : t('Bài đăng dùng tên và địa chỉ bạn tự nhập; chưa có vị trí trên bản đồ.', 'This post uses your entered name and address; no map location is attached.')}
          <p className="mt-1">{t('Bài chia sẻ sẽ hiển thị công khai. Chỉ chia sẻ video và nội dung bạn có quyền chia sẻ.', 'Your post will be public. Share only videos and content you are allowed to share.')}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={authLoading} className={`${button} bg-chili text-chili-ink`}>{!user ? t('Đăng nhập để đăng bài', 'Log in to publish') : editing ? t('Lưu chỉnh sửa', 'Save changes') : t('Đăng bài chia sẻ', 'Publish post')}</button>
          <button type="button" className={button} onClick={() => { reset(); setNotice('') }}>{editing ? t('Hủy chỉnh sửa', 'Cancel editing') : t('Làm mới nội dung', 'Clear draft')}</button>
        </div>
      </fieldset>
      {(busy === 'save' || busy === 'delete') && <p role="status" className="text-herb">{busy === 'analyze' ? t('Đang đọc tiêu đề và tìm gợi ý…', 'Reading the title and finding suggestions…') : busy === 'search' ? t('Đang tìm địa điểm…', 'Searching places…') : t('Đang lưu thay đổi…', 'Saving changes…')}</p>}
    </form> : <div className="mt-6"><GuestLoginWall title={t('Đăng nhập để chia sẻ quán của bạn', 'Sign in to share a place')} /></div>}

    {user && plan && candidates.length > 0 && <div className="mt-6"><VideoPlanCard key={draft.videoUrl} plan={plan} places={candidates} cityName={signalsRef.current?.cities?.[0] ?? ''} userId={user.id} onOpenDetails={(p) => setDetail(toMapPlace(p))} vi={vi} /></div>}

    <section className="mt-12">
      <div className="flex flex-wrap gap-3 items-center justify-between mb-5"><h2 className="text-2xl font-bold">{t('Các quán đã chia sẻ', 'Shared places')}</h2><div className="flex gap-2"><button className={button} aria-pressed={!mine || !user} onClick={() => setMine(false)}>{t('Cộng đồng', 'Community')}</button>{user && <button className={button} aria-pressed={mine} onClick={() => setMine(true)}>{t('Bài của tôi', 'My posts')}</button>}<button className={button} disabled={listBusy} onClick={() => setReload((n) => n + 1)}>{t('Tải lại', 'Refresh')}</button></div></div>
      {listError && <p role="alert" className="text-chili mb-4">{t('Không tải được bài chia sẻ. Nhấn Tải lại hoặc Tải thêm để thử lại.', 'Could not load posts. Use Refresh or Load more to retry.')}</p>}
      {listBusy ? <p role="status">{t('Đang tải bài chia sẻ…', 'Loading posts…')}</p> : !listError && !reviews.length ? <EmptyState icon={FilmSlate} title={t('Chưa có bài chia sẻ', 'No posts yet')} body={t('Chia sẻ quán đầu tiên bằng biểu mẫu phía trên.', 'Share your first place using the form above.')} /> : <div className="grid md:grid-cols-2 gap-5">
        {(user ? reviews : reviews.slice(0, 3)).map((r) => <article key={r.id} className="rounded-xl border border-line bg-surface p-5 space-y-3">
          <h3 className="font-bold text-xl break-words">{r.placeName}</h3><p className="text-sm text-ink-muted break-words">{r.address}</p>
          <p className="text-xs text-ink-faint">{new Date(r.addedAt).toLocaleDateString(vi ? 'vi-VN' : 'en-US')} · {r.location ? t('Có vị trí bản đồ', 'Map attached') : t('Địa chỉ do người đăng cung cấp', 'Address supplied by contributor')}</p>
          {r.note && <p className="whitespace-pre-wrap break-words">{user ? r.note : `${r.note.slice(0, 160)}${r.note.length > 160 ? '…' : ''}`}</p>}
          <ReviewMedia review={r} vi={vi} onLogin={() => setAuthOpen(true)} />
          <div className="flex flex-wrap gap-2">{r.location && <button className={button} onClick={() => user ? setDetail(toMapPlace({ name: r.placeName, address: r.address, location: r.location, placeId: r.googlePlaceId })) : setAuthOpen(true)}><Info size={16} />{t('Xem chi tiết quán', 'Place details')}</button>}<button className={button} onClick={() => share(r)}><ShareNetwork size={16} />{t('Chia sẻ', 'Share')}</button>{user?.id === r.userId && <><button className={button} disabled={Boolean(busy)} onClick={() => edit(r)}><PencilSimple size={16} />{t('Sửa', 'Edit')}</button><button className={button} disabled={Boolean(busy)} onClick={() => setDeleteId(r.id)}><Trash size={16} />{t('Xóa', 'Delete')}</button></>}</div>
          {deleteId === r.id && <div className="rounded-xl border border-chili p-3" role="group" aria-label={t('Xác nhận xóa bài', 'Confirm deletion')}><p>{t('Xóa bài chia sẻ này? Thao tác này không thể hoàn tác.', 'Delete this post? This cannot be undone.')}</p><div className="flex gap-2 mt-2"><button className={button} disabled={Boolean(busy)} onClick={() => remove(r.id)}>{t('Xác nhận xóa', 'Confirm delete')}</button><button className={button} disabled={Boolean(busy)} onClick={() => setDeleteId(null)}>{t('Giữ lại', 'Keep post')}</button></div></div>}
        </article>)}
      </div>}
      {!user && !authLoading && !listBusy && <div className="mt-5"><GuestLoginWall title={t('Đăng nhập để xem thêm quán và video', 'Sign in to see more places and videos')} /></div>}
      {user && hasMore && !listBusy && <button className={`${button} mt-5`} disabled={moreBusy} onClick={loadMore}>{moreBusy ? t('Đang tải…', 'Loading…') : t('Tải thêm', 'Load more')}</button>}
    </section>
    {detail && <PlaceDetailsDrawer place={detail} onClose={closeDetail} />}
    {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
  </div>
}
