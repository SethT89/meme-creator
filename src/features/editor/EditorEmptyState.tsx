import { useTemplates } from '../../lib/queries/templates'

export interface SelectedTemplate {
  id: string
  name: string
  blankImageUrl: string
  imageWidth: number
  imageHeight: number
}

export interface EditorEmptyStateProps {
  onUpload: () => void
  onSelectTemplate: (template: SelectedTemplate) => void
}

export function EditorEmptyState({ onUpload, onSelectTemplate }: EditorEmptyStateProps) {
  const { data: templates = [], isLoading } = useTemplates()

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h2 className="text-lg font-semibold">Start a New Meme</h2>
      <p className="mb-4 text-sm text-muted-foreground">Upload your own image, or choose a template</p>

      <button
        type="button"
        onClick={onUpload}
        className="mb-4 flex h-20 w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border text-sm"
      >
        <span>⬆</span>
        <span>Drag an image here, or click to upload</span>
      </button>

      <p className="mb-2 text-xs uppercase text-muted-foreground">— or choose a template —</p>

      {!isLoading && templates.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No templates yet — the admin add-template flow isn't built yet, so these have to be seeded by hand for now.
        </p>
      )}

      {/* Fixed aspect-square tiles (not a fixed height with flexible width) so thumbnails
          keep a sane, consistent shape regardless of viewport width or the source image's
          own orientation — bg-cover crops to fill the square rather than stretching. */}
      <div className="grid grid-cols-4 gap-2.5">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() =>
              onSelectTemplate({
                id: t.id,
                name: t.name,
                blankImageUrl: t.blank_image_url,
                imageWidth: t.image_width,
                imageHeight: t.image_height,
              })
            }
            className="flex aspect-square items-end overflow-hidden rounded-md bg-muted bg-cover bg-center p-1.5 text-left text-xs font-medium text-white [text-shadow:0_1px_2px_rgb(0_0_0_/_0.8)]"
            style={{ backgroundImage: `url(${t.blank_image_url})` }}
          >
            {t.name}
          </button>
        ))}
      </div>
    </div>
  )
}
