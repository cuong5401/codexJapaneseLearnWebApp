import { ACTIVE_DATASET_KEY, db } from '../database'

export interface Page<T> { items: T[]; limit: number; offset: number }
export function boundedLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new RangeError('limit must be an integer between 1 and 500')
  return limit
}
export function boundedOffset(offset: number): number {
  if (!Number.isInteger(offset) || offset < 0) throw new RangeError('offset must be a non-negative integer')
  return offset
}
export async function activeDatasetVersion(): Promise<string | null> {
  const metadata = await db.metadata.get(ACTIVE_DATASET_KEY)
  return typeof metadata?.value === 'string' ? metadata.value : null
}

