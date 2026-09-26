import { readFile, writeFile } from 'node:fs/promises'

const version = '0.1.0-dev.2'
async function read(name) { return JSON.parse(await readFile(`public/data/${name}/${name}-0001.json`, 'utf8')) }
async function write(name, rows) { await writeFile(`public/data/${name}/${name}-0001.json`, `${JSON.stringify(rows, null, 2)}\n`, 'utf8') }

const kanjiRows = await read('kanji')
kanjiRows.forEach((entry) => { entry.datasetVersion = version })
for (const entry of kanjiRows) {
  if (['日', '本', '語', '学', '校', '人', '大', '小', '上'].includes(entry.character)) entry.jlptLevel = 'N5'
  if (['食', '読', '書', '解'].includes(entry.character)) entry.jlptLevel = 'N4'
}
const kanji = [
  ['推', ['đẩy; đề cử'], ['push; recommend'], ['スイ'], ['お.す'], 11, '手', 'N2', ['推薦', '推奨']],
  ['薦', ['tiến cử; giới thiệu'], ['recommend; suggest'], ['セン'], ['すす.める'], 16, '艹', 'N1', ['推薦']],
  ['改', ['sửa đổi; cải thiện'], ['reform; revise'], ['カイ'], ['あらた.める', 'あらた.まる'], 7, '攵', 'N3', ['改善']],
  ['善', ['tốt; thiện'], ['good; virtuous'], ['ゼン'], ['よ.い'], 12, '口', 'N3', ['改善']],
  ['略', ['lược bỏ; sơ lược'], ['omit; abbreviation'], ['リャク'], ['ほぼ'], 11, '田', 'N2', ['省略']],
  ['把', ['nắm; cầm'], ['grasp; hold'], ['ハ'], [], 7, '手', null, ['把握']],
  ['握', ['nắm chặt'], ['grip; grasp'], ['アク'], ['にぎ.る'], 12, '手', 'N1', ['把握']],
  ['検', ['kiểm tra; xem xét'], ['examine; inspect'], ['ケン'], [], 12, '木', 'N2', ['検討']],
  ['討', ['thảo luận; xem xét'], ['discuss; examine'], ['トウ'], ['う.つ'], 10, '言', 'N2', ['検討']],
  ['促', ['thúc đẩy; giục'], ['urge; promote'], ['ソク'], ['うなが.す'], 9, '人', 'N2', ['促進']],
  ['進', ['tiến lên; tiến độ'], ['advance; progress'], ['シン'], ['すす.む', 'すす.める'], 11, '辶', 'N3', ['促進', '進捗']],
  ['捗', ['tiến triển'], ['make progress'], ['チョク'], ['はかど.る'], 11, '手', null, ['進捗']],
  ['省', ['tỉnh; lược bỏ'], ['省; omit'], ['セイ', 'ショウ'], ['かえり.みる', 'はぶ.く'], 9, '目', 'N2', ['省略']],
  ['昇', ['đi lên; tăng'], ['rise; ascend'], ['ショウ'], ['のぼ.る'], 8, '日', 'N3', ['上昇']],
  ['響', ['vang; ảnh hưởng'], ['echo; influence'], ['キョウ'], ['ひび.く'], 20, '音', 'N2', ['影響']],
  ['影', ['bóng; ảnh hưởng'], ['shadow; influence'], ['エイ'], ['かげ'], 15, '彡', 'N2', ['影響']],
  ['対', ['đối; ứng với'], ['opposite; respond to'], ['タイ', 'ツイ'], [''], 7, '寸', 'N3', ['対応']],
  ['応', ['đáp ứng; phản hồi'], ['respond; answer'], ['オウ'], ['こた.える'], 7, '心', 'N3', ['対応']],
  ['解', ['giải; hiểu'], ['solve; understand'], ['カイ', 'ゲ'], ['と.く', 'と.ける', 'わか.る'], 13, '角', 'N3', ['読解']],
]
for (const [character, vi, en, onyomi, kunyomi, strokeCount, radical, jlptLevel, commonCompounds] of kanji) {
  if (kanjiRows.some((entry) => entry.character === character)) continue
  kanjiRows.push({ id: character, datasetVersion: version, character, meanings: { vi, en }, onyomi, kunyomi: kunyomi.filter(Boolean), strokeCount, radical, radicalName: null, jlptLevel, grade: null, frequencyRank: null, commonCompounds, tags: ['dev-seed', 'phase4-reviewed'] })
}
await write('kanji', kanjiRows)

const dictionaryRows = await read('dictionary')
dictionaryRows.forEach((entry) => { entry.datasetVersion = version })
await write('dictionary', dictionaryRows)

const examples = await read('examples')
examples.forEach((entry) => { entry.datasetVersion = version })
const newExamples = [
  ['ex-grammar-naide', 'ここで写真を撮らないでください。', 'ここでしゃしんをとらないでください。', 'Xin đừng chụp ảnh ở đây.', 'Please do not take photos here.'],
  ['ex-grammar-shimau', '財布を家に忘れてしまいました。', 'さいふをいえにわすれてしまいました。', 'Tôi lỡ quên ví ở nhà mất rồi.', 'I accidentally left my wallet at home.'],
  ['ex-grammar-kotonisuru', '毎朝、漢字を五つ覚えることにしました。', 'まいあさ、かんじをいつつおぼえることにしました。', 'Tôi đã quyết định học thuộc năm chữ Hán mỗi sáng.', 'I decided to learn five kanji every morning.'],
  ['ex-grammar-ni-chigainai', '彼はもう駅に着いたに違いありません。', 'かれはもうえきについたにちがいありません。', 'Chắc hẳn anh ấy đã đến ga rồi.', 'He must have arrived at the station already.'],
  ['ex-grammar-nimokakawarazu', '雨にもかかわらず、多くの人が集まりました。', 'あめにもかかわらず、おおくのひとがあつまりました。', 'Mặc dù trời mưa, nhiều người vẫn đã tập trung.', 'Despite the rain, many people gathered.'],
  ['ex-grammar-wake-ni-wa-ikanai', '今日は大事な会議があるので、休むわけにはいきません。', 'きょうはだいじなかいぎがあるので、やすむわけにはいきません。', 'Hôm nay có cuộc họp quan trọng nên tôi không thể nghỉ.', 'I cannot take the day off because there is an important meeting today.'],
  ['ex-grammar-kinjienai', '彼女の努力に感動を禁じ得ませんでした。', 'かのじょのどりょくにかんどうをきんじえませんでした。', 'Tôi không thể kìm nén sự xúc động trước nỗ lực của cô ấy.', 'I could not help feeling moved by her effort.'],
]
for (const [id, japanese, reading, translationVi, translationEn] of newExamples) {
  if (examples.some((example) => example.id === id)) continue
  examples.push({ id, datasetVersion: version, japanese, reading, translationVi, translationEn, source: null, tags: ['dev-seed', 'phase4-reviewed'] })
}
await write('examples', examples)

const grammarRows = await read('grammar')
grammarRows.forEach((entry) => { entry.datasetVersion = version })
const grammar = [
  ['grammar-naide-kudasai', '～ないでください', 'Xin đừng làm…', 'please do not; please refrain from', 'Vない + でください', 'Dùng để đưa ra yêu cầu lịch sự không thực hiện một hành động.', 'A polite request asking someone not to do something.', 'ex-grammar-naide', 'N5'],
  ['grammar-te-kara', '～てから', 'sau khi làm…', 'after doing', 'Vて + から', 'Diễn tả hành động thứ hai xảy ra sau khi hành động thứ nhất hoàn tất.', 'Indicates that one action happens after another is completed.', 'ex-study', 'N5'],
  ['grammar-te-shimau', '～てしまう', 'lỡ; làm xong mất rồi', 'end up doing; do completely', 'Vて + しまう', 'Có thể diễn tả hành động hoàn tất hoặc điều không mong muốn đã xảy ra.', 'Can express completion or an unintended, regrettable result.', 'ex-grammar-shimau', 'N4'],
  ['grammar-yotei', '～予定だ', 'dự định; theo kế hoạch', 'plan to; be scheduled to', 'Vる / Nの + 予定だ', 'Nói về kế hoạch hoặc lịch trình đã định.', 'Describes a plan or scheduled event.', 'ex-school', 'N4'],
  ['grammar-kotonisuru', '～ことにする', 'quyết định làm…', 'decide to do', 'Vる / Vない + ことにする', 'Diễn tả quyết định do chính người nói đưa ra.', 'Expresses a decision made by the speaker.', 'ex-grammar-kotonisuru', 'N3'],
  ['grammar-hazuda', '～はずだ', 'chắc là; lẽ ra', 'should; be expected to', '普通形 + はずだ', 'Diễn tả điều được suy ra từ thông tin hoặc lý do đã biết.', 'Expresses an expectation or conclusion based on known information.', 'ex-experience', 'N3'],
  ['grammar-ni-chigainai', '～に違いない', 'chắc chắn là', 'must be; surely', '普通形 + に違いない', 'Nêu suy đoán mạnh dựa trên căn cứ mà người nói tin là thuyết phục.', 'States a strong inference the speaker considers well supported.', 'ex-grammar-ni-chigainai', 'N2'],
  ['grammar-wake-ni-wa-ikanai', '～わけにはいかない', 'không thể (vì trách nhiệm/hoàn cảnh)', 'cannot; must not (due to circumstances)', 'Vる + わけにはいかない', 'Diễn tả việc không thể làm vì nghĩa vụ, trách nhiệm hoặc hoàn cảnh.', 'Expresses that circumstances or responsibility make an action impossible.', 'ex-grammar-wake-ni-wa-ikanai', 'N2'],
  ['grammar-ni-mo-kakawarazu', '～にもかかわらず', 'mặc dù; bất chấp', 'despite; although', '普通形 / N + にもかかわらず', 'Nối hai mệnh đề có nội dung trái với điều được mong đợi.', 'Connects clauses when the result is contrary to expectation.', 'ex-grammar-nimokakawarazu', 'N2'],
  ['grammar-wo-kinjienai', '～を禁じ得ない', 'không thể kìm nén; không khỏi', 'cannot help; be unable to suppress', 'N + を禁じ得ない', 'Diễn tả cảm xúc mạnh không thể kìm nén trước một sự việc.', 'Describes a strong feeling that cannot be suppressed in response to something.', 'ex-grammar-kinjienai', 'N1'],
].map(([id, pattern, vi, en, formation, explanationVi, explanationEn, exampleId, jlptLevel]) => ({
  id, datasetVersion: version, pattern, normalizedPattern: pattern.normalize('NFKC').toLowerCase(), meaningVi: [vi], meaningEn: [en], jlptLevel,
  formation: [formation], explanationVi, explanationEn, exampleSentenceIds: [exampleId], notes: [], tags: ['dev-seed', 'phase4-reviewed'],
}))
for (const entry of grammar) {
  const existingIndex = grammarRows.findIndex((row) => row.id === entry.id)
  if (existingIndex < 0) grammarRows.push(entry)
  else Object.assign(grammarRows[existingIndex], entry)
}
await write('grammar', grammarRows)

const manifest = JSON.parse(await readFile('public/data/manifest.json', 'utf8'))
manifest.datasetVersion = version
manifest.collections.kanji.count = kanjiRows.length
manifest.collections.kanji.chunks[0].itemCount = kanjiRows.length
manifest.collections.grammar.count = grammarRows.length
manifest.collections.grammar.chunks[0].itemCount = grammarRows.length
manifest.collections.examples.count = examples.length
manifest.collections.examples.chunks[0].itemCount = examples.length
await writeFile('public/data/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`Seed now has ${kanjiRows.length} kanji, ${grammarRows.length} grammar entries, and ${examples.length} examples.`)
