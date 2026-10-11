import { type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'gilt-outline' | 'ghost'
export type ButtonSize    = 'sm' | 'md'

const VARIANT: Record<ButtonVariant, string> = {
  primary:        'btn-gilt',
  secondary:      'bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 hover:text-zinc-100',
  danger:         'bg-red-600/15 text-red-400 border border-red-700 hover:bg-red-600/25',
  success:        'bg-green-600/15 text-green-400 border border-green-700 hover:bg-green-600/25',
  'gilt-outline': 'bg-amber-500/10 text-amber-400 border border-amber-700 hover:bg-amber-500/20',
  ghost:          'bg-transparent text-zinc-500 border border-transparent hover:text-zinc-200 hover:bg-zinc-800',
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'text-[10px] px-2.5 py-1.5 gap-1',
  md: 'text-[11px] px-3.5 py-2 gap-1.5',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?:    ButtonSize
  loading?: boolean
  icon?:    ReactNode
  ref?:     Ref<HTMLButtonElement>
}

/**
 * The one button. Cinzel small caps, sharp corners, no glow.
 * `loading` swaps the icon for a spinner and disables the button.
 */
export function Button({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ref, ...rest }: ButtonProps) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-sm font-display font-bold uppercase tracking-[0.08em] leading-none transition-colors',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-inherit',
        VARIANT[variant], SIZE[size], className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
      {children}
    </button>
  )
}

/** Same look as Button for anchors and router Links: pass the classes to the element. */
export function buttonCls(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', className?: string): string {
  return cn(
    'inline-flex items-center justify-center whitespace-nowrap rounded-sm font-display font-bold uppercase tracking-[0.08em] leading-none transition-colors',
    VARIANT[variant], SIZE[size], className,
  )
}
