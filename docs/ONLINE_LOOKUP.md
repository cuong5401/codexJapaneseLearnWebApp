# Online dictionary fallback

## Provider and static hosting

The production browser provider is `WiktionaryOnlineDictionaryProvider`. It requests the English Wiktionary structured definition endpoint directly:

`https://en.wiktionary.org/api/rest_v1/page/definition/{term}`

This is an experimental Wikimedia REST endpoint, and Wiktionary is currently the only project edition documented as exposing it. The app makes a normal anonymous same-origin-independent JSON `GET`; it has no API key, private backend, Vite proxy, or server route. This keeps deployed static-host behavior consistent with local production preview. Browser JavaScript does not set a custom `User-Agent`; the browser's normal request headers apply. Wikimedia may change or rate-limit this experimental endpoint, so failures remain recoverable through manual entry.

The provider performs exact term lookup only. It intentionally does not crawl, fetch rendered article HTML, or automatically search on each keystroke. It accepts definitions only from Japanese-language sections (`ja`/`Japanese`) and filters out definitions containing Japanese script as a conservative safeguard against mixed-language material. Wiktionary's structured endpoint can omit reading, POS, or examples and can return data whose shape changes; missing metadata stays empty. Vietnamese meanings are never generated. At most three Japanese examples are retained when supplied.

Jisho is not called from the browser. Its public endpoint is not suitable for this static frontend's CORS constraints. Reconsider it only if a separately deployed serverless proxy is introduced and reviewed; there is no proxy or secret in this app.

## Search and user flow

The Dictionary page searches local CustomWords and the configured reference source first. It offers an explicit **Search online** action only when local results are empty. Online entries occupy a separate, visibly attributed section. A result can be retried, opened at its Wiktionary page in a safe new tab, or copied into My Vocabulary. Failed lookups offer retry and manual entry; no raw provider exception is shown.

An online save creates a durable user-owned `CustomWord`, preserving provider and source URL as attribution metadata. Saves deduplicate by normalized word and reading when available. The record remains editable; changing its meaning, reading, notes, tags, or POS does not erase its source metadata. CustomWords are searchable locally by indexed normalized word and reading and continue to work with Favorites, Notebook, and SRS through the Phase 5/6 custom-word identity.

Search history records successful online lookup counts through the existing deduplicating repository. Cache entries are never the durable copy of a saved word.

## Cache, timeout, and errors

`OnlineLookupService` owns cache lookup/write, provider selection, normalization boundary, timeout, cancellation, and typed errors. The UI passes a signal but does not implement transport behavior.

| Lookup result | Cache lifetime |
| --- | ---: |
| One or more results | 72 hours |
| Empty/not-found result | 4 hours |

The existing cache repository expires entries on read, removes expired/older-than-30-days rows, and keeps the 200 most recently accessed entries. Cache clearing touches only `onlineLookupCache`; it cannot delete `customWords`. Cache records are disposable and may be removed at any time.

Requests time out after 8 seconds. Query changes, unmounts, or replacement lookups abort the prior request. Provider errors distinguish offline hints, timeout, provider unavailable, rate limit, not found, invalid response, CORS/network, unknown, and no result. The fetch result is authoritative; `navigator.onLine` is used only to refine a failed request into an offline message. There is no automatic retry loop.

## Normalized content and attribution

Only normalized application fields reach React: word, reliably exposed kana reading, English meanings, Japanese examples, POS labels, provider, and source URL. Vietnamese meanings remain empty when absent. Provider markup is reduced to plain text and React renders it as text; no external HTML is injected. The source line links to the exact Wiktionary page.

Wiktionary entry text is dual-licensed under CC BY-SA 4.0 and GFDL. The result identifies Wiktionary and links to the source page; Settings links to the CC BY-SA 4.0 license. Entry-specific external content may carry separate terms, so this small online fallback does not bulk-copy content or examples. See [Wiktionary copyrights](https://en.wiktionary.org/wiki/Wiktionary:Copyrights) and [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

## Tests and deployment limits

Unit tests cover Japanese-language filtering, malformed data, readings/POS/examples, safe text conversion, cache hit/miss/write/expiry/capacity, empty results, timeout, cancellation, provider errors, duplicate saves, source retention, local search, and cache/user-data isolation. Production browser smoke testing from the Vite production preview confirmed direct browser access to Wiktionary for `雨宿り`, displayed its English definition and source link, saved it, refreshed the page, and found the saved word through local search. No development proxy is configured to mask production CORS behavior.
