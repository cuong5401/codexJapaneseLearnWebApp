# Kotoba application architecture

## Scope and current state

The app is a Vite, React, TypeScript, Tailwind application. The approved shell and design system provide the presentation layer. Phases 2 and 3 added local persistence and dictionary search. Phase 4 adds word detail, kanji browsing, and grammar browsing; later study and review workflows remain out of scope.

## Project structure

```text
src/
  app/                         Shell, route table, theme, startup wiring
  components/ui/               Shared presentation primitives
  features/                    Route-level feature screens/placeholders
    home/ settings/ sections/ dictionary/search/
  db/
    database.ts                Dexie database, version 4 schema, indexes, migrations
    errors.ts                  Typed data-layer errors
    initialization.ts          Development seed bootstrap and route readiness helper
    import/                    Manifest import, progress, dataset version rules
    repositories/              Bounded reference and user-data access
  features/
    dictionary/                Search, detail, and speech helper
    kanji/                      Search/list and detail screens
    grammar/                    Search/list and detail screens
    diagnostics/                Development-only reset and inspection functions
  data/
    schemas/                    Zod schemas at imported-data boundaries
    seed/generator.ts           Synthetic performance-data generator
  lib/                          Pure normalization, meaning-index builder and UI utilities
  types/domain.ts               Reference and user-data model types
public/data/
  manifest.json                Dataset version, schema version and chunk map
  dictionary/ kanji/ grammar/ examples/
                                UTF-8 JSON array chunks
```

Screens call repositories/services; React components do not import Dexie tables. Reference records are never copied into global React state. The only startup integration is a development-mode asynchronous seed import, which does not block the shell or display an import screen.

## Local database and records

Database name: `kotoba-db`. Current Dexie schema version: **4**. Database schema version and dataset release version are separate values.

| Table | Classification | Main access indexes |
| --- | --- | --- |
| `dictionaryEntries` | Reference | Compound dataset-version keys for ID, exact word, normalized word, reading, normalized reading, JLPT and frequency; version-prefixed multi-entry kanji reverse-lookup keys |
| `dictionarySearchTerms` | Reference search index | Dataset-version + entry ID; multi-entry Vietnamese/English normalized phrase and token keys |
| `kanjiEntries` | Reference | Dataset-version + ID, character, JLPT; version- and JLPT-prefixed multi-entry character/meaning/reading search keys |
| `grammarEntries` | Reference | Dataset-version + ID, normalized pattern, JLPT |
| `exampleSentences` | Reference | Dataset-version + ID |
| `notebooks` | User | ID, update time, sort order |
| `notebookItems` | User | Notebook, notebook + creation time, item identity; unique notebook + item membership |
| `studyStates` | User | Unique item type + item ID, status |
| `srsCards` | User | Due time, state, item type + item ID |
| `reviewLogs` | User | Card, review time, card + review time |
| `searchHistory` | User | Search time, normalized query, normalized query + time |
| `userSettings` | User | Setting key |
| `datasetImports` | Import metadata | Dataset version, collection, status |
| `metadata` | Import metadata | String key; active dataset version and generated time |

The compound reference keys include `datasetVersion`, so two releases can temporarily coexist. Repositories resolve the active version from `metadata` and never return staged or abandoned records. This avoids exposing an incomplete/mixed dataset during an update. IndexedDB indexes are kept to fields used by concrete repository queries; indexes cost storage and make bulk import slower.

The separate user tables hold notebooks, notebook items, study states, SRS card schema, review logs, search history, and settings. Clearing or replacing reference data does not clear these tables. `UserProgress` is not stored: totals and history can be derived from study state and review logs at current scale. Persisted aggregates can be added with a measured performance need and an explicit reconciliation rule.

### Database migrations

Version 1 is the initial schema. Version 2 added normalized meaning helper fields to dictionary entries. Version 3 added `dictionarySearchTerms`; its migration cursor-walks existing v2 dictionary entries and writes their persisted meaning-index records in batches. Version 4 adds multi-entry search indexes to kanji entries and version-prefixed reverse-kanji lookup keys to dictionary entries. Its cursor migration backfills those keys for existing reference records. It does not rewrite notebooks, study states, cards, review logs, search history, or settings; the migration fixture verifies these stores survive. Structural changes to tables, primary keys, indexes, or stored field meaning require a new `this.version(N).stores(...)` entry and, when existing records need transformation, an `upgrade(transaction => ...)` migration. Keep each migration deterministic, idempotent where possible, and test it against a prior-version database fixture. Database-open/upgrade failures are surfaced as `migration-failed` data errors through initialization and diagnostics. Never use a dataset import to migrate user data.

An application update with the same DB schema opens version 1 without rewriting user records. A new dataset with the same schema imports under its own dataset version and flips the active pointer when complete. A DB schema migration with the same dataset upgrades local stores independently. If both change, run Dexie’s schema upgrade first, then import/activate the compatible dataset. A dataset `schemaVersion` declares the record format understood by the importer; unsupported versions fail before writes.

## Dataset format and import

The manifest is `public/data/manifest.json`, validated by Zod. `datasetVersion` uses semantic versions, independently from the manifest `schemaVersion`. Each collection states its total count and ordered chunks with stable chunk ID, local path, and expected item count; byte size is optional. The sample development release has four UTF-8 JSON-array chunks. No external dataset, license, attribution, or checksum is claimed by these hand-authored development examples.

The production ingestion target is 150,000+ vocabulary entries, 10,000+ kanji, grammar, and sentence records. Generate normalized static chunks from source data, preserving the upstream source and license in a future dataset provenance file. A starting target is approximately 500 records per chunk, tuned by byte size and low-memory device measurements. The importer loads one chunk at a time, validates the array and each record at the trust boundary, and performs a short transaction that writes the rows and the completed-chunk marker together. It yields between chunks. It never bulk loads the complete dataset into memory or holds one transaction for all records.

On first development startup, the app opens IndexedDB, loads the local manifest, compares the active release, and imports the seed if needed. `initializeDevelopmentData()` returns readiness and progress state. Production builds do not auto-import the development seed. Import progress reports collection, chunk counts, processed/total records, percentage, and `preparing`, `importing`, `completed`, or `failed` status.

Each import run is tracked in `datasetImports` by dataset version and collection. Stable record keys and `bulkPut` make committed chunks idempotent. If interrupted after a committed chunk, the next run skips completed chunk IDs and continues. If a chunk read, schema validation, or transaction fails, it records a typed error and keeps the old active dataset. Only after every required collection finishes does one metadata transaction switch the active version. The previous active release is then removed in bounded batches. A cleanup failure does not roll back the new release; it is recorded in metadata and surfaced by diagnostics.

There is no checksum verification, remote dataset updater, worker-based JSON parser, or automatic dataset garbage collection in this phase. The small dev chunks demonstrate the format, not the final production data source.

## Repositories and access bounds

`DictionaryRepository` supports active-version ID lookup, indexed exact word/reading lookup, prefix lookup, reverse-word lookup by kanji, JLPT pages, and count. `DictionarySearchService` performs Japanese and romaji lookups through dictionary indexes and Vietnamese/English meaning lookup through the persisted multi-entry search indexes. It loads bounded entry rows only after indexed candidate retrieval. `KanjiRepository.search()` queries version-scoped multi-entry keys for character, Vietnamese/English meaning, onyomi, and kunyomi; it supports JLPT filtering and caps candidate reads. Reverse lookup uses `kanjiLookupKeys` on dictionary entries, capped at 30. `GrammarRepository.search()` scans at most 1,000 active-version grammar entries (or the selected JLPT index subset), filters normalized pattern and meanings, and returns bounded pages; the grammar dataset is expected to remain small. No repository exposes an unbounded dictionary read.

`NotebookRepository`, `StudyRepository`, `SrsRepository`, `SearchHistoryRepository`, and `SettingsRepository` isolate access to mutable personal records. Notebook operations use transactions and prevent duplicate membership. Search history coalesces a repeated query within five seconds and retains the latest 100 entries. SRS persistence/query schema exists only; there is no scheduling algorithm or review flow.

Dictionary meaning indexing stores one search-index record per dictionary entry, with version-prefixed phrase/token arrays and multi-entry indexes for Vietnamese and English. Queries support exact phrase, phrase prefix, token exact, and token prefix; arbitrary in-word substring matching is intentionally omitted. Posting and entry candidates are bounded, and the service reports truncation for broad terms. See [DICTIONARY_SEARCH.md](DICTIONARY_SEARCH.md) for index keys, normalization, limits, and storage estimates. Search never scans the first N dictionary entries to find meanings.

## State management and routing

IndexedDB is the source of truth for persistent personal data. React receives only bounded repository results needed by the active view; list pages retain at most 500 entries while paging. No state library is added. React Router owns `/dictionary/:id`, `/kanji`, `/kanji/:character`, `/grammar`, and `/grammar/:id` under the approved shell. Content routes are lazy-loaded. Content pages await the shared development dataset bootstrap before their first repository query, avoiding a premature empty or not-found state during first-run import.

## Development diagnostics

In dev mode the browser console exposes `window.kotobaDb`:

```js
await window.kotobaDb.diagnostics()
await window.kotobaDb.seed()
await window.kotobaDb.clearReferenceData() // preserves user data
await window.kotobaDb.clearUserData()      // preserves reference data
await window.kotobaDb.reset()              // clears both, then imports the development seed
```

Diagnostics return schema/dataset versions, per-table counts, recent import states/errors, and startup status. An `importing` state with no update for 60 seconds is reported as interrupted; rerunning resumes committed chunks. This API is excluded from production behavior by the `import.meta.env.DEV` guard and is not part of primary navigation. `diagnostics()` counts only records for the active reference version and reads at most 20 import-state rows.

## Performance and validation strategy

- Import ordered chunks sequentially with one chunk resident at a time, a short transaction per chunk, and an event-loop yield between commits.
- Use compound indexes for actual exact/prefix/level/due/history queries and explicit result limits.
- Normalize Japanese with NFKC and katakana-to-hiragana conversion for exact/prefix lookup. Do not treat that as a complete romaji or linguistic search engine.
- Avoid full-table reads, large React contexts, and unbounded diagnostics.
- Use Vitest and `fake-indexeddb` for schema/repository/import/recovery tests. Phase 3 tests search against a generated 20,000-entry dataset with unique terms near its beginning, middle, and final records, and verifies the bounded result page. These are correctness and bounded-operation checks in `fake-indexeddb`, not real browser/device performance claims.

## Design direction

Keep the approved Japanese-minimal productivity style: quiet surfaces, restrained accent color, readable Japanese text, compact but clear information hierarchy, responsive mobile and desktop layouts, and accessible contrast/focus. Content screens use separators and compact list rows instead of nested cards. Kanji stroke-order content remains a text placeholder until a trustworthy dataset exists. Browser speech synthesis requests Japanese (`ja-JP`), prefers an installed Japanese voice, cancels prior speech before starting again, and gracefully reports when the API is unavailable; actual voice availability depends on browser and operating-system installation. No audio is downloaded.

## Phase boundaries

- **Phase 0:** Vite, React, TypeScript, Tailwind foundation and architecture outline.
- **Phase 1:** approved application shell, design system, route placeholders, and static Home content.
- **Phase 2:** IndexedDB schema, data types, validation, repositories, local seed import, progress/recovery, diagnostics, and tests.
- **Phase 3:** offline dictionary search, entry details/examples, recent-search integration, persisted versioned meaning index, and v3 migration.
- **Phase 4:** polished word detail and speech action, Kanji search/list/detail with linked dictionary words, Grammar search/filter/detail, expanded local samples, and v4 indexes/migration.
- **Phase 5 and later:** SRS behavior, full notebook workflows, reading/tokenization, JLPT quizzes, analytics, backup, and PWA behavior.
