export default function LogoMark({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      {/* F */}
      <rect x="7" y="8" width="5.5" height="24" rx="2.5" fill="var(--chili)" />
      <rect x="7" y="8" width="13.5" height="5.5" rx="2.5" fill="var(--chili)" />
      <rect x="7" y="17.5" width="10" height="5.5" rx="2.5" fill="var(--chili)" />
      {/* T */}
      <rect x="18" y="8" width="14.5" height="5.5" rx="2.5" fill="var(--logo-navy)" />
      <rect x="23" y="8" width="5.5" height="24" rx="2.5" fill="var(--logo-navy)" />
      {/* dot accent */}
      <circle cx="25.75" cy="5.3" r="2.8" fill="var(--chili)" />
    </svg>
  )
}
