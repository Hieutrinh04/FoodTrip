import { useEffect, useState } from 'react'

/** Whole seconds since `since` (ms), ticking each second while it is set; 0 when it is not. */
export function useElapsed(since) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!since) return undefined
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [since])
  return since ? Math.max(0, Math.floor((now - since) / 1000)) : 0
}
