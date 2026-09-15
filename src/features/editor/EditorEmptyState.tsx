// Template names are hardcoded placeholders. The admin add-template flow
// (which would make these real, admin-created rows) is a separate,
// not-yet-built sub-project — see docs/superpowers/specs/2026-09-15-app-ui-ux-design.md.
const PLACEHOLDER_TEMPLATES = ['Drake', 'Distracted Boyfriend', 'Expanding Brain', 'Two Buttons']

export interface EditorEmptyStateProps {
  onUpload: () => void
  onSelectTemplate: (name: string) => void
}

export function EditorEmptyState({ onUpload, onSelectTemplate }: EditorEmptyStateProps) {
  return (
    <div className="p-8">
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
      <div className="grid grid-cols-4 gap-2.5">
        {PLACEHOLDER_TEMPLATES.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => onSelectTemplate(name)}
            className="flex h-20 items-end rounded-md bg-muted p-1.5 text-left text-xs"
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  )
}
