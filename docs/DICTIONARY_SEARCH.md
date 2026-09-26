# Dictionary search (Phase 3)

## Persisted local index

Dictionary meaning search uses the Dexie `dictionarySearchTerms` table (schema version 3). It stores one compact search-index record per dictionary entry, keyed by `[datasetVersion+entryId]`. Each record contains deduplicated arrays for Vietnamese phrases/tokens and English phrases/tokens. The arrays are multi-entry IndexedDB indexes. Each indexed string is prefixed with its dataset version plus a separator, so queries can target the active version while a new version is staged.

This is a compact postings layout: 20,000 dictionary entries produce 20,000 index records rather than one object per phrase/token. The record also stores the normalized term keys in four IndexedDB multi-entry indexes, which adds B-tree entries and increases import/storage cost. With the development generator, there are about 10–15 distinct phrase/token keys per entry across both languages (roughly 200,000–300,000 multi-entry keys for 20,000 records; roughly 1.5–2.25 million for 150,000). The exact count depends on the number and length of senses.

The table indexes `[datasetVersion+entryId]`, `datasetVersion`, `*viPhraseKeys`, `*viTokenKeys`, `*enPhraseKeys`, and `*enTokenKeys`. Search keys include the version prefix because a multi-entry index cannot be compounded with `datasetVersion`. This keeps staged versions isolated without scanning entries from other releases.

## Normalization and tokenization

- All user input uses Unicode NFKC, lowercase, trim, and collapsed whitespace.
- Japanese exact/prefix values continue to use `normalizedWord` and `normalizedReading`; katakana folds to hiragana. Common Hepburn input maps to kana for reading lookup.
- Vietnamese phrase and token keys use lowercase, NFD, removal of combining marks, and `đ` to `d` folding. Original accented meanings remain in `DictionaryEntry` for display.
- English phrases and tokens use Unicode NFKC, lowercase, and whitespace normalization. There is no stemming.
- Tokenization uses Unicode letter/number runs, removes duplicates per entry, drops one-character fragments, and omits common Vietnamese/English stop words. Complete normalized phrases are always kept, including stop words, so exact phrase and phrase-prefix lookup remain available.

## Query and ranking

Meaning candidate lookup uses the multi-entry phrase/token indexes across the active dataset. It checks exact phrase, phrase prefix, and token prefix forms. Multiple query tokens intersect within each language. It then merges candidates with indexed Japanese exact/prefix/reading/romaji candidates, loads only bounded entry rows by compound primary key, and sorts them deterministically.

Ranking prioritizes Japanese exact word, exact reading, romaji exact reading, word prefix, and reading prefix. Meaning results follow: Vietnamese exact phrase, phrase prefix, all-token exact, token prefix, then the equivalent English tiers. Common/frequency status and then word/ID stabilize ordering within a tier.

The UI debounces by 180 ms, renders 30 results per page, and caps its retained list at 120. Each meaning posting query reads at most 256 index rows, and the combined entry candidate pool is capped at 800. A response sets `truncated` when those candidate limits are reached. These limits bound a very common token query; a broad term may need future cursor-backed pagination if complete traversal of extremely large posting lists becomes a product requirement. Unlike the old implementation, candidates are retrieved by the persisted meaning index across the active dataset, not by scanning an initial slice of dictionary entries. Arbitrary in-word substring search is not supported; exact phrase, phrase-prefix, token-exact, and token-prefix lookup are supported.

## Schema migration and import safety

Schema version 3 adds the search-index table without changing existing keys. The migration walks v2 dictionary entries using a cursor and writes one index record per entry in batches within the version-change transaction. Schema v2's normalized meaning helpers and all user-owned tables remain intact. Migration tests start with a v2 fixture and verify notebooks, study state, SRS cards, review logs, search history, and settings survive.

During dataset import, each validated dictionary chunk writes normalized dictionary entries, corresponding search-index records, and its completed-chunk marker in one transaction. Replaying an incomplete import is idempotent by the compound index key. The active dataset pointer changes only after all collections complete, so search ignores staged index rows. On activation, old dictionary and search-index rows are removed in bounded 500-row batches. Development reference-data clearing also clears the index.

## Routes and phase boundary

`/dictionary?q=...` restores a query; `/dictionary/:id` is a stable detail route. Search history remains local and appears on Home. This phase does not add notebook actions, kanji/grammar links, SRS actions, review workflows, or dataset download/update UI.
