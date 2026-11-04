// Never loads an env file. Only the CLI's local status supplies runtime credentials.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { requireLocalSupabase } from './e2e-safety.mjs'

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, ...options })
  if (result.error || result.status !== 0) throw new Error(`E2E local dừng: ${command} ${args[0]} không chạy được. Cần Docker Linux engine và Supabase CLI local; không dùng project thật.`)
  return result.stdout
}
try {
  requireLocalSupabase(process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321')
  if (run('docker', ['info', '--format', '{{.OSType}}']).trim() !== 'linux') throw new Error('E2E local dừng: cần Docker Linux engine.')
  run('supabase', ['start'])
  run('supabase', ['migration', 'up', '--local'])
  const status = JSON.parse(run('supabase', ['status', '-o', 'json']))
  const backend = requireLocalSupabase(status.API_URL)
  // Seed only the explicitly named local Docker container, never a remote DB URL.
  const roomId = randomUUID(), departureId = randomUUID()
  run('docker', ['exec', '-i', 'supabase_db_Tripfood', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-v', `e2e_room_id=${roomId}`, '-v', `e2e_departure_id=${departureId}`], { input: readFileSync('e2e/seed.sql', 'utf8') })
  const result = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config=e2e/playwright.local.config.js'], {
    stdio: 'inherit', windowsHide: true,
    env: { ...process.env, VITE_SUPABASE_URL: backend, VITE_SUPABASE_ANON_KEY: status.ANON_KEY, E2E_ROOM_ID: roomId, E2E_DEPARTURE_ID: departureId },
  })
  process.exitCode = result.status ?? 1
} catch (error) {
  console.error(error.message.startsWith('E2E') ? error.message : 'E2E local dừng: không đọc được trạng thái CLI local. Không in dữ liệu cấu hình.')
  process.exitCode = 1
}
