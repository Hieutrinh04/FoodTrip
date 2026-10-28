import { useState } from 'react'
import { Star } from '@phosphor-icons/react'

/** Read-only stars for a 1–5 rating. */
export function Stars({ value, size = 13, className = '' }) {
  const full = Math.round(value ?? 0)
  return (
    <span className={`inline-flex items-center gap-0.5 text-lantern ${className}`} aria-label={`${value}/5`}>
      {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={size} weight={n <= full ? 'fill' : 'regular'} className={n <= full ? '' : 'text-line-strong'} />)}
    </span>
  )
}

const LABELS = {
  vi: ['Rất tệ', 'Chưa tốt', 'Bình thường', 'Tốt', 'Tuyệt vời'],
  en: ['Terrible', 'Poor', 'Average', 'Good', 'Excellent'],
}

/** Five buttons to pick a rating, with the word for the one hovered or picked. */
export function StarInput({ value, onChange, lang }) {
  const [hover, setHover] = useState(0)
  const shown = hover || value
  return (
    <div className="flex items-center gap-3">
      <div role="radiogroup" aria-label={lang === 'vi' ? 'Số sao' : 'Rating'} className="flex gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} — ${LABELS[lang][n - 1]}`}
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            className="rounded p-0.5 text-lantern transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-chili"
          >
            <Star size={26} weight={n <= shown ? 'fill' : 'regular'} className={n <= shown ? '' : 'text-line-strong'} />
          </button>
        ))}
      </div>
      {shown > 0 && <span className="font-utility text-sm font-semibold text-ink-muted">{LABELS[lang][shown - 1]}</span>}
    </div>
  )
}
