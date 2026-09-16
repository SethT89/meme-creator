import { Fragment, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { EditorEmptyState } from './EditorEmptyState'
import type { SelectedTemplate } from './EditorEmptyState'
import { PropertyBar } from './PropertyBar'
import { SaveDialog } from './SaveDialog'
import { useCreation, useCreateCreation, useCreations, useUpdateCreation } from '../../lib/queries/creations'
import { useTemplates, useTemplateFields } from '../../lib/queries/templates'
import { nextAvailableName } from '../../lib/creationNaming'
import { layersFromCanvasData, applyDragDelta, applyResizeDelta } from '../../lib/layers'
import type { Layer, ResizeSign } from '../../lib/layers'
import type { Json } from '../../types/database'

type Source =
  | { type: 'freeform'; name: string }
  | { type: 'template'; name: string; templateId: string; blankImageUrl: string }
  | null
type SavedMeta = { id: string; name: string; tags: string[] } | null

// The 8 resize handles: 4 corners (control both axes) and 4 edge midpoints
// (control only their own axis). top/left as CSS percentages position each
// handle on the box's own edge; translate(-50%,-50%) centers the handle dot
// on that edge/corner rather than sitting fully inside or outside it.
const RESIZE_HANDLES: { key: string; top: string; left: string; cursor: string; xSign: ResizeSign; ySign: ResizeSign }[] = [
  { key: 'tl', top: '0%', left: '0%', cursor: 'nwse-resize', xSign: -1, ySign: -1 },
  { key: 'tm', top: '0%', left: '50%', cursor: 'ns-resize', xSign: 0, ySign: -1 },
  { key: 'tr', top: '0%', left: '100%', cursor: 'nesw-resize', xSign: 1, ySign: -1 },
  { key: 'lm', top: '50%', left: '0%', cursor: 'ew-resize', xSign: -1, ySign: 0 },
  { key: 'rm', top: '50%', left: '100%', cursor: 'ew-resize', xSign: 1, ySign: 0 },
  { key: 'bl', top: '100%', left: '0%', cursor: 'nesw-resize', xSign: -1, ySign: 1 },
  { key: 'bm', top: '100%', left: '50%', cursor: 'ns-resize', xSign: 0, ySign: 1 },
  { key: 'br', top: '100%', left: '100%', cursor: 'nwse-resize', xSign: 1, ySign: 1 },
]

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
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null)
  const editStartLabel = useRef('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'save' | 'saveAs'>('save')
  const [dialogKey, setDialogKey] = useState(0)

  const { data: fields = [] } = useTemplateFields(source?.type === 'template' ? source.templateId : undefined)
  const [layers, setLayers] = useState<Layer[]>([])
  const [layersSeededFor, setLayersSeededFor] = useState<string | undefined>(undefined)
  const imgRef = useRef<HTMLImageElement>(null)
  const dragState = useRef<{
    id: string
    startX: number
    startY: number
    layerStartX: number
    layerStartY: number
    moved: boolean
  } | null>(null)
  const resizeState = useRef<{ id: string; startX: number; startY: number; layerStart: Layer; xSign: ResizeSign; ySign: ResizeSign } | null>(
    null,
  )

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

  // Layers need `fields`, a separate async query keyed off source.templateId,
  // so they're seeded independently of source/savedMeta above rather than in
  // the same block — the seed key is the creation's id when reopening a saved
  // creation, or 'new:'+templateId when starting fresh.
  if (source?.type === 'template' && fields.length > 0) {
    const seedKey = existingCreation?.id ?? 'new:' + source.templateId
    if (layersSeededFor !== seedKey) {
      setLayersSeededFor(seedKey)
      setLayers(layersFromCanvasData(existingCreation?.canvas_data, fields))
    }
  }

  if (creationId && loadingExisting) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
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

  const templateRow = source.type === 'template' ? allTemplates.find((t) => t.id === source.templateId) : undefined

  function startOver() {
    setSource(null)
    setSavedMeta(null)
    setSelectedFieldId(null)
    setEditingLayerId(null)
    setLayers([])
    setLayersSeededFor(undefined)
    if (creationId) navigate('/')
  }

  function openDialog(mode: 'save' | 'saveAs') {
    setDialogMode(mode)
    setDialogOpen(true)
    setDialogKey((k) => k + 1) // forces SaveDialog to remount with fresh internal state each time it opens
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>, layer: Layer) {
    e.stopPropagation()
    // While this box is being edited, a pointerdown inside it is the user
    // placing a text cursor or selecting text, not moving the box — don't
    // arm a drag, and don't steal focus away from the contentEditable box.
    if (editingLayerId === layer.id) return
    setSelectedFieldId(layer.id)
    dragState.current = { id: layer.id, startX: e.clientX, startY: e.clientY, layerStartX: layer.x, layerStartY: layer.y, moved: false }
    // Optional chaining: jsdom (used by the test suite) doesn't implement
    // setPointerCapture at all — calling it directly would throw and break
    // every test that clicks a field box. Real browsers always support it.
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function handleDoubleClick(e: ReactMouseEvent<HTMLDivElement>, layer: Layer) {
    e.stopPropagation()
    setSelectedFieldId(layer.id)
    editStartLabel.current = layer.label
    setEditingLayerId(layer.id)
  }

  function handleLabelInput(layerId: string, text: string) {
    setLayers((prev) => prev.map((l) => (l.id === layerId ? { ...l, label: text } : l)))
  }

  function handleLabelBlur() {
    setEditingLayerId(null)
  }

  function handleLabelKeyDown(e: ReactKeyboardEvent<HTMLDivElement>, layerId: string) {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleLabelInput(layerId, editStartLabel.current)
      e.currentTarget.blur()
    }
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragState.current
    if (!drag || !templateRow || !imgRef.current) return
    const deltaXPx = e.clientX - drag.startX
    const deltaYPx = e.clientY - drag.startY
    if (!drag.moved && Math.hypot(deltaXPx, deltaYPx) < 4) return
    drag.moved = true
    const displayScale = imgRef.current.getBoundingClientRect().width / templateRow.image_width
    setLayers((prev) =>
      prev.map((l) =>
        l.id === drag.id
          ? applyDragDelta(
              { ...l, x: drag.layerStartX, y: drag.layerStartY },
              deltaXPx,
              deltaYPx,
              displayScale,
              templateRow.image_width,
              templateRow.image_height,
            )
          : l,
      ),
    )
  }

  function handlePointerUp() {
    dragState.current = null
  }

  function handleResizePointerDown(e: ReactPointerEvent<HTMLDivElement>, layer: Layer, xSign: ResizeSign, ySign: ResizeSign) {
    e.stopPropagation()
    resizeState.current = { id: layer.id, startX: e.clientX, startY: e.clientY, layerStart: layer, xSign, ySign }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function handleResizePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation()
    const resize = resizeState.current
    if (!resize || !templateRow || !imgRef.current) return
    const deltaXPx = e.clientX - resize.startX
    const deltaYPx = e.clientY - resize.startY
    const displayScale = imgRef.current.getBoundingClientRect().width / templateRow.image_width
    setLayers((prev) =>
      prev.map((l) =>
        l.id === resize.id
          ? applyResizeDelta(resize.layerStart, deltaXPx, deltaYPx, displayScale, resize.xSign, resize.ySign)
          : l,
      ),
    )
  }

  function handleResizePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation()
    resizeState.current = null
  }

  function handleChangeFontSize(layerId: string, px: number) {
    setLayers((prev) => prev.map((l) => (l.id === layerId ? { ...l, fontSize: px } : l)))
  }

  function handleDeleteLayer(layerId: string) {
    setLayers((prev) => prev.filter((l) => l.id !== layerId))
    setSelectedFieldId(null)
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
        // Layer only has string/number fields, so this is genuinely JSON-safe —
        // Json's recursive index-signature type just can't verify a concrete
        // interface without one, which is a known TS/Supabase-generated-types
        // limitation, not a real type mismatch.
        canvasData: { layers } as unknown as Json,
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
    updateCreation.mutate({ id: savedMeta.id, name: savedMeta.name, tags: savedMeta.tags, canvasData: { layers } as unknown as Json })
  }

  return (
    // Deselects on any click that isn't explicitly stopped from bubbling —
    // by the selected field itself, or the property bar's own controls.
    <div onClick={() => setSelectedFieldId(null)}>
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
              ref={imgRef}
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

          {source.type === 'template' && templateRow && (
            // A separate, absolutely-positioned @container layer rather than
            // putting @container directly on the inline-block wrapper above:
            // an element that shrink-wraps to its content (inline-block) and
            // is also a size container at once is a circular CSS dependency
            // browsers resolve by collapsing it to 0×0. This inner div is
            // inset:0 — its size comes from the already-resolved outer box
            // (which shrink-wraps to the <img>), not from its own content, so
            // containment here has nothing circular to resolve.
            <div className="absolute inset-0 @container">
              {layers.map((layer) => {
                const leftPct = (layer.x / templateRow.image_width) * 100
                const topPct = (layer.y / templateRow.image_height) * 100
                const widthPct = (layer.width / templateRow.image_width) * 100
                const heightPct = (layer.height / templateRow.image_height) * 100
                // font-size scaled to the image's own rendered width via a CSS
                // container query unit, the same percentage-of-image math the
                // position/width above already use — otherwise font size would
                // render as a literal screen-px value regardless of how large
                // the template is actually displayed.
                const fontSizeCqw = (layer.fontSize / templateRow.image_width) * 100

                const isSelected = selectedFieldId === layer.id
                const isEditing = editingLayerId === layer.id

                return (
                  <Fragment key={layer.id}>
                    <div
                      // Forces a full remount (not a diff) when entering/exiting
                      // edit mode. While editing, the browser mutates this
                      // element's real DOM text via native contentEditable
                      // typing — React never tracks those changes (children
                      // renders as `false` below). Reconciling back into
                      // React-owned `{layer.label}` children afterward would
                      // make React try to diff against DOM it doesn't
                      // recognize, which can throw. A key change sidesteps
                      // that entirely: React just discards the old subtree
                      // and mounts a fresh one.
                      key={isEditing ? `${layer.id}-edit` : `${layer.id}-view`}
                      className={`absolute p-1 text-center font-bold text-black ${
                        isSelected ? 'border border-blue-500' : 'border border-transparent'
                      } ${isEditing ? 'cursor-text' : 'cursor-grab touch-none active:cursor-grabbing'}`}
                      style={{
                        left: `${leftPct}%`,
                        top: `${topPct}%`,
                        width: `${widthPct}%`,
                        // heightAuto (the default): no explicit height, so the
                        // box grows to fit wrapped text instead of clipping it
                        // — a bigger font or more text is never silently cut
                        // off. Dragging a resize handle below sets an explicit
                        // height and turns this off permanently for that box,
                        // same as any ordinary text box.
                        ...(layer.heightAuto ? {} : { height: `${heightPct}%` }),
                        fontSize: `calc(${fontSizeCqw} * 1cqw)`,
                      }}
                      // contentEditable while editing, not React `children` —
                      // React thinks this element's children is just `false`
                      // (see below) so it never touches the live DOM text via
                      // reconciliation, which is what would reset the cursor
                      // to the start on every keystroke. The ref sets the
                      // starting text once; typing after that is the browser's
                      // own contentEditable behavior, read back via onInput.
                      contentEditable={isEditing}
                      suppressContentEditableWarning
                      ref={
                        isEditing
                          ? (el) => {
                              if (el && el.textContent !== layer.label) {
                                el.textContent = layer.label
                                el.focus()
                                // Select the existing text so the first
                                // keystroke replaces it, like renaming a
                                // layer in most design tools. Best-effort:
                                // a stale Range/Selection from a previous
                                // edit session can throw here in some
                                // environments — editing still works fine
                                // without the selection, so don't let it
                                // block entering edit mode.
                                try {
                                  const range = document.createRange()
                                  range.selectNodeContents(el)
                                  const selection = window.getSelection()
                                  selection?.removeAllRanges()
                                  selection?.addRange(range)
                                } catch {
                                  // ignore — select-all-on-edit is a convenience, not a requirement
                                }
                              }
                            }
                          : undefined
                      }
                      onPointerDown={(e) => handlePointerDown(e, layer)}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => handleDoubleClick(e, layer)}
                      onInput={(e) => handleLabelInput(layer.id, e.currentTarget.textContent ?? '')}
                      onBlur={handleLabelBlur}
                      onKeyDown={(e) => handleLabelKeyDown(e, layer.id)}
                    >
                      {!isEditing && layer.label}
                      {/* Hidden while editing: these render as children of
                          the contentEditable box, and the browser's native
                          editing engine can restructure/move child nodes
                          during text selection — which then breaks React's
                          own bookkeeping of them. Resizing mid-type isn't a
                          real use case anyway; finish editing first. */}
                      {isSelected &&
                        !isEditing &&
                        RESIZE_HANDLES.map((handle) => (
                          <div
                            key={handle.key}
                            className="absolute h-2.5 w-2.5 touch-none border border-blue-500 bg-white"
                            style={{ top: handle.top, left: handle.left, transform: 'translate(-50%, -50%)', cursor: handle.cursor }}
                            onPointerDown={(e) => handleResizePointerDown(e, layer, handle.xSign, handle.ySign)}
                            onPointerMove={handleResizePointerMove}
                            onPointerUp={handleResizePointerUp}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ))}
                    </div>

                    {isSelected && (
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
                        <PropertyBar
                          fontSize={layer.fontSize}
                          onChangeFontSize={(px) => handleChangeFontSize(layer.id, px)}
                          onDelete={() => handleDeleteLayer(layer.id)}
                        />
                      </div>
                    )}
                  </Fragment>
                )
              })}
            </div>
          )}
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
