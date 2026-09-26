import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type BadgeProps = HTMLAttributes<HTMLSpanElement> & { tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' }
export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return <span className={cn('badge', `badge-${tone}`, className)} {...props} />
}
