export function normalizeJapanese(value: string): string {
  return value.normalize('NFKC').trim().replace(/[\u30a1-\u30f6]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 0x60),
  ).toLowerCase()
}

