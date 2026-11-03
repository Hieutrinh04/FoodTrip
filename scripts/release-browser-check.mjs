// Isolated UI checks: no .env files, real accounts, API credits or DB writes.
import { chromium } from '@playwright/test'
import { createServer } from 'vite'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const origin = 'http://127.0.0.1:4180'
const backend = 'http://127.0.0.1:54329'
assert.equal(new URL(backend).hostname, '127.0.0.1')
const out = 'docs/screenshots/release-readiness'
await mkdir(out, { recursive: true })
const server = await createServer({ envDir: false, mode: 'release-check', server: { host: '127.0.0.1', port: 4180, strictPort: true, hmr: false }, define: {
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(backend),
  'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('sb_publishable_release_mock_only'),
  'import.meta.env.VITE_TRACK_ASIA_API_KEY': JSON.stringify('mock-only'),
  'import.meta.env.VITE_TRACK_ASIA_API_KEY_BACKUP': JSON.stringify(''),
  'import.meta.env.VITE_GOOGLE_MAPS_EMBED_KEY': JSON.stringify(''),
} })
await server.listen()
const browser = await chromium.launch({ headless: true })
const report = { pages: [], scenarios: [], errors: [], mockedFunctions: [], blockedExternal: [], smallControls: [], keyboard: {} }
let shareEmpty = false
const fixturePlace = { placeId: 'release-place', name: 'Fixture Cafe', address: 'Fixture street', location: { lat: 21.03, lng: 105.85 } }
const user = { id: '10000000-0000-0000-0000-000000000001', email: 'release@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} }
const property = { id: '10000000-0000-0000-0000-000000000002', name: 'Fixture Stay', active: true, inventory_enabled: true, hotel_place_id: 'fixture-hotel', address: 'Fixture street', city: 'Hanoi', property_type: 'hotel' }
const operator = { id: '10000000-0000-0000-0000-000000000003', name: 'Fixture Operator', status: 'approved', type: 'company', cities: ['Hà Nội'] }

async function mockContext({ width, lang = 'en', authenticated = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce', serviceWorkers: 'block' })
  context.setDefaultTimeout(20000)
  context.setDefaultNavigationTimeout(60000)
  await context.addInitScript(({ lang, authenticated, user }) => {
    localStorage.setItem('foodtrip-lang', lang)
    localStorage.setItem('foodtrip-theme', 'dark')
    if (authenticated) {
      const payload = btoa(JSON.stringify({ sub: user.id, role: 'authenticated', exp: 4102444800 }))
      localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: `e30.${payload}.mock`, refresh_token: 'mock-refresh', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user }))
    }
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: (_success, error) => error({ code: 1 }) } })
    const query = navigator.permissions.query.bind(navigator.permissions)
    navigator.permissions.query = (descriptor) => descriptor.name === 'geolocation' ? Promise.resolve({ state: 'denied' }) : query(descriptor)
  }, { lang, authenticated, user })
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === origin) return route.continue()
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' } })
    if (url.origin === backend) {
      const fn = url.pathname.split('/functions/v1/')[1]
      if (fn) {
        report.mockedFunctions.push(fn)
        if (/oembed/.test(fn)) return json({ title: 'Fixture Cafe in Hanoi', hints: [], area: 'Hanoi' })
        if (fn === 'detect-place' || fn === 'verify-place') return json({ places: shareEmpty ? [] : [fixturePlace], catalogueSaved: false })
        if (fn.startsWith('map-place-search')) return json({ status: 'ok', places: [] })
        return json({ status: 'no-key', places: [] })
      }
      if (url.pathname.includes('/auth/')) return json({ user })
      if (url.pathname.endsWith('/rpc/is_admin')) return json(false)
      if (url.pathname.includes('property_managers')) return json([{ role: 'owner', property, user_id: user.id }])
      if (url.pathname.includes('tour_members')) return json([{ operator_id: operator.id, user_id: user.id, role: 'owner', operator }])
      if (url.pathname.endsWith('/tour_operators')) return json([operator])
      if (url.pathname.includes('/rpc/') && /readiness|statement|payout/.test(url.pathname)) return json({ items: [], settlements: [], checks: [], ready: false })
      return json([])
    }
    if (url.hostname === 'maps.track-asia.com' && url.pathname.endsWith('streets.json')) return json({ version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#d9e5df' } }] })
    report.blockedExternal.push(url.hostname)
    return route.abort('blockedbyclient')
  })
  return context
}

try {
  for (const width of [375, 1280]) for (const lang of ['vi', 'en']) {
    const context = await mockContext({ width, lang })
    const page = await context.newPage()
    page.on('pageerror', (error) => report.errors.push(error.message))
    for (const path of ['/', '/explore', '/plan', '/nearby', '/share', '/community', '/privacy', '/hop-tac']) {
      await page.goto(origin + path)
      await page.locator('h1').first().waitFor()
      await page.evaluate(() => document.fonts.ready)
      const result = await page.evaluate(() => ({ text: document.querySelector('main')?.innerText, overflow: document.documentElement.scrollWidth > innerWidth, theme: getComputedStyle(document.body).backgroundColor }))
      report.pages.push({ path, width, lang, ...result })
      await writeFile(`${out}/results.json`, JSON.stringify(report, null, 2))
      await page.screenshot({ path: `${out}/${path.slice(1) || 'home'}-${lang}-${width}.png` })
      if (path === '/explore' && lang === 'en' && width === 375) report.smallControls = await page.evaluate(() => [...document.querySelectorAll('a[href],button,input,select,[role="button"]')].filter((e) => {
        const r = e.getBoundingClientRect(), s = getComputedStyle(e)
        const x = Math.max(0, Math.min(innerWidth - 1, r.left + r.width / 2)), y = Math.max(0, Math.min(innerHeight - 1, r.top + r.height / 2))
        return !e.disabled && r.width && r.height && s.visibility === 'visible' && s.display !== 'none' && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && (r.width < 32 || r.height < 32) && e.contains(document.elementFromPoint(x, y))
      }).map((e) => ({ label: e.getAttribute('aria-label') || e.innerText || e.tagName, width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height })))
    }
    if (lang === 'en') {
      const scenarioContext = await mockContext({ width, authenticated: true })
      const scenarioPage = await scenarioContext.newPage()
      await scenarioPage.goto(origin + '/share')
      const input = scenarioPage.locator('input').filter({ hasNot: scenarioPage.locator('[type=email]') }).first()
      const analyze = scenarioPage.getByRole('button', { name: 'Find places from video', exact: true })
      // Names below are verified against rendered labels; failures remain failures.
      report.scenarios.push({ width, shareButtons: await scenarioPage.locator('main button').allTextContents() })
      await input.fill('invalid-link')
      await analyze.click()
      report.scenarios.push({ width, type: 'invalid-link', text: await scenarioPage.locator('main').innerText() })
      await input.fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
      await analyze.click()
      await scenarioPage.getByText('Fixture Cafe', { exact: true }).first().waitFor()
      report.scenarios.push({ width, type: 'valid-link', text: await scenarioPage.locator('main').innerText() })
      shareEmpty = true
      await analyze.click()
      await scenarioPage.getByText(/No suitable place found/).waitFor()
      report.scenarios.push({ width, type: 'no-place', text: await scenarioPage.locator('main').innerText() })
      shareEmpty = false
      await scenarioPage.goto(origin + '/nearby')
      await scenarioPage.getByRole('button', { name: 'Locate me & suggest', exact: true }).click()
      await scenarioPage.getByText(/Location is blocked/).waitFor()
      report.scenarios.push({ width, type: 'location-denied', text: await scenarioPage.locator('main').innerText() })
      await scenarioPage.getByPlaceholder('e.g. breakfast spots in thu dau mot').fill('fixture food in Hanoi')
      await scenarioPage.getByRole('button', { name: 'Find places', exact: true }).click()
      await scenarioPage.getByText(/Nothing found for/).waitFor()
      report.scenarios.push({ width, type: 'nearby-empty', text: await scenarioPage.locator('main').innerText() })
      // Reload creates a clean idle wheel; no real GPS permission is requested.
      await scenarioPage.reload()
      await scenarioPage.getByRole('button', { name: 'Spin now', exact: true }).click()
      await scenarioPage.getByRole('button', { name: 'Find nearby places for this', exact: true }).waitFor()
      report.scenarios.push({ width, type: 'wheel-pick', text: await scenarioPage.locator('main').innerText() })
      await scenarioContext.close()
      await page.goto(origin + '/')
      await page.getByRole('button', { name: 'FoodTrip assistant', exact: true }).click()
      await page.getByRole('dialog', { name: 'FoodTrip assistant' }).waitFor()
      await page.keyboard.press('Escape')
      report.keyboard[`chat-${width}`] = await page.evaluate(() => ({ active: document.activeElement?.getAttribute('aria-label'), dialog: Boolean(document.querySelector('[role=dialog]')) }))
      const login = page.getByRole('banner').getByRole('button', { name: 'Log in', exact: true })
      if (width === 375) await page.getByRole('button', { name: 'Open menu', exact: true }).click()
      await login.click()
      await page.locator('.ft-auth-dialog').waitFor()
      await page.keyboard.press('Escape')
      report.keyboard[`auth-${width}`] = await page.evaluate(() => ({ active: document.activeElement?.innerText, dialog: Boolean(document.querySelector('.ft-auth-dialog')) }))
    }
    await context.close()
  }
  const context = await mockContext({ width: 1280, authenticated: true })
  const page = await context.newPage()
  for (const path of ['/partner', '/partner/tours']) {
    await page.goto(origin + path)
    await page.locator('h1').first().waitFor()
    await page.waitForTimeout(1000)
    report.pages.push({ path, lang: 'en', width: 1280, text: await page.locator('main').innerText() })
    await page.screenshot({ path: `${out}/${path.replaceAll('/', '-')}-en-1280.png` })
  }
  await context.close()
} catch (error) {
  report.failure = error.stack
  for (const [i, context] of browser.contexts().entries()) for (const [j, page] of context.pages().entries()) {
    report.scenarios.push({ type: 'failure-state', text: await page.locator('body').innerText().catch(() => '') })
    await page.screenshot({ path: `${out}/failure-${i}-${j}.png` }).catch(() => {})
  }
  process.exitCode = 1
}
finally {
  await writeFile(`${out}/results.json`, JSON.stringify(report, null, 2))
  await browser.close()
  await server.close()
  console.log(JSON.stringify({ pages: report.pages.length, scenarios: report.scenarios.length, keyboard: report.keyboard, smallControls: report.smallControls, failure: report.failure, pageErrors: report.errors }))
}
