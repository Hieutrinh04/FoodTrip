import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * An <img> for third-party photos.
 *
 * Three things every remote image here needs and a bare <img> does not do:
 *
 * 1. `referrerPolicy="no-referrer"`. Google's photo CDN
 *    (lh3.googleusercontent.com/gps-cs-s/…, where the Maps place photos live)
 *    rejects a request whose Referer is an origin it does not know, so the
 *    place photo failed on every FoodTrip page. Measured: the same URL errors
 *    with the default policy and loads with no referrer.
 * 2. Hiding itself when the load fails. Otherwise the browser paints its
 *    broken-image icon plus the alt text, which looks like a bug rather than a
 *    missing photo.
 * 3. Asking Google for the size actually shown. Google serves a photo at any
 *    size requested through a suffix on the URL, and the one-size-fits-all
 *    hints used before were wrong in a way that showed: `w900-h360` means "fit
 *    *inside* 900×360", so a portrait photo came back 270×360 and was stretched
 *    across a 1270px hero — blurred nearly five times over, from an original
 *    that was 3024×4032. The box is now measured, multiplied by the screen's
 *    pixel density, and requested with `-p` (crop to exactly that size).
 *
 * `loading` defaults to lazy, but a hero image must pass "eager": the browser
 * decides whether to fetch a lazy image from its layout box, and an element
 * that measures 0x0 at first paint is never considered near the viewport, so it
 * is never fetched at all.
 */

// Largest edge ever requested. Past this the file only gets heavier; nothing on
// the site is shown larger.
const MAX_EDGE = 2400
// Sizes are rounded up to a step so that boxes a few pixels apart share one
// cached image instead of each fetching its own.
const SIZE_STEP = 80

const GOOGLE_PHOTO = /googleusercontent\.com/
// A size suffix Google already carries, e.g. "=w408-h306-k-no" or "=s1360".
const SIZE_SUFFIX = /=[swh]\d[\w-]*$/

function roundUp(px) {
  return Math.min(MAX_EDGE, Math.ceil(px / SIZE_STEP) * SIZE_STEP)
}

function sizedForGoogle(src, box, sizeHint) {
  if (!src || !GOOGLE_PHOTO.test(src) || src.includes('?')) return src
  const bare = src.replace(SIZE_SUFFIX, '')

  if (box && box.w > 0 && box.h > 0) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    return `${bare}=w${roundUp(box.w * dpr)}-h${roundUp(box.h * dpr)}-p-k-no`
  }
  if (sizeHint) {
    // A caller's hint without a crop flag would fit-inside and shrink portrait
    // photos; cropping to the hinted box is what every caller actually meant.
    return `${bare}=${/-[pc]-/.test(sizeHint) ? sizeHint : sizeHint.replace(/^(w\d+-h\d+)/, '$1-p')}`
  }
  return src
}

export default function RemoteImage({ src, alt = '', className = '', sizeHint = '', fallback = null, loading = 'lazy' }) {
  const [failed, setFailed] = useState(false)
  const ref = useRef(null)
  // null until the box has been measured. Measured before the first paint
  // (layout effect), so no request is ever made at the wrong size and then
  // repeated at the right one.
  const [box, setBox] = useState(null)

  // A new place means a new photo — clear a previous failure so the next one
  // gets its own chance to load.
  useEffect(() => setFailed(false), [src])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setBox({ w: rect.width, h: rect.height })
  }, [src])

  if (!src || failed) return fallback

  const needsMeasure = GOOGLE_PHOTO.test(src)
  const resolved = needsMeasure && box === null ? undefined : sizedForGoogle(src, box, sizeHint)

  return (
    <img
      ref={ref}
      src={resolved}
      alt={alt}
      loading={loading}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  )
}
