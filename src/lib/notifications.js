import { supabase, hasSupabase } from './supabaseClient.js'

// The signed-in user's notifications. The database writes them (bookings,
// tours, partner applications, settlements, refunds); here they are only read
// and marked read.

export async function listNotifications(limit = 30) {
  if (!hasSupabase) return []
  const { data, error } = await supabase.from('notifications')
    .select('id, kind, title, body, link, read_at, created_at').order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return data ?? []
}

export async function markNotificationsRead(ids) {
  if (!hasSupabase || !ids.length) return
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids).is('read_at', null)
  if (error) throw error
}

/** "5 phút trước", "2 giờ trước", "3 ngày trước". */
export function timeAgo(iso, lang = 'vi') {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000))
  const units = minutes < 60 ? [minutes, 'phút', 'min'] : minutes < 1440 ? [Math.round(minutes / 60), 'giờ', 'h'] : [Math.round(minutes / 1440), 'ngày', 'd']
  if (minutes < 1) return lang === 'vi' ? 'vừa xong' : 'just now'
  return lang === 'vi' ? `${units[0]} ${units[1]} trước` : `${units[0]}${units[2]} ago`
}
