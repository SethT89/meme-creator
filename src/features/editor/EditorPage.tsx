import { Fragment, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { EditorEmptyState } from './EditorEmptyState'
import type { SelectedTemplate } from './EditorEmptyState'
import { PropertyBar } from './PropertyBar'
import { SaveDialog } from './SaveDialog'
import { useCreation, useCreateCreation, useCreations, useUpdateCreation } from '../../lib/queries/creations'
import { useTemplates, useTemplateFields } from '../../lib/queries/templates'
import { nextAvailableName } from '../../lib/creationNaming'

type Source =
  | { type: 'freeform'; name: string }
  | { type: 'template'; name: string; templateId: string; blankImageUrl: string }
  | null
type SavedMeta = { id: string; name: string; tags: string[] } | null

export function EditorPage() {
  const { creationId } = useParams<{ creationId?: string }>()
  const navigate = useNavigate()

  const { data: existingCreation, isLoading: loadingExisting } = useCreation(creationId)
  const { data: allCreations = [] } = useCreations()
  const { data: allTemplates = [] } = useTemplates()
  const createCreation = useCreateCreation()
  const updateCreation = useUpdateCreation()

  const [source, setSource] = useState<Source>(null)
  const [savedMeta, setSavedMeta] = useState<SavedMeta>(null)
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'save' | 'saveAs'>('save')
  const [dialogKey, setDialogKey] = useState(0)

  const { data: fields = [] } = useTemplateFields(source?.type === 'template' ? source.templateId : undefined)

  // When editing an existing creation, sync local state from it the first time
  // it loads for this id — done during render (not in an effect) so it doesn't
  // clobber local state after a later Save As switches to a new id locally.
  const [loadedCreationId, setLoadedCreationId] = useState<string | undefined>(undefined)
  if (existingCreation && existingCreation.id !== loadedCreationId) {
    if (existingCreation.source_type === 'template' && existingCreation.template_id) {
      // allTemplates is a separate async query — it may not have resolved yet.
      // Don't mark loadedCreationId until we actually find the template, so
      // this block keeps retrying on later renders instead of giving up silently.
      const template = allTemplates.find((t) => t.id === existingCreation.template_id)
      if (template) {
        setLoadedCreationId(existingCreation.id)
        setSource({
          type: 'template',
          name: template.name,
          templateId: template.id,
          blankImageUrl: template.blank_image_url,
        })
        setSavedMeta({ id: existingCreation.id, name: existingCreation.name, tags: existingCreation.tags })
      }
    } else {
      setLoadedCreationId(existingCreation.id)
      setSource({ type: 'freeform', name: existingCreation.name.replace(/ \d+$/, '') || existingCreation.name })
      setSavedMeta({ id: existingCreation.id, name: existingCreation.name, tags: existingCreation.tags })
    }
  }

  if (creationId && loadingExisting) {
    return <p className="p-8 text-sm text-muted-foreground">Loading…</p>
  }

  if (!source) {
    return (
      <EditorEmptyState
        onUpload={() => setSource({ type: 'freeform', name: 'My Meme' })}
        onSelectTemplate={(template: SelectedTemplate) =>
          setSource({
            type: 'template',
            name: template.name,
            templateId: template.id,
            blankImageUrl: template.blankImageUrl,
          })
        }
      />
    )
  }

  function startOver() {
    setSource(null)
    setSavedMeta(null)
    setSelectedFieldId(null)
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
    const activeSource = source! // guaranteed non-null: this handler only runs once `source` is set (see the `!source` early return above)
    createCreation.mutate(
      {
        name,
        tags,
        sourceType: activeSource.type,
        templateId: activeSource.type === 'template' ? activeSource.templateId : null,
      },
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

  const templateRow = source.type === 'template' ? allTemplates.find((t) => t.id === source.templateId) : undefined

  return (
    // Deselects on any click that isn't explicitly stopped from bubbling —
    // by the selected field itself, or the property bar's own controls.
    <div className="mx-auto max-w-2xl p-8" onClick={() => setSelectedFieldId(null)}>
      <h2 className="mb-3 text-lg font-semibold">{savedMeta ? savedMeta.name : 'Editor'}</h2>

      {/* Page-level actions live above the canvas, not overlapping the image —
          only per-field editing controls (PropertyBar) appear on the canvas itself. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-1.5">
        <Button size="sm" variant="outline" onClick={startOver}>
          ← Start Over
        </Button>
        <div className="flex flex-wrap gap-1.5">
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
      </div>

      <div className="flex justify-center">
        <div className="relative inline-block rounded-lg bg-[repeating-conic-gradient(#00000010_0%_25%,transparent_0%_50%)] bg-[length:20px_20px]">
          {source.type === 'template' ? (
            <img
              src={source.blankImageUrl}
              alt={source.name}
              // No explicit width/height — the browser scales the image down
              // to fit within these bounds using its own intrinsic aspect
              // ratio, so portrait/landscape/square templates all render
              // undistorted regardless of viewport width.
              className="block max-h-[65vh] w-auto max-w-full"
            />
          ) : (
            <div className="flex h-80 w-80 items-center justify-center border border-border bg-muted text-sm text-muted-foreground">
              {source.name}
            </div>
          )}

          {source.type === 'template' &&
            templateRow &&
            fields.map((field) => {
              const leftPct = (field.position_x / templateRow.image_width) * 100
              const topPct = (field.position_y / templateRow.image_height) * 100
              const widthPct = (field.width / templateRow.image_width) * 100
              const heightPct = (field.height / templateRow.image_height) * 100

              return (
                <Fragment key={field.id}>
                  <div
                    className="absolute cursor-pointer overflow-hidden border-[1.5px] border-blue-500 bg-white/90 p-1 text-center font-bold text-black"
                    style={{
                      left: `${leftPct}%`,
                      top: `${topPct}%`,
                      width: `${widthPct}%`,
                      height: `${heightPct}%`,
                      fontSize: `${field.font_size}px`,
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedFieldId(field.id)
                    }}
                  >
                    {field.label}
                  </div>

                  {selectedFieldId === field.id && (
                    <div
                      className="absolute"
                      style={{
                        left: `${leftPct + widthPct / 2}%`,
                        top: `${topPct}%`,
                        // Anchored to the field's own position, not the canvas
                        // center — sits just above the field, horizontally centered on it.
                        transform: 'translate(-50%, calc(-100% - 8px))',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <PropertyBar />
                    </div>
                  )}
                </Fragment>
              )
            })}
        </div>
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
