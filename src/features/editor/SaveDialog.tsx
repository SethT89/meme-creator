import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Chip } from '../../components/ui/chip'
import { Button } from '../../components/ui/button'
import { suggestTags } from '../../lib/creationNaming'

export interface SaveDialogProps {
  open: boolean
  title: string
  defaultName: string
  defaultTags: string[]
  existingCreations: Array<{ tags: string[] }>
  // True while the save is in flight (rendering the preview, uploading, writing
  // the row): the Save button spins and both buttons lock, so it never looks stuck.
  saving?: boolean
  onCancel: () => void
  onSave: (name: string, tags: string[]) => void
}

export function SaveDialog({
  open,
  title,
  defaultName,
  defaultTags,
  existingCreations,
  saving = false,
  onCancel,
  onSave,
}: SaveDialogProps) {
  const [name, setName] = useState(defaultName)
  const [tags, setTags] = useState<string[]>(defaultTags)
  const [tagInput, setTagInput] = useState('')
  const tagSuggestions = suggestTags(existingCreations, tagInput)

  if (!open) return null

  function addTag(tag: string) {
    const trimmed = tag.trim()
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed])
    }
    setTagInput('')
  }

  return (
    <div role="dialog" className="fixed inset-0 flex items-center justify-center bg-black/50">
      <div className="w-80 rounded-lg bg-background p-4 shadow-lg">
        <h2 className="mb-3 text-sm font-semibold">{title}</h2>

        <label htmlFor="save-name" className="mb-1 block text-xs uppercase text-muted-foreground">
          Name
        </label>
        <input
          id="save-name"
          aria-label="Name"
          className="mb-3 w-full rounded-md border border-border px-2 py-1.5 text-base sm:text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <p className="mb-1 text-xs uppercase text-muted-foreground">Tags</p>
        <div className="mb-1 flex flex-wrap gap-1.5 rounded-md border border-border p-1.5">
          {tags.map((tag) => (
            <Chip key={tag} label={tag} onRemove={() => setTags(tags.filter((t) => t !== tag))} />
          ))}
          <input
            className="min-w-[60px] flex-1 text-base outline-none sm:text-xs"
            placeholder="add a tag..."
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTag(tagInput)
              }
            }}
          />
        </div>
        {tagInput && tagSuggestions.length > 0 && (
          <div className="mb-3 rounded-md border border-border">
            {tagSuggestions.map((s) => (
              <div
                key={s}
                className="cursor-pointer px-2 py-1 text-xs hover:bg-muted"
                onClick={() => addTag(s)}
              >
                {s}
              </div>
            ))}
          </div>
        )}
        {!tagInput && <div className="mb-3" />}

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" disabled={saving} onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" disabled={saving} onClick={() => onSave(name, tags)}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}
