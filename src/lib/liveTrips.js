import { supabase } from './supabaseClient.js'

export async function liveTripRpc(name, args) {
  if (!supabase) throw new Error('unavailable')
  const { data, error } = await supabase.rpc(name, args).abortSignal(AbortSignal.timeout(10000))
  if (error) throw error
  return data
}
export const createLiveTrip = (id) => liveTripRpc('create_live_trip', { p_itinerary: id })
export const joinLiveTrip = (id, token, name) => liveTripRpc('join_live_trip', { p_itinerary: id, p_token: token, p_name: name })
export const getLiveTripState = (id) => liveTripRpc('live_trip_state', { p_room: id })
export const publishLiveLocation = (id, name, location) => liveTripRpc('live_trip_publish', { p_room: id, p_name: name, p_location: location })
export const leaveLiveTrip = (id) => liveTripRpc('leave_live_trip', { p_room: id })
export const manageLiveTrip = (id, action, member = null) => liveTripRpc('manage_live_trip', { p_room: id, p_action: action, p_member: member })
export function liveTripError(err, lang = 'vi') {
  const message = String(err?.message ?? '')
  if (/membership-revoked/.test(message)) return lang === 'vi' ? 'Bạn đã được gỡ khỏi phòng này.' : 'You have been removed from this room.'
  if (/room-full/.test(message)) return lang === 'vi' ? 'Phòng đã đủ 50 thành viên.' : 'This room already has 50 members.'
  if (/room-unavailable|invalid-room/.test(message)) return lang === 'vi' ? 'Phòng đã đóng, hết hạn hoặc link mời đã đổi. Hãy xin link mới từ chủ hành trình.' : 'The room is closed, expired or its invitation changed. Ask the owner for a new link.'
  if (err?.code === 'PGRST202') return lang === 'vi' ? 'Phòng hành trình chưa được kích hoạt trên máy chủ.' : 'Live trip rooms are not enabled on the server yet.'
  return lang === 'vi' ? 'Chưa kết nối được phòng. Kiểm tra mạng rồi thử lại.' : 'Could not connect. Check your connection and retry.'
}
