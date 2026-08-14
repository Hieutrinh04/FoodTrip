/**
 * Shares a link via the OS share sheet (Zalo/Messenger/etc on mobile) when
 * available, falling back to copying it to the clipboard on desktop.
 * Returns 'shared' | 'copied' | 'cancelled' | 'error'.
 */
export async function shareOrCopyLink(url, { title, text } = {}) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url })
      return 'shared'
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled'
      // fall through to clipboard for other share failures
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch {
    return 'error'
  }
}
