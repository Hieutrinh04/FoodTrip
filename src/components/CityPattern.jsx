const OVERLAY = 'rgba(255,255,255,.8)'
const OVERLAY_SOFT = 'rgba(255,255,255,.6)'

export const ACCENT_GRADIENT = {
  chili: 'linear-gradient(135deg, var(--chili), var(--lantern))',
  lantern: 'linear-gradient(135deg, var(--lantern), var(--chili))',
  herb: 'linear-gradient(135deg, var(--herb), var(--lantern))',
}

function Rooftops() {
  return (
    <svg viewBox="0 0 200 130" className="w-2/3">
      <polygon points="10,110 40,60 70,110" fill={OVERLAY} />
      <polygon points="60,110 95,50 130,110" fill={OVERLAY_SOFT} />
      <polygon points="120,110 150,68 180,110" fill={OVERLAY} />
      <circle cx="170" cy="30" r="14" fill={OVERLAY_SOFT} />
    </svg>
  )
}

function Lanterns() {
  return (
    <svg viewBox="0 0 200 130" className="w-2/3">
      <path d="M20 90 Q100 40 180 90" stroke={OVERLAY_SOFT} strokeWidth="5" fill="none" />
      <circle cx="45" cy="45" r="10" fill={OVERLAY} />
      <circle cx="80" cy="35" r="10" fill={OVERLAY_SOFT} />
      <circle cx="115" cy="30" r="10" fill={OVERLAY} />
      <circle cx="150" cy="40" r="10" fill={OVERLAY_SOFT} />
    </svg>
  )
}

function Wave() {
  return (
    <svg viewBox="0 0 200 130" className="w-2/3">
      <path d="M10 100 Q60 60 100 100 T190 100" stroke={OVERLAY} strokeWidth="5" fill="none" />
      <path d="M40 60 A50 30 0 0 1 140 60" stroke={OVERLAY_SOFT} strokeWidth="5" fill="none" />
    </svg>
  )
}

function Skyline() {
  return (
    <svg viewBox="0 0 200 130" className="w-2/3">
      <rect x="15" y="55" width="18" height="55" fill={OVERLAY} />
      <rect x="40" y="35" width="18" height="75" fill={OVERLAY} />
      <rect x="65" y="20" width="20" height="90" fill={OVERLAY} />
      <rect x="92" y="45" width="18" height="65" fill={OVERLAY_SOFT} />
      <rect x="117" y="60" width="18" height="50" fill={OVERLAY} />
    </svg>
  )
}

function Pines() {
  return (
    <svg viewBox="0 0 200 130" className="w-2/3">
      <polygon points="30,110 45,70 60,110" fill={OVERLAY} />
      <polygon points="70,110 90,55 110,110" fill={OVERLAY_SOFT} />
      <polygon points="120,110 140,75 160,110" fill={OVERLAY} />
    </svg>
  )
}

function Pagoda() {
  return (
    <svg viewBox="0 0 200 130" className="w-2/3">
      <polygon points="60,90 100,50 140,90 130,90 130,110 70,110 70,90" fill={OVERLAY} />
      <polygon points="70,70 100,40 130,70 122,70 122,86 78,86 78,70" fill={OVERLAY_SOFT} />
      <path d="M20 115 Q100 100 180 115" stroke={OVERLAY_SOFT} strokeWidth="4" fill="none" />
    </svg>
  )
}

const PATTERNS = {
  rooftops: Rooftops,
  lanterns: Lanterns,
  wave: Wave,
  skyline: Skyline,
  pines: Pines,
  pagoda: Pagoda,
}

export default function CityPattern({ pattern, accent = 'chili', className = '' }) {
  const Cmp = PATTERNS[pattern] ?? Rooftops
  return (
    <div
      className={`flex items-center justify-center ${className}`}
      style={{ background: ACCENT_GRADIENT[accent] ?? ACCENT_GRADIENT.chili }}
      aria-hidden="true"
    >
      <Cmp />
    </div>
  )
}
