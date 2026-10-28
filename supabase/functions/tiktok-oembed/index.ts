import { jsonResponse, handleOptions } from '../_shared/cors.ts'
import { parseVideoUrl } from '../_shared/videoUrl.js'
import { parseTikTokPage, pageHeaders, vttText, parseComments, tiktokCommentsUrl } from '../_shared/videoPage.js'
import { screenText } from '../_shared/screenText.ts'

// oEmbed gives the player; the video page gives the caption (oEmbed no longer
// carries it), TikTok's location tag — the venue itself when the creator tagged
// one, else the city to search in — and the automatic subtitles, where reviewers
// often say the venue's name. Either of oEmbed / page alone is still an answer.
Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  const url = new URL(req.url).searchParams.get('url')
  if (!url) return jsonResponse({ error: 'missing-url' }, { status: 400 })
  const parsed = parseVideoUrl(url)
  if (parsed?.platform !== 'tiktok') return jsonResponse({ error: 'invalid-url' }, { status: 400 })

  const [oembed, page] = await Promise.all([
    fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(parsed.url)}`, {
      signal: AbortSignal.timeout(10000),
      headers: { 'user-agent': 'Mozilla/5.0 (FoodTrip video-share feature)' },
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    // Short links (vm.tiktok.com) redirect to the video page.
    fetch(parsed.url, { headers: pageHeaders, redirect: 'follow', signal: AbortSignal.timeout(8000) })
      .then((r) => (r.ok ? r.text() : '')).then(parseTikTokPage).catch(() => null),
  ])
  if (!oembed && !page) return jsonResponse({ error: 'oembed-failed' }, { status: 502 })
  // What the reviewer says ("quán có tên là …"): TikTok's automatic subtitles, a few KB;
  // and the comments that can say where it is (the creator's, answers to "xin địa chỉ").
  // …and the text written on its pictures (photos of a photo post, the cover), when Cloud Vision is on.
  const [transcript, comments, onScreen] = await Promise.all([
    page?.subtitleUrl
      ? fetch(page.subtitleUrl, { headers: { ...pageHeaders, referer: 'https://www.tiktok.com/' }, signal: AbortSignal.timeout(5000) })
        .then((r) => (r.ok ? r.text() : '')).then(vttText).catch(() => '')
      : '',
    page?.id && page.commentCount
      ? fetch(tiktokCommentsUrl(page.id), { headers: { ...pageHeaders, referer: parsed.url }, signal: AbortSignal.timeout(5000) })
        .then((r) => (r.ok ? r.json() : null)).then((json) => parseComments(json, page.authorId)).catch(() => [])
      : [],
    page?.images?.length ? screenText(page.images) : '',
  ])
  return jsonResponse({
    ...(oembed ?? {}),
    title: oembed?.title?.trim() || page?.caption || '',
    author_name: oembed?.author_name || page?.author || '',
    location: page?.location ?? null,
    area: page?.area ?? '',
    hints: page?.hints ?? [],
    isPhoto: page?.isPhoto ?? false,
    transcript,
    comments,
    screenText: onScreen,
    authorId: page?.authorId ?? '',
  })
})
