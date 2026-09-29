# Reference data pipeline

## Commands and inputs

- `npm run data:fetch` explicitly acquires the reviewed, pinned OpenJLPT JSON snapshot and English JMdict XML. The lock file records source hashes, byte counts, URLs, fetch times and upstream modification times.
- `npm run data:fetch:examples` explicitly samples Tatoeba's API. Per-query files under the ignored `data-sources/tatoeba-requests/` directory make the fetch resumable and preserve sentence IDs, owners, links and per-sentence licenses. No audio is queried.
- `npm run data:build` reads the local pinned snapshots only; it makes no network requests.
- `npm run data:validate` verifies build-time hashes, IDs, strict UTF-8, source provenance, linked examples, Tatoeba attribution, search postings, JLPT assignments and materialized pages.

Source snapshots stay outside `public`. The generated current release is published as static files in `public/data/production/`. The integrity inventory and merge report are kept under `scripts/data/reports/<datasetVersion>/` and are not deployed.

Before parsing, the build checks each pinned snapshot hash. It fingerprints the source hashes, Tatoeba snapshot, pipeline/transport versions and chunk layout. When that fingerprint matches the published manifest and its release directory exists, the build reuses the corpus and exits without parsing JMdict or rewriting assets. Increment `pipelineVersion` for data-generation behavior changes and `transportVersion` for browser transport shape changes.

## Pipeline stages

1. Validate the source lock checksums.
2. Stream the compressed JMdict XML with strict UTF-8 decoding and a validating XML parser. Only declared literal entities are expanded; external entities are never fetched.
3. Parse the five OpenJLPT source levels and validate fields used by the mapper.
4. Preserve JMdict orthographies, readings, form restrictions, priority tags, sense boundaries, English meanings and parts of speech. Select a compatible primary form pair for the current detail UI while retaining alternative forms and senses.
5. Merge an OpenJLPT vocabulary row only when an exact source spelling and reading resolve to one compatible JMdict form pair. Ambiguous or unmatched rows remain source-specific. JLPT assignments come from the pinned study source; they are not inferred from JMdict.
6. Deduplicate kanji and grammar records across levels. One canonical record keeps all source-level assignments.
7. Deduplicate grammar examples and retain at most three per pattern. Link Tatoeba examples only when the Japanese form appears in exactly one dictionary entry; this textual link does not claim the example matches a particular sense.
8. Emit compact record chunks, search shards, JLPT ID lists, materialized JLPT record pages, browse lists, aliases and source metadata.
9. Validate every emitted asset and its external build-time hash before replacing the top-level manifest. After a successful publish, remove old release directories so only the current version is deployed.

## Runtime layout

```text
public/data/production/
  manifest.json                    # current release pointer, counts and transport descriptors
  sources.json                     # small attribution payload used by the app
  versions/<datasetVersion>/
    dictionary/<bucket>.json       # compact dictionary tuples
    kanji/<bucket>.json
    grammar/<bucket>.json
    examples/<bucket>.json
    search/<bucket>.json            # normalized key to [IDs, total]
    jlpt/<category>/<level>.json    # canonical ordered ID lists
    jlpt-pages/<category>/<level>/<page>.json # 100 materialized records per page
    browse/{kanji,grammar}.json
    aliases.json
    sources.json
scripts/data/reports/<datasetVersion>/
  integrity.json                   # build-only file hashes; not served to browsers
  merge-report.json                # merge conflicts, assignments and source counts
  source-lock.json                 # exact pinned input versions
```

The current release, `2026-09-29.014928`, contains 219,230 dictionary entries, 2,211 kanji, 99 grammar patterns and 392 example sentences. N5 through N1 reference counts match the previous release; the exact generated counts are in [DATA_DELIVERY.md](DATA_DELIVERY.md).

## Compact transport schema

The browser still receives JSON. Dictionary storage uses the tuple

```text
[id, word, reading, English glosses, parts of speech, extra]
```

`extra` stores only non-default fields under short keys. It can carry Vietnamese glosses, exceptional normalized values, JLPT/common/frequency metadata, kanji links, example links, tags, alternate forms, senses, non-inferable provenance and multiple JLPT assignments. The decoder derives `datasetVersion` from the manifest, computes normalized word/reading/English values when they match the established normalizer, restores empty arrays and null metadata, and infers default provenance from stable ID namespaces. Full forms and sense details remain available to dictionary detail screens.

Search shards store object properties as normalized keys; each value is `[stableIds, totalMatches]`. No English meaning, word form or dictionary record is copied into a posting. Postings keep at most 256 IDs and report the full total so callers can expose truncation.

## Chunk and search layout

Dictionary records use 1,024 FNV-1a stable-ID buckets. The current distribution averages 214 entries and 80.3 KB raw per file; the largest is 97.3 KB. Kanji use 16 buckets, grammar 4 and examples 8. The buckets are deterministic and preserve reverse lookup by ID.

Search uses 1,024 FNV-1a buckets. The hash input is the normalized suffix after the first key separator, so `w:推薦`, `r:推薦` and Japanese prefix keys for 推薦 resolve to one shard. English keys with the same normalized suffix also co-locate. A query computes the shard path directly; no inventory of every term is needed. Current search shards average 206,078 bytes raw, have a 204,935-byte median and top out at 269,519 bytes. Those measured sizes leave no multi-megabyte hot shard, so this release does not need a second-level split.

JLPT lists retain complete stable-ID sets for counts and progress. The list/quiz data source instead reads compact, pre-materialized pages of 100 records in canonical ID order. A JLPT list therefore does not fetch the whole dictionary or fan out to random dictionary record chunks. The Home N5 feature warms the first small JLPT page because it renders six useful examples; that page is 15.9 KB with the local gzip profile.

The full production footprint, request profiles, bundle sizes and compression measurements are in [DATA_DELIVERY.md](DATA_DELIVERY.md). The exact per-file build hashes remain in the external integrity report; normal startup fetches only the small runtime manifest, source attribution when needed, and bounded data assets. No whole-corpus IndexedDB copy or checksum download is performed.

## Identities, user data and refreshes

- JMdict vocabulary IDs are `jmdict:<ent_seq>`.
- Standalone OpenJLPT vocabulary IDs hash the exact source word and reading. `scripts/data/identity-lock.json` preserves previous identities when the same source pair remains unchanged.
- OpenJLPT kanji IDs use the Unicode character; grammar IDs hash the exact source pattern. Examples use Tatoeba sentence IDs or a hash of an OpenJLPT grammar text pair.
- Development seed IDs receive an alias only when word+reading, character or grammar pattern maps uniquely to a production record.
- Notes, favorites, notebooks, study/SRS state, quiz attempts and reading documents stay in IndexedDB. Replacing static release files does not import records or migrate user tables.

For a source refresh, review licenses, update pinned source snapshots, refresh the Tatoeba sample deliberately, run `npm run data:build` and `npm run data:validate`, inspect the generated report, run app checks and preview the release. EDRDG requires regular JMdict web-dictionary updates, including at least monthly updates. See [DATA_SOURCES.md](DATA_SOURCES.md) for upstream terms and notices.

## Data limits

OpenJLPT grammar and level labels are a curated study reference rather than an official exam specification. English is the licensed dictionary language; Vietnamese text is used only when a reviewed source supplies it. Tatoeba sentences retain author/license attribution but are not guaranteed to illustrate the linked word's intended sense.
