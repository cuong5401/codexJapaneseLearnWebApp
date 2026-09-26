import { cn } from '../../lib/cn'

type ProgressProps = { value: number; label: string; className?: string }
export function Progress({ value, label, className }: ProgressProps) {
  const clampedValue = Math.min(100, Math.max(0, value))
  return <div className={cn('progress-track', className)} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={clampedValue}>
    <span className="progress-fill" style={{ width: `${clampedValue}%` }} />
  </div>
}
