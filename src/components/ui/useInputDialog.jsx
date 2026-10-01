import { useRef, useState } from 'react'

const BUTTON = 'inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-utility text-2xs font-semibold transition-colors hover:border-chili hover:text-chili disabled:opacity-50'
const DANGER = 'inline-flex items-center gap-1.5 rounded-full border border-chili/40 px-3 py-1.5 font-utility text-2xs font-semibold text-chili transition-colors hover:bg-chili hover:text-chili-ink disabled:opacity-50'

/**
 * A small modal that asks for one piece of text — a note on a manual payment,
 * a payment code to match — and resolves with it, or null if cancelled.
 */
export function useInputDialog(t) {
  const [dialog, setDialog] = useState(null)
  const [value, setValue] = useState('')
  const resolveRef = useRef(null)
  const ask = (options) => new Promise((resolve) => {
    resolveRef.current = resolve
    setValue(options.initial ?? '')
    setDialog(options)
  })
  const close = (result) => {
    resolveRef.current?.(result)
    resolveRef.current = null
    setDialog(null)
  }
  const tooShort = dialog && value.trim().length < (dialog.minLength ?? 1)
  const element = dialog && (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-labelledby="admin-dialog-title"
      onKeyDown={(e) => { if (e.key === 'Escape') close(null) }}>
      <form className="w-full max-w-[440px] rounded-2xl border border-line bg-surface p-5 shadow-lifted"
        onSubmit={(e) => { e.preventDefault(); if (!tooShort) close(value.trim()) }}>
        <h2 id="admin-dialog-title" className="text-lg font-bold">{dialog.title}</h2>
        {dialog.body && <p className="mt-1.5 text-sm text-ink-muted">{dialog.body}</p>}
        <label className="mt-4 block font-utility text-micro uppercase tracking-wide text-ink-faint">{dialog.label}
          <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder={dialog.placeholder}
            className="mt-1.5 w-full rounded-xl border border-line-strong bg-paper px-3.5 py-2.5 font-body text-md normal-case tracking-normal text-ink focus:border-chili" />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => close(null)} className={BUTTON}>{t('Huỷ', 'Cancel')}</button>
          <button type="submit" disabled={tooShort} className={dialog.danger ? DANGER : `${BUTTON} border-chili bg-chili text-chili-ink hover:text-chili-ink`}>{dialog.confirmLabel}</button>
        </div>
      </form>
    </div>
  )
  return [element, ask]
}
