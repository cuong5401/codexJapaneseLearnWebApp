export function normalizeSearchInput(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().trim().replace(/\s+/g, ' ')
}

export function normalizeVietnamese(value: string): string {
  return normalizeSearchInput(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .normalize('NFC')
}

export function normalizedMeanings(meanings: { vi: string[]; en: string[] }) {
  return {
    normalizedMeaningVi: meanings.vi.map(normalizeVietnamese),
    normalizedMeaningEn: meanings.en.map(normalizeSearchInput),
  }
}
