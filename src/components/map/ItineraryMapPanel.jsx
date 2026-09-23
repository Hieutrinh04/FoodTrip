import { useEffect, useState } from 'react'
import { ArrowsIn, ArrowsOut, Bed, CalendarBlank, Clock, Path } from '@phosphor-icons/react'
import LiveTripMap from './LiveTripMap.jsx'
import { haversineKm } from '../../lib/trackAsia.js'

const ROUTE_COLORS = ['#d8481f', '#2f7f70', '#7357a6', '#2776a8', '#b06a24', '#5c7853']

export default function ItineraryMapPanel({ days = [], hotels = [], transport, lang = 'vi' }) {
  const [activeDay, setActiveDay] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [routeMetrics, setRouteMetrics] = useState(null)
  const selectedHotel = hotels.find((hotel) => hotel.selected) ?? null
  const isOverview = activeDay === 0
  const selectedDay = isOverview ? null : days[activeDay - 1]

  const hotelStart = selectedHotel?.location
    ? {
        placeId: `hotel-${selectedHotel.id}`,
        kind: 'hotel',
        name: selectedHotel.name,
        address: selectedHotel.address,
        location: selectedHotel.location,
        time: lang === 'vi' ? 'Bắt đầu' : 'Start',
      }
    : null

  const dayStops = selectedDay?.map((stop, index) => ({ ...stop, displayIndex: index + 1 })) ?? []
  const mappedStops = isOverview
    ? [
        ...(hotelStart ? [hotelStart] : []),
        ...days.flatMap((day, dayIndex) => day.map((stop, stopIndex) => ({
          ...stop,
          displayIndex: stopIndex + 1,
          markerColor: ROUTE_COLORS[dayIndex % ROUTE_COLORS.length],
        }))),
      ]
    : [
        ...(hotelStart ? [hotelStart] : []),
        ...dayStops,
        ...(hotelStart ? [{ ...hotelStart, placeId: `${hotelStart.placeId}-return`, hideMarker: true }] : []),
      ]

  const overviewRoutes = isOverview
    ? days.map((day, index) => ({
        color: ROUTE_COLORS[index % ROUTE_COLORS.length],
        stops: [...(hotelStart ? [hotelStart] : []), ...day, ...(hotelStart ? [hotelStart] : [])],
      }))
    : []

  const estimatedDistanceKm = !isOverview
    ? mappedStops.slice(1).reduce((total, stop, index) => total + (haversineKm(mappedStops[index]?.location, stop.location) ?? 0), 0)
    : 0
  const speedKmH = { walk: 4.5, bike: 28, car: 32, taxi: 32 }[transport] ?? 28
  const hasRoadMetrics = routeMetrics?.distanceMeters != null && routeMetrics?.durationSeconds != null
  const distanceKm = hasRoadMetrics ? routeMetrics.distanceMeters / 1000 : estimatedDistanceKm
  const minutes = hasRoadMetrics
    ? Math.max(1, Math.round(routeMetrics.durationSeconds / 60))
    : Math.max(0, Math.round((estimatedDistanceKm / speedKmH) * 60))

  useEffect(() => {
    setRouteMetrics(null)
  }, [activeDay, transport])

  useEffect(() => {
    const resizeTimer = window.setTimeout(() => window.dispatchEvent(new Event('resize')), 50)
    if (!expanded) return () => window.clearTimeout(resizeTimer)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(resizeTimer)
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      window.setTimeout(() => window.dispatchEvent(new Event('resize')), 50)
    }
  }, [expanded])

  return (
    <section className={`${expanded ? 'fixed inset-3 z-[100] flex flex-col shadow-lifted sm:inset-6' : ''} overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-soft`}>
      <div className="flex flex-col gap-4 border-b border-line px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 font-bold text-base">
              {selectedHotel ? <Bed size={19} className="text-herb" weight="fill" /> : <CalendarBlank size={19} className="text-chili" />}
              {isOverview
                ? (lang === 'vi' ? 'Tổng quan chuyến đi' : 'Trip overview')
                : (lang === 'vi' ? `Tuyến đường ngày ${activeDay}` : `Day ${activeDay} route`)}
            </div>
            <p className="mt-1 text-sm text-ink-muted">
              {selectedHotel
                ? (lang === 'vi' ? `Khởi hành và quay về ${selectedHotel.name}.` : `Start and return to ${selectedHotel.name}.`)
                : (lang === 'vi' ? 'Tuyến đường được dựng từ vị trí thật của các điểm đã lưu.' : 'The route uses the saved stops’ real coordinates.')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-paper-2 text-ink-muted hover:text-chili"
            aria-label={expanded ? (lang === 'vi' ? 'Thu nhỏ bản đồ' : 'Exit full map') : (lang === 'vi' ? 'Mở rộng bản đồ' : 'Expand map')}
          >
            {expanded ? <ArrowsIn size={17} /> : <ArrowsOut size={17} />}
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label={lang === 'vi' ? 'Chọn ngày trên bản đồ' : 'Select map day'}>
          <DayTab active={isOverview} onClick={() => setActiveDay(0)} label={lang === 'vi' ? 'Tổng quan' : 'Overview'} />
          {days.map((_, index) => <DayTab key={index} active={activeDay === index + 1} onClick={() => setActiveDay(index + 1)} label={lang === 'vi' ? `Ngày ${index + 1}` : `Day ${index + 1}`} />)}
        </div>

        {isOverview ? (
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-muted">
            {days.map((_, index) => (
              <span key={index} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ROUTE_COLORS[index % ROUTE_COLORS.length] }} />
                {lang === 'vi' ? `Ngày ${index + 1}` : `Day ${index + 1}`}
              </span>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <div className="flex items-center gap-2 rounded-lg bg-paper-2 px-3 py-2 text-xs text-ink-muted">
              <Path size={15} className="text-chili" />
              <span><strong className="text-ink">{distanceKm.toFixed(1)} km</strong> {hasRoadMetrics ? (lang === 'vi' ? 'theo đường' : 'by road') : (lang === 'vi' ? 'ước tính' : 'estimated')}</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-paper-2 px-3 py-2 text-xs text-ink-muted">
              <Clock size={15} className="text-herb" />
              <span><strong className="text-ink">{minutes} {lang === 'vi' ? 'phút' : 'min'}</strong> {hasRoadMetrics ? (lang === 'vi' ? 'theo tuyến thực tế' : 'on the road route') : (lang === 'vi' ? 'ước tính' : 'estimated')}</span>
            </div>
          </div>
        )}
      </div>

      <LiveTripMap
        key={activeDay}
        stops={mappedStops}
        transport={transport}
        showRoute={!isOverview}
        overviewRoutes={overviewRoutes}
        onRouteMetrics={setRouteMetrics}
        className={`${expanded ? 'min-h-0 flex-1 [&>div:first-child]:h-full [&>div:first-child>div:first-child]:h-full' : ''} [&>div:first-child]:rounded-none [&>div:first-child]:border-0`}
      />
    </section>
  )
}

function DayTab({ active, onClick, label }) {
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`shrink-0 rounded-full px-4 py-2 font-utility text-sm font-semibold ${active ? 'bg-chili text-chili-ink shadow-soft' : 'bg-paper-2 text-ink-muted hover:text-chili'}`}>
      {label}
    </button>
  )
}
