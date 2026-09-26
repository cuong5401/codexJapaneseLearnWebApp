export type DataErrorCode = 'manifest-invalid' | 'chunk-read-failed' | 'chunk-invalid' | 'db-write-failed' | 'unsupported-dataset' | 'interrupted-import' | 'migration-failed'
export class DataLayerError extends Error {
  constructor(public readonly code: DataErrorCode, message: string, public readonly cause?: unknown) {
    super(message); this.name = 'DataLayerError'
  }
}
