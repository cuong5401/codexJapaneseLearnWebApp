# Reference data sources

License review date: 2026-09-29. This review preceded the Phase 8.5 corpus import. Data acquisition is an explicit maintenance operation; ordinary application builds use local generated assets. Source snapshots, revision IDs, acquisition timestamps and SHA-256 checksums belong in the generated source metadata/manifest.

## OpenJLPT

- Source: [evanclan/OpenJLPT](https://github.com/evanclan/OpenJLPT), pinned to commit `c42fd9fa3777bfc1775446f7c418d549dfd6e4cf` (2026-07-21).
- Files: `data/json/vocab/n5.json` through `n1.json`, and corresponding `kanji` and `grammar` directories.
- Purpose: community JLPT study/reference assignments and grammar reference content.
- License: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Preserve the exact upstream [LICENSE](https://github.com/evanclan/OpenJLPT/blob/c42fd9fa3777bfc1775446f7c418d549dfd6e4cf/LICENSE) and [NOTICE](https://github.com/evanclan/OpenJLPT/blob/c42fd9fa3777bfc1775446f7c418d549dfd6e4cf/NOTICE.md), distributed in `public/data/licenses/`.
- Attribution: credit OpenJLPT and the NOTICE's upstream contributors: EDRDG (JMdict/EDICT and KANJIDIC2), Jonathan Waller, and Tatoeba. Include license links and identify Kotoba's conversion, deduplication, indexing and omissions as modifications. Distribute derived reference data under CC BY-SA 4.0; retain upstream rights and notices.
- Fields used: original written word, reading, English meanings, study level; kanji character/readings/meanings/strokes/grade/frequency where supplied; grammar pattern/meaning/formation/notes/tags/examples. Absent Vietnamese translations and uncertain metadata stay absent.
- Updates: review and pin a new upstream commit, recheck NOTICE/LICENSE and schema, regenerate, compare counts/checksums and deploy a complete version.

OpenJLPT's [grammar source README](https://github.com/evanclan/OpenJLPT/blob/c42fd9fa3777bfc1775446f7c418d549dfd6e4cf/sources/grammar/README.md) describes hand-curated seed grammar, not comprehensive coverage. Its grammar examples are maintained with that licensed source. Vocabulary examples have only `ja`/`en` text in the published JSON: upstream's [vocabulary builder](https://github.com/evanclan/OpenJLPT/blob/c42fd9fa3777bfc1775446f7c418d549dfd6e4cf/scripts/build-vocab.ts) attaches Tatoeba examples without retaining IDs or authors. Kotoba excludes those unattributed embedded vocabulary examples and acquires attributed pairs directly instead.

The [JLPT FAQ](https://www.jlpt.jp/e/faq/) explains that the post-2010 test does not publish vocabulary/kanji/grammar specifications. Display **JLPT study/reference dataset**. OpenJLPT/Waller assignments are community estimates; neither imported levels nor counts are official examination lists. KANJIDIC2's historical four-level `jlpt` field must not be reinterpreted as modern N5–N1.

## JMdict / EDICT — EDRDG

- Source: [JMdict project](https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project); official English XML download: `https://www.edrdg.org/pub/Nihongo/JMdict_e.gz`.
- Purpose: general Japanese dictionary coverage, independent of JLPT membership.
- License: Japanese/English components are [CC BY-SA 4.0 under the EDRDG statement](https://www.edrdg.org/edrdg/licence.html). Other languages may have different copyright; this pipeline does not assume that they are covered.
- Attribution: acknowledge James William Breen and the Electronic Dictionary Research and Development Group, link the project/docs/license, retain the statement in `public/data/licenses/EDRDG-licence.html`, and identify data modifications. Dictionary displays need accessible acknowledgement. EDRDG expressly distinguishes the data license from the application's code license.
- Derivatives: converted dictionary records and search data retain CC BY-SA 4.0 and upstream copyright.
- Fields used: `ent_seq` source identity, written forms, readings and their restrictions, English glosses, part-of-speech entities, reliable common-word priority flags. No synthetic global frequency ranks or Vietnamese glosses. Preserve alternative spellings/readings in provenance or lookup keys.
- Updates: the maintainer must refresh deployed EDRDG data regularly; the statement specifies at least monthly for web dictionaries. Explicit acquisition, generation, validation and deployment constitute the update procedure; ordinary `npm run build` performs no source download.

## KANJIDIC2 — EDRDG, via OpenJLPT

- Source: [KANJIDIC project](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project), as credited in OpenJLPT NOTICE.
- Purpose/fields: kanji readings, English meanings, strokes, grade and frequency metadata already present in OpenJLPT. Waller/OpenJLPT supplies modern study-level assignments.
- License/attribution: CC BY-SA 4.0 under the same [EDRDG statement](https://www.edrdg.org/edrdg/licence.html); preserve EDRDG and OpenJLPT acknowledgement. The statement separately lists contributors to some specialized codes; this integration does not import those codes.
- Derivatives/updates: retain the share-alike data license and refresh through reviewed OpenJLPT versions. This is the OpenJLPT kanji subset, not a claim to ship all KANJIDIC2 characters.

## Jonathan Waller's JLPT resources, via OpenJLPT

- Source: [Jonathan Waller's JLPT resources](https://www.tanos.co.uk/jlpt/), credited by the pinned OpenJLPT NOTICE as CC BY. Waller's own [sharing statement](https://www.tanos.co.uk/jlpt/sharing/) confirms CC BY for material he is not selling, with site credit.
- Purpose/fields: vocabulary and kanji level membership, distributed through OpenJLPT; no direct scraping of Waller's site.
- Attribution: retain Jonathan Waller's name and site link. The pinned NOTICE specifies CC BY without a version; Kotoba does not invent a version or independently relicense the underlying contribution.
- Derivatives/updates: Kotoba consumes the CC BY-SA 4.0 OpenJLPT derivative with its upstream notices, reviewing their changes when advancing the OpenJLPT pin.

## Tatoeba textual sentences

- Sources: [Tatoeba API documentation](https://api.tatoeba.org/openapi), [downloads](https://tatoeba.org/en/downloads), and [terms sections 6.2–6.5](https://tatoeba.org/en/terms_of_use).
- Purpose: a bounded selection of Japanese sentences and their directly linked English translations for reference-word examples.
- Licenses: accept only explicit `CC BY 2.0 FR` or `CC0 1.0` returned for each text. Link [CC BY 2.0 FR](https://creativecommons.org/licenses/by/2.0/fr/) or [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). No audio is requested or imported; audio licensing is separate.
- Attribution/fields: retain both sentence IDs, exact texts, owners, individual license values and sentence URLs. Credit both owners beside examples or through directly accessible per-example attribution. A generic Tatoeba credit alone does not replace author credit. The owner is the API's attribution identity, not an assertion about original authorship history.
- Derivatives: preserve each sentence's original license independently of the generated corpus's share-alike arrangement; do not imply CC0 for BY material. Keep Japanese and English text unchanged.
- Updates: explicit API acquisition records the timestamp and query list; approved, non-orphan sentences and direct translations are filtered. Unknown licenses, absent owners, licensing problems or invalid IDs are excluded. Refresh the bounded snapshot and check changed/deleted sentences during data maintenance. A broader import should use detailed weekly exports, retaining owners/IDs/licenses and translation links.

## Distribution and provenance

Dataset-level source metadata centralizes attribution and license URLs. Individual records retain source dataset and source-record identities; examples additionally retain both sentence attribution objects. Source acquisition archives remain outside the application bundle. Generated assets contain the notices needed for redistribution and a source registry exposed by the application. Do not publish new data with unclear licensing, fabricate translations, or claim endorsement by these projects.

This document records observed upstream terms and the implementation's handling; it does not guarantee ownership of every upstream contribution or provide an independent legal compatibility opinion.
