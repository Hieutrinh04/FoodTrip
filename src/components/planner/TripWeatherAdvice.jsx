import { useEffect, useMemo, useState } from 'react'
import { ArrowSquareOut, CalendarBlank, CloudRain, Info, ShieldWarning, Sun, Warning, Wind } from '@phosphor-icons/react'
import { fetchTripWeather, seasonalTravelRisk, summarizeTripWeather, weatherKind } from '../../lib/tripWeather.js'

const C = {
  vi: {
    title: 'Thời tiết trong chuyến đi',
    loading: 'Đang lấy dự báo mới nhất…',
    unavailable: 'Chưa lấy được dự báo lúc này. Bạn vẫn có thể xem khuyến nghị theo mùa bên dưới.',
    tooFar: 'Ngày đi còn ngoài phạm vi dự báo 16 ngày. FoodTrip chỉ đánh giá theo mùa và sẽ có dự báo chính xác hơn khi gần ngày khởi hành.',
    noLocation: 'Chưa xác định được tâm điểm đến để lấy dự báo.',
    stormHigh: 'Chuyến đi rơi vào giai đoạn cao điểm mùa bão của khu vực.',
    stormMedium: 'Thời gian này nằm trong mùa có thể xuất hiện bão hoặc áp thấp nhiệt đới.',
    noStormSeason: 'Không nằm trong mùa bão điển hình của khu vực.',
    stormDisclaimer: 'Đây là đánh giá rủi ro theo mùa, không khẳng định sẽ có bão vào ngày đi.',
    rainSeason: 'Đang trong mùa mưa', drySeason: 'Ngoài mùa mưa chính',
    forecastGood: 'Thời tiết nhìn chung thuận lợi cho lịch trình.',
    forecastRain: (n, total) => `Có khả năng mưa trong ${n}/${total} ngày có dự báo.`,
    forecastSevere: (n) => `${n} ngày có dấu hiệu mưa dông, mưa lớn hoặc gió giật mạnh.`,
    partial: (n, total) => `Hiện mới có dự báo cho ${n}/${total} ngày của chuyến đi.`,
    adviceTitle: 'Gợi ý cho bạn',
    severeAdvice: 'Ưu tiên lịch trình linh hoạt, chuẩn bị điểm tham quan trong nhà và tránh hoạt động biển khi có cảnh báo gió mạnh.',
    rainAdvice: 'Mang áo mưa gọn nhẹ, giày chống trượt và chừa thêm thời gian di chuyển.',
    sunAdvice: 'Chuẩn bị nước uống, kem chống nắng và tránh hoạt động ngoài trời giữa trưa.',
    stormAdvice: 'Nên chọn phòng/vé có thể hoàn huỷ và kiểm tra bản tin chính thức trước ngày đi 3–5 ngày.',
    refreshAdvice: 'Hãy mở lại lịch trình khi còn dưới 16 ngày để nhận dự báo từng ngày.',
    source: 'Dữ liệu dự báo: Open-Meteo', official: 'Kiểm tra cảnh báo bão chính thức',
    rainChance: (n) => `${Math.round(n)}% mưa`, gust: (n) => `Gió giật ${Math.round(n)} km/h`,
    sunny: 'Nắng', partlyCloudy: 'Ít mây', cloudy: 'Nhiều mây', rain: 'Mưa', storm: 'Mưa dông',
  },
  en: {
    title: 'Weather during your trip', loading: 'Fetching the latest forecast…',
    unavailable: 'The forecast is unavailable right now. Seasonal guidance is still shown below.',
    tooFar: 'The trip is beyond the 16-day forecast window. FoodTrip is showing seasonal risk only and can provide a more precise forecast closer to departure.',
    noLocation: 'The destination centre could not be located for a forecast.',
    stormHigh: 'Your trip falls in this region’s peak tropical-storm season.',
    stormMedium: 'These dates fall in a season when tropical storms may occur.',
    noStormSeason: 'These dates are outside the region’s typical tropical-storm season.',
    stormDisclaimer: 'This is seasonal risk guidance and does not mean a storm will occur on your dates.',
    rainSeason: 'Rainy season', drySeason: 'Outside the main rainy season',
    forecastGood: 'The forecast generally looks suitable for the itinerary.',
    forecastRain: (n, total) => `Rain is possible on ${n} of ${total} forecast days.`,
    forecastSevere: (n) => `${n} day(s) show thunderstorms, heavy rain or strong gusts.`,
    partial: (n, total) => `A forecast is currently available for ${n} of ${total} trip days.`,
    adviceTitle: 'Suggestions',
    severeAdvice: 'Keep the plan flexible, prepare indoor alternatives and avoid sea activities when strong-wind warnings are active.',
    rainAdvice: 'Pack a light raincoat and non-slip shoes, and allow extra travel time.',
    sunAdvice: 'Bring water and sunscreen, and avoid long outdoor activities around midday.',
    stormAdvice: 'Choose refundable bookings and check official warnings 3–5 days before departure.',
    refreshAdvice: 'Open the itinerary again within 16 days of departure for a daily forecast.',
    source: 'Forecast data: Open-Meteo', official: 'Check official storm warnings',
    rainChance: (n) => `${Math.round(n)}% rain`, gust: (n) => `Gusts ${Math.round(n)} km/h`,
    sunny: 'Sunny', partlyCloudy: 'Partly cloudy', cloudy: 'Cloudy', rain: 'Rain', storm: 'Thunderstorms',
  },
}

const WEATHER_EMOJI = { sunny: '☀️', partlyCloudy: '🌤️', cloudy: '☁️', rain: '🌧️', storm: '⛈️' }

export default function TripWeatherAdvice({ cityId, location, startDate, duration, lang = 'vi' }) {
  const c = C[lang]
  const [status, setStatus] = useState('loading')
  const [forecast, setForecast] = useState({ kind: 'seasonal', days: [] })
  const seasonal = useMemo(
    () => seasonalTravelRisk({ cityId, location, startDate, duration }),
    [cityId, duration, location, startDate],
  )

  useEffect(() => {
    if (!location || !startDate) {
      setStatus('no-location')
      return
    }
    setForecast({ kind: 'seasonal', days: [] })
    setStatus('loading')
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      fetchTripWeather({ location, startDate, duration, signal: controller.signal })
        .then((result) => {
          setForecast(result)
          setStatus(result.kind === 'forecast' ? 'ready' : 'seasonal')
        })
        .catch((error) => {
          if (error.name !== 'AbortError') setStatus('error')
        })
    }, 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [duration, location, startDate])

  const summary = summarizeTripWeather(forecast.days)
  const advice = []
  if (seasonal.inStormSeason) advice.push(c.stormAdvice)
  if (summary.severeDays) advice.push(c.severeAdvice)
  else if (summary.rainyDays) advice.push(c.rainAdvice)
  else if (summary.sunnyDays) advice.push(c.sunAdvice)
  if (status === 'seasonal' || (status === 'ready' && forecast.days.length < duration)) advice.push(c.refreshAdvice)

  const stormText = seasonal.inPeakStormSeason ? c.stormHigh : seasonal.inStormSeason ? c.stormMedium : c.noStormSeason
  const stormClass = seasonal.inPeakStormSeason ? 'border-chili/40 bg-chili/5 text-chili' : seasonal.inStormSeason ? 'border-lantern/40 bg-lantern/5 text-lantern' : 'border-herb/30 bg-herb/5 text-herb'

  return (
    <section className="rounded-2xl border border-line-strong bg-surface p-4 shadow-soft sm:p-5" aria-live="polite">
      <div className="mb-4 flex items-center gap-2">
        <CloudRain size={20} className="text-chili" />
        <h3 className="font-bold">{c.title}</h3>
      </div>

      {status === 'loading' && <p className="flex items-center gap-2 text-sm text-ink-muted"><span className="h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-chili" /> {c.loading}</p>}
      {status === 'error' && <p className="flex items-start gap-2 text-sm text-lantern"><Warning size={16} className="mt-0.5 shrink-0" /> {c.unavailable}</p>}
      {status === 'seasonal' && <p className="flex items-start gap-2 text-sm text-ink-muted"><CalendarBlank size={16} className="mt-0.5 shrink-0" /> {c.tooFar}</p>}
      {status === 'no-location' && <p className="text-sm text-ink-muted">{c.noLocation}</p>}

      {forecast.days.length > 0 && (
        <>
          <div className="no-scrollbar -mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-2">
            {forecast.days.map((day) => {
              const kind = weatherKind(day.weatherCode)
              return (
                <article key={day.date} className="w-[142px] shrink-0 rounded-xl border border-line bg-paper-2 p-3">
                  <div className="font-utility text-2xs font-bold uppercase tracking-wide text-ink-muted">{new Date(`${day.date}T12:00:00`).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', { weekday: 'short', day: '2-digit', month: '2-digit' })}</div>
                  <div className="mt-2 text-2xl" aria-hidden="true">{WEATHER_EMOJI[kind]}</div>
                  <div className="mt-1 text-sm font-semibold">{c[kind]}</div>
                  <div className="mt-1 font-utility text-xs tabular text-ink-muted">{Math.round(day.temperatureMin)}–{Math.round(day.temperatureMax)}°C</div>
                  {day.precipitationProbability != null && <div className="mt-1 text-xs text-ink-faint">{c.rainChance(day.precipitationProbability)}</div>}
                  {(day.windGustMax ?? 0) >= 35 && <div className="mt-1 flex items-center gap-1 text-2xs text-lantern"><Wind size={11} /> {c.gust(day.windGustMax)}</div>}
                </article>
              )
            })}
          </div>
          <div className="mt-3 flex items-start gap-2 text-sm text-ink-muted">
            {summary.severeDays ? <ShieldWarning size={17} className="mt-0.5 shrink-0 text-chili" /> : summary.rainyDays ? <CloudRain size={17} className="mt-0.5 shrink-0 text-lantern" /> : <Sun size={17} className="mt-0.5 shrink-0 text-herb" />}
            <span>{summary.severeDays ? c.forecastSevere(summary.severeDays) : summary.rainyDays ? c.forecastRain(summary.rainyDays, summary.totalDays) : c.forecastGood}</span>
          </div>
          {forecast.days.length < duration && <p className="mt-2 text-xs text-ink-faint">{c.partial(forecast.days.length, duration)}</p>}
        </>
      )}

      <div className={`mt-4 rounded-xl border px-3.5 py-3 ${stormClass}`}>
        <div className="flex items-start gap-2 text-sm font-semibold"><ShieldWarning size={17} className="mt-0.5 shrink-0" /> {stormText}</div>
        <p className="mt-1 pl-6 text-xs opacity-80">{seasonal.inRainSeason ? c.rainSeason : c.drySeason} · {c.stormDisclaimer}</p>
      </div>

      {advice.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-1.5 font-utility text-xs font-bold uppercase tracking-wide text-ink-muted"><Info size={14} /> {c.adviceTitle}</div>
          <ul className="space-y-1.5 pl-5 text-sm text-ink-muted">
            {advice.map((item) => <li key={item} className="list-disc">{item}</li>)}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-3 font-utility text-2xs font-semibold">
        <a href="https://open-meteo.com/en/docs" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink-muted hover:text-chili">{c.source} <ArrowSquareOut size={11} /></a>
        <a href="https://nchmf.gov.vn/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink-muted hover:text-chili">{c.official} <ArrowSquareOut size={11} /></a>
      </div>
    </section>
  )
}
