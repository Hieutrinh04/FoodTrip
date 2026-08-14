import { setWorkerUrl } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

// MapLibre v6 ships its render worker as a separate entry point and no longer
// resolves it under a bundler: `getWorkerUrl()` returns an empty string, no
// worker is spawned, and the map then hangs silently — a canvas and a WebGL
// context are created, but no `load`/`error` event ever fires, the style's
// tiles are never decoded, and nothing paints. Only DOM overlays (markers,
// controls, attribution) show up, over a blank background.
//
// `?worker&url` is what makes this correct in both modes: it hands the file to
// Vite's worker pipeline, so the worker's own `./maplibre-gl-shared.mjs` import
// is bundled in and a usable URL comes back. A plain `?url` import copies the
// file verbatim instead, leaving that import dangling and breaking the
// production build.
//
// Import this module once before constructing any Map.
setWorkerUrl(maplibreWorkerUrl)
