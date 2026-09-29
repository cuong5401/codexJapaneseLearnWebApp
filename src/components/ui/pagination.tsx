import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './button'

export function PaginationSummary({ page, pageSize, total, shown, noun }: { page: number; pageSize: number; total: number; shown: number; noun: string }) {
  if (!total || !shown) return null
  const first = (page - 1) * pageSize + 1
  return <>Showing {first.toLocaleString()}–{(first + shown - 1).toLocaleString()} of {total.toLocaleString()} {noun}</>
}

export function Pagination({ page, pageCount, onChange, label, compact = false }: { page: number; pageCount: number; onChange: (page: number) => void; label: string; compact?: boolean }) {
  if (pageCount <= 1) return null
  return <nav className={compact ? 'pagination pagination-compact' : 'pagination'} aria-label={label}>
    <Button type="button" variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={15} aria-hidden="true" />Previous</Button>
    <label className="pagination-jump">
      <span className="sr-only">Go to page</span>
      <select value={Math.min(page, pageCount)} onChange={(event) => onChange(Number(event.target.value))}>
        {Array.from({ length: pageCount }, (_, index) => <option key={index + 1} value={index + 1}>Page {index + 1}</option>)}
      </select>
      <span aria-hidden="true">/ {pageCount}</span>
    </label>
    <Button type="button" variant="secondary" size="sm" disabled={page >= pageCount} onClick={() => onChange(page + 1)}>Next<ChevronRight size={15} aria-hidden="true" /></Button>
  </nav>
}
