import { useTemplates } from '../../lib/queries/templates'

export function GalleryPage() {
  const { data: templates, isLoading } = useTemplates()

  return (
    <section className="p-8">
      <h2 className="text-xl font-semibold">My Creations</h2>
      <p className="text-sm text-slate-500">
        {isLoading ? 'Loading templates…' : `${templates?.length ?? 0} templates available`}
      </p>
    </section>
  )
}
