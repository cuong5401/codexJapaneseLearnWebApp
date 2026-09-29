# JLPT study and vocabulary quizzes

## Routes

- `/jlpt` shows N5 through N1 with generated vocabulary, kanji and grammar assignment counts and device-local study progress.
- `/jlpt/:level` shows level categories and dataset-scoped counts.
- `/jlpt/:level/vocabulary`, `/kanji`, and `/grammar` show paged reference records.
- `/jlpt/:level/quiz` provides quiz setup; active sessions live in route state and completed summaries are reloadable using a persisted attempt ID.

Routes use `HashRouter` for static hosting and GitHub Pages. Phase 8 quiz sessions remain independent from SRS review; finishing a quiz stores `QuizAttempt` only.

## Source, level membership and wording

The configured `referenceDataSource` reads production static assets outside IndexedDB. Development defaults to the small IndexedDB seed; `VITE_REFERENCE_SOURCE=static` selects the generated assets for local production-data QA. Production always selects the static source and does not import the dev seed.

Level membership comes from OpenJLPT's pinned community study/reference dataset, based on Jonathan Waller's lists; it is **not an official JLPT list**. The test organization does not publish post-2010 official vocabulary/kanji/grammar specifications. Source assignments stay attached to one stable record; if a word is assigned to multiple levels, it appears in each source-backed level list and shares local study state. Generated per-level counts derive from those records, not UI constants. Grammar is a curated, limited reference collection and does not claim syllabus completeness.

Vocabulary and kanji meanings from reference sources are English. UI prefers Vietnamese when supplied and falls back to English. No Vietnamese translations are fabricated. Details on source licenses/count methodology are in [DATA_SOURCES.md](DATA_SOURCES.md) and [DATA_PIPELINE.md](DATA_PIPELINE.md).

## Quiz generation

Production questions use actual assigned-level word records. The three existing modes use Vietnamese glosses when present, otherwise English. The generator skips repeated/ambiguous normalized headwords, readings, or meanings, and avoids distractors that share an overlapping gloss; it prefers a matching broad POS category when enough choices exist. Source data does not encode every synonym or semantic relationship, so a generated distractor cannot be guaranteed unambiguous by automation alone. Read the Phase 8.5 distractor audit results in the release report.

## Progress, performance and limitations

Level counts and paged records load from bounded static assets. Level lists page through every record 100 at a time (one materialized page file per list page) with the page in the URL; the former 500-record browsing cap is removed. The status filter applies to the records on the current page. Level progress uses the per-level ID lists (`idsByJlptLevel`) when the source provides them. User study states and quiz history remain in this device's IndexedDB. As in Phase 8, quiz sessions cap at 30 questions and summaries retain compact answer snapshots. The app does not imply official syllabus completion. Dataset counts can change with source updates; JMdict is updated on a regular schedule in accordance with its published terms.
