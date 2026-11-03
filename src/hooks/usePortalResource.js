import { useCallback, useEffect, useState } from 'react'

/** Scope-bound loading: changing business/account never renders old scope data. */
export function usePortalResource(scope, load) {
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState({ scope: null, load: null, status: 'loading', data: null, error: null })
  useEffect(() => {
    let active = true
    setState({ scope, load, status: 'loading', data: null, error: null })
    Promise.resolve().then(load).then((data) => {
      if (active) setState({ scope, load, status: 'ready', data, error: null })
    }).catch((error) => {
      if (active) setState({ scope, load, status: 'error', data: null, error })
    })
    return () => { active = false }
  }, [scope, load, revision])
  const reload = useCallback(() => setRevision((r) => r + 1), [])
  return { ...(state.scope === scope && state.load === load ? state : { status: 'loading', data: null, error: null }), reload }
}
