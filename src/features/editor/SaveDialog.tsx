import { useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Chip } from '../../components/ui/chip'
import { Button } from '../../components/ui/button'
import { ModalOverlay } from '../../components/ui/ModalOverlay'
import { suggestTags } from '../../lib/creationNaming'
import { TAP_HEIGHT } from '../../lib/touch'

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
  const tagInputRef = useRef<HTMLInputElement>(null)
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
    <ModalOverlay>
      <div className="w-80 max-w-[calc(100vw-2rem)] rounded-lg bg-background p-4 shadow-lg">
        <h2 className="mb-3 text-sm font-semibold">{title}</h2>

        <label htmlFor="save-name" className="mb-1 block text-xs uppercase text-muted-foreground">
          Name
        </label>
        <input
          id="save-name"
          aria-label="Name"
          className={`mb-3 w-full rounded-md border border-border px-2 py-1.5 text-base sm:text-sm ${TAP_HEIGHT}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <p className="mb-1 text-xs uppercase text-muted-foreground">Tags</p>
        {/* The bordered box is the visible target, but only the thin input inside it took
            focus — tapping the rest of the box did nothing. Tapping the box's own empty space
            focuses the input (a tap on a chip or its ✕ is left alone). */}
        <div
          className={`mb-1 flex flex-wrap items-center gap-1.5 rounded-md border border-border p-1.5 ${TAP_HEIGHT}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) tagInputRef.current?.focus()
          }}
        >
          {tags.map((tag) => (
            <Chip key={tag} label={tag} onRemove={() => setTags(tags.filter((t) => t !== tag))} />
          ))}
          <input
            ref={tagInputRef}
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
                className={`flex cursor-pointer items-center px-2 py-1 text-xs hover:bg-muted ${TAP_HEIGHT}`}
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
    </ModalOverlay>
  )
}
