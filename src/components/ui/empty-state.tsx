import type { ReactNode } from 'react'

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state">{icon && <span className="empty-state-icon" aria-hidden="true">{icon}</span>}<h2>{title}</h2><p>{description}</p>{action}</div>
}
