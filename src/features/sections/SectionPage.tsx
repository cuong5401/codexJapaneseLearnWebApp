import { BookOpen, CircleHelp } from 'lucide-react'
import type { SectionId } from '../../app/navigation'
import { sectionDetails } from '../../app/navigation'
import { EmptyState } from '../../components/ui/empty-state'
import { PageHeader } from '../../components/ui/page-header'

type Section = Exclude<SectionId, 'home' | 'settings'>
export function SectionPage({ section }: { section: Section }) {
  const details = sectionDetails[section]
  return <div className="section-page">
    <PageHeader eyebrow="STUDY SPACE" title={details.title} description={details.description} />
    <EmptyState icon={section === 'dictionary' ? <BookOpen size={21} /> : <CircleHelp size={21} />} title={`${details.title} is planned for a later phase`} description="This route is part of the application shell. Its learning tools and data will be implemented in a future phase." />
  </div>
}
