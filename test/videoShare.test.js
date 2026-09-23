import assert from 'node:assert/strict'
import test from 'node:test'
import { parseVideoUrl, reviewPayload, validLocation } from '../supabase/functions/_shared/videoUrl.js'
import { resolveEmbed } from '../src/lib/videoEmbed.js'

test('rejects lookalike domains, credentials, unsafe schemes and non-post URLs', () => {
  for (const url of ['https://evil-tiktok.com/@a/video/123', 'https://youtube.com.evil.test/watch?v=abcdefghijk', 'javascript:alert(1)', 'https://me:password@youtube.com/watch?v=abcdefghijk', 'https://youtube.com:444/watch?v=abcdefghijk', 'https://www.instagram.com/someone/', 'https://tiktok.com/@someone', 'https://facebook.com/someone']) {
    assert.equal(parseVideoUrl(url), null, url)
    assert.equal(resolveEmbed(url), null, url)
  }
})

test('video aliases and tracking parameters resolve to a stable identity', () => {
  const expected = { platform: 'youtube', url: 'https://www.youtube.com/watch?v=AbCdEf123_-' }
  for (const url of ['https://youtu.be/AbCdEf123_-?si=tracking', 'https://m.youtube.com/shorts/AbCdEf123_-', 'https://youtube.com/watch?v=AbCdEf123_-&utm_source=test#chapter']) assert.deepEqual(parseVideoUrl(url), expected)
  assert.equal(parseVideoUrl('https://www.tiktok.com/@food/video/123456?is_from_webapp=1').url, 'https://www.tiktok.com/@food/video/123456')
  assert.equal(parseVideoUrl('https://instagram.com/reels/ABC_123/?utm_source=x').url, 'https://www.instagram.com/reel/ABC_123/')
  assert.equal(parseVideoUrl('https://vm.tiktok.com/ABC/').platform, 'tiktok')
  assert.equal(parseVideoUrl('https://www.facebook.com/reel/123456?mibextid=tracking').url, 'https://www.facebook.com/reel/123456')
})

test('review payload requires ownership, a real name, and finite paired coordinates', () => {
  const entry = { videoUrl: 'https://youtu.be/AbCdEf123_-', placeName: ' Quán A ', address: ' Huế ', note: ' Món ngon ' }
  assert.throws(() => reviewPayload(entry, null), /auth-required/)
  assert.throws(() => reviewPayload({ ...entry, placeName: ' ' }, 'owner'), /invalid-details/)
  assert.throws(() => reviewPayload({ ...entry, note: 'x'.repeat(1001) }, 'owner'), /invalid-details/)
  for (const location of [{ lat: NaN, lng: 106 }, { lat: 91, lng: 106 }, { lat: 10, lng: Infinity }, { lat: '10', lng: 106 }]) {
    assert.equal(Boolean(validLocation(location)), false)
    assert.throws(() => reviewPayload({ ...entry, location }, 'owner'), /invalid-location/)
  }
  const payload = reviewPayload({ ...entry, googlePlaceId: 'unverified' }, 'owner')
  assert.equal(payload.user_id, 'owner')
  assert.equal(payload.place_name, 'Quán A')
  assert.equal(payload.note, 'Món ngon')
  assert.equal(payload.lat, null)
  assert.equal(payload.google_place_id, null)
  assert.equal('embed_html' in payload, false)
})
