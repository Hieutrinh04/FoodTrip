import { ForkKnife, Coffee, Binoculars } from '@phosphor-icons/react'

const MAP = {
  food: ForkKnife,
  cafe: Coffee,
  attraction: Binoculars,
}

export default function CategoryIcon({ category, size = 15, weight = 'bold', className = '' }) {
  const Cmp = MAP[category] ?? ForkKnife
  return <Cmp size={size} weight={weight} className={className} />
}
