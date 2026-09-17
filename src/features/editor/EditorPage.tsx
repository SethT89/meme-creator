import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { TemplateSidebar } from './TemplateSidebar'
import type { SelectedTemplate } from './TemplateSidebar'
import { PropertyBar } from './PropertyBar'
import { CanvasFab } from './CanvasFab'
import { SaveDialog } from './SaveDialog'
import { useCreation, useCreateCreation, useCreations, useUpdateCreation } from '../../lib/queries/creations'
import { useTemplates, useTemplateFields } from '../../lib/queries/templates'
import { nextAvailableName } from '../../lib/creationNaming'
import { layersFromCanvasData, applyDragDelta, applyResizeDelta, createBlankTextLayer } from '../../lib/layers'
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
  // Set (alongside editStartLabel) at every call site that starts a new edit
  // session, consumed by the contentEditable ref callback below. Needed
  // because that callback's own "does DOM content differ from layer.label"
  // check can't tell a brand-new *blank* box (both start at '') apart from
  // a re-render mid-typing (also already in sync) — without this, a blank
  // box would never receive its initial focus.
  const needsEditFocus = useRef(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'save' | 'saveAs'>('save')
  const [dialogKey, setDialogKey] = useState(0)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const [pendingTemplate, setPendingTemplate] = useState<SelectedTemplate | null>(null)

  const { data: fields = [] } = useTemplateFields(source?.type === 'template' ? source.templateId : undefined)
  const [layers, setLayers] = useState<Layer[]>([])
  const [layersSeededFor, setLayersSeededFor] = useState<string | undefined>(undefined)
  const imgRef = useRef<HTMLImageElement>(null)
  const canvasScrollRef = useRef<HTMLDivElement>(null)
  // Fixed-position (viewport pixel) anchor for the portaled PropertyBar —
  // see the useLayoutEffect below for why this is measured into state
  // rather than read from imgRef.current during render.
  const [propertyBarPos, setPropertyBarPos] = useState<{ left: number; top: number } | null>(null)
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

  // Deselect on a click ANYWHERE in the app, not just within this page's own
  // rendered content — the page's content div only spans its own content
  // height, not the full floating panel (which can be much taller), so a
  // click-handler on this component's own wrapper missed clicks in the
  // panel's empty space (or the header/backdrop above it). A document-level
  // listener catches every click regardless of what DOM subtree it lands in.
  // Elements that shouldn't trigger a deselect (the field itself, the
  // property bar, resize handles) already call stopPropagation, which stops
  // the event from ever reaching this listener.
  useEffect(() => {
    function handleDocumentClick() {
      setSelectedFieldId(null)
    }
    document.addEventListener('click', handleDocumentClick)
    return () => document.removeEventListener('click', handleDocumentClick)
  }, [])

  // Delete/Backspace deletes the selected field — but only while it's
  // merely selected, not while actively editing its text (where those keys
  // are ordinary character editing, handled by the browser's native
  // contentEditable behavior + handleLabelKeyDown below). Only registered
  // while something is selected and not being edited, so it can't fire from
  // some other, unrelated keypress elsewhere on the page.
  useEffect(() => {
    if (!selectedFieldId || editingLayerId === selectedFieldId) return
    const fieldId = selectedFieldId
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      // Extra guard: don't delete the field if some other input/textarea/
      // contentEditable on the page happens to have focus (e.g. the
      // sidebar search box) — selecting a field doesn't itself move DOM
      // focus, so this only matters if focus already landed somewhere else
      // while the field stayed selected.
      const active = document.activeElement as HTMLElement | null
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return
      handleDeleteLayer(fieldId)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectedFieldId, editingLayerId])

  // PropertyBar is portaled to document.body (see its render below, inside
  // the layers map) so it can float above every other on-page element,
  // including ones outside the canvas's own DOM subtree — nesting it inside
  // the @container div used for font-size scaling traps it in that
  // container's own stacking context, and no z-index on any descendant can
  // escape it (confirmed live: even z-index 9999 on every ancestor up to
  // the canvas scroll area lost to a plain static sibling button elsewhere
  // on the page). Its fixed pixel position is measured here, in an effect,
  // rather than read from imgRef.current during render — React's rules
  // correctly flag a ref read during render as unsafe, since ref updates
  // don't trigger a re-render and can be inconsistent under concurrent
  // rendering. Recomputed whenever the selected layer, its position, or the
  // template changes, and again on scroll/resize, since neither of those
  // changes React state on its own.
  useLayoutEffect(() => {
    const templateRow = source?.type === 'template' ? allTemplates.find((t) => t.id === source.templateId) : undefined
    const layer = layers.find((l) => l.id === selectedFieldId)
    // Nothing to measure — and nothing to reset either: the render below
    // already gates the portal on `isSelected`, so a stale propertyBarPos
    // simply won't be used once nothing (or a different layer) is selected.
    if (!layer || !templateRow) return
    function measure() {
      if (!imgRef.current || !templateRow || !layer) return
      const imgRect = imgRef.current.getBoundingClientRect()
      const leftPct = (layer.x / templateRow.image_width) * 100
      const topPct = (layer.y / templateRow.image_height) * 100
      const widthPct = (layer.width / templateRow.image_width) * 100
      setPropertyBarPos({
        left: imgRect.left + ((leftPct + widthPct / 2) / 100) * imgRect.width,
        top: imgRect.top + (topPct / 100) * imgRect.height,
      })
    }
    measure()
    const scrollEl = canvasScrollRef.current
    scrollEl?.addEventListener('scroll', measure)
    window.addEventListener('resize', measure)
    return () => {
      scrollEl?.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [source, allTemplates, layers, selectedFieldId])

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

  const templateRow = source?.type === 'template' ? allTemplates.find((t) => t.id === source.templateId) : undefined

  function clearCanvas() {
    setSource(null)
    setSavedMeta(null)
    setSelectedFieldId(null)
    setEditingLayerId(null)
    setLayers([])
    setLayersSeededFor(undefined)
    if (creationId) navigate('/')
  }

  function loadTemplate(template: SelectedTemplate) {
    setSource({ type: 'template', name: template.name, templateId: template.id, blankImageUrl: template.blankImageUrl })
    setSavedMeta(null)
    setSelectedFieldId(null)
    setEditingLayerId(null)
    setLayers([])
    setLayersSeededFor(undefined)
    if (creationId) navigate('/')
  }

  function handleSelectTemplate(template: SelectedTemplate) {
    if (source !== null) {
      setPendingTemplate(template)
    } else {
      loadTemplate(template)
    }
  }

  function handleClearCanvasClick() {
    setClearConfirmOpen(true)
  }

  function confirmClearCanvas() {
    clearCanvas()
    setClearConfirmOpen(false)
  }

  function confirmSwitchTemplate() {
    if (pendingTemplate) loadTemplate(pendingTemplate)
    setPendingTemplate(null)
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
    needsEditFocus.current = true
    setEditingLayerId(layer.id)
  }

  // CanvasFab's Add Text action. A no-op on the blank canvas (no image yet
  // to place text on — that's future work, tied to Add Image establishing a
  // freeform canvas). Same select-and-enter-edit-mode sequence
  // handleDoubleClick uses, so the new box opens with focus and the cursor
  // ready to type, exactly like double-clicking an existing one.
  function handleAddText() {
    if (!templateRow) return
    const newLayer = createBlankTextLayer(templateRow.image_width, templateRow.image_height)
    setLayers((prev) => [...prev, newLayer])
    setSelectedFieldId(newLayer.id)
    editStartLabel.current = ''
    needsEditFocus.current = true
    setEditingLayerId(newLayer.id)
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
      : nextAvailableName(source?.name ?? '', allCreations.map((c) => c.name))
  const defaultTags = dialogMode === 'saveAs' && savedMeta ? savedMeta.tags : []

  function handleDialogSave(name: string, tags: string[]) {
    const activeSource = source! // guaranteed non-null: Save to Gallery only renders once source is set
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
    <div className="flex h-full gap-6">
      <TemplateSidebar selectedTemplateId={source?.type === 'template' ? source.templateId : undefined} onSelectTemplate={handleSelectTemplate} />

      <div className="flex min-w-0 flex-1 flex-col">
        <h2 className="mb-3 text-lg font-semibold">{savedMeta ? savedMeta.name : 'Editor'}</h2>

        {/* Page-level actions live above the canvas, not overlapping the image —
            only per-field editing controls (PropertyBar) appear on the canvas itself. */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-1.5">
          {source !== null ? (
            <Button size="sm" variant="outline" onClick={handleClearCanvasClick}>
              Clear Canvas
            </Button>
          ) : (
            <div />
          )}
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" disabled>
              Export
            </Button>

            {source !== null && !savedMeta && (
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

        <div ref={canvasScrollRef} className="flex min-h-0 flex-1 items-start justify-center overflow-auto">
          <div
            // sm:mr-12 sm:mb-4 reserve exactly the room CanvasFab needs
            // outside this box's own right/bottom edges (it matches the
            // negative right-12/bottom-4 offsets CanvasFab positions itself
            // with) — this scroll area shrink-wraps to its content's own
            // size rather than filling remaining flex space, so without this
            // the FAB's protrusion falls outside the content box entirely
            // and gets clipped by the scroll container's overflow-auto,
            // forcing a scroll to see all of it. Not needed on mobile, where
            // CanvasFab overlays the image instead of sitting outside it.
            className="relative inline-block rounded-lg bg-[repeating-conic-gradient(#00000010_0%_25%,transparent_0%_50%)] bg-[length:20px_20px] sm:mr-12 sm:mb-4"
          >
            {source === null && <div className="h-80 w-80" />}
            {source?.type === 'template' && (
              <img
                ref={imgRef}
                src={source.blankImageUrl}
                alt={source.name}
                // No explicit width/height attributes — sized entirely via
                // CSS below. An explicit aspect-ratio (once templateRow is
                // known) keeps sm:min-h-[240px] below from distorting the
                // image on its own — without a locked ratio, a height floor
                // and max-w-full can each win independently, stretching
                // width and height out of proportion instead of scaling
                // together.
                style={templateRow ? { aspectRatio: `${templateRow.image_width} / ${templateRow.image_height}` } : undefined}
                // max-h-[65vh] is the fallback before templateRow (and its
                // real aspect ratio) has loaded. Once it has, sm:max-h-
                // [calc(100vh-19rem)] replaces the 65vh guess with the
                // actual available height in this layout (measured live:
                // header + toolbar + padding + margins + CanvasFab's own
                // reserved margin below always total 19rem here) — 65vh is
                // the wrong shape of formula for "fill available space" (it
                // scales at 0.65x viewport height while the real budget
                // scales at 1x minus a constant, so it only matches by
                // coincidence at one specific window height).
                // sm:min-h-[240px] is the floor past which the image stops
                // scaling down and this area's overflow-auto (or, on a short
                // enough viewport, the page itself) scrolls instead — sm+
                // only: below that width the image is already width-bound
                // (portrait templates on a narrow phone), and forcing a
                // height floor there fights max-w-full for control of the
                // box and distorts it (confirmed live — the two together
                // rendered a visibly squashed template under 640px). A short
                // *landscape* phone still gets the floor, since landscape
                // width is almost always above the sm breakpoint.
                className="block max-h-[65vh] w-auto max-w-full sm:max-h-[calc(100vh-19rem)] sm:min-h-[240px]"
              />
            )}
            {source?.type === 'freeform' && (
              <div className="flex h-80 w-80 items-center justify-center border border-border bg-muted text-sm text-muted-foreground">
                {source.name}
              </div>
            )}

            {source?.type === 'template' && templateRow && (
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
                        // White fill + black outline (classic meme-text look) —
                        // legible regardless of what's underneath. Stroke width
                        // in em so it scales with this box's own font-size
                        // (itself already scaled to the image via cqw, see
                        // fontSize below) without a second scaling calc.
                        // paint-order draws the stroke behind the fill so it
                        // doesn't eat into/thin the white letterforms.
                        className={`absolute p-1 text-center font-bold text-white outline-none [-webkit-text-stroke:0.24em_black] [paint-order:stroke_fill] ${
                          isSelected ? 'border border-blue-500' : 'border border-transparent'
                        } ${isEditing ? 'cursor-text' : 'cursor-grab touch-none active:cursor-grabbing'} ${
                          isSelected && !isEditing ? 'hover:underline hover:decoration-blue-500' : ''
                        }`}
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
                                // needsEditFocus (set at the two places that start
                                // an edit session) catches the case textContent
                                // !== label can't: a brand-new *blank* box, where
                                // both start at '' and look already "in sync".
                                if (el && (el.textContent !== layer.label || needsEditFocus.current)) {
                                  el.textContent = layer.label
                                  el.focus()
                                  needsEditFocus.current = false
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

                      {isSelected &&
                        propertyBarPos &&
                        createPortal(
                          <div
                            className="fixed z-50"
                            style={{
                              left: propertyBarPos.left,
                              top: propertyBarPos.top,
                              // Anchored to the field's own position — sits
                              // just above the field, horizontally centered on it.
                              transform: 'translate(-50%, calc(-100% - 8px))',
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <PropertyBar
                              fontSize={layer.fontSize}
                              onChangeFontSize={(px) => handleChangeFontSize(layer.id, px)}
                              onDelete={() => handleDeleteLayer(layer.id)}
                            />
                          </div>,
                          document.body,
                        )}
                    </Fragment>
                  )
                })}
              </div>
            )}
            {/* Shown on the blank canvas too (source === null), not just once
                a template is loaded — it's the entry point for starting from
                scratch (upload an image, add a sticker/text) as well as for
                adding to a loaded template. */}
            <CanvasFab onAddText={handleAddText} />
          </div>
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

      <ConfirmDialog
        open={clearConfirmOpen}
        title="Clear canvas?"
        message="This will discard your current work. This can't be undone."
        confirmLabel="Clear Canvas"
        onConfirm={confirmClearCanvas}
        onCancel={() => setClearConfirmOpen(false)}
      />

      <ConfirmDialog
        open={pendingTemplate !== null}
        title="Switch templates?"
        message="This will discard your current work. This can't be undone."
        confirmLabel="Switch Template"
        onConfirm={confirmSwitchTemplate}
        onCancel={() => setPendingTemplate(null)}
      />
    </div>
  )
}
