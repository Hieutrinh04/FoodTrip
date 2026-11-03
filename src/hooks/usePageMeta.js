import { useEffect } from 'react'

const SITE = 'FoodTrip'
const DEFAULT_TITLE = 'FoodTrip — Ăn ngon, đi vui, lịch trình vừa ý'

function setMeta(selector, attr, key, value) {
  let tag = document.head.querySelector(selector)
  if (!value) return null
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(attr, key)
    document.head.appendChild(tag)
  }
  const before = tag.getAttribute('content')
  tag.setAttribute('content', value)
  return () => { if (before == null) tag.remove(); else tag.setAttribute('content', before) }
}

/**
 * The page's title and description in the browser tab, history and bookmarks.
 * Client-side only: Facebook, Zalo and most crawlers read the HTML the server
 * sends and never run this, so link previews still show the site's defaults
 * until pages are rendered on the server (docs/og-preview.md).
 */
export function usePageMeta({ title, description, image } = {}) {
  useEffect(() => {
    if (!title) return undefined
    const before = document.title
    document.title = `${title} — ${SITE}`
    const undo = [
      setMeta('meta[name="description"]', 'name', 'description', description),
      setMeta('meta[property="og:title"]', 'property', 'og:title', title),
      setMeta('meta[property="og:description"]', 'property', 'og:description', description),
      setMeta('meta[property="og:image"]', 'property', 'og:image', image && new URL(image, window.location.origin).href),
    ].filter(Boolean)
    return () => {
      document.title = before || DEFAULT_TITLE
      undo.forEach((fn) => fn())
    }
  }, [title, description, image])
}
