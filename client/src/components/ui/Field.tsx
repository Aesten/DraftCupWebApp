import { type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Shared input look: iron well, hairline edge, gilt focus. */
export const inputCls = 'w-full px-3 py-2 rounded-sm bg-zinc-950 border border-zinc-700 text-sm text-zinc-100 placeholder:text-zinc-600 placeholder:italic focus:outline-none focus:border-amber-600 transition-colors'
export const inputSmCls = 'px-2.5 py-1.5 rounded-sm bg-zinc-950 border border-zinc-700 text-sm text-zinc-100 placeholder:text-zinc-600 placeholder:italic focus:outline-none focus:border-amber-600 transition-colors'

export function FieldLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <label className={cn('block font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500', className)}>
      {children}
    </label>
  )
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputCls, className)} {...rest} />
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <FieldLabel>{label}</FieldLabel>
      {children}
    </div>
  )
}
