import { motion } from 'framer-motion'

/** The rotating-ring loader used across the app's async states. */
export default function Spinner({ size = 36, label, className = '' }) {
  return (
    <div className={`flex flex-col items-center gap-4 py-14 text-center ${className}`}>
      <motion.div
        className="rounded-full border-line-strong border-t-chili"
        style={{ width: size, height: size, borderWidth: Math.max(3, Math.round(size / 12)) }}
        animate={{ rotate: 360 }}
        transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
        role="status"
        aria-label={label || 'Loading'}
      />
      {label && <p className="text-ink-muted text-md">{label}</p>}
    </div>
  )
}
