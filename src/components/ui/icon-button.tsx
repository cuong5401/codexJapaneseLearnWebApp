import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { label: string }
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(({ label, className, ...props }, ref) => (
  <button ref={ref} type="button" className={cn('icon-button', className)} aria-label={label} {...props} />
))
IconButton.displayName = 'IconButton'
