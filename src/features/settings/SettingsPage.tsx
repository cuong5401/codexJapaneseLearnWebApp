import { Laptop2, Moon, Sun } from 'lucide-react'
import { PageHeader } from '../../components/ui/page-header'
import { useTheme } from '../../app/theme/theme-context'
import type { Theme } from '../../app/theme/theme-context'
import { uiCopy } from '../../app/copy'

const themeOptions: { value: Theme; label: string; description: string; icon: typeof Sun }[] = [
  { value: 'light', label: uiCopy.appearance.light, description: uiCopy.settings.lightDescription, icon: Sun },
  { value: 'dark', label: uiCopy.appearance.dark, description: uiCopy.settings.darkDescription, icon: Moon },
  { value: 'system', label: uiCopy.appearance.system, description: uiCopy.settings.systemDescription, icon: Laptop2 },
]

export function SettingsPage() {
  const { theme, setTheme } = useTheme()
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
    <section className="settings-panel settings-about"><div className="settings-panel-heading"><h2>{uiCopy.settings.about}</h2><p>{uiCopy.settings.aboutDescription}</p></div><div className="settings-detail"><span>{uiCopy.settings.application}</span><strong>Kotoba</strong></div><div className="settings-detail"><span>{uiCopy.settings.currentPhase}</span><strong>{uiCopy.settings.currentPhaseValue}</strong></div></section>
  </div>
}
