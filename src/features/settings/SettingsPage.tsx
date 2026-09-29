import { Laptop2, Moon, Sun } from 'lucide-react'
import { PageHeader } from '../../components/ui/page-header'
import { useTheme } from '../../app/theme/theme-context'
import type { Theme } from '../../app/theme/theme-context'
import { uiCopy } from '../../app/copy'
import { useEffect, useState } from 'react'
import { SettingsRepository } from '../../db/repositories/user-data'
import { staticAssetUrl } from '../../lib/static-asset-url'

const settingsRepository = new SettingsRepository()
const dailyLimitKey = 'review.dailyNewLimit'
const dailyLimitChoices = [0, 5, 10, 20, 30, 50]

interface DataSourceNotice { id: string; name: string; url: string; version: string; license: string; licenseUrl: string; attribution: string; noticePath?: string }
function isDataSourceNotice(value: unknown): value is DataSourceNotice {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return ['id', 'name', 'url', 'version', 'license', 'licenseUrl', 'attribution'].every((key) => typeof item[key] === 'string')
    && /^https?:\/\//u.test(String(item.url)) && /^https?:\/\//u.test(String(item.licenseUrl))
    && (item.noticePath === undefined || (typeof item.noticePath === 'string' && !item.noticePath.includes('..') && !item.noticePath.includes(':')))
}

function DataSources() {
  const [sources, setSources] = useState<DataSourceNotice[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  useEffect(() => {
    const controller = new AbortController()
    void fetch(staticAssetUrl('data/production/sources.json'), { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error('Source notices unavailable')
      const value: unknown = await response.json()
      if (!Array.isArray(value) || !value.length || !value.every(isDataSourceNotice)) throw new Error('Invalid source notices')
      if (!controller.signal.aborted) { setSources(value); setStatus('ready') }
    }).catch(() => { if (!controller.signal.aborted) setStatus('error') })
    return () => controller.abort()
  }, [])
  return <section className="settings-panel" aria-labelledby="data-sources-heading">
    <div className="settings-panel-heading"><h2 id="data-sources-heading">Data sources / Licenses</h2><p>Reference content is licensed separately from the application. JLPT assignments are study references, not official JLPT lists.</p></div>
    {status === 'loading' && <p className="content-subtle" role="status">Loading source notices…</p>}
    {status === 'error' && <p className="content-subtle" role="status">Source notices could not be loaded. Reconnect and reopen Settings to try again.</p>}
    {sources.map((source) => <details className="settings-detail settings-attribution" key={source.id}><summary>{source.name} · {source.license}</summary><p>{source.attribution}</p><p>Source version: {source.version}</p><p><a href={source.url} target="_blank" rel="noopener noreferrer">Source</a> · <a href={source.licenseUrl} target="_blank" rel="noopener noreferrer">License terms</a>{source.noticePath && <> · <a href={staticAssetUrl(source.noticePath)} target="_blank" rel="noopener noreferrer">Preserved notices</a></>}</p></details>)}
  </section>
}

const themeOptions: { value: Theme; label: string; description: string; icon: typeof Sun }[] = [
  { value: 'light', label: uiCopy.appearance.light, description: uiCopy.settings.lightDescription, icon: Sun },
  { value: 'dark', label: uiCopy.appearance.dark, description: uiCopy.settings.darkDescription, icon: Moon },
  { value: 'system', label: uiCopy.appearance.system, description: uiCopy.settings.systemDescription, icon: Laptop2 },
]

export function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const [dailyNewLimit, setDailyNewLimit] = useState(20)
  useEffect(() => { void settingsRepository.get(dailyLimitKey).then((setting) => { if (typeof setting?.value === 'number' && Number.isInteger(setting.value) && setting.value >= 0 && setting.value <= 100) setDailyNewLimit(setting.value) }) }, [])
  return <div className="settings-page">
    <PageHeader eyebrow={uiCopy.settings.preferences} title={uiCopy.settings.title} description={uiCopy.settings.description} />
    <section className="settings-panel" aria-labelledby="appearance-heading">
      <div className="settings-panel-heading"><h2 id="appearance-heading">{uiCopy.settings.appearance}</h2><p>{uiCopy.settings.deviceThemeNote}</p></div>
      <div className="theme-options" role="group" aria-label={uiCopy.settings.colorTheme}>
        {themeOptions.map(({ value, label, description, icon: Icon }) => <button key={value} type="button" className={`theme-option${theme === value ? ' is-selected' : ''}`} onClick={() => setTheme(value)} aria-pressed={theme === value}>
          <Icon size={18} /><span className="theme-option-copy"><strong>{label}</strong><small>{description}</small></span><span className="theme-radio" aria-hidden="true" />
        </button>)}
      </div>
    </section>
    <section className="settings-panel"><div className="settings-panel-heading"><h2>Review pace</h2><p>The daily new card limit is stored locally on this device.</p></div><label className="settings-review-limit"><span>New cards per day</span><select value={dailyNewLimit} onChange={(event) => { const value = Number(event.target.value); setDailyNewLimit(value); void settingsRepository.set(dailyLimitKey, value) }}>{dailyLimitChoices.map((value) => <option key={value} value={value}>{value} per day</option>)}</select></label></section>
    <DataSources />
    <section className="settings-panel settings-about"><div className="settings-panel-heading"><h2>{uiCopy.settings.about}</h2><p>{uiCopy.settings.aboutDescription}</p></div><div className="settings-detail"><span>{uiCopy.settings.application}</span><strong>Kotoba</strong></div><div className="settings-detail"><span>{uiCopy.settings.currentPhase}</span><strong>{uiCopy.settings.currentPhaseValue}</strong></div><div className="settings-detail settings-attribution"><span>Online dictionary attribution</span><p>Wiktionary content is provided under the Creative Commons Attribution-ShareAlike license. Individual entries link to their source page.</p><a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a></div></section>
  </div>
}
