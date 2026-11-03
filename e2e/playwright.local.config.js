import { defineConfig } from '@playwright/test'
import { requireLocalSupabase } from '../scripts/e2e-safety.mjs'
requireLocalSupabase(process.env.VITE_SUPABASE_URL)
if (!process.env.VITE_SUPABASE_ANON_KEY) throw new Error('Chạy bằng npm run test:e2e để lấy thông tin local từ CLI.')
export default defineConfig({
  testDir: './local', workers: 1, retries: 0, timeout: 60000,
  outputDir: '../test-results/e2e-local',
  use: { baseURL: 'http://127.0.0.1:4182', headless: true, trace: 'retain-on-failure' },
  projects: [375, 1280].map((width) => ({ name: `${width}px`, use: { viewport: { width, height: 900 } } })),
  webServer: { command: 'npm run dev -- --mode e2e --host 127.0.0.1 --port 4182 --strictPort', url: 'http://127.0.0.1:4182', reuseExistingServer: false },
})
