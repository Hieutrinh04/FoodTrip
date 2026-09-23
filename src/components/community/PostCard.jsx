import { lazy, Suspense, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChatCircle, MapPin, PencilSimple, ShareNetwork, Trash, ArrowUpRight } from '@phosphor-icons/react'
import { useAuth } from '../../auth/AuthContext.jsx'
import { communityPhotoUrl, deleteCommunityPost } from '../../lib/community.js'
import { communityError, useCommunityText } from './communityUi.js'
import PostComposer from './PostComposer.jsx'

const CommunityMap = lazy(() => import('./CommunityMap.jsx'))

export default function PostCard({ post, detail = false, onChanged, onDeleted, onLogin }) {
  const t = useCommunityText()
  const { user } = useAuth()
  const [mapOpen, setMapOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [shareLink, setShareLink] = useState('')
  const [copied, setCopied] = useState(false)
  const owner = user?.id === post.user_id
  const count = post.community_comments?.[0]?.count || 0
  const date = new Date(post.created_at).toLocaleString(t('vi-VN', 'en-US'), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${post.lat},${post.lng}`)}`

  async function remove() {
    if (busy || !window.confirm(t('Xóa bài viết này cùng toàn bộ bình luận? Không thể hoàn tác.', 'Delete this post and all its comments? This cannot be undone.'))) return
    setBusy(true); setError('')
    try {
      const result = await deleteCommunityPost(post)
      onDeleted(post.id, result.photosRemoved)
    } catch (err) { setError(communityError(err, t)); setBusy(false) }
  }
  async function share() {
    const url = new URL(`/community/${post.id}`, window.location.origin).href
    setShareLink(url); setCopied(false)
    try { await navigator.clipboard.writeText(url); setCopied(true) } catch { /* The selectable URL remains available without clipboard permission. */ }
  }
  if (editing && owner) return <PostComposer post={post} onLogin={onLogin} onCancel={() => setEditing(false)} onSaved={(row) => { onChanged(row); setEditing(false) }} />

  return <article className="community-card community-post">
    <header className="community-post-header"><span className="community-avatar" aria-hidden="true">{post.author_name.slice(0, 1).toUpperCase()}</span><div><strong>{post.author_name}</strong><div className="community-meta"><time dateTime={post.created_at}>{date}</time>{post.updated_at !== post.created_at && <span> · {t('đã sửa', 'edited')}</span>}</div></div>{owner && <div className="community-owner-actions"><button className="community-icon" type="button" disabled={busy} onClick={() => setEditing(true)} aria-label={t('Sửa bài viết', 'Edit post')}><PencilSimple size={18} /></button><button className="community-icon" type="button" disabled={busy} onClick={remove} aria-label={t('Xóa bài viết', 'Delete post')}><Trash size={18} /></button></div>}</header>
    <p className="community-body">{post.body}</p>
    {post.photo_paths.length > 0 && <div className={`community-gallery ${post.photo_paths.length === 1 ? 'community-gallery-single' : ''}`}>{post.photo_paths.map((path, index) => <a href={communityPhotoUrl(path)} target="_blank" rel="noopener noreferrer" key={path} aria-label={t(`Mở ảnh ${index + 1} của ${post.place_name}`, `Open photo ${index + 1} of ${post.place_name}`)}><img src={communityPhotoUrl(path)} alt={`${post.place_name} · ${index + 1}`} loading="lazy" decoding="async" onError={(event) => { event.currentTarget.alt = t('Không tải được ảnh. Nhấn để thử mở ảnh gốc.', 'Photo unavailable. Open the original to retry.') }} /></a>)}</div>}
    <div className="community-place"><MapPin size={23} weight="duotone" /><div><h2>{detail ? post.place_name : <Link to={`/community/${post.id}`}>{post.place_name}</Link>}</h2><p>{post.address}</p><span className="community-meta">{post.lat.toFixed(6)}, {post.lng.toFixed(6)}</span></div></div>
    <div className="community-place-actions"><button type="button" className="community-text-button" onClick={() => setMapOpen((value) => !value)} aria-expanded={mapOpen}>{mapOpen ? t('Ẩn bản đồ', 'Hide map') : t('Xem bản đồ', 'View map')}</button><a href={directions} target="_blank" rel="noopener noreferrer" className="community-text-button">{t('Chỉ đường', 'Directions')}<ArrowUpRight size={15} /></a></div>
    {mapOpen && <Suspense fallback={<p role="status">{t('Đang tải bản đồ…', 'Loading map…')}</p>}><CommunityMap lat={post.lat} lng={post.lng} /></Suspense>}
    <footer className="community-post-actions"><Link to={detail ? '#discussion' : `/community/${post.id}#discussion`} className="community-text-button"><ChatCircle size={20} />{detail ? t('Thảo luận', 'Discussion') : t(`${count} bình luận`, `${count} comments`)}</Link><button className="community-text-button" type="button" onClick={share}><ShareNetwork size={19} />{t('Chia sẻ', 'Share')}</button></footer>
    {shareLink && <label className="community-share-link">{copied ? t('Đã sao chép link bài viết', 'Post link copied') : t('Sao chép link này để chia sẻ', 'Copy this link to share')}<input readOnly value={shareLink} onFocus={(event) => event.target.select()} /></label>}
    {error && <p role="alert" className="community-error">{error}</p>}
  </article>
}
