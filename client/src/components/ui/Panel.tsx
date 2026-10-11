import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Small-caps section label with the lozenge ornament. */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 whitespace-nowrap font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500', className)}>
      <span className="lozenge" />
      {children}
    </span>
  )
}

export function PanelHead({ children, meta, className }: { children: ReactNode; meta?: ReactNode; className?: string }) {
  return (
    <div className={cn('panel-head flex items-center justify-between gap-3 px-3.5 py-1.5 flex-shrink-0', className)}>
      <Label>{children}</Label>
      {meta !== undefined && meta !== null && meta !== false && (
        <span className="min-w-0 truncate whitespace-nowrap flex items-center gap-2">{meta}</span>
      )}
    </div>
  )
}

/**
 * The one container. Pass `title` for a header band, `meta` for a right-aligned
 * slot in that band. The body is a flex column so children can use flex-1.
 */
export function Panel({ title, meta, children, className, bodyClassName }: {
  title?:         ReactNode
  meta?:          ReactNode
  children:       ReactNode
  className?:     string
  bodyClassName?: string
}) {
  return (
    <div className={cn('panel flex flex-col overflow-hidden', className)}>
      {title !== undefined && <PanelHead meta={meta}>{title}</PanelHead>}
      <div className={cn('flex-1 min-h-0 flex flex-col', bodyClassName)}>
        {children}
      </div>
    </div>
  )
}
