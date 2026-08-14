export default function Wordmark({ className = '' }) {
  return (
    <span className={className}>
      <span style={{ color: 'var(--chili)' }}>Food</span>
      <span style={{ color: 'var(--logo-navy)' }}>Trip</span>
    </span>
  )
}
