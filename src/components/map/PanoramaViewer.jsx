import { useEffect, useRef, useState } from 'react'
import 'pannellum/build/pannellum.css'
import 'pannellum/build/pannellum.js'

/**
 * Renders an equirectangular JPEG as a draggable 360° panorama.
 *
 * KartaView serves raw frames rather than an embeddable player, so the
 * projection has to happen here. Pannellum does it on its own WebGL canvas —
 * no three.js, ~56 KB — and attaches itself to `window.pannellum` as a global
 * when the build is imported for its side effect.
 */
export default function PanoramaViewer({ imageUrl, heading = 0, className = '', onError }) {
  const containerRef = useRef(null)
  const viewerRef = useRef(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    const pannellum = typeof window !== 'undefined' ? window.pannellum : null
    if (!container || !pannellum || !imageUrl) return undefined

    setFailed(false)
    let viewer
    try {
      viewer = pannellum.viewer(container, {
        type: 'equirectangular',
        panorama: imageUrl,
        autoLoad: true,
        showFullscreenCtrl: true,
        showZoomCtrl: true,
        // Start facing the way the camera was pointing, not due north.
        yaw: ((heading + 180) % 360) - 180,
        hfov: 100,
        // The strip of copyright text Pannellum would otherwise draw; the
        // caller renders proper attribution in real markup instead.
        autoRotate: 0,
      })
      viewerRef.current = viewer
      viewer.on('error', () => { setFailed(true); onError?.() })
    } catch {
      setFailed(true)
      onError?.()
    }

    return () => {
      try { viewerRef.current?.destroy?.() } catch { /* already torn down */ }
      viewerRef.current = null
    }
  }, [imageUrl, heading, onError])

  if (failed) return null

  return <div ref={containerRef} className={`bg-black ${className}`} />
}
