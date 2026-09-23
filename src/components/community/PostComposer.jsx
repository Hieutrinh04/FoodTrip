import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Camera, MapPin, MagnifyingGlass, X } from '@phosphor-icons/react'
import { useAuth } from '../../auth/AuthContext.jsx'
import { createCommunityPost, updateCommunityPost, prepareCommunityPhoto } from '../../lib/community.js'
import { coordinates, postPayload, MAX_PHOTOS } from '../../lib/communityValidation.js'
import { verifyPlaceQuery } from '../../lib/videoShare.js'
import { communityError, readCommunityName, rememberCommunityName, useCommunityText } from './communityUi.js'

const CommunityMap = lazy(() => import('./CommunityMap.jsx'))

export default function PostComposer({ post, onSaved, onCancel, onLogin }) {
  const t = useCommunityText()
  const { user } = useAuth()
  const [draft, setDraft] = useState(() => post || { author_name: readCommunityName(user), body: '', place_name: '', address: '', lat: '', lng: '' })
  const [photos, setPhotos] = useState([])
  const photosRef = useRef([])
  const postId = useRef(post?.id || crypto.randomUUID())
  const ownerAtStart = useRef(user?.id)
  const [busy, setBusy] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const lock = useRef(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState([])
  const [searching, setSearching] = useState(false)
  const searchToken = useRef(0)
  const [searchNotice, setSearchNotice] = useState('')
  const [mapOpen, setMapOpen] = useState(false)
  const [consent, setConsent] = useState(Boolean(post))
  const alive = useRef(true)
  // Lock uncertain submissions until the same draft has been retried successfully.
  const [attempted, setAttempted] = useState(false)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; searchToken.current++; photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.url)) }
  }, [])
  useEffect(() => {
    if (user && !ownerAtStart.current) ownerAtStart.current = user.id
    if (user && !draft.author_name) setDraft((value) => ({ ...value, author_name: readCommunityName(user) }))
  }, [user, draft.author_name])

  const frozen = busy || attempted
  const change = (key, value) => setDraft((old) => ({ ...old, [key]: value }))
  let point = null
  try { point = coordinates(draft.lat, draft.lng) } catch { /* The user has not chosen a point yet. */ }

  async function addPhotos(event) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (lock.current || !files.length) return
    if (files.length + photosRef.current.length > MAX_PHOTOS) { setError(communityError(new Error('invalid-photo'), t)); return }
    lock.current = true
    setPreparing(true); setError('')
    const next = []
    try {
      for (const file of files) {
        const blob = await prepareCommunityPhoto(file)
        if (!alive.current) return
        next.push({ id: crypto.randomUUID(), blob, url: URL.createObjectURL(blob) })
      }
      photosRef.current = [...photosRef.current, ...next]
      setPhotos(photosRef.current)
    } catch (err) {
      next.forEach((photo) => URL.revokeObjectURL(photo.url))
      if (alive.current) setError(communityError(err, t))
    } finally { lock.current = false; if (alive.current) setPreparing(false) }
  }
  function removePhoto(id) {
    const removed = photosRef.current.find((photo) => photo.id === id)
    if (removed) URL.revokeObjectURL(removed.url)
    photosRef.current = photosRef.current.filter((photo) => photo.id !== id)
    setPhotos(photosRef.current)
  }
  async function search() {
    if (query.trim().length < 2) return
    const token = ++searchToken.current
    setSearching(true); setCandidates([]); setSearchNotice('')
    try {
      const result = await verifyPlaceQuery(query.trim())
      if (token !== searchToken.current) return
      const rows = (result.places || []).filter((row) => {
        try { coordinates(row.location?.lat, row.location?.lng); return Boolean(row.name) } catch { return false }
      }).slice(0, 6)
      setCandidates(rows)
      setSearchNotice(rows.length ? t('Chọn đúng địa điểm bên dưới; kiểm tra lại ghim và địa chỉ.', 'Choose the correct result; check its pin and address.') : t('Chưa có kết quả. Bạn có thể nhập địa chỉ và tọa độ bên dưới.', 'No results. You can enter the address and coordinates below.'))
    } catch {
      if (token === searchToken.current) setSearchNotice(t('Tìm kiếm đang lỗi. Bạn vẫn có thể nhập thông tin hoặc đặt ghim thủ công.', 'Search unavailable. You can enter details or place a pin manually.'))
    } finally { if (token === searchToken.current) setSearching(false) }
  }
  async function submit(event) {
    event.preventDefault()
    if (!user) { onLogin(); return }
    if (lock.current) return
    if (ownerAtStart.current !== user.id) { setError(t('Tài khoản đã thay đổi. Đóng bản nháp và tạo bài mới.', 'Your account changed. Close this draft and create a new post.')); return }
    try { postPayload(draft) } catch (err) { setError(communityError(err, t)); return }
    if (!consent) return
    lock.current = true; setBusy(true); setError(''); setAttempted(!post)
    // Ignore search responses after submission starts.
    searchToken.current++; setSearching(false)
    try {
      const saved = post ? await updateCommunityPost(post.id, draft) : await createCommunityPost({ id: postId.current, draft, photos,
        onProgress: (index, total) => setProgress(t(`Đang tải ảnh ${index}/${total}…`, `Uploading photo ${index}/${total}…`)) })
      rememberCommunityName(user, draft.author_name)
      onSaved(saved)
    } catch (err) { if (alive.current) setError(communityError(err, t)) }
    finally { lock.current = false; if (alive.current) { setBusy(false); setProgress('') } }
  }

  return <section className="community-composer community-card" aria-label={t('Soạn bài chia sẻ', 'Write a post')}>
    <div className="community-row"><h2>{post ? t('Chỉnh sửa bài viết', 'Edit post') : t('Một nơi đáng để đi.', 'Somewhere worth going.')}</h2><button type="button" className="community-icon" disabled={busy || preparing} onClick={onCancel} aria-label={t('Đóng bản nháp', 'Close draft')}><X size={20} /></button></div>
    <p className="community-help">{t('Chia sẻ trải nghiệm thật, những góc đẹp và điều bạn ước mình biết trước chuyến đi.', 'Share real experiences, lovely corners and things you wish you knew before visiting.')}</p>
    <form onSubmit={submit}>
      <fieldset disabled={frozen || preparing}>
        <label>{t('Tên hiển thị công khai', 'Public display name')}<input required minLength={2} maxLength={60} value={draft.author_name} onChange={(e) => change('author_name', e.target.value)} autoComplete="nickname" placeholder={t('Ví dụ: Minh thích đi', 'E.g. Alex explores')} /></label>
        <label>{t('Câu chuyện của bạn', 'Your story')}<textarea required maxLength={3000} rows={5} value={draft.body} onChange={(e) => change('body', e.target.value)} placeholder={t('Nơi này có gì thú vị? Đi lúc nào đẹp, chi phí và lưu ý…', 'What makes this place special? Best time, costs and tips…')} /><span className="community-help">{draft.body.length}/3000</span></label>
        {!post && <div>
          <label className="community-upload"><Camera size={20} />{t('Thêm ảnh', 'Add photos')} <span>{photos.length}/4</span><input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={addPhotos} aria-label={t('Chọn ảnh địa điểm', 'Choose place photos')} /></label>
          <p className="community-help">{t('JPG, PNG, WebP · tối đa 10 MB/ảnh. Ảnh được nén và bỏ dữ liệu GPS gốc.', 'JPG, PNG, WebP · up to 10 MB each. Photos are compressed and original GPS metadata removed.')}</p>
          <div className="community-photo-previews">{photos.map((photo, index) => <div key={photo.id}><img src={photo.url} alt={t(`Ảnh đã chọn ${index + 1}`, `Selected photo ${index + 1}`)} /><button type="button" onClick={() => removePhoto(photo.id)} aria-label={t(`Bỏ ảnh ${index + 1}`, `Remove photo ${index + 1}`)}><X size={16} /></button></div>)}</div>
        </div>}
        {post && <p className="community-help">{t('Ảnh đã đăng được giữ nguyên khi chỉnh sửa nội dung.', 'Published photos are preserved when editing text.')}</p>}
        <div className="community-place-editor">
          <h3><MapPin size={18} />{t('Địa điểm cụ thể', 'Exact location')}</h3>
          <label>{t('Tìm địa điểm', 'Find a place')}<div className="community-search-row"><input maxLength={300} value={query} onChange={(e) => { setQuery(e.target.value); searchToken.current++; setSearching(false); setCandidates([]); setSearchNotice('') }} placeholder={t('Tên địa điểm, tỉnh/thành phố', 'Place name, city or region')} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search() } }} /><button className="community-button" type="button" onClick={search} disabled={searching || query.trim().length < 2}><MagnifyingGlass size={18} />{searching ? '…' : t('Tìm', 'Find')}</button></div></label>
          {searchNotice && <p className="community-help" role="status">{searchNotice}</p>}
          <div className="community-candidates">{candidates.map((place, index) => <button type="button" key={place.placeId || index} onClick={() => { setDraft((old) => ({ ...old, place_name: place.name, address: place.address || '', ...place.location })); setCandidates([]); setMapOpen(true) }}><strong>{place.name}</strong><span>{place.address}</span></button>)}</div>
          <label>{t('Tên địa điểm', 'Place name')}<input required minLength={2} maxLength={200} value={draft.place_name} onChange={(e) => change('place_name', e.target.value)} /></label>
          <label>{t('Địa chỉ / khu vực', 'Address / area')}<input required minLength={2} maxLength={500} value={draft.address} onChange={(e) => change('address', e.target.value)} /></label>
          <div className="community-coordinates"><label>{t('Vĩ độ', 'Latitude')}<input required type="number" min="-90" max="90" step="any" value={draft.lat} onChange={(e) => change('lat', e.target.value)} placeholder="10.7769" /></label><label>{t('Kinh độ', 'Longitude')}<input required type="number" min="-180" max="180" step="any" value={draft.lng} onChange={(e) => change('lng', e.target.value)} placeholder="106.7009" /></label></div>
          <button type="button" className="community-text-button" onClick={() => setMapOpen((value) => !value)} aria-expanded={mapOpen}><MapPin size={16} />{mapOpen ? t('Ẩn bản đồ', 'Hide map') : t('Chọn / kiểm tra ghim trên bản đồ', 'Choose / check the pin on the map')}</button>
          {mapOpen && <Suspense fallback={<p role="status">{t('Đang tải bản đồ…', 'Loading map…')}</p>}><CommunityMap lat={point?.lat ?? 16.0471} lng={point?.lng ?? 108.2068} onChoose={frozen ? undefined : (location) => setDraft((old) => ({ ...old, ...location }))} /></Suspense>}
        </div>
        <label className="community-consent"><input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} />{t('Tôi đồng ý công khai nội dung, ảnh và vị trí địa điểm này. Không chia sẻ địa chỉ riêng tư của người khác.', 'I agree to publish this content, photos and place location. Do not share someone else’s private address.')}</label>
      </fieldset>
      {preparing && <p role="status">{t('Đang xử lý ảnh…', 'Preparing photos…')}</p>}
      {error && <p className="community-error" role="alert">{error}</p>}
      {attempted && !busy && <p className="community-help">{t('Nhấn “Thử đăng lại” để kiểm tra và hoàn tất đúng bài này, tránh đăng trùng. Nội dung tạm khóa trong lúc xác minh.', 'Choose “Retry publishing” to verify and finish this same post without duplicates. The draft is temporarily locked.')}</p>}
      <div className="community-actions"><button type="submit" className="community-button community-primary" disabled={busy || preparing}>{busy ? progress || t('Đang lưu…', 'Saving…') : post ? t('Lưu thay đổi', 'Save changes') : attempted ? t('Thử đăng lại', 'Retry publishing') : t('Đăng chia sẻ', 'Publish post')}</button><button type="button" className="community-button" disabled={busy || preparing} onClick={onCancel}>{t('Hủy', 'Cancel')}</button></div>
    </form>
  </section>
}
