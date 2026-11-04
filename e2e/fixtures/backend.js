import process from 'node:process'
import { expect } from '@playwright/test'
import { ruleIntent } from '../../supabase/functions/_shared/assistant/rules.js'
import { composeReply } from '../../supabase/functions/_shared/assistant/reply.js'
import { user, property, place, session, tripId } from './data.js'
import { requireLocalSupabase } from '../../scripts/e2e-safety.mjs'

export async function mockBackend(page, { role = 'guest', lang = 'vi', theme = 'light', events = [], cityCounts = null, placeFacts = null } = {}) {
  const backend = requireLocalSupabase(process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54329')
  const writes = [], requests = [], blocked = [], errors = []
  let savedTrip = null
  await page.context().addInitScript(({ role, lang, theme, session }) => {
    localStorage.setItem('foodtrip-lang', lang)
    localStorage.setItem('foodtrip-theme', theme)
    if (role !== 'guest') localStorage.setItem('sb-127-auth-token', JSON.stringify(session))
  }, { role, lang, theme, session: session() })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.context().route('**/*', async (route) => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin === 'http://127.0.0.1:4181') return route.continue()
    if (url.origin !== backend) { blocked.push(url.hostname); return route.abort('blockedbyclient') }
    const body = request.postDataJSON?.() ?? null
    requests.push({ path: url.pathname, method: request.method(), body })
    const json = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data), headers: { 'access-control-allow-origin': '*' } })
    const fn = url.pathname.split('/functions/v1/')[1]
    if (fn) {
      if (fn === 'assistant' && body?.message) {
        const reading = ruleIntent(body.message)
        return json({ ...composeReply(body.message, reading, lang), ...reading, slots: [], id: null, answeredBy: 'fixture' })
      }
      if (/oembed/.test(fn)) return json({ title: 'Phở kiểm thử Hà Nội', area: 'Hà Nội', hints: [] })
      if (fn === 'detect-place' || fn === 'verify-place') return json({ places: [place], catalogueSaved: false })
      if (fn === 'place-details') return json({ status: 'ok', place: { ...place, mapsUrl: 'https://example.test/maps', hours: [] } })
      if (fn === 'map-place-search') return json({ status: 'ok', places: [place] })
      return json({ status: 'no-key', places: [] })
    }
    if (url.pathname.includes('/auth/')) return json(user)
    if (url.pathname.endsWith('/rpc/is_admin')) return json(false)
    if (url.pathname.endsWith('/rpc/is_food_event_partner')) return json(role === 'owner')
    if (url.pathname.endsWith('/rpc/place_public_facts')) return placeFacts ? json(placeFacts) : route.fulfill({ status: 404, contentType: 'application/json', body: '{"code":"PGRST202"}', headers: { 'access-control-allow-origin': '*' } })
    if (url.pathname.endsWith('/rpc/submit_place_review')) { writes.push({ path: url.pathname, body }); return json(null) }
    if (url.pathname.endsWith('/rpc/place_city_counts')) return cityCounts ? json(cityCounts) : route.fulfill({ status: 404, contentType: 'application/json', body: '{"code":"PGRST202"}', headers: { 'access-control-allow-origin': '*' } })
    if (url.pathname.endsWith('/food_events')) {
      if (request.method() === 'POST') { writes.push({ path: url.pathname, body }); return json({ id: '00000000-0000-4000-8000-0000000000ee' }) }
      const id = url.searchParams.get('id')?.replace(/^eq\./, '')
      const city = url.searchParams.get('city_id')?.replace(/^eq\./, '')
      if (url.searchParams.get('created_by')) return json([])
      const rows = events.filter((e) => (!id || e.id === id) && (!city || e.city_id === city))
      return id ? json(rows[0] ?? null) : json(rows)
    }
    if (url.pathname.endsWith('/property_managers')) return json(role === 'staff' ? [{ role: 'staff', property, user_id: user.id }] : [])
    if (url.pathname.endsWith('/rpc/property_team')) throw new Error('Staff UI must never request team emails')
    if (url.pathname.endsWith('/rpc/shared_itinerary')) return json(savedTrip?.is_public ? { ...savedTrip, user_id: undefined } : null)
    if (url.pathname.endsWith('/itineraries')) {
      if (request.method() === 'POST') { savedTrip = { ...body, id: tripId }; writes.push({ path: url.pathname, body }); return json({ id: tripId }) }
      if (request.method() === 'PATCH') { savedTrip = { ...savedTrip, ...body }; writes.push({ path: url.pathname, body }); return json({ id: tripId }) }
      return json(savedTrip ? [savedTrip] : [])
    }
    if (url.pathname.endsWith('/contact_messages') && request.method() === 'POST') { writes.push({ path: url.pathname, body }); return json(null) }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && !url.pathname.includes('/rpc/')) throw new Error(`Unplanned write blocked: ${url.pathname}`)
    return json([])
  })
  return { writes, requests, blocked, errors, assertNoErrors: () => expect(errors).toEqual([]) }
}
