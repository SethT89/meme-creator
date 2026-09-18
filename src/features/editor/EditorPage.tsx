import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type {
  PointerEvent as ReactPointerEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ChangeEvent as ReactChangeEvent,
  RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { TemplateSidebar } from './TemplateSidebar'
import type { SelectedTemplate } from './TemplateSidebar'
import { PropertyBar } from './PropertyBar'
import { CanvasFab } from './CanvasFab'
import { CanvasMoreMenu } from './CanvasMoreMenu'
import { SaveDialog } from './SaveDialog'
import { useCreation, useCreateCreation, useCreations, useUpdateCreation } from '../../lib/queries/creations'
import { useTemplates, useTemplateFields } from '../../lib/queries/templates'
import { nextAvailableName } from '../../lib/creationNaming'
import {
  layersFromCanvasData,
  applyDragDelta,
  applyResizeDelta,
  applyAspectLockedResizeDelta,
  createBlankTextLayer,
  createImageLayer,
  reorderLayer,
  getCropRect,
  getFullImageBounds,
  frameToCropFraction,
  clampImagePan,
  applyCropFrameResizeDelta,
  RESIZE_HANDLES,
  MIN_CANVAS_SIZE,
} from '../../lib/layers'
import type { Layer, TextLayer, ImageLayer, ImageBounds, ResizeSign, ReorderAction } from '../../lib/layers'
import { renderCreationToBlob } from '../../lib/exportCanvas'
import { canShareFile, downloadBlob, isMobileOrTabletDevice, sanitizeFilename, shareFile } from '../../lib/exportDelivery'
import { prepareImageForUpload } from '../../lib/imageUpload'
import { supabase } from '../../lib/supabase'
import type { Json } from '../../types/database'

type Source =
  | { type: 'freeform'; name: string; canvasWidth?: number; canvasHeight?: number }
  | { type: 'template'; name: string; templateId: string; blankImageUrl: string }
  | null
type SavedMeta = { id: string; name: string; tags: string[] } | null
type FreeformCanvasData = { layers?: Layer[]; canvasWidth?: number; canvasHeight?: number }

// Image layers only ever get the 4 corner handles — an image renders via
// object-cover, so letting it resize on just one axis (like a text box can)
// would force it to crop to fill the resulting mismatched box shape instead
// of just scaling. Corner drags always scale both dimensions together (see
// applyAspectLockedResizeDelta), so a corner handle is the only one that
// makes sense for an image.
const CORNER_RESIZE_HANDLES = RESIZE_HANDLES.filter((h) => h.xSign !== 0 && h.ySign !== 0)

// Canvas-resize handles — right edge, bottom edge, bottom-right corner only.
// See the design doc's scope note: growing/shrinking from these three never
// requires moving existing layers' x/y, since the canvas's own origin (0,0)
// never moves. Left/top-edge growth would need to shift every layer's
// position too, and isn't needed yet.
const CANVAS_RESIZE_HANDLES: { key: string; top: string; left: string; cursor: string; xSign: ResizeSign; ySign: ResizeSign }[] = [
  { key: 'rm', top: '50%', left: '100%', cursor: 'ew-resize', xSign: 1, ySign: 0 },
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
  // Explicit mode, entered via the More Options menu's "Adjust Canvas" item
  // — canvas-resize handles only show while this is true, rather than
  // whenever nothing else happens to be selected, so they don't appear
  // unannounced immediately after every upload.
  const [adjustingCanvas, setAdjustingCanvas] = useState(false)
  // Set by double-clicking an image layer — while non-null, that layer
  // renders in-place with a dashed frame instead of its normal solid
  // selection border: dragging the image pans it, dragging a handle
  // resizes the frame, and a click anywhere outside accepts the result
  // (Escape reverts). See cropSession below for the session's fixed
  // reference point.
  const [cropTargetId, setCropTargetId] = useState<string | null>(null)
  // Established once when crop mode starts (see handleEnterCropMode) and
  // held for the whole session: imageBounds is the full source image's own
  // on-canvas rect (most of which isn't visible if anything's cropped) —
  // mutated in place as the user pans, but never rescaled, since panning
  // and resizing the frame both leave the image's own scale untouched.
  // layerSnapshot is the layer exactly as it was before crop mode started,
  // restored verbatim if the session is reverted (Escape).
  const cropSession = useRef<{ layerId: string; imageBounds: ImageBounds; layerSnapshot: ImageLayer } | null>(null)
  const cropPanState = useRef<{ startX: number; startY: number; imageBoundsStart: ImageBounds } | null>(null)
  const cropResizeState = useRef<{
    startX: number
    startY: number
    frameStart: { x: number; y: number; width: number; height: number }
    xSign: ResizeSign
    ySign: ResizeSign
  } | null>(null)
  // Attached to the cropping layer's own wrapper div — lets the
  // outside-pointerdown-exits-crop-mode listener below tell a pointerdown
  // on the frame itself (pan/resize — let it through) apart from one
  // anywhere else on the page (accept and exit).
  const cropFrameElRef = useRef<HTMLDivElement>(null)
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
  const [exporting, setExporting] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [toast, setToast] = useState<{ message: string; isError: boolean } | null>(null)

  const templateRow = source?.type === 'template' ? allTemplates.find((t) => t.id === source.templateId) : undefined
  // The one generalized "how big is the surface I'm drawing on" value —
  // real pixel width/height regardless of whether that comes from a
  // template row or a freeform source's own canvasWidth/canvasHeight.
  // Every place that used to read templateRow.image_width/image_height
  // purely for the percentage/coordinate math now reads this instead, which
  // is what lets drag/resize/Add Text work identically on a freeform canvas.
  // Memoized so its reference only changes when the underlying dimensions
  // actually do — a fresh object literal every render would break the
  // useLayoutEffect below, which depends on activeCanvas directly (React's
  // effect-dependency comparison is by reference, so a new object every
  // render re-fires the effect every render — including from inside the
  // effect's own setState call, which is an infinite loop).
  const activeCanvas = useMemo(() => {
    if (templateRow) return { width: templateRow.image_width, height: templateRow.image_height }
    if (source?.type === 'freeform' && source.canvasWidth && source.canvasHeight) {
      return { width: source.canvasWidth, height: source.canvasHeight }
    }
    return undefined
  }, [templateRow, source])

  const { data: fields = [] } = useTemplateFields(source?.type === 'template' ? source.templateId : undefined)
  const [layers, setLayers] = useState<Layer[]>([])
  const [layersSeededFor, setLayersSeededFor] = useState<string | undefined>(undefined)
  // Snapshot of `layers` exactly as seeded (fresh template defaults, or a
  // saved creation's own canvas_data) — compared against the live `layers`
  // state to tell whether the user has actually changed anything since,
  // so switching templates only needs to confirm when there's real work to
  // lose. A ref, not state: it's only ever read at the moment of an action
  // (switching templates), never rendered.
  const baselineLayersRef = useRef<Layer[]>([])
  const imgRef = useRef<HTMLElement>(null)
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
  const canvasResizeState = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number; xSign: ResizeSign; ySign: ResizeSign } | null>(
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
      setAdjustingCanvas(false)
    }
    document.addEventListener('click', handleDocumentClick)
    return () => document.removeEventListener('click', handleDocumentClick)
  }, [])

  // "A click anywhere outside accepts the crop" — a capture-phase listener
  // (fires before any bubble-phase handler, including the stopPropagation
  // every other layer/button already calls on its own pointerdown) rather
  // than another bubble listener like the one above: a plain bubble
  // listener would never fire for a pointerdown that landed on, say,
  // another layer or the FAB, since those already stop the event from
  // reaching `document` in the bubble phase. Capture-phase isn't affected
  // by that at all, so this reliably catches "anywhere else," not just
  // "anywhere with no handler of its own." A pointerdown on the cropping
  // frame itself (panning, or one of its resize handles, both DOM
  // descendants of it) is deliberately let through untouched.
  useEffect(() => {
    if (!cropTargetId) return
    function handlePointerDownCapture(e: PointerEvent) {
      if (cropFrameElRef.current && e.target instanceof Node && !cropFrameElRef.current.contains(e.target)) {
        handleExitCropMode(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDownCapture, true)
    return () => document.removeEventListener('pointerdown', handlePointerDownCapture, true)
  }, [cropTargetId])

  // Escape reverts the crop session instead of accepting it — the one
  // exit path that's not just "a plain click elsewhere."
  useEffect(() => {
    if (!cropTargetId) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') handleExitCropMode(true)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [cropTargetId])

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

  // ⌘[ / ⌘] move the selected layer back / forward one step in the stack;
  // adding Shift sends it all the way to the back / front. Ctrl works in
  // place of ⌘ for non-Mac keyboards. Matched on e.code first, not just
  // e.key: Shift turns "]" into "}" (and "[" into "{"), and the physical key
  // is what identifies the shortcut. e.key (both shifted and unshifted
  // characters) is the fallback for the virtual/remote keyboards and
  // automation that send an empty e.code. preventDefault stops the browser's own
  // ⌘[ / ⌘] (history Back / Forward) from also firing. Same registration
  // rules as Delete above: only while a layer is selected and not being
  // text-edited, and never while some other input has focus.
  useEffect(() => {
    if (!selectedFieldId || editingLayerId === selectedFieldId) return
    const layerId = selectedFieldId
    function handleKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      const forward = e.code === 'BracketRight' || e.key === ']' || e.key === '}'
      const backward = e.code === 'BracketLeft' || e.key === '[' || e.key === '{'
      if (!forward && !backward) return
      const active = document.activeElement as HTMLElement | null
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return
      e.preventDefault()
      handleReorderLayer(layerId, e.shiftKey ? (forward ? 'front' : 'back') : forward ? 'forward' : 'backward')
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectedFieldId, editingLayerId])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

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
    const layer = layers.find((l) => l.id === selectedFieldId)
    // Nothing to measure — and nothing to reset either: the render below
    // already gates the portal on `isSelected`, so a stale propertyBarPos
    // simply won't be used once nothing (or a different layer) is selected.
    if (!layer || !activeCanvas) return
    function measure() {
      if (!imgRef.current || !activeCanvas || !layer) return
      const imgRect = imgRef.current.getBoundingClientRect()
      const leftPct = (layer.x / activeCanvas.width) * 100
      const topPct = (layer.y / activeCanvas.height) * 100
      const widthPct = (layer.width / activeCanvas.width) * 100
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
  }, [activeCanvas, layers, selectedFieldId])

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
      const canvasData = existingCreation.canvas_data as FreeformCanvasData | null
      setSource({
        type: 'freeform',
        name: existingCreation.name.replace(/ \d+$/, '') || existingCreation.name,
        canvasWidth: canvasData?.canvasWidth,
        canvasHeight: canvasData?.canvasHeight,
      })
      const seeded = layersFromCanvasData(existingCreation.canvas_data, [])
      setLayers(seeded)
      baselineLayersRef.current = seeded
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
      const seeded = layersFromCanvasData(existingCreation?.canvas_data, fields)
      setLayers(seeded)
      baselineLayersRef.current = seeded
    }
  }

  if (creationId && loadingExisting) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  function clearCanvas() {
    setSource(null)
    setSavedMeta(null)
    setSelectedFieldId(null)
    setEditingLayerId(null)
    setAdjustingCanvas(false)
    setCropTargetId(null)
    cropSession.current = null
    setLayers([])
    setLayersSeededFor(undefined)
    baselineLayersRef.current = []
    if (creationId) navigate('/')
  }

  function loadTemplate(template: SelectedTemplate) {
    setSource({ type: 'template', name: template.name, templateId: template.id, blankImageUrl: template.blankImageUrl })
    setSavedMeta(null)
    setSelectedFieldId(null)
    setEditingLayerId(null)
    setAdjustingCanvas(false)
    setCropTargetId(null)
    cropSession.current = null
    setLayers([])
    setLayersSeededFor(undefined)
    baselineLayersRef.current = []
    if (creationId) navigate('/')
  }

  // Only confirm when there's actually something to lose — compares the
  // live layers against the snapshot taken when they were seeded, rather
  // than just checking whether *any* template is loaded. Lets someone
  // quickly flip through templates to see what they look like without a
  // dialog in the way every single time, and only interrupts once they've
  // genuinely started customizing one.
  function hasUnsavedLayerEdits(): boolean {
    return JSON.stringify(layers) !== JSON.stringify(baselineLayersRef.current)
  }

  function handleSelectTemplate(template: SelectedTemplate) {
    if (source !== null && hasUnsavedLayerEdits()) {
      setPendingTemplate(template)
    } else {
      loadTemplate(template)
    }
  }

  function handleClearCanvasClick() {
    setClearConfirmOpen(true)
  }

  // CanvasMoreMenu's "Adjust Canvas" item. Deselects any layer/edit session
  // on the way in so the two modes never overlap — a selected layer's own
  // resize handles and the canvas's own would otherwise both be candidates
  // for what a drag on the canvas edge means.
  function handleToggleAdjustCanvas() {
    setAdjustingCanvas((prev) => !prev)
    setSelectedFieldId(null)
    setEditingLayerId(null)
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
    setAdjustingCanvas(false)
    dragState.current = { id: layer.id, startX: e.clientX, startY: e.clientY, layerStartX: layer.x, layerStartY: layer.y, moved: false }
    // Optional chaining: jsdom (used by the test suite) doesn't implement
    // setPointerCapture at all — calling it directly would throw and break
    // every test that clicks a field box. Real browsers always support it.
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function handleDoubleClick(e: ReactMouseEvent<HTMLDivElement>, layer: TextLayer) {
    e.stopPropagation()
    setSelectedFieldId(layer.id)
    editStartLabel.current = layer.label
    needsEditFocus.current = true
    setEditingLayerId(layer.id)
  }

  // CanvasFab's Add Text action. A no-op until there's a real canvas to
  // place text on — no template loaded, and no freeform canvas established
  // yet (that needs at least one uploaded image; see handleImageFileSelected
  // below). Same select-and-enter-edit-mode sequence handleDoubleClick uses,
  // so the new box opens with focus and the cursor ready to type, exactly
  // like double-clicking an existing one.
  function handleAddText() {
    if (!activeCanvas) return
    const newLayer = createBlankTextLayer(activeCanvas.width, activeCanvas.height)
    setLayers((prev) => [...prev, newLayer])
    setSelectedFieldId(newLayer.id)
    editStartLabel.current = ''
    needsEditFocus.current = true
    setEditingLayerId(newLayer.id)
  }

  // CanvasFab's Upload Image action. Opens the browser/OS's native file
  // picker via the hidden <input type="file"> below — on mobile that picker
  // itself offers Photo Library / Camera / Files, and the OS handles any
  // permission prompt (e.g. iOS's photo-access dialog) automatically the
  // moment the user picks one, so no explicit permission request is needed
  // here. With a template or freeform canvas already loaded it adds an
  // image layer on top; from the blank canvas it establishes a new freeform
  // canvas sized to the picked image.
  function handleAddImage() {
    if (uploadingImage) return
    fileInputRef.current?.click()
  }

  async function handleImageFileSelected(e: ReactChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // reset so picking the same file again still fires this handler
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setToast({ message: 'Please choose an image file.', isError: true })
      return
    }
    setUploadingImage(true)
    // Captured up front — decided once here rather than re-derived after the
    // (now-async, possibly slow) upload, since `source` itself may have
    // changed by the time this promise settles. Any loaded canvas (template
    // or freeform) means "add on top of it"; only the blank canvas is a
    // fresh start.
    const isFreshStart = !activeCanvas
    const targetCanvas = activeCanvas
    let previewUrl: string | undefined
    let newLayerId: string | undefined
    try {
      const { blob, width, height } = await prepareImageForUpload(file)
      // Shown immediately via a local object URL — the canvas doesn't wait
      // on any network round trip to reflect what the user just picked.
      // Swapped for the permanent Supabase URL below once that upload
      // (now a much smaller re-encoded JPEG, not the original file)
      // finishes in the background.
      previewUrl = URL.createObjectURL(blob)

      if (isFreshStart) {
        // Starting fresh from the blank canvas — Upload Image is its entry
        // point. This first image defines the canvas's own size.
        const baseName = file.name.replace(/\.[^/.]+$/, '').trim() || 'Untitled'
        const newLayer = createImageLayer(previewUrl, width, height)
        newLayerId = newLayer.id
        setSource({ type: 'freeform', name: baseName, canvasWidth: width, canvasHeight: height })
        setSavedMeta(null)
        setSelectedFieldId(null)
        setEditingLayerId(null)
        setAdjustingCanvas(false)
        setCropTargetId(null)
        cropSession.current = null
        setLayers([newLayer])
        setLayersSeededFor(undefined)
        // The freshly-created canvas's starting point already includes this
        // first image — matches loadTemplate's baseline-equals-just-seeded
        // pattern, so switching away without adding anything else doesn't
        // spuriously prompt to discard work.
        baselineLayersRef.current = [newLayer]
      } else if (targetCanvas) {
        // Adding to an existing canvas (template or freeform) — auto-scaled
        // to fit, canvas size untouched.
        const newLayer = createImageLayer(previewUrl, width, height, targetCanvas)
        newLayerId = newLayer.id
        setLayers((prev) => [...prev, newLayer])
      }

      const path = `${crypto.randomUUID()}.jpg`
      const { error: uploadError } = await supabase.storage.from('creation-assets').upload(path, blob)
      if (uploadError) throw uploadError
      const {
        data: { publicUrl },
      } = supabase.storage.from('creation-assets').getPublicUrl(path)

      setLayers((prev) => prev.map((l) => (l.id === newLayerId && l.type === 'image' ? { ...l, src: publicUrl } : l)))
    } catch {
      setToast({ message: 'Upload failed — try again.', isError: true })
      // Roll back the optimistic local preview — its blob: src is only ever
      // valid for this page session, so leaving it in place would silently
      // break the moment the upload never actually completes.
      if (isFreshStart) {
        setSource(null)
        setSavedMeta(null)
        setLayers([])
        setLayersSeededFor(undefined)
        baselineLayersRef.current = []
      } else if (newLayerId) {
        setLayers((prev) => prev.filter((l) => l.id !== newLayerId))
      }
    } finally {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setUploadingImage(false)
    }
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
    if (!drag || !activeCanvas || !imgRef.current) return
    const deltaXPx = e.clientX - drag.startX
    const deltaYPx = e.clientY - drag.startY
    if (!drag.moved && Math.hypot(deltaXPx, deltaYPx) < 4) return
    drag.moved = true
    const displayScale = imgRef.current.getBoundingClientRect().width / activeCanvas.width
    setLayers((prev) =>
      prev.map((l) =>
        l.id === drag.id
          ? applyDragDelta(
              { ...l, x: drag.layerStartX, y: drag.layerStartY },
              deltaXPx,
              deltaYPx,
              displayScale,
              activeCanvas.width,
              activeCanvas.height,
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
    if (!resize || !activeCanvas || !imgRef.current) return
    const deltaXPx = e.clientX - resize.startX
    const deltaYPx = e.clientY - resize.startY
    const displayScale = imgRef.current.getBoundingClientRect().width / activeCanvas.width
    const { layerStart } = resize
    setLayers((prev) =>
      prev.map((l) =>
        l.id === resize.id
          ? layerStart.type === 'image'
            ? applyAspectLockedResizeDelta(layerStart, deltaXPx, deltaYPx, displayScale, resize.xSign, resize.ySign)
            : applyResizeDelta(layerStart, deltaXPx, deltaYPx, displayScale, resize.xSign, resize.ySign)
          : l,
      ),
    )
  }

  function handleResizePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation()
    resizeState.current = null
  }

  // Canvas-resize handles (rendered below) — right/bottom edges and the
  // bottom-right corner only. Growing/shrinking from those edges never
  // needs to move existing layers' x/y, since the canvas's own origin
  // (0,0) never moves; left/top-edge growth would require shifting every
  // layer's position too and isn't needed yet (see the design doc's scope
  // note).
  function handleCanvasResizePointerDown(e: ReactPointerEvent<HTMLDivElement>, xSign: ResizeSign, ySign: ResizeSign) {
    e.stopPropagation()
    if (source?.type !== 'freeform' || !source.canvasWidth || !source.canvasHeight) return
    canvasResizeState.current = { startX: e.clientX, startY: e.clientY, startWidth: source.canvasWidth, startHeight: source.canvasHeight, xSign, ySign }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function handleCanvasResizePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation()
    const resize = canvasResizeState.current
    if (!resize || !imgRef.current) return
    const displayScale = imgRef.current.getBoundingClientRect().width / resize.startWidth
    const deltaX = (e.clientX - resize.startX) / displayScale
    const deltaY = (e.clientY - resize.startY) / displayScale
    setSource((prev) =>
      prev?.type === 'freeform'
        ? {
            ...prev,
            canvasWidth: resize.xSign === 1 ? Math.max(MIN_CANVAS_SIZE, resize.startWidth + deltaX) : prev.canvasWidth,
            canvasHeight: resize.ySign === 1 ? Math.max(MIN_CANVAS_SIZE, resize.startHeight + deltaY) : prev.canvasHeight,
          }
        : prev,
    )
  }

  function handleCanvasResizePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation()
    canvasResizeState.current = null
  }

  function handleChangeFontSize(layerId: string, px: number) {
    setLayers((prev) => prev.map((l) => (l.id === layerId ? { ...l, fontSize: px } : l)))
  }

  // Stacking order is array order (see reorderLayer), so this is all
  // "Layering" needs — the selection stays put and the toolbar stays up.
  function handleReorderLayer(layerId: string, action: ReorderAction) {
    setLayers((prev) => reorderLayer(prev, layerId, action))
  }

  function handleDeleteLayer(layerId: string) {
    setLayers((prev) => prev.filter((l) => l.id !== layerId))
    setSelectedFieldId(null)
  }

  // Double-clicking an image layer. Entering crop mode changes nothing
  // about the layer yet — it stays exactly where/how it already is; only
  // the session's fixed reference point (imageBounds) gets established.
  // Re-entering while already cropping the same layer (a repeated
  // double-click) is harmless: getFullImageBounds always recovers the same
  // true image rect from whatever the layer's current frame+crop happens
  // to be, so recomputing it is idempotent.
  function handleEnterCropMode(layer: ImageLayer) {
    setSelectedFieldId(layer.id)
    setAdjustingCanvas(false)
    cropSession.current = { layerId: layer.id, imageBounds: getFullImageBounds(layer), layerSnapshot: layer }
    setCropTargetId(layer.id)
  }

  function handleExitCropMode(revert: boolean) {
    const session = cropSession.current
    if (!session) return
    if (revert) {
      setLayers((prev) => prev.map((l) => (l.id === session.layerId ? session.layerSnapshot : l)))
    }
    cropSession.current = null
    setCropTargetId(null)
  }

  // Dragging the image itself while cropping — pans it under the frame,
  // which stays exactly where it is.
  function handleCropPanPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation()
    const session = cropSession.current
    if (!session) return
    cropPanState.current = { startX: e.clientX, startY: e.clientY, imageBoundsStart: { ...session.imageBounds } }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function handleCropPanPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation()
    const pan = cropPanState.current
    const session = cropSession.current
    if (!pan || !session || !activeCanvas || !imgRef.current) return
    const layer = layers.find((l) => l.id === session.layerId)
    if (!layer || layer.type !== 'image') return
    const displayScale = imgRef.current.getBoundingClientRect().width / activeCanvas.width
    const desired = {
      x: pan.imageBoundsStart.x + (e.clientX - pan.startX) / displayScale,
      y: pan.imageBoundsStart.y + (e.clientY - pan.startY) / displayScale,
    }
    const clamped = clampImagePan(desired, layer, pan.imageBoundsStart)
    session.imageBounds = { ...session.imageBounds, x: clamped.x, y: clamped.y }
    const crop = frameToCropFraction(layer, session.imageBounds)
    setLayers((prev) =>
      prev.map((l) => (l.id === layer.id && l.type === 'image' ? { ...l, cropX: crop.x, cropY: crop.y, cropWidth: crop.width, cropHeight: crop.height } : l)),
    )
  }

  function handleCropPanPointerUp() {
    cropPanState.current = null
  }

  // Dragging one of the frame's 8 handles while cropping — free resize
  // (see applyCropFrameResizeDelta for why all 8, unlike an ordinary image
  // resize's 4 corners), clamped to the image's own fixed bounds.
  function handleCropResizePointerDown(e: ReactPointerEvent<HTMLDivElement>, layer: ImageLayer, xSign: ResizeSign, ySign: ResizeSign) {
    e.stopPropagation()
    cropResizeState.current = {
      startX: e.clientX,
      startY: e.clientY,
      frameStart: { x: layer.x, y: layer.y, width: layer.width, height: layer.height },
      xSign,
      ySign,
    }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function handleCropResizePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation()
    const resize = cropResizeState.current
    const session = cropSession.current
    if (!resize || !session || !activeCanvas || !imgRef.current) return
    const displayScale = imgRef.current.getBoundingClientRect().width / activeCanvas.width
    const newFrame = applyCropFrameResizeDelta(
      resize.frameStart,
      e.clientX - resize.startX,
      e.clientY - resize.startY,
      displayScale,
      resize.xSign,
      resize.ySign,
      session.imageBounds,
    )
    const crop = frameToCropFraction(newFrame, session.imageBounds)
    setLayers((prev) =>
      prev.map((l) =>
        l.id === session.layerId && l.type === 'image'
          ? { ...l, x: newFrame.x, y: newFrame.y, width: newFrame.width, height: newFrame.height, cropX: crop.x, cropY: crop.y, cropWidth: crop.width, cropHeight: crop.height }
          : l,
      ),
    )
  }

  function handleCropResizePointerUp() {
    cropResizeState.current = null
  }

  const defaultName =
    dialogMode === 'saveAs' && savedMeta
      ? `${savedMeta.name} copy`
      : nextAvailableName(source?.name ?? '', allCreations.map((c) => c.name))
  const defaultTags = dialogMode === 'saveAs' && savedMeta ? savedMeta.tags : []

  // Layer only has string/number fields, and the freeform extras below are
  // all string/number too, so this is genuinely JSON-safe — Json's recursive
  // index-signature type just can't verify a concrete interface without one,
  // which is a known TS/Supabase-generated-types limitation, not a real type
  // mismatch.
  function buildCanvasData(activeSource: Source): Json {
    const freeformExtras =
      activeSource?.type === 'freeform' ? { canvasWidth: activeSource.canvasWidth, canvasHeight: activeSource.canvasHeight } : {}
    return { layers, ...freeformExtras } as unknown as Json
  }

  function handleDialogSave(name: string, tags: string[]) {
    const activeSource = source! // guaranteed non-null: Save to Gallery only renders once source is set
    createCreation.mutate(
      {
        name,
        tags,
        sourceType: activeSource.type,
        templateId: activeSource.type === 'template' ? activeSource.templateId : null,
        canvasData: buildCanvasData(activeSource),
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
    updateCreation.mutate({ id: savedMeta.id, name: savedMeta.name, tags: savedMeta.tags, canvasData: buildCanvasData(source) })
  }

  async function handleExport() {
    if (!source || !activeCanvas || !imgRef.current) return
    setExporting(true)
    try {
      const blob = await renderCreationToBlob(
        imgRef.current,
        { image_width: activeCanvas.width, image_height: activeCanvas.height },
        layers,
      )
      const filename = `${sanitizeFilename(savedMeta?.name ?? source.name)}.png`
      const file = new File([blob], filename, { type: 'image/png' })
      if (isMobileOrTabletDevice() && canShareFile(file)) {
        try {
          await shareFile(file, filename)
          setToast({ message: 'Shared!', isError: false })
        } catch (err) {
          // A user cancelling the native share sheet rejects with
          // AbortError — that's not a failure worth surfacing.
          if ((err as Error)?.name !== 'AbortError') {
            setToast({ message: 'Export failed — try again.', isError: true })
          }
        }
      } else {
        downloadBlob(blob, filename)
        setToast({ message: 'Downloaded!', isError: false })
      }
    } catch {
      setToast({ message: 'Export failed — try again.', isError: true })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex h-full gap-6">
      <TemplateSidebar selectedTemplateId={source?.type === 'template' ? source.templateId : undefined} onSelectTemplate={handleSelectTemplate} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* This row sits above the Canvas (the checkerboard artwork surface
            below) but spans the full width of the Panel (the white floating
            card this whole page renders inside — see AppShell) via this
            column's own flex-1, so Export + the menu land at the Panel's
            far right edge, not the Canvas's — those are two different right
            edges whenever the Canvas is narrower than or centered within
            the Panel's content column. Previously these floated absolutely
            over the Canvas's own top-right corner, which on narrow
            viewports sat directly on top of a template field positioned
            near that same corner (needed a pointer-events workaround to
            stop it from blocking clicks) — an in-flow row above the Canvas
            avoids that class of bug entirely, not just this one instance. */}
        <div className="mb-3 flex items-center justify-between gap-3">
          {/* No "Editor" placeholder when nothing's saved yet — redundant
              with the page itself. Once saved, the creation's own name is
              genuinely useful info, so that still shows. */}
          {savedMeta ? <h2 className="text-lg font-semibold">{savedMeta.name}</h2> : <div />}
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={!activeCanvas || exporting || uploadingImage}
              onClick={handleExport}
            >
              {exporting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              Export
            </Button>
            <CanvasMoreMenu
              // Also disabled mid-upload: a newly-added image layer's src is
              // a local blob: URL until the background upload finishes and
              // swaps in the permanent one — saving before then would
              // persist a URL that's meaningless after a reload.
              disabled={source === null || uploadingImage}
              canSaveAs={savedMeta !== null}
              canAdjustCanvas={source?.type === 'freeform' && activeCanvas !== undefined}
              onSave={() => (savedMeta ? handleQuickSave() : openDialog('save'))}
              onSaveAs={() => openDialog('saveAs')}
              onAdjustCanvas={handleToggleAdjustCanvas}
              onClearCanvas={handleClearCanvasClick}
            />
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
            {/* Same fill-available-height approach as the template <img>
                below (viewport-relative height + aspect-square instead of a
                fixed h-80 w-80) — a plain <div> has no intrinsic size, so
                unlike the image this needs an explicit height (not just a
                max-height) for aspect-square to have anything to derive its
                width from. Using vh/calc here rather than h-full sidesteps
                the same shrink-to-fit circularity the image's own comment
                below describes: this box's parent is inline-block and
                shrink-wraps to its content's size, so a child whose own
                size depended on 100% of that parent would never resolve —
                for the same reason, max-w-full doesn't work here either
                (it's a percentage of that same indeterminate parent), so
                unlike the image this also needs an explicit calc(100vw -
                Npx) max-width, not a percentage one. Found live: a square
                sized purely from vh overflows horizontally on a
                narrow-but-tall phone (65vh is ~528px on a 812px-tall
                375px-wide screen, versus ~153px actually available) — these
                two constants are the real measured chrome (sidebar +
                gutters) on each side of the `sm` breakpoint (222px below
                it, 376px at/above it, both confirmed slope-1 — i.e. exactly
                `100vw - constant` — across multiple widths), each rounded
                up slightly to a clean rem value for a small safety margin. */}
            {source === null && (
              <div className="aspect-square h-[65vh] max-w-[calc(100vw-14rem)] sm:h-[calc(100vh-19rem)] sm:max-w-[calc(100vw-24rem)] sm:min-h-[240px]" />
            )}
            {source?.type === 'template' && (
              <img
                ref={imgRef as RefObject<HTMLImageElement>}
                src={source.blankImageUrl}
                alt={source.name}
                // Needed for canvas.toBlob() in renderCreationToBlob to not
                // throw on a "tainted" canvas — the template-images bucket
                // is public with permissive CORS, so this alone is enough.
                crossOrigin="anonymous"
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
                //
                // object-contain matters specifically when switching between
                // two templates: this <img> element is reused (same src
                // attribute changing, not remounted), so the browser keeps
                // painting the OLD template's already-decoded bitmap while
                // the new one downloads. The aspect-ratio above already
                // updates to the new template's ratio immediately (it comes
                // from templateRow/allTemplates, already loaded — no network
                // wait), so the box reshapes right away, but the default
                // object-fit (fill) would non-uniformly stretch that old
                // bitmap to fill the new box shape until the new image
                // finishes loading — which is exactly the "squished for a
                // moment" glitch. object-contain keeps the old bitmap at its
                // own correct proportions (letterboxed within the new box
                // shape) for that brief window instead of distorting it; it
                // has no visible effect once the new image has loaded, since
                // the box's aspect-ratio always matches the loaded image's
                // own ratio at rest.
                className="block max-h-[65vh] w-auto max-w-full object-contain sm:max-h-[calc(100vh-19rem)] sm:min-h-[240px]"
              />
            )}
            {source?.type === 'freeform' && activeCanvas && (
              // A plain <div> isn't a "replaced element" the way <img> is, so
              // it has no built-in algorithm for deriving its width from a
              // max-height + intrinsic ratio the way the template <img>
              // above can — that combination silently collapses this div to
              // its CSS floor (sm:min-h-[240px]) regardless of the real
              // aspect ratio or viewport size, since w-auto/max-w-full both
              // resolve against this box's own indeterminate (shrink-wrap)
              // parent, the same circular-sizing trap the blank placeholder
              // div below (source === null) already works around. Fixed the
              // same way: an explicit height (not max-height) makes this
              // box's own height definite directly, so aspect-ratio can then
              // derive width from it without any circularity — and the
              // max-width needs the same explicit calc() as that placeholder
              // for the same reason (a percentage one hits the same
              // indeterminate-parent problem).
              <div
                ref={imgRef as RefObject<HTMLDivElement>}
                style={{ aspectRatio: `${activeCanvas.width} / ${activeCanvas.height}` }}
                // No background color here — left transparent so the outer
                // wrapper's own checkerboard pattern (the app's established
                // "empty" indicator, already used for the no-source blank
                // canvas) shows through in any canvas space not covered by
                // an image layer. Matters most right after resizing the
                // canvas larger than its layers: that revealed space needs
                // to read as "empty canvas," not blend invisibly into the
                // page's own white background the way opaque white would.
                className="block h-[65vh] max-w-[calc(100vw-14rem)] sm:h-[calc(100vh-19rem)] sm:max-w-[calc(100vw-24rem)] sm:min-h-[240px]"
              />
            )}
            {source?.type === 'freeform' && !activeCanvas && (
              <div className="flex h-80 w-80 items-center justify-center border border-border bg-muted text-sm text-muted-foreground">
                {source.name}
              </div>
            )}

            {activeCanvas && (
              // A separate, absolutely-positioned @container layer rather than
              // putting @container directly on the inline-block wrapper above:
              // an element that shrink-wraps to its content (inline-block) and
              // is also a size container at once is a circular CSS dependency
              // browsers resolve by collapsing it to 0×0. This inner div is
              // inset:0 — its size comes from the already-resolved outer box
              // (which shrink-wraps to the sized img/div above), not from its
              // own content, so containment here has nothing circular to resolve.
              <div className="absolute inset-0 @container">
                {layers.map((layer, layerIndex) => {
                  const leftPct = (layer.x / activeCanvas.width) * 100
                  const topPct = (layer.y / activeCanvas.height) * 100
                  const widthPct = (layer.width / activeCanvas.width) * 100
                  const heightPct = (layer.height / activeCanvas.height) * 100
                  const isSelected = selectedFieldId === layer.id
                  const isEditing = editingLayerId === layer.id
                  const isCropping = layer.type === 'image' && cropTargetId === layer.id

                  return (
                    <Fragment key={layer.id}>
                      {layer.type === 'image' ? (
                        <div
                          ref={isCropping ? cropFrameElRef : undefined}
                          // overflow-hidden always on, cropping or not — the
                          // <img> below renders larger than this box exactly
                          // when a crop is set (see its own style comment),
                          // and this box always clips it to the current crop.
                          // While panning in crop mode this means the parts
                          // of the image being panned into view only appear
                          // once they're actually inside the frame — no
                          // separate preview of what's just outside it,
                          // which keeps this box's rendering identical
                          // whether or not it's mid-crop-session.
                          className={`absolute touch-none cursor-grab overflow-hidden active:cursor-grabbing ${
                            isCropping ? 'border-2 border-dashed border-blue-500' : isSelected ? 'border border-blue-500' : 'border border-transparent'
                          }`}
                          style={{ left: `${leftPct}%`, top: `${topPct}%`, width: `${widthPct}%`, height: `${heightPct}%` }}
                          onPointerDown={(e) => (isCropping ? handleCropPanPointerDown(e) : handlePointerDown(e, layer))}
                          onPointerMove={isCropping ? handleCropPanPointerMove : handlePointerMove}
                          onPointerUp={isCropping ? handleCropPanPointerUp : handlePointerUp}
                          onClick={(e) => e.stopPropagation()}
                          onDoubleClick={(e) => {
                            e.stopPropagation()
                            handleEnterCropMode(layer)
                          }}
                        >
                          {(() => {
                            const crop = getCropRect(layer)
                            return (
                              <img
                                src={layer.src}
                                alt=""
                                draggable={false}
                                // max-w-none overrides Tailwind Preflight's
                                // global `img { max-width: 100% }` reset —
                                // without it, the browser silently clamps
                                // the inline width % below back down to 100%
                                // any time a crop needs this image rendered
                                // WIDER than its box (i.e. any horizontal
                                // crop at all), which is exactly what
                                // happened: the analogous max-height rule
                                // doesn't exist by default, so vertical
                                // crops worked while horizontal ones (and
                                // therefore corners too) silently collapsed
                                // back to 100% width and never covered the
                                // frame — confirmed live via getComputedStyle
                                // showing computedWidth clamped to the
                                // wrapper's own width despite a much larger
                                // inline width.
                                className="absolute max-w-none select-none"
                                // Renders the image larger than this box by
                                // exactly 1/cropWidth and 1/cropHeight, then
                                // shifts it up/left so the cropped region
                                // lands at (0,0) — the wrapper's own
                                // overflow-hidden clips everything else. With
                                // no crop (the default 0,0,1,1) this reduces
                                // to 100%/100%/0/0, i.e. today's plain
                                // fill-the-box behavior.
                                style={{
                                  width: `${(1 / crop.width) * 100}%`,
                                  height: `${(1 / crop.height) * 100}%`,
                                  left: `${-(crop.x / crop.width) * 100}%`,
                                  top: `${-(crop.y / crop.height) * 100}%`,
                                }}
                              />
                            )
                          })()}
                          {isCropping &&
                            RESIZE_HANDLES.map((handle) => (
                              <div
                                key={handle.key}
                                className="absolute z-10 h-2.5 w-2.5 touch-none border border-blue-500 bg-white"
                                style={{ top: handle.top, left: handle.left, transform: 'translate(-50%, -50%)', cursor: handle.cursor }}
                                onPointerDown={(e) => handleCropResizePointerDown(e, layer, handle.xSign, handle.ySign)}
                                onPointerMove={handleCropResizePointerMove}
                                onPointerUp={handleCropResizePointerUp}
                                onClick={(e) => e.stopPropagation()}
                              />
                            ))}
                          {isSelected &&
                            !isCropping &&
                            CORNER_RESIZE_HANDLES.map((handle) => (
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
                      ) : (
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
                            fontSize: `calc(${(layer.fontSize / activeCanvas.width) * 100} * 1cqw)`,
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
                      )}

                      {isSelected &&
                        !isCropping &&
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
                              fontSize={layer.type === 'text' ? layer.fontSize : undefined}
                              onChangeFontSize={layer.type === 'text' ? (px) => handleChangeFontSize(layer.id, px) : undefined}
                              onCrop={layer.type === 'image' ? () => handleEnterCropMode(layer) : undefined}
                              onDelete={() => handleDeleteLayer(layer.id)}
                              onReorder={(action) => handleReorderLayer(layer.id, action)}
                              canMoveForward={layerIndex < layers.length - 1}
                              canMoveBackward={layerIndex > 0}
                            />
                          </div>,
                          document.body,
                        )}
                    </Fragment>
                  )
                })}
              </div>
            )}
            {source?.type === 'freeform' && activeCanvas && adjustingCanvas && (
              <div className="absolute inset-0">
                {CANVAS_RESIZE_HANDLES.map((handle) => (
                  <div
                    key={handle.key}
                    className="absolute z-10 h-2.5 w-2.5 touch-none border border-neutral-500 bg-white"
                    style={{ top: handle.top, left: handle.left, transform: 'translate(-50%, -50%)', cursor: handle.cursor }}
                    onPointerDown={(e) => handleCanvasResizePointerDown(e, handle.xSign, handle.ySign)}
                    onPointerMove={handleCanvasResizePointerMove}
                    onPointerUp={handleCanvasResizePointerUp}
                    onClick={(e) => e.stopPropagation()}
                  />
                ))}
              </div>
            )}
            {/* Shown on the blank canvas too (source === null), not just once
                a template is loaded — it's the entry point for starting from
                scratch (upload an image, add a sticker/text) as well as for
                adding to a loaded template. */}
            <CanvasFab onAddText={handleAddText} onAddImage={handleAddImage} uploadingImage={uploadingImage} />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageFileSelected}
            />
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

      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-sm text-white shadow-lg ${
            toast.isError ? 'bg-red-600' : 'bg-neutral-900'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}
