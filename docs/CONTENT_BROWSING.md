# Dictionary, kanji, and grammar browsing

## Word detail

`DictionaryDetailPage` loads one active-version entry through `DictionaryRepository`, then resolves at most six referenced examples and twelve kanji IDs. Missing references are omitted. Vietnamese/English meanings, POS, JLPT, common status, and frequency rank are displayed only when the dataset provides them. Each linked kanji points to `/kanji/:character` only when a matching `KanjiEntry` exists. There are no favorite or notebook controls yet because this phase does not add a data-backed default notebook workflow.

The pronunciation button uses browser `speechSynthesis`. It cancels an earlier utterance before starting, requests the `ja-JP` locale, prefers an installed exact `ja-JP` voice and then another Japanese voice, and falls back to the browser's default voice with the Japanese locale when none is installed. If the API or utterance fails, the page reports that speech is unavailable. No audio is fetched. Voice quality and availability depend on the browser and operating system.

## Kanji list, search, and detail

`KanjiRepository.search()` reads bounded records from the active dataset. The list supports exact character, Vietnamese and English meaning, onyomi, kunyomi, and JLPT N5–N1 filters. It retains at most 500 results in page state. Multi-entry `searchKeys` are prefixed by dataset version and categorized as character, Vietnamese, English, onyomi, kunyomi, and (where supplied) JLPT level. Meaning keys include normalized phrases, tokens, and adjacent two-/three-token phrases. Vietnamese keys remove diacritics and fold `đ` to `d`; Japanese reading keys normalize kana; English keys normalize Unicode and case. Candidate reads are capped and the UI reports when a search is truncated.

`/kanji/:character` loads one character and performs reverse dictionary lookup through the dictionary table's multi-entry `kanjiLookupKeys`, with a maximum of 30 results. These keys include the dataset version so staged records cannot crowd out active results. Stroke order is explicitly marked unavailable because the current offline data has no trustworthy stroke-order records. Missing metadata is omitted.

## Grammar list, filters, and detail

`GrammarRepository.search()` applies the selected JLPT index first when present and otherwise reads at most 1,000 entries from the active dataset. Pattern, Vietnamese meaning, and English meaning are normalized and matched locally. It returns bounded pages and a truncation indicator. Grammar detail resolves only the entry's referenced examples and displays formation, explanations, and notes only when present. Search and JLPT controls use semantic labels and native keyboard-accessible inputs.

## Schema and sample data

Database schema v4 adds multi-entry `searchKeys` to `kanjiEntries` and `kanjiLookupKeys` to `dictionaryEntries`. The v4 cursor migration derives keys for the installed reference rows. It preserves all user-owned stores. Import also derives both key sets as each chunk is written. The development release was advanced to `0.1.0-dev.2` so existing development databases import the expanded sample dataset. Its hand-authored seed now contains 33 kanji, 16 grammar entries spanning N5–N1, and 34 example sentences. No external source, license, or official JLPT provenance is claimed.

The small development seed demonstrates browsing and query behavior. It is not a complete kanji or grammar reference. The grammar search limit assumes the grammar collection remains small (at most 1,000 entries for an unfiltered query); a larger grammar corpus should receive a persisted term index before increasing that target.
