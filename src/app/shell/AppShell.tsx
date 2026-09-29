import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { BookOpen, ChevronRight, House, MoreHorizontal, RotateCcw, Search, X } from 'lucide-react'
import { useState } from 'react'
import { mainNavigation, settingsNavigation } from '../navigation'
import { ThemeMenu } from './ThemeMenu'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '../../components/ui/sheet'
import { IconButton } from '../../components/ui/icon-button'
import { uiCopy } from '../copy'

const studyIds = ['kanji', 'grammar', 'jlpt'] as const
const moreIds = ['myVocabulary', 'reading', 'notebook', 'progress', 'settings'] as const

function getCurrentTitle(pathname: string) {
  if (pathname.startsWith('/dictionary/')) return uiCopy.navigation.dictionary
  if (pathname.startsWith('/review/')) return uiCopy.navigation.review
  if (pathname.startsWith('/reading/')) return uiCopy.navigation.reading
  if (pathname.startsWith('/my-vocabulary')) return uiCopy.navigation.myVocabulary
  if (pathname.startsWith('/jlpt/')) return uiCopy.navigation.jlpt
  if (pathname.startsWith('/notebook/')) return uiCopy.navigation.notebook
  const item = [...mainNavigation, settingsNavigation].find((nav) => nav.path === pathname)
  if (item) return item.label
  return uiCopy.navigation.home
}

function Brand() {
  return <NavLink className="brand" to="/" aria-label={uiCopy.accessibility.home}><span className="brand-mark" aria-hidden="true">言</span><span>kotoba</span></NavLink>
}

function Sidebar() {
  return <aside className="sidebar" aria-label={uiCopy.accessibility.mainNavigation}>
    <Brand />
    <p className="sidebar-label">{uiCopy.shell.studySpace}</p>
    <nav className="sidebar-nav">
      {mainNavigation.map(({ id, label, path, icon: Icon }) => <NavLink key={id} to={path} end={path === '/'} className={({ isActive }) => `sidebar-link${isActive ? ' is-active' : ''}`}>
        <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
      </NavLink>)}
    </nav>
    <div className="sidebar-bottom">
      <div className="sidebar-divider" />
      <NavLink to={settingsNavigation.path} className={({ isActive }) => `sidebar-link${isActive ? ' is-active' : ''}`}><settingsNavigation.icon size={18} strokeWidth={1.8} /><span>Settings</span></NavLink>
      <div className="sidebar-footnote"><span className="local-indicator" />{uiCopy.shell.localStudySpace}</div>
    </div>
  </aside>
}

function MobileSheet({ kind, open, onOpenChange }: { kind: 'study' | 'more'; open: boolean; onOpenChange: (open: boolean) => void }) {
  const items = kind === 'study'
    ? studyIds.map((id) => mainNavigation.find((item) => item.id === id)).filter((item) => item !== undefined)
    : moreIds.map((id) => id === 'settings' ? settingsNavigation : mainNavigation.find((item) => item.id === id)).filter((item) => item !== undefined)
  const title = kind === 'study' ? uiCopy.shell.study : uiCopy.shell.more
  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent className="mobile-sheet">
      <div className="sheet-grabber" aria-hidden="true" />
      <div className="sheet-heading"><div><SheetTitle>{title}</SheetTitle><SheetDescription>{kind === 'study' ? uiCopy.shell.chooseStudyArea : uiCopy.shell.moreOfWorkspace}</SheetDescription></div><IconButton label={uiCopy.accessibility.closeMenu} onClick={() => onOpenChange(false)}><X size={18} /></IconButton></div>
      <nav className="sheet-links" aria-label={`${title} navigation`}>
        {items.map((item) => {
          const Icon = item.icon
          return <NavLink key={item.id} to={item.path} onClick={() => onOpenChange(false)} className={({ isActive }) => `sheet-link${isActive ? ' is-active' : ''}`}>
            <span className="sheet-link-icon"><Icon size={18} /></span><span>{item.label}</span><ChevronRight className="sheet-chevron" size={16} />
          </NavLink>
        })}
      </nav>
    </SheetContent>
  </Sheet>
}

function MobileNavigation() {
  const { pathname } = useLocation()
  const [sheet, setSheet] = useState<'study' | 'more' | null>(null)
  const activeStudy = studyIds.some((id) => pathname === `/${id}` || (id === 'jlpt' && pathname.startsWith('/jlpt/')))
  const activeMore = moreIds.some((id) => mainNavigation.find((item) => item.id === id)?.path === pathname || (id === 'myVocabulary' && pathname.startsWith('/my-vocabulary')) || (id === 'notebook' && pathname.startsWith('/notebook')))
  return <>
    <nav className="mobile-nav" aria-label={uiCopy.accessibility.primaryNavigation}>
      <NavLink to="/" end className={({ isActive }) => `mobile-nav-item${isActive ? ' is-active' : ''}`}><span className="mobile-nav-icon"><House size={20} /></span><span>{uiCopy.shell.mobileNavigation.home}</span></NavLink>
      <NavLink to="/dictionary" className={({ isActive }) => `mobile-nav-item${isActive ? ' is-active' : ''}`}><span className="mobile-nav-icon"><Search size={20} /></span><span>{uiCopy.shell.mobileNavigation.search}</span></NavLink>
      <button type="button" className={`mobile-nav-item${activeStudy ? ' is-active' : ''}`} aria-haspopup="dialog" aria-expanded={sheet === 'study'} onClick={() => setSheet('study')}><span className="mobile-nav-icon"><BookOpen size={20} /></span><span>{uiCopy.shell.mobileNavigation.study}</span></button>
      <NavLink to="/review" className={({ isActive }) => `mobile-nav-item${isActive ? ' is-active' : ''}`}><span className="mobile-nav-icon"><RotateCcw size={20} /></span><span>{uiCopy.shell.mobileNavigation.review}</span></NavLink>
      <button type="button" className={`mobile-nav-item${activeMore ? ' is-active' : ''}`} aria-haspopup="dialog" aria-expanded={sheet === 'more'} onClick={() => setSheet('more')}><span className="mobile-nav-icon"><MoreHorizontal size={20} /></span><span>{uiCopy.shell.mobileNavigation.more}</span></button>
    </nav>
    <MobileSheet kind="study" open={sheet === 'study'} onOpenChange={(open) => setSheet(open ? 'study' : null)} />
    <MobileSheet kind="more" open={sheet === 'more'} onOpenChange={(open) => setSheet(open ? 'more' : null)} />
  </>
}

export function AppShell() {
  const location = useLocation()
  const currentTitle = getCurrentTitle(location.pathname)
  const title = location.pathname === '/' ? uiCopy.navigation.home : currentTitle

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">{uiCopy.accessibility.skipToContent}</a>
    <Sidebar />
    <div className="main-column">
      <header className="topbar">
        <div className="topbar-brand"><Brand /></div>
        <div className="breadcrumb"><span>{uiCopy.shell.workspace}</span><ChevronRight size={14} /><strong>{title}</strong></div>
        <div className="topbar-right"><ThemeMenu /></div>
      </header>
      <main id="main-content" className="main-content"><Outlet /></main>
    </div>
    <MobileNavigation />
  </div>
}
