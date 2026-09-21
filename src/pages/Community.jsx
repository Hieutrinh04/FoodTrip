import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChatCircle, Compass, MagnifyingGlass, Plus, ArrowClockwise } from '@phosphor-icons/react'
import { useAuth } from '../auth/AuthContext.jsx'
import AuthModal from '../components/auth/AuthModal.jsx'
import PostComposer from '../components/community/PostComposer.jsx'
import PostCard from '../components/community/PostCard.jsx'
import CommentThread from '../components/community/CommentThread.jsx'
import { useCommunityText } from '../components/community/communityUi.js'
import { getCommunityPost, listCommunityPosts, POST_PAGE_SIZE } from '../lib/community.js'
import { isUuid } from '../lib/communityValidation.js'
import './Community.css'

export default function Community() {
  const t = useCommunityText()
  const { user } = useAuth()
  const { postId } = useParams()
  const navigate = useNavigate()
  const [authOpen, setAuthOpen] = useState(false)
  const [composing, setComposing] = useState(false)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [moreBusy, setMoreBusy] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [mine, setMine] = useState(false)
  const [search, setSearch] = useState('')
  const [input, setInput] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [notice, setNotice] = useState('')
  const request = useRef(0)
  const mineId = mine ? user?.id : null

  useEffect(() => { if (!user) setMine(false) }, [user])
  useEffect(() => {
    const controller = new AbortController()
    const token = ++request.current
    setRows([]); setLoading(true); setError(''); setMoreBusy(false)
    const promise = postId
      ? isUuid(postId) ? getCommunityPost(postId, controller.signal).then((row) => row ? [row] : []) : Promise.resolve([])
      : listCommunityPosts({ mine: mineId, search, signal: controller.signal })
    promise.then((data) => {
      if (token !== request.current) return
      setRows(data); setHasMore(!postId && data.length === POST_PAGE_SIZE)
    }).catch(() => { if (!controller.signal.aborted) setError('load') })
      .finally(() => { if (token === request.current) setLoading(false) })
    return () => { controller.abort(); request.current++ }
  }, [postId, mineId, search, refresh])

  async function more() {
    if (loading || moreBusy) return
    const token = request.current
    setMoreBusy(true); setError('')
    try {
      const data = await listCommunityPosts({ mine: mineId, search, cursor: rows.at(-1) })
      if (token !== request.current) return
      setRows((old) => [...old, ...data.filter((row) => !old.some((item) => item.id === row.id))]); setHasMore(data.length === POST_PAGE_SIZE)
    } catch { if (token === request.current) setError('more') }
    finally { if (token === request.current) setMoreBusy(false) }
  }
  function saved(row) { setComposing(false); setNotice(t('Đã đăng chia sẻ của bạn.', 'Your post is published.')); navigate(`/community/${row.id}`) }
  function deleted(id, photosRemoved) {
    setRows((old) => old.filter((row) => row.id !== id))
    setNotice(photosRemoved ? t('Đã xóa bài viết, ảnh và các bình luận. Không thể hoàn tác.', 'Post, photos and comments deleted. This cannot be undone.') : t('Đã xóa bài viết và bình luận; chưa xóa được tệp ảnh trên máy chủ. Cần liên hệ hỗ trợ để dọn ảnh.', 'Post and comments deleted; image files could not be removed. Contact support for cleanup.'))
    if (postId) navigate('/community')
  }
  return <main className="community-page">
    <header className="community-hero"><span className="community-eyebrow">FOODTRIP COMMUNITY</span><h1>{t('Đi một nơi. Kể một chuyện.', 'Go somewhere. Share a story.')}</h1><p>{t('Những điểm đến đáng nhớ, qua lời kể của người đã đi.', 'Memorable places, told by the people who have been there.')}</p></header>
    <div className="community-layout"><aside className="community-sidebar"><div className="community-sidebar-intro"><span className="community-symbol"><Compass size={30} weight="duotone" /></span><h2>{t('Đi cùng cảm hứng.', 'Find your next adventure.')}</h2><p>{t('Một bức ảnh, một chiếc ghim, một trải nghiệm thật. Chuyến đi tiếp theo có thể bắt đầu từ đây.', 'A photo, a pin, a real experience. Your next trip could start here.')}</p></div><nav aria-label={t('Điều hướng cộng đồng', 'Community navigation')}><Link to="/community" className={!postId && !mine ? 'active' : ''} onClick={() => { setMine(false); setSearch(''); setInput('') }}><ChatCircle size={19} />{t('Bảng tin cộng đồng', 'Community feed')}</Link><Link to="/explore"><Compass size={19} />{t('Khám phá trên bản đồ', 'Explore the map')}</Link><Link to="/share">{t('Chia sẻ video quán ăn', 'Share a food video')}</Link></nav><div className="community-guidelines"><strong>{t('Một cộng đồng tử tế', 'A thoughtful community')}</strong><p>{t('Chia sẻ ảnh bạn có quyền sử dụng. Ghim đúng địa điểm, không công khai thông tin riêng tư. Tôn trọng những trải nghiệm khác nhau.', 'Only share photos you have permission to use. Pin the correct place, protect private information and respect different experiences.')}</p><Link to="/contact">{t('Liên hệ hỗ trợ / báo nội dung', 'Contact support / report content')} →</Link></div></aside>
      <div className="community-feed">
        {notice && <p className="community-notice" role="status">{notice}</p>}
        {postId ? <Link to="/community" className="community-text-button community-back"><ArrowLeft size={17} />{t('Về bảng tin', 'Back to feed')}</Link> : <>
          {!composing && <button type="button" className="community-start community-card" onClick={() => setComposing(true)}><span className="community-avatar"><Plus size={23} /></span><span><strong>{t('Bạn vừa khám phá nơi nào?', 'Where have you been lately?')}</strong><small>{t('Chia sẻ địa điểm, hình ảnh và câu chuyện của bạn', 'Share a place, photos and your story')}</small></span><Plus size={21} /></button>}
          {composing && <PostComposer onSaved={saved} onCancel={() => { if (window.confirm(t('Đóng và bỏ bản nháp này?', 'Close and discard this draft?'))) setComposing(false) }} onLogin={() => setAuthOpen(true)} />}
          <div className="community-feed-tools"><div className="community-tabs"><button type="button" aria-pressed={!mine} className={!mine ? 'active' : ''} onClick={() => setMine(false)}>{t('Mới nhất', 'Latest')}</button><button type="button" aria-pressed={mine} className={mine ? 'active' : ''} onClick={() => user ? setMine(true) : setAuthOpen(true)}>{t('Bài của tôi', 'My posts')}</button></div><button className="community-icon" type="button" disabled={loading} aria-label={t('Làm mới bảng tin', 'Refresh feed')} onClick={() => setRefresh((value) => value + 1)}><ArrowClockwise size={20} /></button></div>
          <form className="community-feed-search" onSubmit={(event) => { event.preventDefault(); setSearch(input.trim()) }}><MagnifyingGlass size={19} /><input aria-label={t('Tìm bài theo tên địa điểm', 'Search posts by place name')} maxLength={200} value={input} onChange={(event) => setInput(event.target.value)} placeholder={t('Tìm một địa điểm trong cộng đồng…', 'Find a place in the community…')} /><button type="submit">{t('Tìm', 'Search')}</button></form>
          {search && <button className="community-text-button" type="button" onClick={() => { setInput(''); setSearch('') }}>{t('Bỏ bộ lọc:', 'Clear filter:')} {search} ×</button>}
        </>}
        {loading && <div className="community-card community-empty" role="status">{t('Đang tải bài chia sẻ…', 'Loading stories…')}</div>}
        {error && <div className="community-card community-error" role="alert"><p>{t('Chưa tải được cộng đồng. Kiểm tra kết nối và thử lại.', 'Could not load the community. Check your connection and retry.')}</p><button type="button" className="community-button" onClick={() => error === 'more' ? more() : setRefresh((value) => value + 1)}>{t('Thử lại', 'Retry')}</button></div>}
        {!loading && !error && !rows.length && <div className="community-card community-empty"><Compass size={44} weight="duotone" /><h2>{postId ? t('Không tìm thấy bài viết', 'Post not found') : search ? t('Chưa có câu chuyện ở đây', 'No stories found') : mine ? t('Chuyến đi của bạn đang chờ được kể', 'Your adventures are waiting to be shared') : t('Bắt đầu một câu chuyện mới', 'Start a new story')}</h2><p>{postId ? t('Link có thể không đúng hoặc bài viết đã bị xóa.', 'The link may be incorrect or the post was deleted.') : t('Chia sẻ một điểm đến bạn yêu thích để mọi người cùng khám phá.', 'Share a place you love for others to discover.')}</p>{!postId && !composing && <button className="community-button community-primary" onClick={() => setComposing(true)}>{t('Viết bài đầu tiên', 'Write a post')}</button>}</div>}
        {!loading && rows.map((row) => <PostCard key={row.id} post={row} detail={Boolean(postId)} onChanged={(updated) => setRows((old) => old.map((item) => item.id === updated.id ? updated : item))} onDeleted={deleted} onLogin={() => setAuthOpen(true)} />)}
        {hasMore && !loading && <button className="community-button community-load-more" type="button" disabled={moreBusy} onClick={more}>{moreBusy ? t('Đang tải…', 'Loading…') : t('Xem thêm câu chuyện', 'More stories')}</button>}
        {postId && !loading && rows.length === 1 && <CommentThread key={postId} postId={postId} onLogin={() => setAuthOpen(true)} />}
      </div>
    </div>
    {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
  </main>
}
