import { CheckCircle, Circle, Info, SpinnerGap, WarningCircle } from '@phosphor-icons/react'

/**
 * What a running action is doing, right under the button that started it:
 * each step done / under way / still to come, and how long it has taken, so a
 * search that takes 10–20 seconds never looks like nothing happened.
 */
export function ActionProgress({ steps, elapsed, hint, vi }) {
  return <div role="status" aria-live="polite" className="rounded-xl border border-line bg-paper-2 p-4 text-sm">
    <ol className="space-y-2">
      {steps.map((step) => <li key={step.label} className={`flex items-center gap-2 ${step.state === 'todo' ? 'text-ink-faint' : step.state === 'done' ? 'text-herb' : 'font-semibold text-ink'}`}>
        {step.state === 'done' ? <CheckCircle size={16} weight="fill" /> : step.state === 'active' ? <SpinnerGap size={16} className="animate-spin text-chili" /> : <Circle size={16} />}
        {step.label}
      </li>)}
    </ol>
    <p className="mt-2 text-xs text-ink-faint">{vi ? `Đang xử lý… ${elapsed} giây` : `Working… ${elapsed}s`}{hint ? ` · ${hint}` : ''}</p>
  </div>
}

/** The outcome of the last action, where it was asked for. */
export function ActionResult({ notice, error }) {
  if (error) return <p role="alert" className="flex items-start gap-2 rounded-xl border border-chili p-4 text-chili"><WarningCircle size={18} className="mt-0.5 shrink-0" />{error}</p>
  if (notice) return <p role="status" className="flex items-start gap-2 rounded-xl bg-paper-2 p-4 text-herb"><Info size={18} className="mt-0.5 shrink-0" />{notice}</p>
  return null
}
