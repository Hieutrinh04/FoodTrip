import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { requireLocalSupabase } from './scripts/e2e-safety.mjs'

export default defineConfig(({ mode }) => ({
  ...(mode === 'e2e' ? {
    // Never load .env/.env.local, even when a developer's default points at production.
    envDir: false,
    // Fixture/report writes during a run must not reload a page mid-conversation.
    server: { hmr: false, watch: null },
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(requireLocalSupabase(process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54329')),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_e2e_mock_only'),
      'import.meta.env.VITE_TRACK_ASIA_API_KEY': JSON.stringify(''),
      'import.meta.env.VITE_TRACK_ASIA_API_KEY_BACKUP': JSON.stringify(''),
      'import.meta.env.VITE_GOOGLE_MAPS_EMBED_KEY': JSON.stringify(''),
    },
  } : {}),
  plugins: [react(), tailwindcss()],
  // MapLibre's worker is an ES module and the library spawns it with
  // `{ type: 'module' }`, so Vite must emit it as ESM rather than the default
  // IIFE — see src/lib/maplibreSetup.js.
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
  // Libraries every page loads get chunks of their own: a deploy that only
  // changes the app leaves these files, and the browser's copies, untouched.
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
            { name: 'supabase', test: /node_modules[\\/](@supabase|iceberg-js)[\\/]/ },
            { name: 'motion', test: /node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/ },
          ],
        },
      },
    },
  },
}))
