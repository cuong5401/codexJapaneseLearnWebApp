# Dictionary, kanji, and grammar browsing

## Pages and source access

Dictionary, kanji, grammar and example pages read through `referenceDataSource`. Production uses generated, license-attributed static data and bounded search/list/record requests. Development uses the small IndexedDB seed unless static data is explicitly selected for QA. The IndexedDB importer and `IndexedDbReferenceSource` remain available for development and optional packs.

JMdict forms, readings, restrictions and sense boundaries are retained. Dictionary meaning uses a Vietnamese translation when supplied and otherwise presents the available English gloss naturally. JLPT assignment badges and filters use source assignments. Kanji character detail provides readings, English meanings, stroke/grade/frequency metadata, and bounded reverse dictionary lookup. Grammar derives from OpenJLPT's hand-curated sample; the interface describes it as reference content, not a complete official list. Examples preserve their data source; Tatoeba records display both sentence authors, IDs, URLs and licenses.

## Paged lists

Kanji, grammar and JLPT level lists are paged at 100 records instead of `Load more` with a 500-record cap, so every record is reachable: all 2,211 kanji (23 pages), all 99 grammar patterns (one page) and every JLPT level list, for example 3,454 N1 words across 35 pages. Page number, JLPT level and search text live in the hash URL (`#/kanji?level=N1&page=3`), so refresh, back/forward and shared links restore the same page. An out-of-range page moves to the last page. Each page requests only its own records: a JLPT page reads one materialized 100-record file, and a kanji or grammar page reads only the record buckets for its IDs. Search results keep the existing posting cap and say so when capped.

The grammar list is small because the production grammar source is OpenJLPT's curated subset of about 20 patterns per level. The page says so, and no grammar content is added without a reviewed source. Kanji detail shows 30 linked dictionary words first and can expand to the 256 IDs kept in each static reverse-lookup posting.

## Attribution and identity

Dataset source notices and the original OpenJLPT, EDRDG and Tatoeba terms are retained with the deployed site and accessible from Settings. JMdict attribution appears on dictionary screens as required by EDRDG. Each Tatoeba sentence pair retains attribution per Japanese and English sentence. See [DATA_SOURCES.md](DATA_SOURCES.md).

Reference IDs remain separate from user-owned notebook/favorite/study/review identities. Stable source IDs and seed alias maps allow old links to resolve on a dataset update without rewriting local rows. If a source record is removed or can no longer be mapped, existing snapshot behavior remains available. The pipeline never imports static production records into the personal IndexedDB store.

## Current data bounds

Source pin, generated data version, per-level assignments, unique reference counts, checksums, search chunks and known limits are recorded in [DATA_PIPELINE.md](DATA_PIPELINE.md). The OpenJLPT grammar subset is small. Tatoeba examples are a bounded sample; exact text containment does not promise a sense match. English is the available production translation language. A Vietnamese layer can be added after independent source/license review.
