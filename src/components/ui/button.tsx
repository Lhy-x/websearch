import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

const variants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full text-xs font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border border-transparent bg-primary text-primary-fg shadow-sm hover:brightness-110 active:scale-[0.98]',
        secondary: 'bg-panel-2 text-fg hover:bg-border/70',
        outline: 'border border-border bg-panel text-fg hover:border-primary/40 hover:bg-panel-2',
        ghost: 'hover:bg-panel-2',
        danger: 'bg-danger text-white hover:opacity-90',
        link: 'text-primary underline-offset-4 hover:underline px-0 h-auto',
      },
      size: { sm: 'min-h-9 px-3.5 py-2 text-[11px]', md: 'min-h-11 px-5 py-2.5', lg: 'min-h-12 px-6 py-3 text-sm', icon: 'size-11' },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
)

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof variants> {
  asChild?: boolean
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp ref={ref} className={cn(variants({ variant, size }), className)} {...props} disabled={asChild ? undefined : disabled || loading} aria-disabled={disabled || loading || undefined} aria-busy={loading || undefined} tabIndex={asChild && (disabled || loading) ? -1 : props.tabIndex} onClick={disabled || loading ? e=>e.preventDefault() : props.onClick}>
      {asChild ? children : <>{loading ? <Loader2 className="animate-spin" /> : null}{children}</>}
    </Comp>
  )
})
Button.displayName = 'Button'
