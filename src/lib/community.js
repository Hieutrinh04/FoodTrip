import { supabase, hasSupabase } from './supabaseClient.js'
import { postPayload, commentPayload, olderThan, isUuid, validatePhoto, MAX_UPLOAD_BYTES } from './communityValidation.js'

export const POST_PAGE_SIZE = 10
export const COMMENT_PAGE_SIZE = 20
const BUCKET = 'community-photos'
const POST_FIELDS = 'id,user_id,author_name,body,place_name,address,lat,lng,photo_paths,created_at,updated_at,community_comments(count)'

function client() {
  if (!hasSupabase) throw new Error('unavailable')
  return supabase
}
function fail(error) {
  if (error?.message?.includes('community-rate-limit')) throw new Error('rate-limit')
  if (error?.code === '42501' || error?.status === 401) throw new Error('permission-denied')
  if (error) throw new Error('request-failed')
}
async function userId() {
  const { data, error } = await client().auth.getUser()
  if (error || !data.user) throw new Error('auth-required')
  return data.user.id
}
function checkedId(id) { if (!isUuid(id)) throw new Error('not-found'); return id }

export async function listCommunityPosts({ cursor, mine, search = '', signal } = {}) {
  let query = client().from('community_posts').select(POST_FIELDS).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(POST_PAGE_SIZE)
  if (mine) query = query.eq('user_id', checkedId(mine))
  if (search.trim()) query = query.ilike('place_name', `%${search.trim().replace(/[\\%_]/g, '\\$&')}%`)
  const filter = olderThan(cursor)
  if (filter) query = query.or(filter)
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query
  fail(error)
  return data
}
export async function getCommunityPost(id, signal) {
  let query = client().from('community_posts').select(POST_FIELDS).eq('id', checkedId(id)).maybeSingle()
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query
  fail(error)
  return data
}
export function communityPhotoUrl(path) { return client().storage.from(BUCKET).getPublicUrl(path).data.publicUrl }

// Canvas re-encoding strips original EXIF (including GPS) and bounds image dimensions.
export async function prepareCommunityPhoto(file) {
  validatePhoto(file)
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('invalid-photo') })
  try {
    if (bitmap.width * bitmap.height > 60_000_000) throw new Error('invalid-photo')
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('invalid-photo')
    context.fillStyle = '#fffcf4'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
    if (!blob || blob.size > MAX_UPLOAD_BYTES) throw new Error('invalid-photo')
    return blob
  } finally { bitmap.close() }
}

// A stable draft ID makes retrying a timed-out insert safe, without duplicate posts.
export async function createCommunityPost({ id, draft, photos, onProgress }) {
  const owner = await userId()
  const payload = postPayload(draft)
  checkedId(id)
  if (photos.length > 4) throw new Error('invalid-photo')
  const existing = await getCommunityPost(id)
  if (existing) {
    if (existing.user_id !== owner) throw new Error('permission-denied')
    return existing
  }
  const paths = []
  for (let index = 0; index < photos.length; index++) {
    const photo = photos[index]
    checkedId(photo.id)
    const path = `${owner}/${id}/${photo.id}.jpg`
    onProgress?.(index + 1, photos.length)
    const { error } = await client().storage.from(BUCKET).upload(path, photo.blob, { contentType: 'image/jpeg', upsert: false })
    // The same immutable path may already exist after a retry.
    if (error && String(error.statusCode) !== '409' && error.message !== 'The resource already exists') fail(error)
    paths.push(path)
  }
  const { data, error } = await client().from('community_posts').insert({ id, user_id: owner, ...payload, photo_paths: paths }).select(POST_FIELDS).single()
  if (error) {
    // Do not remove uploads here: the server may have committed despite a network failure.
    const committed = await getCommunityPost(id).catch(() => null)
    if (committed?.user_id === owner) return committed
    fail(error)
  }
  return data
}
export async function updateCommunityPost(id, draft) {
  const owner = await userId()
  const { data, error } = await client().from('community_posts').update(postPayload(draft)).eq('id', checkedId(id)).eq('user_id', owner).select(POST_FIELDS).single()
  fail(error)
  return data
}
export async function deleteCommunityPost(post) {
  const owner = await userId()
  const { data, error } = await client().from('community_posts').delete().eq('id', checkedId(post.id)).eq('user_id', owner).select('id,photo_paths').single()
  fail(error)
  if (!data.photo_paths.length) return { photosRemoved: true }
  const { error: storageError } = await client().storage.from(BUCKET).remove(data.photo_paths)
  return { photosRemoved: !storageError }
}
export async function listCommunityComments(postId, cursor, signal) {
  let query = client().from('community_comments').select('*').eq('post_id', checkedId(postId)).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(COMMENT_PAGE_SIZE)
  const filter = olderThan(cursor)
  if (filter) query = query.or(filter)
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query
  fail(error)
  return data
}
export async function saveCommunityComment({ id, postId, draft, editing }) {
  const owner = await userId()
  const payload = commentPayload(draft)
  let query = client().from('community_comments')
  query = editing ? query.update(payload).eq('id', checkedId(id)).eq('user_id', owner)
    : query.insert({ id: checkedId(id), post_id: checkedId(postId), user_id: owner, ...payload })
  const { data, error } = await query.select('*').single()
  if (!editing && error?.code === '23505') {
    const retry = await client().from('community_comments').select('*').eq('id', id).eq('user_id', owner).single()
    fail(retry.error)
    return retry.data
  }
  fail(error)
  return data
}
export async function deleteCommunityComment(id) {
  const owner = await userId()
  const { error } = await client().from('community_comments').delete().eq('id', checkedId(id)).eq('user_id', owner).select('id').single()
  fail(error)
}
export function watchCommunityComments(postId, onChange) {
  if (!hasSupabase) return () => {}
  const channel = supabase.channel(`community-${postId}-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_comments', filter: `post_id=eq.${postId}` }, onChange)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'community_comments', filter: `post_id=eq.${postId}` }, onChange)
    // DELETE payloads may contain only the primary key; filter against loaded IDs in the UI.
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'community_comments' }, onChange)
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}
