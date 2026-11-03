import { defineConfig } from '@playwright/test'
import { requireLocalSupabase } from '../scripts/e2e-safety.mjs'

export const backend = requireLocalSupabase(process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54329')
export default defineConfig({
  testDir: './ui', timeout: 60000, expect: { timeout: 15000 }, workers: 1, retries: 0,
  outputDir: '../test-results/e2e-ui', reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4181', headless: true, reducedMotion: 'reduce', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [375, 1280].map((width) => ({ name: `${width}px`, use: { viewport: { width, height: 900 } } })),
  webServer: {
    command: 'npm run dev -- --mode e2e --host 127.0.0.1 --port 4181 --strictPort',
    url: 'http://127.0.0.1:4181', reuseExistingServer: false, timeout: 90000,
    env: { VITE_SUPABASE_URL: backend, VITE_SUPABASE_ANON_KEY: 'sb_publishable_e2e_mock_only' },
  },
})
