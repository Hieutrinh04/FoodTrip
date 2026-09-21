import assert from 'node:assert/strict'
import test from 'node:test'
import { destinationWeatherLocation, seasonalTravelRisk, summarizeTripWeather, weatherKind } from '../src/lib/tripWeather.js'

test('weather location uses the median of real destination places', () => {
  assert.deepEqual(destinationWeatherLocation('hoian', [
    { location: { lat: 10, lng: 106 } },
    { location: { lat: 12, lng: 108 } },
    { location: { lat: 50, lng: 150 } },
  ]), { lat: 12, lng: 108 })
  assert.ok(destinationWeatherLocation('hanoi').lat > 20)
})

test('central Vietnam dates in October are clearly marked as peak storm season', () => {
  const risk = seasonalTravelRisk({ cityId: 'hoian', startDate: '2026-10-10', duration: 3 })
  assert.equal(risk.inStormSeason, true)
  assert.equal(risk.inPeakStormSeason, true)
  assert.equal(risk.level, 'high')
})

test('weather summary distinguishes fair days from hazardous rain and wind', () => {
  const summary = summarizeTripWeather([
    { weatherCode: 0, precipitationProbability: 10, precipitationSum: 0, windGustMax: 15 },
    { weatherCode: 95, precipitationProbability: 85, precipitationSum: 24, windGustMax: 55 },
  ])
  assert.deepEqual(summary, { rainyDays: 1, severeDays: 1, sunnyDays: 1, totalDays: 2 })
  assert.equal(weatherKind(95), 'storm')
})
