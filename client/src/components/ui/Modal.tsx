import { useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Modal shell: dark overlay (no blur), iron panel with a double-rule edge.
 * Closes on a click that both started and ended on the backdrop, so a drag
 * that ends outside the box does not dismiss it.
 */
export function Modal({ title, onClose, children, footer, className, width = 'w-80' }: {
  title:      ReactNode
  onClose:    () => void
  children:   ReactNode
  footer?:    ReactNode
  className?: string
  width?:     string
}) {
  const downOnBackdrop = useRef(false)
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={e => { downOnBackdrop.current = e.target === e.currentTarget }}
      onClick={e => { if (downOnBackdrop.current && e.target === e.currentTarget) onClose() }}
    >
      <div className={cn('panel max-w-full shadow-[0_24px_48px_rgba(0,0,0,0.6)] border-zinc-700', width, className)}>
        <div className="panel-head flex items-center justify-between px-4 py-2.5">
          <span className="font-display text-xs font-bold uppercase tracking-[0.15em] text-zinc-200">{title}</span>
          <button onClick={onClose} className="p-1 rounded-sm text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 transition-colors" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4">{children}</div>
        {footer && <div className="px-4 pb-4 flex gap-2">{footer}</div>}
      </div>
    </div>
  )
}
