const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const FORECAST_DAYS = 16
const CACHE_TTL_MS = 15 * 60 * 1000
const forecastCache = new Map()

const CITY_CENTRES = {
  hanoi: { lat: 21.0285, lng: 105.8542 },
  hoian: { lat: 15.8801, lng: 108.338 },
  danang: { lat: 16.0544, lng: 108.2022 },
  hcmc: { lat: 10.8231, lng: 106.6297 },
  dalat: { lat: 11.9404, lng: 108.4583 },
  hue: { lat: 16.4637, lng: 107.5909 },
  phuquoc: { lat: 10.2899, lng: 103.984 },
  nhatrang: { lat: 12.2388, lng: 109.1967 },
  ninhbinh: { lat: 20.2506, lng: 105.9745 },
  cantho: { lat: 10.0452, lng: 105.7469 },
  sapa: { lat: 22.3364, lng: 103.8438 },
  phanthiet: { lat: 10.9289, lng: 108.1021 },
}

const CITY_REGION = {
  hanoi: 'north', ninhbinh: 'north', sapa: 'north',
  hue: 'central', danang: 'central', hoian: 'central',
  nhatrang: 'southCentral', phanthiet: 'southCentral',
  hcmc: 'south', cantho: 'south', phuquoc: 'south', dalat: 'highlands',
}

const SEASON_BY_REGION = {
  north: { rain: [5, 6, 7, 8, 9, 10], storm: [6, 7, 8, 9, 10], peak: [7, 8, 9] },
  central: { rain: [9, 10, 11, 12], storm: [8, 9, 10, 11], peak: [9, 10, 11] },
  southCentral: { rain: [9, 10, 11, 12], storm: [9, 10, 11, 12], peak: [10, 11] },
  south: { rain: [5, 6, 7, 8, 9, 10, 11], storm: [10, 11, 12], peak: [11] },
  highlands: { rain: [5, 6, 7, 8, 9, 10], storm: [], peak: [] },
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) return null
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export function destinationWeatherLocation(cityId, places = []) {
  const located = places.filter((place) => Number.isFinite(place?.location?.lat) && Number.isFinite(place?.location?.lng))
  if (located.length) return {
    lat: median(located.map((place) => place.location.lat)),
    lng: median(located.map((place) => place.location.lng)),
  }
  return CITY_CENTRES[cityId] ?? null
}

function regionFor(cityId, location) {
  if (CITY_REGION[cityId]) return CITY_REGION[cityId]
  if (!location) return 'central'
  if (location.lat >= 18) return 'north'
  if (location.lat >= 12) return 'central'
  return 'south'
}

function monthNumbers(startDate, duration) {
  const start = new Date(`${startDate}T12:00:00`)
  if (Number.isNaN(start.getTime())) return []
  const months = new Set()
  for (let index = 0; index < duration; index += 1) {
    const date = new Date(start)
    date.setDate(date.getDate() + index)
    months.add(date.getMonth() + 1)
  }
  return [...months]
}

export function seasonalTravelRisk({ cityId, location, startDate, duration }) {
  const region = regionFor(cityId, location)
  const season = SEASON_BY_REGION[region]
  const months = monthNumbers(startDate, duration)
  const inRainSeason = months.some((month) => season.rain.includes(month))
  const inStormSeason = months.some((month) => season.storm.includes(month))
  const inPeakStormSeason = months.some((month) => season.peak.includes(month))
  return {
    region,
    inRainSeason,
    inStormSeason,
    inPeakStormSeason,
    level: inPeakStormSeason ? 'high' : inStormSeason || inRainSeason ? 'medium' : 'low',
  }
}

function localTodayIso() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateOffset(isoDate, amount) {
  const date = new Date(`${isoDate}T12:00:00`)
  date.setDate(date.getDate() + amount)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isWithinForecastWindow(startDate) {
  const today = localTodayIso()
  return startDate >= today && startDate <= dateOffset(today, FORECAST_DAYS - 1)
}

function dailyRows(daily) {
  return (daily?.time ?? []).map((date, index) => ({
    date,
    weatherCode: daily.weather_code?.[index] ?? null,
    temperatureMax: daily.temperature_2m_max?.[index] ?? null,
    temperatureMin: daily.temperature_2m_min?.[index] ?? null,
    precipitationProbability: daily.precipitation_probability_max?.[index] ?? null,
    precipitationSum: daily.precipitation_sum?.[index] ?? null,
    windGustMax: daily.wind_gusts_10m_max?.[index] ?? null,
  }))
}

export async function fetchTripWeather({ location, startDate, duration, signal }) {
  if (!location || !isWithinForecastWindow(startDate)) return { kind: 'seasonal', days: [] }
  const cacheKey = `${location.lat.toFixed(2)},${location.lng.toFixed(2)}`
  const cached = forecastCache.get(cacheKey)
  let rows
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    rows = cached.rows
  } else {
    const query = new URLSearchParams({
      latitude: String(location.lat),
      longitude: String(location.lng),
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_gusts_10m_max',
      timezone: 'Asia/Bangkok',
      forecast_days: String(FORECAST_DAYS),
    })
    const response = await fetch(`${FORECAST_URL}?${query}`, { signal })
    if (!response.ok) throw new Error(`weather-${response.status}`)
    const json = await response.json()
    rows = dailyRows(json.daily)
    forecastCache.set(cacheKey, { rows, createdAt: Date.now() })
  }
  const endDate = dateOffset(startDate, duration - 1)
  return { kind: 'forecast', days: rows.filter((day) => day.date >= startDate && day.date <= endDate) }
}

export function weatherKind(code) {
  if (code === 0) return 'sunny'
  if (code === 1 || code === 2) return 'partlyCloudy'
  if (code === 3 || code === 45 || code === 48) return 'cloudy'
  if (code >= 95) return 'storm'
  if ((code >= 51 && code <= 82)) return 'rain'
  return 'cloudy'
}

export function summarizeTripWeather(days) {
  const rainyDays = days.filter((day) => (day.precipitationProbability ?? 0) >= 50 || (day.precipitationSum ?? 0) >= 5)
  const severeDays = days.filter((day) => weatherKind(day.weatherCode) === 'storm' || (day.precipitationSum ?? 0) >= 20 || (day.windGustMax ?? 0) >= 50)
  const sunnyDays = days.filter((day) => ['sunny', 'partlyCloudy'].includes(weatherKind(day.weatherCode)) && (day.precipitationProbability ?? 0) < 35)
  return { rainyDays: rainyDays.length, severeDays: severeDays.length, sunnyDays: sunnyDays.length, totalDays: days.length }
}
