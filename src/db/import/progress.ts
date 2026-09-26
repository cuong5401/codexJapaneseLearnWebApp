export type ImportStatus = 'idle' | 'preparing' | 'importing' | 'completed' | 'failed'
export interface ImportProgress {
  collection: string | null; currentChunk: number; totalChunks: number; processedItems: number; totalItems: number; percentage: number; status: ImportStatus
}
export function calculateProgress(processedItems: number, totalItems: number, completedChunks: number, totalChunks: number, status: ImportStatus, collection: string | null = null): ImportProgress {
  const safeTotal = Math.max(0, totalItems); const safeProcessed = Math.min(Math.max(0, processedItems), safeTotal)
  return { collection, currentChunk: Math.min(Math.max(0, completedChunks), totalChunks), totalChunks, processedItems: safeProcessed, totalItems: safeTotal,
    percentage: safeTotal === 0 ? (status === 'completed' ? 100 : 0) : Math.round((safeProcessed / safeTotal) * 100), status }
}

