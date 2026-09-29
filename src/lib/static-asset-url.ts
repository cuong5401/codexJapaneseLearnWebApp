/** Resolves public assets under Vite's configured deployment base. */
export function staticAssetUrl(path: string, baseUrl = import.meta.env.BASE_URL): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const relativePath = path.replace(/^\/+/, '')
  return `${base}${relativePath}`
}
