import { Star } from '@phosphor-icons/react'

export default function RatingStars({ rating, size = 13, showNumber = true }) {
  return (
    <span className="inline-flex items-center gap-1 font-utility font-bold text-sm text-lantern" aria-label={`${rating} / 5`}>
      <Star size={size} weight="fill" />
      {showNumber && <span className="tabular">{rating.toFixed(1)}</span>}
    </span>
  )
}
