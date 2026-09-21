import { useEffect, useRef, useState } from 'react'
import { ArrowClockwise, PencilSimple, Trash } from '@phosphor-icons/react'
import { useAuth } from '../../auth/AuthContext.jsx'
import { COMMENT_PAGE_SIZE, listCommunityComments, saveCommunityComment, deleteCommunityComment, watchCommunityComments } from '../../lib/community.js'
import { communityError, readCommunityName, rememberCommunityName, useCommunityText } from './communityUi.js'

export default function CommentThread({ postId, onLogin }) {
  const t = useCommunityText()
  const { user } = useAuth()
  const [rows, setRows] = useState([])
  const rowsRef = useRef([])
  rowsRef.current = rows
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [moreBusy, setMoreBusy] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [updated, setUpdated] = useState(false)
  const [draft, setDraft] = useState({ author_name: readCommunityName(user), body: '' })
  const [editing, setEditing] = useState(null)
  const draftId = useRef(crypto.randomUUID())
  const [retrying, setRetrying] = useState(false)
  const request = useRef(0)
  const lock = useRef(false)
  const ownerAtStart = useRef(user?.id)

  useEffect(() => {
    if (!ownerAtStart.current && user) ownerAtStart.current = user.id
    if (user && !draft.author_name) setDraft((value) => ({ ...value, author_name: readCommunityName(user) }))
  }, [user, draft.author_name])
  useEffect(() => {
    const controller = new AbortController()
    const token = ++request.current
    setLoading(true); setListError(''); setMoreBusy(false)
    listCommunityComments(postId, null, controller.signal).then((data) => {
      if (token !== request.current) return
      setRows(data); setHasMore(data.length === COMMENT_PAGE_SIZE); setUpdated(false)
    }).catch(() => { if (!controller.signal.aborted) setListError('load') })
      .finally(() => { if (token === request.current) setLoading(false) })
    return () => { controller.abort(); request.current++ }
  }, [postId, refresh])
  useEffect(() => watchCommunityComments(postId, (event) => {
    if (event.eventType !== 'DELETE' || rowsRef.current.some((row) => row.id === event.old.id)) setUpdated(true)
  }), [postId])

  async function more() {
    if (moreBusy || loading) return
    const token = request.current
    setMoreBusy(true); setListError('')
    try {
      const data = await listCommunityComments(postId, rows.at(-1))
      if (token !== request.current) return
      setRows((old) => [...old, ...data.filter((row) => !old.some((item) => item.id === row.id))]); setHasMore(data.length === COMMENT_PAGE_SIZE)
    } catch { if (token === request.current) setListError('more') }
    finally { if (token === request.current) setMoreBusy(false) }
  }
  async function submit(event) {
    event.preventDefault()
    if (!user) { onLogin(); return }
    if (lock.current) return
    if (ownerAtStart.current !== user.id) { setError(t('Tài khoản đã đổi. Tải lại trang trước khi gửi.', 'Your account changed. Reload before sending.')); return }
    lock.current = true; setBusy(true); setError('')
    try {
      const row = await saveCommunityComment({ id: editing || draftId.current, postId, draft, editing: Boolean(editing) })
      rememberCommunityName(user, draft.author_name)
      if (editing) setRows((old) => old.map((item) => item.id === row.id ? row : item))
      else setRows((old) => [row, ...old.filter((item) => item.id !== row.id)])
      draftId.current = crypto.randomUUID(); setEditing(null); setRetrying(false); setDraft((old) => ({ ...old, body: '' }))
    } catch (err) { setError(communityError(err, t)); if (!editing && !['auth-required', 'invalid-content', 'permission-denied', 'rate-limit'].includes(err.message)) setRetrying(true) }
    finally { lock.current = false; setBusy(false) }
  }
  async function remove(row) {
    if (lock.current || !window.confirm(t('Xóa bình luận này? Không thể hoàn tác.', 'Delete this comment? This cannot be undone.'))) return
    lock.current = true; setBusy(true); setError('')
    try { await deleteCommunityComment(row.id); setRows((old) => old.filter((item) => item.id !== row.id)) }
    catch (err) { setError(communityError(err, t)) }
    finally { lock.current = false; setBusy(false) }
  }
  function edit(row) {
    setEditing(row.id); setDraft({ author_name: row.author_name, body: row.body }); setError('')
    document.getElementById('community-comment-body')?.focus()
  }
  return <section id="discussion" className="community-card community-discussion">
    <div className="community-row"><h2>{t('Cùng bàn về nơi này', 'Let’s talk about this place')}</h2><button type="button" className="community-icon" disabled={loading} onClick={() => setRefresh((value) => value + 1)} aria-label={t('Làm mới bình luận', 'Refresh comments')}><ArrowClockwise size={19} /></button></div>
    <p className="community-help">{t('Hỏi kinh nghiệm, chia sẻ mẹo hay. Thảo luận lịch sự và tôn trọng nhau.', 'Ask questions, share tips. Keep the discussion kind and respectful.')}</p>
    <form onSubmit={submit} className="community-comment-form">
      <fieldset disabled={busy || retrying}>
        <label>{t('Tên hiển thị công khai', 'Public display name')}<input required minLength={2} maxLength={60} value={draft.author_name} onChange={(e) => setDraft((old) => ({ ...old, author_name: e.target.value }))} autoComplete="nickname" /></label>
        <label>{editing ? t('Sửa bình luận', 'Edit comment') : t('Bình luận của bạn', 'Your comment')}<textarea id="community-comment-body" required maxLength={1000} rows={3} value={draft.body} onChange={(e) => setDraft((old) => ({ ...old, body: e.target.value }))} placeholder={t('Bạn muốn hỏi hoặc chia sẻ điều gì?', 'What would you like to ask or share?')} /></label>
      </fieldset>
      {!user && <p className="community-help"><button type="button" className="community-text-button" onClick={onLogin}>{t('Đăng nhập để bình luận', 'Log in to comment')}</button> · {t('Bản nháp sẽ được giữ.', 'Your draft will be preserved.')}</p>}
      {error && <p className="community-error" role="alert">{error}</p>}
      <div className="community-actions"><button type="submit" disabled={busy} className="community-button community-primary">{busy ? t('Đang gửi…', 'Sending…') : retrying ? t('Thử gửi lại', 'Retry sending') : editing ? t('Lưu bình luận', 'Save comment') : t('Gửi bình luận', 'Post comment')}</button>{editing && <button type="button" className="community-button" disabled={busy} onClick={() => { setEditing(null); setDraft((old) => ({ ...old, body: '' })); setError('') }}>{t('Hủy sửa', 'Cancel edit')}</button>}</div>
      {retrying && <p className="community-help">{t('Nội dung tạm khóa. Thử gửi lại để xác minh bình luận trước đó, không tạo bản trùng.', 'Draft locked temporarily. Retry to verify the previous comment without creating a duplicate.')}</p>}
    </form>
    {updated && <button className="community-update" type="button" onClick={() => setRefresh((value) => value + 1)}>{t('Có cập nhật mới · Nhấn để tải', 'Discussion updated · Tap to refresh')}</button>}
    {loading && <p role="status">{t('Đang tải bình luận…', 'Loading comments…')}</p>}
    {listError && <div className="community-error" role="alert">{t('Chưa tải được bình luận.', 'Could not load comments.')} <button type="button" onClick={() => listError === 'more' ? more() : setRefresh((value) => value + 1)}>{t('Thử lại', 'Retry')}</button></div>}
    {!loading && !listError && !rows.length && <p className="community-empty-small">{t('Chưa có bình luận. Bắt đầu cuộc trò chuyện nhé!', 'No comments yet. Start the conversation!')}</p>}
    <div className="community-comments">{rows.map((row) => <article className="community-comment" key={row.id}><span className="community-avatar community-avatar-small" aria-hidden="true">{row.author_name.slice(0, 1).toUpperCase()}</span><div className="community-comment-content"><div className="community-row"><strong>{row.author_name}</strong>{row.user_id === user?.id && <div className="community-owner-actions"><button type="button" className="community-icon" disabled={busy || retrying} aria-label={t('Sửa bình luận', 'Edit comment')} onClick={() => edit(row)}><PencilSimple size={16} /></button><button type="button" className="community-icon" disabled={busy || retrying} aria-label={t('Xóa bình luận', 'Delete comment')} onClick={() => remove(row)}><Trash size={16} /></button></div>}</div><p>{row.body}</p><time className="community-meta" dateTime={row.created_at}>{new Date(row.created_at).toLocaleString(t('vi-VN', 'en-US'))}{row.updated_at !== row.created_at ? t(' · đã sửa', ' · edited') : ''}</time></div></article>)}</div>
    {hasMore && !loading && <button className="community-button" type="button" disabled={moreBusy} onClick={more}>{moreBusy ? t('Đang tải…', 'Loading…') : t('Xem bình luận cũ hơn', 'Load older comments')}</button>}
  </section>
}
