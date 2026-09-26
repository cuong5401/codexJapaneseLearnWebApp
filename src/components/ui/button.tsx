import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'
import { Slot } from '@radix-ui/react-slot'
import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

const styles = cva('button', {
  variants: {
    variant: { primary: 'button-primary', secondary: 'button-secondary', ghost: 'button-ghost', quiet: 'button-quiet' },
    size: { sm: 'button-sm', md: 'button-md', lg: 'button-lg', icon: 'button-icon' },
  },
  defaultVariants: { variant: 'primary', size: 'md' },
})

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof styles> & { asChild?: boolean }
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Component = asChild ? Slot : 'button'
  return <Component ref={ref} className={cn(styles({ variant, size }), className)} {...props} />
})
Button.displayName = 'Button'
