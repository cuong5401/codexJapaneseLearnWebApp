# Production data delivery — Phase 8.6

The production corpus is unchanged. This phase changes how that corpus is encoded, chunked and requested by the browser. It does not copy the dictionary into IndexedDB.

## Release footprint

Sizes below are decimal bytes. Gzip estimates use Node gzip level 6 on each JSON file. The old layout was captured before rebuilding from release `2026-09-29.001627`; the new layout is `2026-09-29.014928`.

| Data category | Old raw / files | New raw / files | Old gzip estimate | New gzip estimate |
| --- | ---: | ---: | ---: | ---: |
| Dictionary records | 244.75 MB / 4,096 | 82.27 MB / 1,024 | 29.08 MB | 18.96 MB |
| Search indexes | 252.18 MB / 2,048 | 211.02 MB / 1,024 | 63.69 MB | 44.17 MB |
| Kanji | 0.995 MB / 128 | 0.995 MB / 16 | 0.189 MB | 0.139 MB |
| Grammar | 0.061 MB / 8 | 0.061 MB / 4 | 0.014 MB | 0.013 MB |
| Examples | 0.206 MB / 64 | 0.206 MB / 8 | 0.064 MB | 0.040 MB |
| JLPT ID lists | 0.204 MB / 15 | 0.204 MB / 15 | 0.038 MB | 0.038 MB |
| Materialized JLPT pages | — | 7.33 MB / 114 | — | 1.39 MB |
| Browse lists | 0.053 MB / 2 | 0.053 MB / 2 | 0.008 MB | 0.008 MB |

The old generated release measured 499,691,614 bytes across 6,368 files. The new production data directory is 302,151,116 bytes across 2,211 files, including the root manifest and source list. Its per-file gzip estimate is 64,763,966 bytes. That reduces deployed production data by 197.5 MB (39.5%) and file count by 65.3%, while retaining all 219,230 dictionary entries.

The deployed tree includes a 2,217-byte runtime manifest and a 2,312-byte root source list. The old runtime manifest was 4,464 bytes. The new detailed `integrity.json` is 388,106 bytes with 2,209 file hashes, but it lives under `scripts/data/reports/` and is never published or fetched at startup. The merge report and pinned source lock are also build-only files.

The complete GitHub Pages build (`dist`) measured 326,903,780 bytes across 2,329 files. This includes the static app, 302.3 MB under `data/`, assets and 17,807,577 bytes of Kuromoji files. GitHub currently caps a published Pages site at 1 GB, recommends keeping the source repository within 1 GB, and notes a 10-minute deployment timeout and a soft 100 GB monthly bandwidth limit. The measured artifact is below the size cap with room for growth; these published quotas can change, so recheck them when deployment policy changes. [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)

## What was compacted

Dictionary transport uses JSON tuples instead of repeated full objects. `datasetVersion` comes from the manifest; normalized word/reading and English values are reconstructed when they match the normalizer; empty arrays and null values are inferred; and default JMdict/OpenJLPT provenance is inferred from stable IDs. Vietnamese meanings, alternate forms, senses, assignments, examples and exceptional provenance remain encoded when present. Validation decodes every tuple and compares materialized JLPT pages with their canonical records.

Search postings contain only the normalized key, stable IDs and match total. They do not repeat word text, readings, English meanings or dictionary records. Each posting has at most 256 IDs. The browser fetches records only for the current visible page.

Source IDs stay on records where attribution is needed; long source names, license URLs and notice text live in the release-level `sources.json` and license files. Build-only hashes no longer ride in the runtime payload.

## Chunk strategy

The dictionary has 1,024 FNV-1a stable-ID buckets. The measured mean is 214 entries and 80,344 bytes raw per bucket; median size is 80,275 bytes, maximum 97,255 bytes. Those chunks fit the requested 250–1,000-record range without creating thousands of roughly 60 KB files.

The search index has 1,024 shards. FNV-1a hashes the normalized key suffix after the first colon. Thus exact word, exact reading, kana, and prefix keys with the same suffix resolve to the same shard. English phrase/token keys use the same deterministic rule. The largest shard is 269,519 bytes raw; its gzip estimate is 54,020 bytes. Hot prefixes do not create large single-prefix files because the hash distributes each key. No second-level split was needed for this corpus; a future layout change should add one only if measured shards approach the current payload budget.

JLPT lists retain the full canonical IDs for progress and counts. Display and quiz reads use materialized, ID-sorted pages of up to 100 records. A vocabulary page is a compact record tuple array, so one list page does not fan out to dictionary buckets.

## Browser request profile

The profile was collected with headless Chrome 390×844, a fresh temporary profile outside the repository, the GitHub Pages base path, a local static preview that applies gzip to text and gives versioned assets immutable caching. Transfer byte counts below are response-body bytes and exclude HTTP headers. This previews compressed transport; it is not a live GitHub Pages measurement.

| Scenario | Static requests served | Compressed/identity response bytes | Notes |
| --- | ---: | ---: | --- |
| Cold Home | 12 total; 2 production-data files | 2,417,679 total; 16,490 reference bytes | Initial JS/CSS was 246,332 bytes gzip. Japanese WOFF2 font subsets account for most of the remaining first-view transfer. Home warms the first N5 page for its six featured words. |
| Search 推薦 | 10 data files | 211,012 | One relevant search shard plus bounded record buckets; the small manifest was already loaded by Home. |
| Search 食べる | 4 data files | 128,819 | |
| English search `recommend` | 27 data files | 528,904 | The 30 visible candidates span more stable-ID chunks than the Japanese examples. |
| Dictionary detail | 6 data files | 113,709 | Existing search results and the in-memory cache can serve some needed records. |
| Search 推奨 | 8 data files | 170,010 | Same-version cache and store state retained. |
| Search 改善 | 5 data files | 118,945 | |
| Search 影響, throttled | 11 data files | 231,438 | Synthetic 180 ms latency and 200 KiB/s downlink; 2.9 s total in this run. This is not a real 4G result. |
| Search 省略 | 9 data files | 187,598 | |
| Search 読解 | 3 data files | 80,716 | |
| JLPT N5 vocabulary | 0 additional reference bytes after Home warm-up | 0 additional | Its compact 100-entry page is 15,893 bytes gzip and was requested by the Home feature. The route loaded one 8,732-byte JS chunk. |
| JLPT N1 vocabulary | 1 data file | 16,200 | One materialized page; no full dictionary buckets. |
| Kanji detail 推 with linked vocabulary | 20 data files | 377,273 | Bounded to the displayed reverse-lookup results, though they span many record buckets. |
| Reading library before tokenization | 3 lazy JS/CSS assets | 6,837 | No tokenizer library, reference shard or dictionary file requested. |
| First Reading tokenization | 12 tokenizer assets + worker | 17,816,943 | Tokenizer assets: 17,791,956 bytes; worker JS: 24,987 bytes gzip. This happened only after creating and opening a saved reading. |
| Reading token lookup | 5 data files | 118,569 | Uses the same bounded static dictionary source. |
| Same dictionary search after full reload | 2 bodies from local server / 30 cache hits | 1,198 total; 597 reference bytes | The app shell and small manifest were revalidated; immutable versioned search and record assets came from browser cache. |

The five requested searches 推薦, 推奨, 改善, 影響 and 省略 total 919,003 bytes across 43 production-data responses in this session. The additional 食べる and `recommend` searches add 657,723 bytes across 31 responses before opening detail. After a true full reload of the same query, versioned search and record files came from browser cache; only the app entry and small manifest were served again. The fresh profile starts with an empty HTTP cache, and each recorded query uses the same release.

The Home page's first-view total includes about 2.1 MB of Japanese font subsets. JavaScript and CSS together remain about 246 KB gzip. Kuromoji's 17.8 MB is separate and absent from Home/Dictionary requests; its worker is also a separate 69.9 KB chunk. The Reading route itself is lazy-loaded.

## Bundle and compression observations

| Bundle | Previous build | Phase 8.6 build |
| --- | ---: | ---: |
| Main JavaScript | 718,749 B raw / 227,879 B gzip | 721,849 B raw / 228,898 B gzip |
| Main CSS | 101,040 B raw / 17,434 B gzip | 101,040 B raw / 17,434 B gzip |
| Reading page chunk | lazy route | 17,153 B raw / 6,344 B gzip |
| Tokenizer worker | 69,915 B raw / 24,987 B gzip | 69,915 B raw / 24,987 B gzip |

The main JavaScript grew by about 3.1 KB raw (1.0 KB gzip). Feature routes remain split; Reading and the tokenizer are absent from the cold Home transfer. No bundler-analysis package or risky manual chunk rules were added because this phase did not materially enlarge the initial bundle.

Gzip estimates were computed locally for each JSON file at level 6. No `.gz` or `.br` duplicates are published. The local profile preview compresses text responses; the actual production host's transfer encoding and cache headers should be checked from the deployed site. Versioned paths keep stale-file risk low and support long-lived immutable caching on hosts/CDNs that allow explicit cache headers.

## Repository and deployment recommendation

For this release, one current generated directory in the repository is the simplest static-host path. Do not retain old generated versions in the deployed tree; the build already prunes them after validation. The full static output is about 327 MB raw today, but committing each monthly 300 MB corpus into ordinary Git history will grow the source repository even after older folders disappear from the working tree.

For routine app-only changes, keep the pinned production dataset as a reusable artifact and skip JMdict parsing. The current pipeline fingerprint reuse handles unchanged sources locally. A sustainable next deployment workflow is:

1. Run a data-generation workflow only when a pinned source snapshot, Tatoeba sample or data pipeline version changes.
2. Validate and publish the versioned dataset as a build artifact or release asset.
3. Have the application deployment workflow reuse that approved artifact, then run the normal app build and publish one Pages artifact.

GitHub Pages is suitable for this current static artifact by its documented size cap, but the dictionary should not be designed to transfer hundreds of megabytes to an ordinary user. If traffic, deployment time or corpus size grows, keep this same versioned JSON contract and move `versions/<datasetVersion>/` behind object storage/CDN; only the manifest/base URL configuration needs to change. No cloud storage or workflow was added in Phase 8.6.

## Correctness checks and limits

The new release keeps counts identical to the prior release:

| JLPT level | Vocabulary | Kanji | Grammar |
| --- | ---: | ---: | ---: |
| N5 | 658 | 79 | 20 |
| N4 | 632 | 166 | 20 |
| N3 | 1,777 | 367 | 20 |
| N2 | 1,778 | 367 | 20 |
| N1 | 3,454 | 1,232 | 20 |

`production-data.test.ts` compares the ordered IDs from the old release for 推薦, 推奨, 改善, 省略, 読解, 食べる, 雨宿り and `recommend`. `npm run data:validate` verifies every build-only hash and transport link. `db.dictionaryEntries` remains empty during static searches; no user database migration is required.

The profile uses local Chrome, a synthetic static server and gzip level 6, not a deployed network. Query fan-out still depends on candidate count and stable-ID bucket distribution; English searches and kanji reverse lookup can request more chunks than exact Japanese searches even though total bytes remain bounded. The browser loads no checksum inventory and does not preload all 1,024 search shards.
