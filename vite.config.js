import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
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
})
