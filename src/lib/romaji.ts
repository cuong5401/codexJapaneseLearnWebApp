const syllables: Record<string, string> = {
  kya: 'きゃ', kyu: 'きゅ', kyo: 'きょ', sha: 'しゃ', shu: 'しゅ', sho: 'しょ', cha: 'ちゃ', chu: 'ちゅ', cho: 'ちょ',
  nya: 'にゃ', nyu: 'にゅ', nyo: 'にょ', hya: 'ひゃ', hyu: 'ひゅ', hyo: 'ひょ', mya: 'みゃ', myu: 'みゅ', myo: 'みょ',
  rya: 'りゃ', ryu: 'りゅ', ryo: 'りょ', gya: 'ぎゃ', gyu: 'ぎゅ', gyo: 'ぎょ', ja: 'じゃ', ju: 'じゅ', jo: 'じょ',
  bya: 'びゃ', byu: 'びゅ', byo: 'びょ', pya: 'ぴゃ', pyu: 'ぴゅ', pyo: 'ぴょ',
  shi: 'し', chi: 'ち', tsu: 'つ', fu: 'ふ', ji: 'じ', si: 'し', ti: 'ち', tu: 'つ', hu: 'ふ', zi: 'じ',
  ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ', sa: 'さ', su: 'す', se: 'せ', so: 'そ', ta: 'た', te: 'て', to: 'と',
  na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の', ha: 'は', hi: 'ひ', he: 'へ', ho: 'ほ', ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も',
  ya: 'や', yu: 'ゆ', yo: 'よ', ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ', wa: 'わ', wo: 'を', n: 'ん',
  ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご', za: 'ざ', zu: 'ず', ze: 'ぜ', zo: 'ぞ', da: 'だ', di: 'ぢ', du: 'づ', de: 'で', do: 'ど',
  ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ', pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ',
  a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
}

export function romajiToHiragana(value: string): string | null {
  const input = value.normalize('NFKC').toLowerCase().replace(/[\s'-]/g, '')
  if (!input || !/^[a-z]+$/.test(input)) return null
  let output = ''
  for (let i = 0; i < input.length;) {
    const pair = input.slice(i, i + 2)
    if (i + 1 < input.length && input[i] === input[i + 1] && !'aeioun'.includes(input[i]!)) {
      output += 'っ'; i += 1; continue
    }
    if (input[i] === 'n' && i + 1 < input.length && input[i + 1] !== 'y' && !'aiueo'.includes(input[i + 1]!)) {
      output += 'ん'; i += 1; continue
    }
    const triple = input.slice(i, i + 3)
    const match = syllables[triple] ? [triple, syllables[triple]] : syllables[pair] ? [pair, syllables[pair]] : syllables[input[i]!] ? [input[i]!, syllables[input[i]!]!] : null
    if (!match) return null
    output += match[1]
    i += match[0].length
  }
  return output
}
