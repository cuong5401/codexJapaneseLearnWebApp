import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/cn'

export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup

export function DropdownMenuContent({ className, sideOffset = 7, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return <DropdownMenuPrimitive.Portal><DropdownMenuPrimitive.Content sideOffset={sideOffset} className={cn('dropdown-content', className)} {...props} /></DropdownMenuPrimitive.Portal>
}

export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return <DropdownMenuPrimitive.Item className={cn('dropdown-item', className)} {...props} />
}

export function DropdownMenuRadioItem({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return <DropdownMenuPrimitive.RadioItem className={cn('dropdown-item', className)} {...props} />
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return <DropdownMenuPrimitive.Label className={cn('dropdown-label', className)} {...props} />
}
