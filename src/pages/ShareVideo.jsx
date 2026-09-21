import { useEffect, useRef, useState } from 'react'
import { MapPin, FilmSlate, Trash, PencilSimple, ShareNetwork } from '@phosphor-icons/react'
import { useAuth } from '../auth/AuthContext.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import AuthModal from '../components/auth/AuthModal.jsx'
import VideoReviewCard from '../components/video/VideoReviewCard.jsx'
import PlaceMiniMap from '../components/map/PlaceMiniMap.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import { parseVideoUrl, fetchTikTokOEmbed, fetchYoutubeOEmbed, detectPlaceFromContent, verifyPlaceQuery, getVideoReviews, saveVideoReviews, updateVideoReview, deleteVideoReview, REVIEW_PAGE_SIZE } from '../lib/videoShare.js'

const emptyDraft = { videoUrl: '', placeName: '', address: '', note: '' }
const button = 'inline-flex items-center justify-center gap-2 rounded-full border border-line-strong px-4 py-2.5 text-sm font-utility font-semibold hover:border-chili disabled:opacity-50 disabled:cursor-not-allowed'
const field = 'w-full rounded-xl border border-line-strong bg-surface px-4 py-3 outline-none focus:border-chili'

function ReviewMedia({ review, vi }) {
  const [open, setOpen] = useState(false)
  return <div>
    <button type="button" className={button} aria-expanded={open} onClick={() => setOpen(!open)}><FilmSlate size={16} />{open ? (vi ? 'Ẩn video và bản đồ' : 'Hide video and map') : (vi ? 'Xem video và bản đồ' : 'View video and map')}</button>
    {open && <div className="mt-3 space-y-3"><VideoReviewCard review={review} />{review.location && <PlaceMiniMap location={review.location} title={review.placeName} className="h-[200px]" />}</div>}
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
  const [selected, setSelected] = useState([])
  const [busy, setBusy] = useState('')
  const busyRef = useRef(false)
  const requestRef = useRef(0)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [reviews, setReviews] = useState([])
  const [listBusy, setListBusy] = useState(true)
  const [listError, setListError] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [mine, setMine] = useState(false)
  const [reload, setReload] = useState(0)
  const [deleteId, setDeleteId] = useState(null)
  const listRequest = useRef(0)
  const [moreBusy, setMoreBusy] = useState(false)
  const mineId = mine ? user?.id : null

  useEffect(() => {
    const requests = listRequest
    const token = ++requests.current
    setListBusy(true)
    setListError(false)
    setMoreBusy(false)
    getVideoReviews({ userId: mineId }).then((rows) => {
      if (token !== listRequest.current) return
      setReviews(rows)
      setHasMore(rows.length === REVIEW_PAGE_SIZE)
    }).catch(() => { if (token === listRequest.current) setListError(true) })
      .finally(() => { if (token === listRequest.current) setListBusy(false) })
    return () => { requests.current++ }
  }, [mineId, reload])

  useEffect(() => {
    const requests = requestRef
    return () => { requests.current++ }
  }, [])

  function reset() {
    requestRef.current++
    setDraft(emptyDraft)
    setCandidates([])
    setSelected([])
    setEditing(null)
    setError('')
  }
  function change(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }))
    if (key !== 'note') { setCandidates([]); setSelected([]) }
    setNotice('')
    setError('')
  }
  function begin(kind) {
    if (busyRef.current) return false
    busyRef.current = true
    setBusy(kind)
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
    const unique = [...new Map((rows || []).filter((p) => p.placeId && p.name && p.location).map((p) => [p.placeId, p])).values()].slice(0, 8)
    setCandidates(unique)
    setSelected([])
    setNotice(unique.length
      ? t('Đây là các địa điểm gợi ý. Hãy kiểm tra tên, địa chỉ và chọn đúng quán xuất hiện trong video.', 'These are suggestions. Check each name and address, then select the places actually shown in the video.')
      : t('Chưa tìm thấy địa điểm phù hợp. Thêm tên quán, quận/thành phố rồi tìm lại, hoặc đăng thông tin tự nhập.', 'No suitable place found. Add a name and district/city and retry, or publish your manually entered details.'))
  }
  async function analyze() {
    const parsed = parseVideoUrl(draft.videoUrl)
    if (!parsed) { setError(t('Hãy nhập link video/bài đăng hợp lệ từ TikTok, YouTube, Facebook hoặc Instagram.', 'Enter a valid TikTok, YouTube, Facebook or Instagram video/post link.')); return }
    if (!begin('analyze')) return
    const token = ++requestRef.current
    setCandidates([]); setSelected([])
    setDraft((prev) => ({ ...prev, videoUrl: parsed.url }))
    try {
      if (!['tiktok', 'youtube'].includes(parsed.platform)) {
        setNotice(t('Với link này, hãy nhập tên quán và khu vực bên dưới để tìm địa điểm trên bản đồ.', 'For this link, enter the place name and area below to find it on the map.'))
        return
      }
      const meta = await (parsed.platform === 'tiktok' ? fetchTikTokOEmbed(parsed.url) : fetchYoutubeOEmbed(parsed.url))
      if (token !== requestRef.current) return
      if (!meta.title?.trim()) { present([]); return }
      const result = await detectPlaceFromContent({ caption: meta.title })
      if (token === requestRef.current) present(result.places)
    } catch {
      if (token === requestRef.current) setNotice(t('Chưa đọc được nội dung video. Bạn vẫn có thể nhập tên quán và tìm địa chỉ bên dưới.', 'Could not read this video. You can still enter the place name and search below.'))
    } finally { finish() }
  }
  async function search() {
    if (!draft.placeName.trim()) { setError(t('Nhập tên quán trước khi tìm.', 'Enter a place name first.')); return }
    if (!begin('search')) return
    const token = ++requestRef.current
    setCandidates([]); setSelected([])
    try {
      const result = await verifyPlaceQuery([draft.placeName.trim(), draft.address.trim()].filter(Boolean).join(', '))
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

  return <div className="max-w-[1000px] mx-auto px-5 md:px-8 py-12 md:py-16">
    <span className="eyebrow eyebrow-tick">{t('Chia sẻ quán từ video', 'Share a place from a video')}</span>
    <h1 className="text-3xl md:text-4xl font-bold mt-3">{t('Thấy quán hay? Chia sẻ cùng mọi người.', 'Found a great place? Share it with everyone.')}</h1>
    <p className="text-ink-muted mt-3 max-w-[70ch]">{t('Dán link TikTok, YouTube, Facebook hoặc Instagram. Tìm địa điểm từ tiêu đề video hoặc nhập tên quán, kiểm tra địa chỉ rồi đăng chia sẻ của bạn.', 'Paste a TikTok, YouTube, Facebook or Instagram link. Find suggestions from the video title or enter a place name, check the address, then publish your post.')}</p>
    <p className="text-sm text-ink-faint mt-2">{t('Gợi ý từ tiêu đề có thể chưa đầy đủ; tính năng này không xem toàn bộ video. Video riêng tư hoặc bị giới hạn có thể không phát được.', 'Title-based suggestions may be incomplete; this feature does not watch the entire video. Private or restricted videos may not play.')}</p>

    <div role="status" aria-live="polite" className="mt-5">{notice && <p className="rounded-xl bg-paper-2 p-4 text-herb">{notice}</p>}</div>
    {error && <p role="alert" className="mt-3 rounded-xl border border-chili p-4 text-chili">{error}</p>}
    <form onSubmit={publish} className="mt-6 rounded-2xl border border-line bg-surface p-5 md:p-7 space-y-4" aria-busy={Boolean(busy)}>
      <h2 className="text-xl font-bold">{editing ? t('Chỉnh sửa bài chia sẻ', 'Edit your post') : t('1. Thêm video và tìm quán', '1. Add a video and find the place')}</h2>
      <fieldset disabled={Boolean(busy)} className="space-y-4">
        <label className="block space-y-2"><span>{t('Link video / bài đăng', 'Video / post link')}</span><input type="url" required maxLength={2048} className={field} value={draft.videoUrl} onChange={(e) => change('videoUrl', e.target.value)} placeholder="https://…" /></label>
        <button type="button" className={button} onClick={analyze}>{t('Tìm quán từ video', 'Find places from video')}</button>
        {parseVideoUrl(draft.videoUrl) && <ReviewMedia key={draft.videoUrl} review={{ videoUrl: draft.videoUrl, placeName: draft.placeName, platform: parseVideoUrl(draft.videoUrl).platform }} vi={vi} />}
        <div className="grid md:grid-cols-2 gap-4">
          <label className="block space-y-2"><span>{t('Tên quán', 'Place name')}</span><input required={!selected.length} maxLength={200} className={field} value={draft.placeName} onChange={(e) => change('placeName', e.target.value)} placeholder={t('Ví dụ: The Orange Coffee', 'Example: The Orange Coffee')} /></label>
          <label className="block space-y-2"><span>{t('Địa chỉ / quận / thành phố', 'Address / district / city')}</span><input maxLength={500} className={field} value={draft.address} onChange={(e) => change('address', e.target.value)} placeholder={t('Nhập khu vực để tránh nhầm chi nhánh', 'Add an area to find the right branch')} /></label>
        </div>
        <button type="button" className={button} onClick={search}><MapPin size={16} />{t('Tìm địa điểm trên bản đồ', 'Search the map')}</button>
        {candidates.length > 0 && <section className="rounded-xl bg-paper-2 p-4 space-y-3">
          <h3 className="font-bold">{t('2. Chọn đúng địa điểm trong video', '2. Select the correct places in the video')}</h3>
          {candidates.map((p) => <div key={p.placeId} className="rounded-xl border border-line bg-surface p-3">
            <label className="flex gap-3 cursor-pointer"><input type={editing ? 'radio' : 'checkbox'} name="place" checked={selected.includes(p.placeId)} onChange={() => setSelected((prev) => editing ? [p.placeId] : prev.includes(p.placeId) ? prev.filter((id) => id !== p.placeId) : [...prev, p.placeId])} /><span><span className="block font-semibold">{p.name}</span><span className="text-sm text-ink-muted">{p.address}</span></span></label>
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
      {busy && <p role="status" className="text-herb">{busy === 'analyze' ? t('Đang đọc tiêu đề và tìm gợi ý…', 'Reading the title and finding suggestions…') : busy === 'search' ? t('Đang tìm địa điểm…', 'Searching places…') : t('Đang lưu thay đổi…', 'Saving changes…')}</p>}
    </form>

    <section className="mt-12">
      <div className="flex flex-wrap gap-3 items-center justify-between mb-5"><h2 className="text-2xl font-bold">{t('Các quán đã chia sẻ', 'Shared places')}</h2><div className="flex gap-2"><button className={button} aria-pressed={!mine || !user} onClick={() => setMine(false)}>{t('Cộng đồng', 'Community')}</button>{user && <button className={button} aria-pressed={mine} onClick={() => setMine(true)}>{t('Bài của tôi', 'My posts')}</button>}<button className={button} disabled={listBusy} onClick={() => setReload((n) => n + 1)}>{t('Tải lại', 'Refresh')}</button></div></div>
      {listError && <p role="alert" className="text-chili mb-4">{t('Không tải được bài chia sẻ. Nhấn Tải lại hoặc Tải thêm để thử lại.', 'Could not load posts. Use Refresh or Load more to retry.')}</p>}
      {listBusy ? <p role="status">{t('Đang tải bài chia sẻ…', 'Loading posts…')}</p> : !listError && !reviews.length ? <EmptyState icon={FilmSlate} title={t('Chưa có bài chia sẻ', 'No posts yet')} body={t('Chia sẻ quán đầu tiên bằng biểu mẫu phía trên.', 'Share your first place using the form above.')} /> : <div className="grid md:grid-cols-2 gap-5">
        {reviews.map((r) => <article key={r.id} className="rounded-xl border border-line bg-surface p-5 space-y-3">
          <h3 className="font-bold text-xl break-words">{r.placeName}</h3><p className="text-sm text-ink-muted break-words">{r.address}</p>
          <p className="text-xs text-ink-faint">{new Date(r.addedAt).toLocaleDateString(vi ? 'vi-VN' : 'en-US')} · {r.location ? t('Có vị trí bản đồ', 'Map attached') : t('Địa chỉ do người đăng cung cấp', 'Address supplied by contributor')}</p>
          {r.note && <p className="whitespace-pre-wrap break-words">{r.note}</p>}
          <ReviewMedia review={r} vi={vi} />
          <div className="flex flex-wrap gap-2"><button className={button} onClick={() => share(r)}><ShareNetwork size={16} />{t('Chia sẻ', 'Share')}</button>{user?.id === r.userId && <><button className={button} disabled={Boolean(busy)} onClick={() => edit(r)}><PencilSimple size={16} />{t('Sửa', 'Edit')}</button><button className={button} disabled={Boolean(busy)} onClick={() => setDeleteId(r.id)}><Trash size={16} />{t('Xóa', 'Delete')}</button></>}</div>
          {deleteId === r.id && <div className="rounded-xl border border-chili p-3" role="group" aria-label={t('Xác nhận xóa bài', 'Confirm deletion')}><p>{t('Xóa bài chia sẻ này? Thao tác này không thể hoàn tác.', 'Delete this post? This cannot be undone.')}</p><div className="flex gap-2 mt-2"><button className={button} disabled={Boolean(busy)} onClick={() => remove(r.id)}>{t('Xác nhận xóa', 'Confirm delete')}</button><button className={button} disabled={Boolean(busy)} onClick={() => setDeleteId(null)}>{t('Giữ lại', 'Keep post')}</button></div></div>}
        </article>)}
      </div>}
      {hasMore && !listBusy && <button className={`${button} mt-5`} disabled={moreBusy} onClick={loadMore}>{moreBusy ? t('Đang tải…', 'Loading…') : t('Tải thêm', 'Load more')}</button>}
    </section>
    {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
  </div>
}
