import { CheckCircle, Crosshair, NavigationArrow, SpinnerGap, WarningCircle, X } from '@phosphor-icons/react'
import { useLanguage } from '../../i18n/LanguageContext.jsx'

const COPY = {
  vi: {
    locating: 'Đang lấy vị trí của bạn…',
    rerouting: 'Bạn đã rời tuyến — đang tính lại đường…',
    arrived: (name) => `Bạn đã đến ${name}`,
    to: (name) => `Đến ${name}`,
    arriveAt: (time) => `đến lúc ${time}`,
    minutes: (m) => `${m} phút`,
    hours: (h, m) => (m ? `${h} giờ ${m} phút` : `${h} giờ`),
    weakSignal: 'Tín hiệu GPS yếu — đang chờ vị trí chính xác hơn.',
    denied: 'Trình duyệt chưa cho phép truy cập vị trí nên không dẫn đường được. Hãy bật quyền vị trí cho trang này.',
    unsupported: 'Trình duyệt này không hỗ trợ định vị.',
    recenter: 'Căn giữa',
    end: 'Kết thúc',
    accuracy: (m) => `sai số ~${m} m`,
  },
  en: {
    locating: 'Finding your location…',
    rerouting: 'You left the route — finding a new one…',
    arrived: (name) => `You have arrived at ${name}`,
    to: (name) => `To ${name}`,
    arriveAt: (time) => `arrive ${time}`,
    minutes: (m) => `${m} min`,
    hours: (h, m) => (m ? `${h} hr ${m} min` : `${h} hr`),
    weakSignal: 'Weak GPS signal — waiting for a better fix.',
    denied: 'Location access is blocked, so navigation cannot run. Allow location for this site.',
    unsupported: 'This browser cannot report its location.',
    recenter: 'Re-centre',
    end: 'End',
    accuracy: (m) => `±${m} m`,
  },
}

const formatDistance = (meters) => (meters < 1000 ? `${Math.max(0, Math.round(meters / 10) * 10)} m` : `${(meters / 1000).toFixed(1)} km`)

function formatDuration(seconds, copy) {
  const minutes = Math.max(1, Math.round(seconds / 60))
  return minutes < 60 ? copy.minutes(minutes) : copy.hours(Math.floor(minutes / 60), minutes % 60)
}

/**
 * The strip across the top of the map during navigation: what is left of the
 * trip, when they will get there, and what the navigation is doing — locating,
 * re-routing, arrived. It also holds the two controls a moving traveller
 * needs: re-centre (after panning away) and end.
 */
export default function NavigationBanner({ navigation, destinationName, following, onRecenter, onEnd }) {
  const { lang } = useLanguage()
  const copy = COPY[lang]
  const { status, remainingMeters, remainingSeconds, accuracy, error } = navigation

  const shell = 'pointer-events-auto absolute left-3 right-14 top-3 z-20 rounded-2xl border border-line bg-surface/95 p-3 shadow-lifted backdrop-blur-md sm:right-16 sm:max-w-[440px]'
  // Just the cross on a phone, where every character of the banner counts.
  const endButton = (
    <button type="button" onClick={onEnd} aria-label={copy.end} className="flex shrink-0 items-center gap-1.5 rounded-full bg-chili p-2.5 font-utility text-xs font-semibold text-chili-ink sm:px-3.5 sm:py-2">
      <X size={13} weight="bold" /><span className="hidden sm:inline">{copy.end}</span>
    </button>
  )

  if (status === 'error') {
    return (
      <div role="alert" className={shell}>
        <div className="flex items-start gap-3">
          <WarningCircle size={22} className="mt-0.5 shrink-0 text-chili" />
          <p className="flex-1 text-sm text-ink-muted">{error === 'unsupported' ? copy.unsupported : copy.denied}</p>
          {endButton}
        </div>
      </div>
    )
  }

  if (status === 'arrived') {
    return (
      <div role="status" className={shell}>
        <div className="flex items-center gap-3">
          <CheckCircle size={26} weight="fill" className="shrink-0 text-herb" />
          <p className="flex-1 font-display text-md font-bold">{copy.arrived(destinationName)}</p>
          {endButton}
        </div>
      </div>
    )
  }

  const arrival = remainingSeconds != null
    ? new Date(Date.now() + remainingSeconds * 1000).toLocaleTimeString(lang === 'vi' ? 'vi-VN' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div role="status" aria-live="polite" className={shell}>
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#2583d8] text-white">
          {status === 'navigating' ? <NavigationArrow size={18} weight="fill" /> : <SpinnerGap size={18} className="animate-spin" />}
        </span>
        <div className="min-w-0 flex-1">
          {status === 'locating' && <p className="text-sm font-semibold">{copy.locating}</p>}
          {status === 'rerouting' && <p className="text-sm font-semibold">{copy.rerouting}</p>}
          {status === 'navigating' && (
            <>
              <div className="flex items-baseline gap-2 whitespace-nowrap font-utility">
                <span className="text-xl font-bold text-ink">{remainingMeters != null ? formatDistance(remainingMeters) : '—'}</span>
                {remainingSeconds != null && <span className="text-sm font-semibold text-ink-muted">{formatDuration(remainingSeconds, copy)}</span>}
              </div>
              <p className="truncate text-xs text-ink-muted">
                {arrival && <span className="font-semibold">{copy.arriveAt(arrival)} · </span>}
                {copy.to(destinationName)}
                {accuracy != null && accuracy > 30 && <span className="text-ink-faint"> · {copy.accuracy(Math.round(accuracy))}</span>}
              </p>
            </>
          )}
        </div>
        {endButton}
      </div>
      {error === 'weak-signal' && <p className="mt-2 text-2xs text-lantern">{copy.weakSignal}</p>}
      {!following && status !== 'locating' && (
        <button type="button" onClick={onRecenter} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full border border-[#2583d8] px-3 py-1.5 font-utility text-xs font-semibold text-[#2583d8]">
          <Crosshair size={14} />{copy.recenter}
        </button>
      )}
    </div>
  )
}
