/** Vietnamese is preferred when supplied; production English glosses remain first-class. */
export function preferredMeaning(meanings: { vi: string[]; en: string[] }): string | undefined {
  return meanings.vi.find((value) => value.trim()) ?? meanings.en.find((value) => value.trim())
}

export function secondaryMeaning(meanings: { vi: string[]; en: string[] }): string | undefined {
  const primary = preferredMeaning(meanings)
  return meanings.vi.some((value) => value.trim())
    ? meanings.en.find((value) => value.trim() && value !== primary)
    : undefined
}
