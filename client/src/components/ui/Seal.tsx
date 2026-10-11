import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type SealTone = 'live' | 'paused' | 'finished' | 'pending' | 'gilt' | 'success' | 'danger' | 'neutral'

const TONE: Record<SealTone, string> = {
  live:     'text-red-400 bg-red-900 border-red-600',
  paused:   'text-amber-400 bg-amber-950 border-amber-700',
  finished: 'text-green-400 bg-green-950 border-green-600',
  pending:  'text-zinc-500 bg-zinc-900 border-zinc-700',
  gilt:     'text-amber-400 bg-amber-950 border-amber-700',
  success:  'text-green-400 bg-green-950 border-green-600',
  danger:   'text-red-400 bg-red-900 border-red-600',
  neutral:  'text-zinc-400 bg-zinc-900 border-zinc-700',
}

/**
 * Status seal: a stamped label with a double rule inside the border.
 * Replaces the pulsing pills. `mark` adds a small lozenge (used for Live).
 */
export function Seal({ tone = 'neutral', mark, children, className }: {
  tone?:      SealTone
  mark?:      boolean
  children:   ReactNode
  className?: string
}) {
  return (
    <span className={cn(
      'seal inline-flex items-center gap-1.5 border px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-[0.2em] leading-none',
      TONE[tone], className,
    )}>
      {mark && <span className="inline-block w-1.5 h-1.5 rotate-45 bg-current" />}
      {children}
    </span>
  )
}
