import { Search } from 'lucide-react'
import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn('input', className)} {...props} />
))
Input.displayName = 'Input'

type SearchInputProps = InputHTMLAttributes<HTMLInputElement> & { label: string }
export function SearchInput({ label, className, ...props }: SearchInputProps) {
  return <label className={cn('search-input', className)}><Search size={17} aria-hidden="true" /><span className="sr-only">{label}</span><Input type="search" aria-label={label} {...props} /></label>
}
