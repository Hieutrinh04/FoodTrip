const domains = { youtube: ['youtube.com', 'youtu.be'], tiktok: ['tiktok.com'], facebook: ['facebook.com', 'fb.watch'], instagram: ['instagram.com'] }

export function parseVideoUrl(raw) {
  try {
    if (typeof raw !== 'string' || raw.length > 2048) return null
    const url = new URL(raw.trim())
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null
    const host = url.hostname.toLowerCase()
    const platform = Object.keys(domains).find((key) => domains[key].some((domain) => host === domain || host.endsWith(`.${domain}`)))
    if (!platform) return null
    url.protocol = 'https:'
    url.hash = ''
    if (platform === 'youtube') {
      const id = host === 'youtu.be' ? url.pathname.split('/')[1] : url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]+)/)?.[1]
      if (!/^[\w-]{11}$/.test(id || '')) return null
      return { platform, url: `https://www.youtube.com/watch?v=${id}` }
    }
    if (platform === 'tiktok') {
      const match = url.pathname.match(/^\/@([^/]+)\/video\/(\d+)\/?$/)
      if (match) return { platform, url: `https://www.tiktok.com/@${match[1]}/video/${match[2]}` }
      if (!['vm.tiktok.com', 'vt.tiktok.com'].includes(host) && !url.pathname.startsWith('/t/')) return null
      if (url.pathname === '/') return null
    }
    if (platform === 'instagram') {
      const match = url.pathname.match(/^\/(p|reel|reels|tv)\/([\w-]+)\/?$/)
      if (!match) return null
      return { platform, url: `https://www.instagram.com/${match[1] === 'reels' ? 'reel' : match[1]}/${match[2]}/` }
    }
    if (platform === 'facebook') {
      if (host !== 'fb.watch' && !/\/(?:videos|reel|watch|share)\b/.test(url.pathname) && !url.searchParams.get('v')) return null
      if (url.pathname === '/' && !url.searchParams.get('v')) return null
      url.hostname = host === 'fb.watch' ? host : 'www.facebook.com'
    }
    for (const key of [...url.searchParams.keys()]) {
      if (!['v', 'story_fbid', 'id'].includes(key)) url.searchParams.delete(key)
    }
    url.pathname = url.pathname.replace(/\/$/, '') || '/'
    return { platform, url: url.toString() }
  } catch { return null }
}

export function validLocation(location) {
  return location && typeof location.lat === 'number' && typeof location.lng === 'number' &&
    Number.isFinite(location.lat) && Number.isFinite(location.lng) && Math.abs(location.lat) <= 90 && Math.abs(location.lng) <= 180
}

export function reviewPayload(entry, userId) {
  const video = parseVideoUrl(entry.videoUrl)
  if (!video) throw new Error('invalid-video')
  if (!userId) throw new Error('auth-required')
  const name = entry.placeName?.trim()
  const address = entry.address?.trim() || ''
  const note = entry.note?.trim() || ''
  if (!name || name.length > 200 || address.length > 500 || note.length > 1000) throw new Error('invalid-details')
  if (entry.location && !validLocation(entry.location)) throw new Error('invalid-location')
  return {
    user_id: userId, video_url: video.url, platform: video.platform,
    place_name: name, address, note,
    lat: entry.location?.lat ?? null, lng: entry.location?.lng ?? null,
    google_place_id: entry.location ? entry.googlePlaceId || null : null,
  }
}
