// What a video says beyond oEmbed. TikTok's oEmbed now answers with the player
// only (no caption) and YouTube's carries the title alone, while the venue is
// often in the description ("📍 26 Tô Hiến Thành") or in TikTok's location tag.
// Plain JS: Deno and Node share it.

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
export const pageHeaders = { 'user-agent': BROWSER_UA, 'accept-language': 'vi,en;q=0.8' }

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

// A location tag can be a city or district ("Thu Dau Mot" — "Địa điểm và địa
// chỉ / Thành phố") rather than a venue ("Thực phẩm và đồ uống / Nhà hàng hải sản").
const REGION_TAG = /địa điểm và địa chỉ|places? (?:and|&) address|thành phố|tỉnh|quận|huyện|phường|thị xã|city|province|district|region/iu

/**
 * Caption, author, location tag and the link to the spoken-word subtitles from
 * a TikTok video page, or null. A venue tag is `location`; a city or district
 * tag is only `area`, to search in.
 */
export function parseTikTokPage(html) {
  const json = String(html).match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/)?.[1]
  if (!json) return null
  let item
  try { item = JSON.parse(json)?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct } catch { return null }
  if (!item || typeof item !== 'object') return null
  const poi = item.poi && typeof item.poi === 'object' && text(item.poi.name, 200) ? item.poi : null
  const region = poi && [poi.category, poi.ttTypeNameSuper, poi.ttTypeNameTiny].some((t) => typeof t === 'string' && REGION_TAG.test(t))
  const location = poi && !region
    ? { name: text(poi.name, 200), address: text(poi.address, 300), city: text(poi.city, 80), type: text(poi.ttTypeNameMedium || poi.ttTypeNameTiny, 80) }
    : null
  const area = poi && region ? [text(poi.name, 120), text(poi.address, 200)].filter(Boolean).join(', ') : ''
  // A photo post has a title of its own ("LIST QUÁN ĂN TẠI BÌNH DƯƠNG"); the venues
  // are often only written on the photos. TikTok's suggested searches for the
  // post ("chicken talk bình dương") then hint at them — hints, not answers.
  const photoTitle = text(item.imagePost?.title, 300)
  const hints = Array.isArray(item.suggestedWords) ? item.suggestedWords.map((w) => text(w, 80)).filter(Boolean).slice(0, 8) : []
  // Pictures whose text can name the venue: a photo post's photos, else the video's cover.
  const photos = (Array.isArray(item.imagePost?.images) ? item.imagePost.images : [])
    .map((img) => { const list = img?.imageURL?.urlList ?? []; return list.find((u) => /\.jpe?g|format=jpe?g/i.test(u)) ?? list[0] })
  const images = [...photos, item.video?.originCover || item.video?.cover].filter((u) => tiktokImage(u)).slice(0, 6)
  return {
    caption: [photoTitle, text(item.desc, 2200)].filter(Boolean).join('\n'), author: text(item.author?.nickname || item.author?.uniqueId, 120),
    authorId: text(item.author?.uniqueId, 80), id: text(item.id, 40), commentCount: Number(item.stats?.commentCount) || 0,
    location, area, subtitleUrl: subtitleUrl(item.video?.subtitleInfos), hints, isPhoto: Boolean(item.imagePost), images,
  }
}

const TIKTOK_HOST = /(?:^|\.)(?:tiktok\.com|tiktokcdn\.com|tiktokcdn-us\.com|ttwstatic\.com)$/
/** An https image on TikTok's own hosts (the only pictures fetched for reading). */
function tiktokImage(u) {
  try { const url = new URL(u); return url.protocol === 'https:' && TIKTOK_HOST.test(url.hostname) } catch { return false }
}

/** The text Cloud Vision read on each picture, one block per picture, or ''. */
export function visionText(json) {
  const blocks = (Array.isArray(json?.responses) ? json.responses : [])
    .map((r) => text(r?.fullTextAnnotation?.text ?? r?.textAnnotations?.[0]?.description, 1500))
    .filter(Boolean)
  return blocks.join('\n\n').slice(0, 4000)
}

/** The automatic subtitles link, Vietnamese first; only TikTok's own hosts. */
function subtitleUrl(infos) {
  if (!Array.isArray(infos)) return null
  const pick = infos.find((s) => /^vi/i.test(s?.LanguageCodeName ?? '')) ?? infos[0]
  try {
    const url = new URL(pick?.Url)
    return url.protocol === 'https:' && TIKTOK_HOST.test(url.hostname) ? url.toString() : null
  } catch { return null }
}

/** TikTok's public comment list for a post (the first page, with reply previews). */
export const tiktokCommentsUrl = (id) => `https://www.tiktok.com/api/comment/list/?aweme_id=${encodeURIComponent(id)}&count=50&cursor=0&aid=1988`

// A comment asking where the venue is, or which one it is.
const ASKS = /địa chỉ|đ\/c|ở đâu|chỗ nào|quán gì|tên quán|tên gì|location|address|xin (?:đc|dc|địa)|cho xin|chi nhánh/iu

/**
 * The comments that can say where the venue is, from a comment-list answer:
 * the creator's own (and pinned) comments, replies to "xin địa chỉ / quán gì"
 * (`answer: true` — "Dạ. Lai thieu 97. Phường Lái Thiêu"). Other viewers' comments
 * are left out: they name other places ("Quán Bò Sốt Cay 99 cũng ngon") or
 * advertise their own ("ghé bên em số 2 Huỳnh Thúc Kháng").
 */
export function parseComments(json, author) {
  const list = Array.isArray(json?.comments) ? json.comments : []
  const out = []
  for (const c of list.slice(0, 50)) {
    const body = text(c?.text, 300)
    if (!body) continue
    const mine = c?.user?.unique_id && c.user.unique_id === author
    if (mine || c?.stick_position || c?.author_pin) out.push({ text: body, answer: false, by: 'creator' })
    if (ASKS.test(body)) {
      for (const r of Array.isArray(c?.reply_comment) ? c.reply_comment : []) {
        const reply = text(r?.text, 300)
        if (reply) out.push({ text: reply, answer: true, by: r?.user?.unique_id === author ? 'creator' : 'viewer' })
      }
    }
  }
  return out.slice(0, 20)
}

/** The spoken words of a WebVTT file, without timings. */
export function vttText(vtt) {
  return String(vtt).split(/\r?\n/).filter((l) => l.trim() && !/-->|^WEBVTT|^NOTE|^\d+$/.test(l.trim())).join(' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 6000)
}

// YouTube answers servers (Supabase's included) with 403 / a "sorry" page for
// both the watch page and the player endpoint, so the description comes from
// the Data API (videos.list, 1 quota unit), and only with YOUTUBE_API_KEY.
export const YOUTUBE_VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos'

/** The description from a videos.list answer, or ''. */
export function parseYoutubeVideos(json) {
  return text(json?.items?.[0]?.snippet?.description, 3000)
}
