# Reading mode

## Data and routes

Reading documents are local user data stored in Dexie `readingDocuments` (introduced in schema v9; current database schema v10): `id`, `title`, `text`, `createdAt`, `updatedAt`, and optional `sourceName`, `sourceUrl`, and `notes`. The app never inserts or removes dictionary rows when a passage changes or is deleted. Documents are listed by most recently updated and deletion is confirmed in the UI.

Routes are `/#/reading` (library), `/#/reading/new` (new editor), `/#/reading/:id/edit` (edit mode), and `/#/reading/:id` (reading mode). Reading and editing are separate. Changes are persisted only by the explicit save button.

## Tokenization

The selected tokenizer is [Kuromoji.js](https://github.com/takuyaa/kuromoji.js), an Apache-2.0 JavaScript morphological analyzer with dictionary form, part of speech, and readings. TinySegmenter is much smaller and needs no dictionary assets, but does not provide those lexical fields; inflection-aware dictionary lookup and furigana therefore favor Kuromoji.

The IPADIC package contains 12 gzipped dictionary files totaling about 17.8 MB on disk, plus decompressed in-memory structures. `predev` and `prebuild` copy these files and Kuromoji's license/notice to generated, ignored `public/kuromoji/` assets. The generated names end in `.gzdata` so static servers do not send `Content-Encoding: gzip`; Kuromoji's browser loader receives the gzip bytes and decompresses them itself. The URLs use the configured Vite base path and same origin. They are not stored in IndexedDB. HTTP caching may help subsequent sessions according to the host/browser cache policy. This adds first-use transfer and memory cost.

The package's browser bundle is vendored under `src/features/reading/vendor/` with its Apache license and notice. The preparation script patches only the twelve asset suffixes to `.gzdata`; the browser distribution is used to ensure the browser loader (XHR plus gzip decompression) is selected rather than the package's Node loader.

The Reading feature is lazy-loaded. Tokenization runs in a dedicated Web Worker so a several-thousand-character passage does not block editor/UI interactions. Only the currently open document is tokenized; results are kept in memory, not persisted or computed at startup. The normalized transient token shape is `index`, `surface`, optional `reading`, `baseForm`, optional `partOfSpeech`, UTF-16 `start`/`end`, `isPunctuation`, and `isKnown`. Positions are JavaScript string offsets so slices preserve punctuation and spacing. IPADIC readings are converted from katakana to hiragana only for display.

Kuromoji's browser loader exposes completion rather than reliable byte-progress callbacks. The UI reports tokenizer/dictionary preparation as a status step, not a misleading percent. If worker startup, dictionary fetch, or tokenization fails, it renders the complete saved passage as plain Japanese with an explanatory status; leaving and reopening the document retries lazy worker setup. A generated token model is not saved to the user database and does not require a schema migration.

## Lookup and study actions

For each selected word, lookup tries normalized CustomWords first, then exact offline dictionary word forms, exact reading, and a bounded ranked dictionary search. Search is based on the token's base form and preserves the selected surface form in the panel. The existing online provider/cache is used only when these local sources have no match. Source origin is shown in the panel; online entries retain provider/source attribution and can be explicitly saved as CustomWords. Reference entries expose Favorite, Notebook, Review, save-to-vocabulary, and full dictionary actions; CustomWords use their existing local actions and route.

Keyboard access uses one focusable prose region; left/right or up/down moves the selected word, Enter opens it, and Escape closes the Radix dialog. Word clicks are delegated by the prose region, so a long passage does not add thousands of buttons or tab stops. Punctuation is plain text, not a control. Furigana is preference-backed through `userSettings['reading.furigana']`; ruby is rendered only for kanji tokens with a useful reading. Hiragana-only tokens and punctuation have no ruby.

## Limits and follow-up

There is no background bulk tokenization or token persistence. A Chrome check with a 3,000-character passage produced 1,500 word tokens in 225 ms with no main-thread Long Task API entries after dictionary warm-up; cold-load time and device/browser speed will vary. The tokenizer has no percentage progress events. Real corpus licensing and static asset availability are operational concerns separate from Reading documents.
