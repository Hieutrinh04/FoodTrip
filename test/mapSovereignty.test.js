import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { liteStyle, isSeaLabel } from '../src/lib/trackAsia.js'

// The sea-label layers as Track-Asia's style defines them (2026-11-03): their
// features name Biển Đông and Quần Đảo Hoàng Sa / Trường Sa (Việt Nam).
const seaFilter = ['all', ['match', ['get', 'class'], ['bay', 'ocean', 'sea', 'disputed_sea'], true, false], ['==', ['geometry-type'], 'Point']]
const style = () => ({
  sprite: 'https://example.test/sprite', glyphs: 'https://example.test/{fontstack}/{range}.pbf',
  layers: [
    { id: 'background', type: 'background' },
    { id: 'water', type: 'fill', 'source-layer': 'water' },
    { id: 'road', type: 'line', 'source-layer': 'road' },
    { id: 'poi-label', type: 'symbol', 'source-layer': 'poi_label', layout: { 'icon-image': 'x', 'text-field': ['get', 'name'] } },
    { id: 'place-city', type: 'symbol', 'source-layer': 'place_label', layout: { 'text-field': ['get', 'name'] } },
    { id: 'water-point-label', type: 'symbol', 'source-layer': 'natural_label', filter: seaFilter, layout: { 'text-field': ['coalesce', ['get', 'name_vi'], ['get', 'name']] } },
    { id: 'water-line-label', type: 'symbol', 'source-layer': 'natural_label', filter: seaFilter, layout: { 'text-field': ['coalesce', ['get', 'name_vi'], ['get', 'name']] } },
    { id: 'mountain', type: 'symbol', 'source-layer': 'natural_label', filter: ['==', ['get', 'class'], 'mountain'], layout: { 'text-field': ['get', 'name'] } },
  ],
})

test('the lightweight map keeps the sea and archipelago names, and their glyphs', () => {
  const lite = liteStyle(style())
  assert.deepEqual(lite.layers.map((l) => l.id), ['background', 'water', 'road', 'water-point-label', 'water-line-label'])
  assert.equal(lite.sprite, undefined)
  assert.ok(lite.glyphs)
  assert.equal(isSeaLabel(style().layers[3]), false)
})

test('every map in the app is built from loadMapStyle (the full style or liteStyle)', () => {
  const files = ['src/components/map', 'src/components/community'].flatMap((dir) => readdirSync(dir).map((f) => `${dir}/${f}`))
  const builders = files.filter((f) => /new MapLibreMap\(/.test(readFileSync(f, 'utf8')))
  assert.ok(builders.length >= 5)
  for (const f of builders) assert.match(readFileSync(f, 'utf8'), /loadMapStyle\(/, f)
})
