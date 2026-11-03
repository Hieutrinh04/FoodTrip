import { readdir, readFile } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

const OPTIONAL_FRONTEND = new Set(['VITE_TRACK_ASIA_API_KEY', 'VITE_TRACK_ASIA_API_KEY_BACKUP', 'VITE_GOOGLE_MAPS_EMBED_KEY'])
const MARKERS = ['HOTELBEDS', 'SERPER', 'SERVICE_ROLE', 'ANTHROPIC', 'sk-ant']

export function frontendNames(sources) {
  const names = new Set()
  for (const source of sources) for (const match of source.matchAll(/(?:import\.meta\.env\??\.|\benv\.)(VITE_[A-Z0-9_]+)/g)) names.add(match[1])
  return [...names].sort()
}

export function checkEnvironment(names, env) {
  return names.map((name) => ({ name, present: typeof env[name] === 'string' && Boolean(env[name].trim()), required: !OPTIONAL_FRONTEND.has(name) }))
}

export function scanArtifact(path, contents) {
  // Never include a snippet, token value, or matched credential in the report.
  const buffer = Buffer.isBuffer(contents) ? contents : Buffer.from(contents)
  return MARKERS.filter((marker) => buffer.includes(Buffer.from(marker))).map((marker) => ({ path, marker }))
}

export function codeWarnings({ hotelbeds = '', vnpay = '', sepay = '' }) {
  return [
    ...(hotelbeds.includes('api.test.hotelbeds.com') ? ['Hotelbeds: code uses the test host; provider prices are not contracted bookable inventory.'] : []),
    ...(vnpay.includes('sandbox.vnpayment.vn') ? ['VNPay: code uses the sandbox endpoint; real selling requires a separately reviewed integration change.'] : []),
    ...(sepay.includes('sepay_mock_enabled') ? ['SePay: mock mode is controlled by private.settings in the DB; its live state was NOT queried. Verify mock is off before real selling.'] : []),
  ]
}

async function filesIn(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...await filesIn(path))
    else if (entry.isFile()) files.push(path)
    // Do not follow symlinks outside the artifact/source trees.
  }
  return files
}

export async function inspectPreflight(root, env = process.env) {
  const sources = await Promise.all((await filesIn(resolve(root, 'src'))).filter((path) => /\.[jt]sx?$/.test(path)).map((path) => readFile(path, 'utf8')))
  const environment = checkEnvironment(frontendNames(sources), env)
  const errors = environment.filter((item) => item.required && !item.present).map((item) => `Missing required frontend variable: ${item.name}`)
  const findings = []
  let artifacts = []
  try { artifacts = await filesIn(resolve(root, 'dist')) } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  if (!artifacts.length) errors.push('dist is missing or empty; build before preflight.')
  for (const path of artifacts) findings.push(...scanArtifact(relative(root, path).replaceAll('\\', '/'), await readFile(path)))
  if (findings.length) errors.push('Potential secret markers found in dist. Review privately; marker names can also be harmless text.')
  const [hotelbeds, vnpay, sepay] = await Promise.all(['_shared/hotelbeds.ts', '_shared/vnpay.ts', 'sepay-create-payment/index.ts'].map((path) => readFile(resolve(root, 'supabase/functions', path), 'utf8')))
  return { environment, artifactCount: artifacts.length, findings, warnings: codeWarnings({ hotelbeds, vnpay, sepay }), errors }
}

export function formatPreflight(report) {
  return [
    'Frontend configuration (process environment only; no .env files read):',
    ...report.environment.map(({ name, present, required }) => `${name}: ${present ? 'present / có' : 'missing / thiếu'} (${required ? 'required' : 'optional'})`),
    `Artifacts scanned: ${report.artifactCount}`,
    ...report.findings.map(({ path, marker }) => `REVIEW: ${path} — marker ${marker}`),
    ...report.warnings.map((warning) => `WARNING: ${warning}`),
    ...report.errors.map((error) => `ERROR: ${error}`),
    report.errors.length ? 'Preflight: NOT READY' : 'Preflight: static checks passed; operational warnings still require review.',
  ].join('\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const report = await inspectPreflight(resolve(import.meta.dirname, '..'))
    console.log(formatPreflight(report))
    process.exitCode = report.errors.length ? 1 : 0
  } catch {
    // Filesystem exceptions can contain arbitrary data; keep CLI output redacted.
    console.error('Preflight could not read the required source/artifact files. No credentials were printed.')
    process.exitCode = 1
  }
}
