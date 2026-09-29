# Kotoba application architecture

## Product and hosting model

Kotoba is a static React application hosted from a static origin such as GitHub Pages, Cloudflare Pages, or Netlify. There is no application server, authentication service, private API, or server-side database. The HTML, JavaScript, CSS, and canonical reference data are public static assets. The site and its bundled reference files normally require Internet access. IndexedDB is local-first storage for user-owned data; the app does not require a PWA or a full offline installation.

```text
Static host ── app JS/CSS and static reference data
                    │
                    ▼
                browser app
                 /       \
                /         \
     IndexedDB user data   optional online provider
```

## Project structure

```text
src/
  app/                         Shell, routes, theme, startup wiring
  components/ui/               Shared presentation primitives
  features/                    Product feature modules
    home/                       Home page and summary modules
    dictionary/search/          IndexedDB search and provider contracts
    organization/               My Vocabulary, CustomWord, notebooks, learning actions
    review/                      bounded sessions, card view models, review routes
    reading/                     local documents, lazy morphology worker, inline lookup
    jlpt/                        level progress, bounded study lists, vocabulary quiz and local history
    progress/                    local learning analytics (/progress) derived from user-owned IndexedDB data
    kanji/ grammar/             Reference content features
  db/
    srs/                         Pure scheduling rules and local-day helpers
    database.ts                Dexie schema v10 and migrations
    import/                     Optional seed/reference-pack importer
    repositories/               IndexedDB user and reference access
    sources/                    Reference source contracts and adapters
  data/schemas/                 Zod validation at import boundaries
  lib/                          Normalization and base-aware asset URL helper
  types/domain.ts               Canonical, user-owned, and external models
public/data/
  manifest.json                 Development sample/import manifest
  dictionary/ kanji/ grammar/ examples/  Small UTF-8 development seed chunks
  production/
    manifest.json               Current production data version, generated counts and source registry
    sources.json                 Settings/About attribution data
    versions/<version>/          Static records, search shards, JLPT ID lists and checksums
  licenses/                     Retained source license and NOTICE files
scripts/data/                   Explicit licensed source acquisition and local generation tools
docs/DATA_SOURCES.md             Upstream data source and license review
docs/DATA_PIPELINE.md            Generation, identity and static asset layout
```

Feature pages use the swappable `referenceDataSource` facade. `configureReferenceDataSource()` selects a `ReferenceDataSource`. Development defaults to `IndexedDbReferenceSource` with the tiny seed; `VITE_REFERENCE_SOURCE=static` opts into generated production assets for QA. Production always selects `StaticReferenceDataSource`. It implements dictionary/kanji/grammar/example lookup, exact and prefix search, JLPT counts/pages and reverse-kanji search from static ID postings and record buckets. Only bounded search/list/detail assets are requested; the corpus is never copied wholesale into IndexedDB. Dataset license/provenance is documented in [DATA_SOURCES.md](DATA_SOURCES.md) and generation in [DATA_PIPELINE.md](DATA_PIPELINE.md).

## Data ownership and IndexedDB

Dexie database `kotoba-db` is at schema version **10**. Canonical reference data belongs to published static assets or an explicitly downloaded pack. It is not user data. IndexedDB is primarily for user-owned records:

| Tables | Ownership and purpose |
| --- | --- |
| `notebooks`, `notebookItems` | User lists and mixed learning-item references |
| `favorites` | Persistent quick-favorite metadata for reference words, custom words, kanji, and grammar |
| `savedReferenceWords` | Explicit saved references to canonical dictionary IDs, with small display snapshots for missing-entry recovery |
| `studyStates`, `srsCards`, `reviewLogs` | User learning and review state |
| `searchHistory`, `userSettings` | User preferences and recent queries |
| `customWords` | Durable editable vocabulary, including words saved from online results |
| `onlineLookupCache` | Expiring bounded cache; disposable and not user-owned |
| `readingDocuments` | User-owned pasted Japanese passages and metadata |
| `quizAttempts` | Compact completed JLPT vocabulary quiz history and answer summaries |
| `dictionaryEntries`, `dictionarySearchTerms`, `kanjiEntries`, `grammarEntries`, `exampleSentences` | Optional imported development/reference data or downloaded packs |
| `datasetImports`, `metadata` | Import progress and active reference-pack metadata |

Clearing or replacing reference rows never clears user records. Custom words survive application/reference dataset updates and reference-pack removal. The online cache is limited to 200 most-recently-accessed entries and expires by TTL or after 30 days. Cache cleanup is exposed to the lookup service; it does not affect saved CustomWords.

`CustomWord` stores word, reading, Vietnamese/English meanings, parts of speech, optional examples, notes/tags, source type/provider/URL, and timestamps. User edits are saved to this record. Canonical `DictionaryEntry` values are never mutated. An external result is normalized to `ExternalDictionaryEntry`; choosing save copies supported fields into a new user-owned CustomWord.

Learning identity is `(itemType, itemId)` with item types `reference-word`, `custom-word`, `kanji`, and `grammar`. `NotebookItem`, `StudyState`, favorites, saved references, and `SrsCard` do not assume a dictionary primary key. The v5 migration maps prior `word` item types to `reference-word` while preserving notebooks, study states, cards, logs, history, settings, and imported references. The v6 migration adds normalized unique notebook names and dedicated favorites/saved-reference stores without replacing existing user records. It normalizes existing notebook names and resolves historical name collisions deterministically.

`NotebookItem` records only membership. Deleting a notebook removes its memberships but never the underlying word, kanji, grammar, or study state. Removing a saved dictionary word removes its user-owned save metadata, not the canonical record. Missing reference entries remain visible from their saved snapshot and can be reconnected if a later dataset includes the same stable ID. CustomWord deletion removes its notebook links, favorite, study state, SRS cards, and review logs in one transaction to avoid dangling user records.

Schema history: v1 initial stores; v2 normalized dictionary meaning fields; v3 meaning index; v4 kanji and reverse-kanji search keys; v5 CustomWord/cache tables and item identity migration; v6 notebook normalized-name uniqueness, favorites, and saved reference vocabulary; v7 compound SRS identity index; v8 normalized CustomWord word/reading indexes for local personal vocabulary search, backfilled during migration; v9 adds the user-owned `readingDocuments` table without rewriting previous stores; v10 adds `quizAttempts` without rewriting existing user data. Dataset versions remain separate from DB schema versions. The staged chunk importer remains available for development data and future optional downloaded packs. It validates each chunk, commits progress with the chunk, resumes committed chunks, and activates a pack only when complete.

## Static reference data and search

Development JSON fixtures remain small. The production dataset contains JMdict vocabulary plus OpenJLPT level assignments, kanji, curated grammar and a bounded attributed Tatoeba example sample. Release `2026-09-29.014928` contains 219,230 vocabulary entries without importing them into IndexedDB. The browser uses compact UTF-8 JSON tuples, 1,024 stable-ID dictionary chunks and 1,024 stable-ID-only search shards. Search shard paths hash the normalized suffix, which co-locates Japanese exact, reading and prefix keys for the same term. The largest shard is 269.5 KB raw. JLPT list and quiz views read pre-materialized pages of 100 records. The top-level manifest is 2.2 KB and does not contain the build-time checksum inventory. See [DATA_PIPELINE.md](DATA_PIPELINE.md) and the measured [DATA_DELIVERY.md](DATA_DELIVERY.md).

`StaticReferenceDataSource` is the production implementation of `ReferenceDataSource`; `IndexedDbReferenceSource` remains for development seeds and optional imported packs. The static source loads bounded postings and result record buckets on demand. It also reads JLPT pages directly, resolves kanji reverse lookups from postings, and hydrates linked examples only when requested. Static corpus data is never copied to IndexedDB. Reference releases use immutable versioned paths; the current root manifest selects one release, and successful data generation removes older published releases. Build-time hashes, source locks and merge reports remain in `scripts/data/reports/` and are not fetched at startup.

## Source and provider boundaries

`src/db/sources/reference-source.ts` defines dictionary, kanji, grammar and combined reference-source contracts. Each content source may also expose optional `countByJlptLevel` and `idsByJlptLevel`; the static source serves them from the manifest and the per-level ID lists, so level progress needs no record lookups. Screens use the configured source and do not depend on the storage format. Static production, development IndexedDB and optional packs can therefore implement the same bounded contracts.

`OnlineDictionaryProvider` defines `search(query)` and `lookup(word)`. `WiktionaryOnlineDictionaryProvider` calls the English Wiktionary structured definition REST endpoint from the browser and returns normalized `ExternalDictionaryEntry`; provider-specific/raw payloads stay inside its adapter. `OnlineLookupService` owns the disposable cache, 8-second timeout, cancellation, normalization boundary, and typed failures. Successful results live for 72 hours and empty results for 4 hours; the 200-entry LRU-style cap remains. The UI invokes online search only after no useful local/reference results and an explicit user action. Saved entries become editable CustomWords with attribution, separately from cache records. See [ONLINE_LOOKUP.md](ONLINE_LOOKUP.md).

## State management, routing, and deployment

IndexedDB repositories own durable user state. React holds only bounded results for the current view; no state library is added. Development seed initialization runs only in development. In production, route readiness opens the local database but does not import the development seed or require an import before startup.

React Router uses hash routing (`/#/dictionary/:id`). GitHub Pages and other static hosts can serve the app entry at the repository path without SPA rewrite configuration or a `404.html` redirect workaround. Existing route paths remain the same within the hash. Vite `BASE_URL` is used by `staticAssetUrl()` for public data requests. Build at site root with the default base; for a GitHub Pages repository named `JapanLearnAppWeb`, set `VITE_BASE_PATH=/JapanLearnAppWeb/` before `npm run build`. Vite rewrites lazy chunks under the same configured base. No runtime server APIs are used.

## Online fallback and security

Search flow checks indexed CustomWords and the configured reference source, then offers an explicit online lookup only when no local result exists. Bundled, downloaded-pack, custom, and online origins are modeled separately. Online results appear in a separate section with a source page; a save copies supported normalized fields into CustomWord and retains provider/source metadata. The saved word can then appear in future local word/reading searches and use Favorites, Notebook, and SRS without a provider call.

Never put private API keys in source or `VITE_*` variables. Direct browser calls are allowed only for providers whose terms permit it, whose CORS policy allows the site, and whose access needs no private secret. Providers that require secrets need a future serverless proxy (for example a Cloudflare Worker or Netlify Function); no proxy is part of this project phase.

## Design and performance direction

Keep the approved Japanese-minimal productivity UI: restrained surfaces, readable Japanese text, dense but clear information hierarchy, responsive mobile/desktop layouts, and accessible contrast/focus. Existing pages are preserved. Query and list results stay bounded. Static data fetches must be shard/chunk scoped; user content and caches remain in separate tables. The project has no service worker requirement.

The Phase 5 organization UI uses repositories and `MyVocabularyService` for bounded mixed-item resolution. My Vocabulary is limited to explicitly saved reference entries and user-owned CustomWords; it does not mirror the full dictionary. Reference lookups go through the configured `referenceDataSource`. Online-result saves are converted to editable CustomWords without a network call or provider dependency. Favorites remain a dedicated boolean concept, separate from user-created notebooks. Search and filters run over the bounded local personal collection. Bulk selection is deferred to keep the initial mobile actions simple; large collections can adopt paged service queries later.

## Review scheduling and sessions

`SrsCard` is per `(itemType, itemId, cardType)` and stores scheduling state only. A recognition card uses `cardType: recognition`; its prompt and answer are projected at render time by `ReviewCardViewModel` from `referenceDataSource` or the local CustomWord record. A small word/reading/meaning snapshot is saved when a card is created so a removed reference can be explained and skipped without losing its history. One repository transaction writes each scheduled card update and its `ReviewLog`; revealing an answer writes nothing.

The scheduler is SM-2 inspired, with fixed learning steps of 10 minutes and one day, a 10-minute relearning step, ease factor clamped to 1.3–3.0, and a maximum review interval of 36,500 days. Again from review increments lapses and enters relearning; Again during learning repeats the short step. Good graduates learning cards to review, while review intervals grow based on repetitions/ease. Hard uses a conservative 1.2 interval multiplier; Easy advances the ease factor and uses a 1.3 multiplier. Exact rules and boundaries are covered by scheduler tests. `StudyState` remains independently user-controlled.

Review session queues are bounded to 200 cards and snapshotted at session start. They order due review cards first, then due learning/relearning cards, then new recognition cards within the remaining daily allowance. A short-step card created by an answer is not inserted into the current queue; it can appear in a later session after its due time. The daily new-card allowance defaults to 20 and is stored in `userSettings`. First responses to new cards are marked in `ReviewLog.wasNew`; local-day counts use local midnight boundaries computed with calendar dates so daylight-saving transitions do not assume a fixed 24-hour day. Counts use indexed ranges and filters rather than loading all review history.

Suspending preserves prior state and due time; resuming restores them. Reset removes that card's logs and returns only that card to New after explicit confirmation. Recognition reviews expose user-triggered speech synthesis and keyboard shortcuts, with shortcuts ignored in text-entry controls. Session summaries are passed in route state for the just-finished session and are not a separate analytics store.
## Phase boundary

## Reading mode

Reading documents are explicit user-owned records in `readingDocuments`; editing is a separate route and saves only on the Save action. Opening a document tokenizes only that document. A lazy Web Worker loads Kuromoji and its IPADIC files from the same static origin at `/kuromoji/` under Vite `BASE_URL`; npm scripts copy the package's dictionary and its Apache 2.0 license/notice into ignored generated public assets before dev/build. No tokenizer dictionary is persisted to IndexedDB. Token output remains in memory for the open document. Furigana preference is stored in `userSettings` as `reading.furigana`.

Lookup checks CustomWords first, then exact word/reading and bounded indexed reference search; only a miss invokes the existing online lookup service. Selected inflected surface text is preserved for the reader while base form drives dictionary search. The prose region is one keyboard stop; delegated clicks and arrow-key selection avoid placing every token in tab order. If the tokenizer or its files fail, the saved passage remains readable as plain text. Further details and measured limits are in [READING_MODE.md](READING_MODE.md).

Phase 6 adds recognition SRS scheduling, local review sessions and logs, daily new-card pacing, card suspension/reset, and entry points from saved vocabulary areas. Phase 6.5 adds the browser-safe Wiktionary fallback, cache/attribution, and durable CustomWord saving. Phase 7 adds local reading documents, on-device morphology, inline dictionary fallback, and reading preferences. Phase 8 adds JLPT browsing, dataset-scoped progress, bounded vocabulary quizzes, and compact local attempt history. Phase 8.5 integrates licensed production static data while keeping personal data in IndexedDB; Phase 8.6 compacts and profiles its static delivery. Phase 9 replaces the `/progress` placeholder with read-only local analytics (study activity, streaks, SRS status, rating distribution, quiz performance, JLPT dataset progress and recent activity) computed in the browser from existing tables through `LearningAnalyticsRepository`; it adds no schema change, network call or telemetry. Metric definitions are in [PROGRESS.md](PROGRESS.md). Data counts and source terms are in [JLPT_STUDY.md](JLPT_STUDY.md), [DATA_SOURCES.md](DATA_SOURCES.md), [DATA_PIPELINE.md](DATA_PIPELINE.md) and [DATA_DELIVERY.md](DATA_DELIVERY.md). AI quiz generation, official mock exams, listening corpus, PWA, backup/export, and backend remain future phase boundaries.
