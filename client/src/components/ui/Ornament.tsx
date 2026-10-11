import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** A centred title between two fading hairlines: "── ◆ TITLE ◆ ──". */
export function Rule({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="hairline-r h-px flex-1" />
      {children !== undefined
        ? <span className="font-display text-[10px] font-semibold uppercase tracking-[0.3em] text-zinc-500">{children}</span>
        : <span className="lozenge" />}
      <span className="hairline-l h-px flex-1" />
    </div>
  )
}

/** Display heading in Cinzel. */
export function Heading({ children, className, size = 'lg' }: { children: ReactNode; className?: string; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const s = { sm: 'text-sm', md: 'text-lg', lg: 'text-2xl', xl: 'text-4xl' }[size]
  return <h1 className={cn('font-display font-bold tracking-[0.04em] text-zinc-50', s, className)}>{children}</h1>
}
