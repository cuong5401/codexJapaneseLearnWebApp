import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/cn'

export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close

export function SheetContent({ className, children, ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  return <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="dialog-overlay sheet-overlay" />
    <DialogPrimitive.Content className={cn('sheet-content', className)} {...props}>{children}</DialogPrimitive.Content>
  </DialogPrimitive.Portal>
}

export function SheetTitle(props: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className="dialog-title" {...props} />
}

export function SheetDescription(props: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className="dialog-description" {...props} />
}
