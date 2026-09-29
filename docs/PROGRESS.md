# Progress & learning analytics

The `/progress` route (学習の進捗) summarizes the user's own learning history. Everything is computed in the browser from IndexedDB user data. There is no backend, account, telemetry or analytics tracking, and no learning data leaves the device.

## Structure

```text
src/db/repositories/learning-analytics.ts  Read-only access to user-owned tables; streams large histories with each()
src/features/progress/progress-model.ts     Pure, deterministic calculations (days, streaks, SRS, ratings, quizzes, activity)
src/features/progress/progress-service.ts   Composes repository reads, the model and bounded title resolution
src/features/progress/ProgressPage.tsx      Lazy-loaded route UI (src/app/progress-routes.tsx)
src/features/progress/progress.test.ts      Fixture-based unit and IndexedDB integration tests
src/features/progress/progress-view.test.tsx  Server-rendered loading, error, empty and JLPT-failure states
```

No Dexie schema change was needed; the database stays at version 10. The page reads existing tables only and never writes.

## Data sources

| Metric area | Source |
| --- | --- |
| Overview, vocabulary distribution | `studyStates`, `srsCards`, `savedReferenceWords`, `customWords` |
| Study activity, streaks, rating distribution | `reviewLogs` |
| SRS status | `srsCards` |
| Quiz performance | `quizAttempts` |
| JLPT dataset progress | `studyStates` + the configured `referenceDataSource` (level counts and per-level ID lists) |
| Recent activity | `reviewLogs`, `srsCards`, `quizAttempts`, `customWords`, `savedReferenceWords`, `favorites`, `studyStates` |

Reading documents, notebook memberships and search history are not listed as activity. SRS card creation is not listed either, because resetting a card also rewrites `createdAt`, so it cannot reliably mean "added to review".

## Local calendar days

A timestamp's day is its **local** calendar date (`YYYY-MM-DD` from the device's local `Date` fields), never a UTC date. Day arithmetic uses `new Date(year, month, day + n)`, so DST days of 23 or 25 hours still count as exactly one day. Weeks start on **Monday**. Tests run in `America/New_York` and cover late-evening events, as well as the spring-forward and fall-back transitions.

## Metric definitions

**Overview**
- 学習した単語: word identities (`reference-word` or `custom-word`) whose StudyState is `learning` or `known`.
- 学習中 / 習得済み: word identities with StudyState `learning` / `known`. Study status is the user's own label. Reviewing a card does not change it.
- 復習予定: same as "due now" below.
- 今週の学習日数: study days from Monday through today.

**Study activity and streaks**
- A **study day** is a local day with at least one `ReviewLog`. Opening the app, browsing and quizzes do not count.
- **Current streak**: consecutive study days ending today. If there are no reviews yet today, a run that ended yesterday still counts, so the streak breaks only after a full missed day.
- **Longest streak**: the longest run of consecutive study days in the full history.
- The chart shows reviews for the last 14 local days. The trend compares the last 7 days with the 7 days before them.

**SRS status** (analytics only; scheduler behavior is unchanged)
- State counts: New, Learning (including `relearning`, whose count is shown in the note), Review, Suspended.
- **Due now**: `learning`, `relearning` or `review` cards with `nextReviewAt ≤ now`. New cards are not "due"; they are released by the daily new-card limit. This matches the Review dashboard and Home counts.
- **Due today** (今日中): scheduled cards due before the next local midnight, including due-now cards.
- **Overdue** (期限切れ): scheduled cards whose due time was before today's local midnight.

**Review ratings (評価の分布)**
- The number of reviews with each Again / Hard / Good / Easy rating, and each rating's share of all reviews. These are the user's self-assessments, not correctness. The page labels them that way and shows no accuracy figure for SRS.

**Quiz performance** (from `quizAttempts`)
- 正解率 (accuracy): total correct ÷ total questions across all completed attempts.
- 平均スコア (average score): the mean of each attempt's own score (correct ÷ questions), so every quiz counts equally.
- Per-mode results (日本語 → 意味, 意味 → 日本語, 読み) come from the stored per-answer `questionType`/`isCorrect`. Modes with no answers are hidden. With no attempts, the page shows an empty state instead of 0%.

**JLPT dataset progress (データセット上の進捗)**
- For each level and category: learning + known StudyStates whose ID is in that level's dataset list, ÷ the number of IDs in that list. It uses the shared `getAllLevelsProgress` (Home, JLPT overview and this page).
- With the static source, membership comes from the 15 per-level ID lists (`jlpt/<category>/<level>.json`, about 0.2 MB raw in total, immutable and cached), so no dictionary record is fetched. A record assigned to several levels counts in each of them, matching how the per-level totals are built. Sources without ID lists (the development IndexedDB seed) fall back to one record lookup per StudyState.
- This is dataset progress, not official JLPT syllabus completion, and the page says so. A level/category with no tagged records shows 該当データなし.

**Vocabulary distribution (単語の学習状況)**
- The population is the distinct word identities the user has saved, created, given a study status, or added to review. It is not the whole dictionary. The same ID under `reference-word` and `custom-word` counts as two identities.
- 未学習 means tracked but with no StudyState. 保留 (suspended status) is shown only when present. Kanji and grammar study counts are listed separately in the note.

**Recent activity (最近の学習)**
- The 8 newest entries across: review days (grouped per local day with the day's full count and up to 3 reviewed words), completed quizzes, created custom words, saved dictionary words, favorites, and study-status changes.
- Titles come from local data first: the SRS card snapshot, then the saved-reference snapshot, then the CustomWord record. Only an item without any snapshot triggers a single reference lookup. Kanji are resolved by stable ID or, for favorites saved from the kanji detail page, by character. Missing or unreachable entries show a safe Japanese fallback label (for example 辞書にない単語) and never throw.

## Performance

- Review logs and quiz attempts are streamed with Dexie `each()` into small aggregates (per-day counts and rating/mode tallies). Rows are not all held in memory, and cost grows linearly with history size.
- The production corpus is never scanned, searched or imported into IndexedDB. Local statistics make no reference requests at all when snapshots exist. JLPT progress reads the manifest and 15 small ID lists; its cost no longer grows with the number of studied items.
- Measured in headless Chrome against the base-path build with 100,084 review logs (about three years of history): the dashboard was ready 3.0–3.4 s after navigation, including app start-up, with an 8 MB JS heap. The review history is read once per visit; very large histories would need a persisted daily summary, which would be a schema change.
- JLPT progress loads separately from the local statistics. A reference-data failure shows an inline message and leaves the rest of the page usable.
- The route is lazy-loaded (about 27 kB raw / 9 kB gzip). It does not load Reading Mode, Kuromoji or the online dictionary provider.

## Limitations

- Streaks and activity use review logs only. Quizzes appear in quiz statistics and recent activity but do not create study days.
- Resetting an SRS card deletes its review logs (existing behavior), so the history and streaks shrink accordingly.
- StudyState keeps only its latest update, so recent activity shows the latest status change per item, not a full status history.
- A reference word titled from a stored snapshot is not checked against the current dataset. Its link may open the dictionary's "not found" view if the entry was removed.
- All figures describe this browser's IndexedDB on this device. There is no sync across devices.
