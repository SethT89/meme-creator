import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { EditorEmptyState } from './EditorEmptyState'
import { PropertyBar } from './PropertyBar'
import { SaveDialog } from './SaveDialog'
import { useCreation, useCreateCreation, useCreations, useUpdateCreation } from '../../lib/queries/creations'
import { nextAvailableName } from '../../lib/creationNaming'

type Source = { type: 'template' | 'freeform'; name: string } | null
type SavedMeta = { id: string; name: string; tags: string[] } | null

export function EditorPage() {
  const { creationId } = useParams<{ creationId?: string }>()
  const navigate = useNavigate()

  const { data: existingCreation, isLoading: loadingExisting } = useCreation(creationId)
  const { data: allCreations = [] } = useCreations()
  const createCreation = useCreateCreation()
  const updateCreation = useUpdateCreation()

  const [source, setSource] = useState<Source>(null)
  const [savedMeta, setSavedMeta] = useState<SavedMeta>(null)
  const [selected, setSelected] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'save' | 'saveAs'>('save')
  const [dialogKey, setDialogKey] = useState(0)

  // When editing an existing creation, sync local state from it the first time
  // it loads for this id — done during render (not in an effect) so it doesn't
  // clobber local state after a later Save As switches to a new id locally.
  const [loadedCreationId, setLoadedCreationId] = useState<string | undefined>(undefined)
  if (existingCreation && existingCreation.id !== loadedCreationId) {
    setLoadedCreationId(existingCreation.id)
    setSource({
      type: existingCreation.source_type,
      name: existingCreation.name.replace(/ \d+$/, '') || existingCreation.name,
    })
    setSavedMeta({ id: existingCreation.id, name: existingCreation.name, tags: existingCreation.tags })
  }

  if (creationId && loadingExisting) {
    return <p className="p-8 text-sm text-muted-foreground">Loading…</p>
  }

  if (!source) {
    return (
      <EditorEmptyState
        onUpload={() => setSource({ type: 'freeform', name: 'My Meme' })}
        onSelectTemplate={(name) => setSource({ type: 'template', name })}
      />
    )
  }

  function startOver() {
    setSource(null)
    setSavedMeta(null)
    setSelected(false)
    if (creationId) navigate('/')
  }

  function openDialog(mode: 'save' | 'saveAs') {
    setDialogMode(mode)
    setDialogOpen(true)
    setDialogKey((k) => k + 1) // forces SaveDialog to remount with fresh internal state each time it opens
  }

  const defaultName =
    dialogMode === 'saveAs' && savedMeta
      ? `${savedMeta.name} copy`
      : nextAvailableName(source.name, allCreations.map((c) => c.name))
  const defaultTags = dialogMode === 'saveAs' && savedMeta ? savedMeta.tags : []

  function handleDialogSave(name: string, tags: string[]) {
    createCreation.mutate(
      { name, tags, sourceType: source!.type, templateId: null },
      {
        onSuccess: (row) => {
          setSavedMeta({ id: row.id, name: row.name, tags: row.tags })
          setDialogOpen(false)
        },
      },
    )
  }

  function handleQuickSave() {
    if (!savedMeta) return
    updateCreation.mutate({ id: savedMeta.id, name: savedMeta.name, tags: savedMeta.tags })
  }

  return (
    <div className="p-8">
      <h2 className="mb-3 text-lg font-semibold">{savedMeta ? savedMeta.name : 'Editor'}</h2>

      <div className="relative min-h-[320px] rounded-lg bg-[repeating-conic-gradient(#00000010_0%_25%,transparent_0%_50%)] bg-[length:20px_20px]">
        <div
          className="absolute inset-5 flex items-center justify-center border border-border bg-muted text-sm text-muted-foreground"
          onClick={() => setSelected(false)}
        >
          {source.name} {source.type === 'template' ? 'template (blank)' : ''}
        </div>

        <div className="absolute right-2.5 top-2.5 flex gap-1.5">
          <Button size="sm" variant="outline" onClick={startOver}>
            ← Start Over
          </Button>
          <Button size="sm" variant="outline" disabled>
            + Text
          </Button>
          <Button size="sm" variant="outline" disabled>
            + Sticker
          </Button>
          <Button size="sm" variant="outline" disabled>
            Export
          </Button>

          {!savedMeta && (
            <Button size="sm" onClick={() => openDialog('save')}>
              Save to Gallery
            </Button>
          )}
          {savedMeta && (
            <div className="flex">
              <Button size="sm" className="rounded-r-none" onClick={handleQuickSave}>
                Save
              </Button>
              <Button
                size="sm"
                aria-label="▾"
                className="rounded-l-none border-l border-primary-foreground/30 px-2"
                onClick={() => openDialog('saveAs')}
              >
                ▾
              </Button>
            </div>
          )}
        </div>

        <div
          className="absolute left-1/2 top-[36%] w-44 -translate-x-1/2 cursor-pointer border-[1.5px] border-blue-500 bg-white/90 p-1.5 text-center text-sm font-bold text-black"
          onClick={(e) => {
            e.stopPropagation()
            setSelected(true)
          }}
        >
          TOP TEXT GOES HERE
        </div>

        {selected && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2">
            <PropertyBar />
          </div>
        )}
      </div>

      <SaveDialog
        key={dialogKey}
        open={dialogOpen}
        title={dialogMode === 'saveAs' ? 'Save As — My Creations' : 'Save to My Creations'}
        defaultName={defaultName}
        defaultTags={defaultTags}
        existingCreations={allCreations}
        onCancel={() => setDialogOpen(false)}
        onSave={handleDialogSave}
      />
    </div>
  )
}
