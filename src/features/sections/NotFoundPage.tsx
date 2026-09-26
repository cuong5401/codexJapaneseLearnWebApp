import { CircleHelp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { PageHeader } from '../../components/ui/page-header'

export function NotFoundPage() {
  return <div><PageHeader eyebrow="KOTOBA WORKSPACE" title="Page not found" description="That destination is not part of this workspace." /><EmptyState icon={<CircleHelp size={21} />} title="This page doesn't exist" description="Return to your study overview to continue." action={<Button asChild><Link to="/">Go to Home</Link></Button>} /></div>
}
