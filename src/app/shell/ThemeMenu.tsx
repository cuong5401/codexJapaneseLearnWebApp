import { Laptop2, Moon, Sun } from 'lucide-react'
import { IconButton } from '../../components/ui/icon-button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '../../components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip'
import { useTheme } from '../theme/theme-context'
import { uiCopy } from '../copy'

export function ThemeMenu() {
  const { theme, setTheme } = useTheme()
  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Laptop2
  return <DropdownMenu>
    <Tooltip><TooltipTrigger asChild><DropdownMenuTrigger asChild><IconButton label={uiCopy.appearance.change}><Icon size={18} /></IconButton></DropdownMenuTrigger></TooltipTrigger><TooltipContent>{uiCopy.appearance.label}</TooltipContent></Tooltip>
    <DropdownMenuContent align="end" className="theme-menu">
      <DropdownMenuLabel>{uiCopy.appearance.label}</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={theme} onValueChange={(value) => { if (value === 'light' || value === 'dark' || value === 'system') setTheme(value) }}>
        <DropdownMenuRadioItem value="light"><Sun size={16} />{uiCopy.appearance.light}</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="dark"><Moon size={16} />{uiCopy.appearance.dark}</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="system"><Laptop2 size={16} />{uiCopy.appearance.system}</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
}
