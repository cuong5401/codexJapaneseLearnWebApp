# Dictionary search

## Production data source

Production uses `StaticReferenceDataSource`. It reads the small current pointer at `data/production/manifest.json`, loads search shards on demand, then fetches only the record chunks needed for the visible result page. It never imports the full corpus into IndexedDB or scans all dictionary JSON.

The current index has 1,024 shards. FNV-1a hashes the normalized key suffix after its kind prefix, so related keys such as exact written form, reading and prefix for the same Japanese text share a shard. This reduces the number of index requests for a Japanese query without requiring a term-to-file directory. Each compact posting is `[stableIds, totalMatches]`, contains no dictionary payload, and is capped at 256 IDs. The manifest declares the sharding and transport versions.

Dictionary records use 1,024 stable-ID buckets of about 214 entries on average. A record chunk is around 80 KB raw on average (97 KB maximum) and compact tuples reconstruct the domain fields in the browser. Search shard raw sizes average 206 KB, with a 205 KB median and a 270 KB maximum. Per-category and compressed measurements are in [DATA_DELIVERY.md](DATA_DELIVERY.md).

Japanese written forms and readings, normalized romaji candidates, English phrases/tokens, kanji reverse links, kanji readings/meanings and grammar terms use the same bounded posting interface. English and Vietnamese normalization stays in the search boundary; no Vietnamese gloss is invented. Search ranking remains exact written form, exact reading, romaji, prefixes, English phrase and bounded token matches. `scripts/data/regression/phase86-search-baseline.json` records the old release's ordered IDs for eight representative queries; the production-data test compares those results after transport changes.

## Result records and pages

Dictionary detail loads a stable ID through one record bucket and then loads linked examples if present. Prefix, exact and reverse-kanji searches use postings and fetch only result IDs. Candidate hydration is capped at 1,024 IDs and the visible search page at 120 entries.

JLPT list and quiz screens use canonical, materialized pages of 100 records rather than loading a full ID list and fanning out to dictionary buckets. The complete JLPT ID lists remain in the release for counts, assignments and progress. The current release preserves all N5–N1 record counts and assignments. Home renders six N5 example words from the first N5 page; other levels fetch their own requested page.

The browser keeps an 8 MiB / 64-entry in-memory LRU and shares concurrent requests. Versioned release URLs are immutable; the small top-level manifest is revalidated and pins the active release for that store instance. Browser HTTP caching can then retain versioned JSON across reloads. See [DATA_PIPELINE.md](DATA_PIPELINE.md) for schemas and validation.

## Development and personal data

The small Phase 3 development seed and `IndexedDbReferenceSource` remain available for tests and development. User-owned IndexedDB tables remain separate and survive production reference updates. A seed alias can resolve a prior development ID to one exact production match without rewriting user-owned notebook, favorite, study or SRS rows.

## Online fallback and hosting

Online lookup remains a separate, explicit fallback after local static and custom-word search. It never silently changes the canonical offline corpus. Static asset URLs use Vite `BASE_URL`, including `/JapanLearnAppWeb/` for the GitHub Pages project path.

The measured production search profile, HTTP request counts, cache behavior and known request fan-out limits are documented in [DATA_DELIVERY.md](DATA_DELIVERY.md). No full dictionary preload or aggressive search-shard prefetch is used.
