import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type {
  PointerEvent as ReactPointerEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ChangeEvent as ReactChangeEvent,
  CSSProperties,
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
import { useTemplates, useTemplateFields, useLogExport } from '../../lib/queries/templates'
import { TOAST_Z } from '../../lib/stacking'
import { nextAvailableName } from '../../lib/creationNaming'
import {
  layersFromCanvasData,
  applyDragDelta,
  applyResizeDelta,
  applyAspectLockedResizeDelta,
  createBlankTextLayer,
  createImageLayer,
  reorderLayer,
  resizeCanvas,
  layerClipPath,
  resolveTextStyle,
  textLayerCssStyle,
  getCropRect,
  getFullImageBounds,
  frameToCropFraction,
  clampImagePan,
  applyCropFrameResizeDelta,
  RESIZE_HANDLES,
} from '../../lib/layers'
import type { Layer, TextLayer, ImageLayer, ImageBounds, ResizeSign, ReorderAction, TextStylePatch } from '../../lib/layers'
import { renderCreationToBlob } from '../../lib/exportCanvas'
import { fitToolbar } from '../../lib/viewportClamp'
import { clearDraft, draftBelongsTo, readDraft, writeDraft } from '../../lib/editorDraft'
import type { EditorSource } from '../../lib/editorDraft'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { useKeyboardInset } from '../../lib/useKeyboardInset'
import type { RenderOptions } from '../../lib/exportCanvas'
import { canShareFile, downloadBlob, isMobileOrTabletDevice, sanitizeFilename, shareFile } from '../../lib/exportDelivery'
import { prepareImageForUpload } from '../../lib/imageUpload'
import { PREVIEW_RENDER_OPTIONS } from '../../lib/previewStorage'
import { supabase } from '../../lib/supabase'
import type { Json } from '../../types/database'

// The editor's source lives in lib/editorDraft.ts, since the draft stores it.
type Source = EditorSource | null
// Two taps on the same caption within this long, and this close together, are a
// double-tap (see handleTextPointerUp).
const DOUBLE_TAP_MS = 350
const DOUBLE_TAP_SLOP = 24
// How long editing must pause before the draft is written to the browser.
const DRAFT_WRITE_DELAY_MS = 400
type SavedMeta = { id: string; name: string; tags: string[] } | null
type CanvasData = { layers?: Layer[]; canvasWidth?: number; canvasHeight?: number; backgroundX?: number; backgroundY?: number }

// Image layers only ever get the 4 corner handles — an image renders via
// object-cover, so letting it resize on just one axis (like a text box can)
// would force it to crop to fill the resulting mismatched box shape instead
// of just scaling. Corner drags always scale both dimensions together (see
// applyAspectLockedResizeDelta), so a corner handle is the only one that
// makes sense for an image.
const CORNER_RESIZE_HANDLES = RESIZE_HANDLES.filter((h) => h.xSign !== 0 && h.ySign !== 0)

export function EditorPage() {
  const { creationId } = useParams<{ creationId?: string }>()
  const navigate = useNavigate()

  const { data: existingCreation, isLoading: loadingExisting } = useCreation(creationId)
  const { data: allCreations = [] } = useCreations()
  const { data: allTemplates = [] } = useTemplates()
  const createCreation = useCreateCreation()
  const updateCreation = useUpdateCreation()
  const logExport = useLogExport()

  // The unsaved work left behind last time, if any (see lib/editorDraft.ts): restored silently,
  // straight into the editor's own state below. Read once, on mount. On a saved meme's own route
  // only a draft OF that meme applies; any other draft is left for the saved meme to replace.
  const [initialDraft] = useState(() => {
    const draft = readDraft()
    return draft && draftBelongsTo(draft, creationId) ? draft : null
  })
  // True while the layers in state came from a restored draft. The template-seeding step below
  // fills in a template's default captions once they load — which would overwrite the restored
  // layers — so it stands down until the user starts something new (another template, Clear Canvas…).
  const [draftOwnsLayers, setDraftOwnsLayers] = useState(initialDraft !== null)
  const [source, setSource] = useState<Source>(initialDraft?.source ?? null)
  const [savedMeta, setSavedMeta] = useState<SavedMeta>(initialDraft?.savedMeta ?? null)
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
  // Below 640px (Tailwind's `sm`, where the layout switches to the mobile one) the text/image
  // toolbar is a bar docked to the bottom of the screen instead of a pill floating over the
  // selected layer — it doesn't chase the layer around, and it rides above the keyboard.
  const isPhone = useMediaQuery('(max-width: 639px)')
  const keyboardInset = useKeyboardInset()
  const [exporting, setExporting] = useState(false)
  // True from the moment Save is clicked until it fully finishes — including
  // rendering the preview and uploading it, which is most of the wait.
  const [saving, setSaving] = useState(false)
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
    if (source?.type === 'template' && templateRow) {
      // Its own adjusted size once adjusted, otherwise exactly the image.
      return { width: source.canvasWidth ?? templateRow.image_width, height: source.canvasHeight ?? templateRow.image_height }
    }
    if (source?.type === 'freeform' && source.canvasWidth && source.canvasHeight) {
      return { width: source.canvasWidth, height: source.canvasHeight }
    }
    return undefined
  }, [templateRow, source])
  // Where the template image sits on the canvas, in the canvas's real pixels:
  // filling it (0,0) until the canvas is adjusted, then wherever the adjustment
  // left it — possibly off-center, or hanging off an edge. Its size never
  // changes; only the canvas around it does.
  const templateBackground = useMemo(() => {
    if (source?.type !== 'template' || !templateRow) return undefined
    return { x: source.backgroundX ?? 0, y: source.backgroundY ?? 0, width: templateRow.image_width, height: templateRow.image_height }
  }, [templateRow, source])

  const { data: fields = [], isSuccess: fieldsLoaded } = useTemplateFields(source?.type === 'template' ? source.templateId : undefined)
  const [layers, setLayers] = useState<Layer[]>(initialDraft?.layers ?? [])
  const [layersSeededFor, setLayersSeededFor] = useState<string | undefined>(undefined)
  // Snapshot of `layers` exactly as seeded (fresh template defaults, or a
  // saved creation's own canvas_data) — compared against the live `layers`
  // state to tell whether the user has actually changed anything since,
  // so switching templates only needs to confirm when there's real work to
  // lose. A ref, not state: it's only ever read at the moment of an action
  // (switching templates), never rendered.
  const baselineLayersRef = useRef<Layer[]>(initialDraft?.baseline ?? [])
  const imgRef = useRef<HTMLElement>(null)
  // The template image inside the canvas box (drawn under every layer).
  const bgImgRef = useRef<HTMLImageElement>(null)
  // The previous tap on a text box, for double-tap detection (touch has no dblclick).
  const lastTap = useRef<{ id: string; time: number; x: number; y: number } | null>(null)
  // Set once a canvas resize actually changes something, so switching templates
  // afterwards asks before throwing the adjustment away, even with no layer
  // edits. Reset wherever the baseline layers are reset.
  const canvasEditedRef = useRef(initialDraft?.canvasEdited ?? false)
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
  // Everything a canvas-resize drag needs, captured once when it begins: the
  // pointer and canvas size to measure from, and every layer as it was, since a
  // drag on the left/top edge moves the canvas origin and so shifts them all
  // (always computed from these start positions, never accumulated).
  const canvasResizeState = useRef<{
    startX: number
    startY: number
    startWidth: number
    startHeight: number
    // On-screen px per canvas px when the drag began. The view zooms out to fit
    // as the canvas grows, so re-measuring mid-drag would change how far the
    // pointer "counts" for; this stays fixed for the whole drag.
    startDisplayScale: number
    // Where the template image sat when the drag began (null for freeform).
    startBackground: { x: number; y: number } | null
    xSign: ResizeSign
    ySign: ResizeSign
    startLayers: Layer[]
  } | null>(null)

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

  // --- Draft: keep the editor's unsaved work in the browser (lib/editorDraft.ts) ---
  // The latest state, written after a short pause in editing (not on every keystroke) — and
  // straight away when the page is hidden/closed or this screen is left (tapping My Saves),
  // which usually happens inside that pause.
  const pendingDraft = useRef<Parameters<typeof writeDraft>[0] | null>(null)
  // Bumped after a save: it changes what counts as unsaved without changing any state below.
  const [savedTick, setSavedTick] = useState(0)
  useEffect(() => {
    // Nothing loaded (fresh editor, or a saved meme still loading): write nothing — and never
    // CLEAR here, or merely opening a saved meme would wipe the draft before anyone chose to.
    if (source === null) {
      pendingDraft.current = null
      return
    }
    // A template's default captions arrive separately: a draft with no layers yet would
    // restore a template with none, so wait until they're in. A blank canvas needs its image.
    const seeded = draftOwnsLayers || layersSeededFor !== undefined
    if (source.type === 'template' && !seeded) return
    if (source.type === 'freeform' && layers.length === 0) return
    const draft = {
      hasEdits: canvasEditedRef.current || JSON.stringify(layers) !== JSON.stringify(baselineLayersRef.current),
      source,
      savedMeta,
      layers,
      baseline: baselineLayersRef.current,
      canvasEdited: canvasEditedRef.current,
    }
    pendingDraft.current = draft
    const timer = setTimeout(() => {
      writeDraft(draft)
      if (pendingDraft.current === draft) pendingDraft.current = null
    }, DRAFT_WRITE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [source, savedMeta, layers, layersSeededFor, draftOwnsLayers, savedTick])
  useEffect(() => {
    const flush = () => {
      const draft = pendingDraft.current
      if (draft) {
        writeDraft(draft)
        pendingDraft.current = null
      }
    }
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', flushWhenHidden)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', flushWhenHidden)
      flush() // leaving this screen
    }
  }, [])

  // When editing an existing creation, sync local state from it the first time
  // it loads for this id — done during render (not in an effect) so it doesn't
  // clobber local state after a later Save As switches to a new id locally.
  // Starts as the restored draft's meme, so its saved version doesn't load over the restored edits.
  const [loadedCreationId, setLoadedCreationId] = useState<string | undefined>(initialDraft?.savedMeta?.id)
  if (existingCreation && existingCreation.id !== loadedCreationId) {
    if (existingCreation.source_type === 'template' && existingCreation.template_id) {
      // allTemplates is a separate async query — it may not have resolved yet.
      // Don't mark loadedCreationId until we actually find the template, so
      // this block keeps retrying on later renders instead of giving up silently.
      const template = allTemplates.find((t) => t.id === existingCreation.template_id)
      if (template) {
        setLoadedCreationId(existingCreation.id)
        const saved = existingCreation.canvas_data as CanvasData | null
        const adjusted = saved?.canvasWidth && saved?.canvasHeight
        canvasEditedRef.current = false
        setSource({
          type: 'template',
          name: template.name,
          templateId: template.id,
          blankImageUrl: template.blank_image_url,
          thumbnailUrl: template.thumbnail_url,
          ...(adjusted
            ? { canvasWidth: saved.canvasWidth, canvasHeight: saved.canvasHeight, backgroundX: saved.backgroundX ?? 0, backgroundY: saved.backgroundY ?? 0 }
            : {}),
        })
        setSavedMeta({ id: existingCreation.id, name: existingCreation.name, tags: existingCreation.tags })
      }
    } else {
      setLoadedCreationId(existingCreation.id)
      const canvasData = existingCreation.canvas_data as CanvasData | null
      setSource({
        type: 'freeform',
        name: existingCreation.name.replace(/ \d+$/, '') || existingCreation.name,
        canvasWidth: canvasData?.canvasWidth,
        canvasHeight: canvasData?.canvasHeight,
      })
      const seeded = layersFromCanvasData(existingCreation.canvas_data, [])
      setLayers(seeded)
      baselineLayersRef.current = seeded
      canvasEditedRef.current = false
      setSavedMeta({ id: existingCreation.id, name: existingCreation.name, tags: existingCreation.tags })
    }
  }

  // Layers need `fields`, a separate async query keyed off source.templateId,
  // so they're seeded independently of source/savedMeta above rather than in
  // the same block — the seed key is the creation's id when reopening a saved
  // creation, or 'new:'+templateId when starting fresh.
  // Waits for the fields query to have *resolved*, not for it to have returned
  // something: a template can legitimately have no fields of its own (an image
  // with no starter captions), and its saved layers — text the user added —
  // must still load. Gating on fields.length > 0 silently dropped them, and a
  // later Save then overwrote the stored layers with an empty list.
  if (source?.type === 'template' && fieldsLoaded && !draftOwnsLayers) {
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
    // The work was deliberately discarded (the user confirmed): forget the draft too, including
    // any write still waiting out its pause.
    pendingDraft.current = null
    clearDraft()
    setSource(null)
    setSavedMeta(null)
    setSelectedFieldId(null)
    setEditingLayerId(null)
    setAdjustingCanvas(false)
    setCropTargetId(null)
    cropSession.current = null
    setLayers([])
    setLayersSeededFor(undefined)
    setDraftOwnsLayers(false)
    baselineLayersRef.current = []
    canvasEditedRef.current = false
    if (creationId) navigate('/')
  }

  function loadTemplate(template: SelectedTemplate) {
    setSource({
      type: 'template',
      name: template.name,
      templateId: template.id,
      blankImageUrl: template.blankImageUrl,
      thumbnailUrl: template.thumbnailUrl,
    })
    setSavedMeta(null)
    setSelectedFieldId(null)
    setEditingLayerId(null)
    setAdjustingCanvas(false)
    setCropTargetId(null)
    cropSession.current = null
    setLayers([])
    setLayersSeededFor(undefined)
    setDraftOwnsLayers(false)
    baselineLayersRef.current = []
    canvasEditedRef.current = false
    if (creationId) navigate('/')
  }

  // Only confirm when there's actually something to lose — compares the
  // live layers against the snapshot taken when they were seeded, rather
  // than just checking whether *any* template is loaded. Lets someone
  // quickly flip through templates to see what they look like without a
  // dialog in the way every single time, and only interrupts once they've
  // genuinely started customizing one.
  function hasUnsavedLayerEdits(): boolean {
    return canvasEditedRef.current || JSON.stringify(layers) !== JSON.stringify(baselineLayersRef.current)
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

  function beginEditing(layer: TextLayer) {
    setSelectedFieldId(layer.id)
    editStartLabel.current = layer.label
    needsEditFocus.current = true
    setEditingLayerId(layer.id)
  }

  function handleDoubleClick(e: ReactMouseEvent<HTMLDivElement>, layer: TextLayer) {
    e.stopPropagation()
    beginEditing(layer)
  }

  // A phone has no double-click, and iOS doesn't reliably synthesize one for
  // these touch-none, pointer-captured boxes — so on touch/pen, two quick taps
  // on the same caption enter edit mode themselves. (A mouse keeps the real
  // dblclick above.) Both taps must land within DOUBLE_TAP_MS and
  // DOUBLE_TAP_SLOP px of each other, and a drag doesn't count as a tap.
  function handleTextPointerUp(e: ReactPointerEvent<HTMLDivElement>, layer: TextLayer) {
    const drag = dragState.current
    dragState.current = null
    if (e.pointerType === 'mouse') return
    // Already editing: a tap places the text cursor. Re-running "enter edit
    // mode" would select all the text again under the user's finger.
    if (editingLayerId === layer.id) return
    if (drag?.moved) {
      lastTap.current = null
      return
    }
    const now = Date.now()
    const previous = lastTap.current
    if (
      previous &&
      previous.id === layer.id &&
      now - previous.time <= DOUBLE_TAP_MS &&
      Math.hypot(e.clientX - previous.x, e.clientY - previous.y) <= DOUBLE_TAP_SLOP
    ) {
      lastTap.current = null
      beginEditing(layer)
    } else {
      lastTap.current = { id: layer.id, time: now, x: e.clientX, y: e.clientY }
    }
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
        setDraftOwnsLayers(false)
        // The freshly-created canvas's starting point already includes this
        // first image — matches loadTemplate's baseline-equals-just-seeded
        // pattern, so switching away without adding anything else doesn't
        // spuriously prompt to discard work.
        baselineLayersRef.current = [newLayer]
        canvasEditedRef.current = false
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
        setDraftOwnsLayers(false)
        baselineLayersRef.current = []
        canvasEditedRef.current = false
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

  // Canvas-resize handles (rendered below) — all 8 edges and corners. The
  // right/bottom edges leave the canvas origin (0,0) where it is; the
  // left/top edges move it, so those drags also shift every layer (see
  // resizeCanvas in layers.ts).
  function handleCanvasResizePointerDown(e: ReactPointerEvent<HTMLDivElement>, xSign: ResizeSign, ySign: ResizeSign) {
    e.stopPropagation()
    if (!activeCanvas || !imgRef.current) return
    canvasResizeState.current = {
      startX: e.clientX,
      startY: e.clientY,
      startWidth: activeCanvas.width,
      startHeight: activeCanvas.height,
      startDisplayScale: imgRef.current.getBoundingClientRect().width / activeCanvas.width,
      startBackground: templateBackground ? { x: templateBackground.x, y: templateBackground.y } : null,
      xSign,
      ySign,
      startLayers: layers,
    }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function handleCanvasResizePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation()
    const resize = canvasResizeState.current
    if (!resize) return
    const deltaX = (e.clientX - resize.startX) / resize.startDisplayScale
    const deltaY = (e.clientY - resize.startY) / resize.startDisplayScale
    const next = resizeCanvas({ width: resize.startWidth, height: resize.startHeight }, deltaX, deltaY, resize.xSign, resize.ySign)
    if (next.width !== resize.startWidth || next.height !== resize.startHeight) canvasEditedRef.current = true
    setSource((prev) => {
      if (prev?.type === 'freeform') return { ...prev, canvasWidth: next.width, canvasHeight: next.height }
      if (prev?.type === 'template') {
        // The image is part of what the left/top drags move, exactly like a layer.
        return {
          ...prev,
          canvasWidth: next.width,
          canvasHeight: next.height,
          backgroundX: (resize.startBackground?.x ?? 0) + next.offsetX,
          backgroundY: (resize.startBackground?.y ?? 0) + next.offsetY,
        }
      }
      return prev
    })
    // Dragging the left/top edge moves the canvas origin, so every layer moves
    // with it. From the drag's start positions, so it never accumulates.
    if (resize.xSign === -1 || resize.ySign === -1) {
      setLayers(resize.startLayers.map((l) => ({ ...l, x: l.x + next.offsetX, y: l.y + next.offsetY })))
    }
  }

  function handleCanvasResizePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation()
    canvasResizeState.current = null
  }

  function handleChangeFontSize(layerId: string, px: number) {
    setLayers((prev) => prev.map((l) => (l.id === layerId ? { ...l, fontSize: px } : l)))
  }

  function handleChangeTextStyle(layerId: string, patch: TextStylePatch) {
    setLayers((prev) => prev.map((l) => (l.id === layerId && l.type === 'text' ? { ...l, ...patch } : l)))
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
    // A freeform canvas always saves its size. A template saves it (and where the
    // image sits) only once adjusted, so an unadjusted one saves exactly what it
    // always has and older saves reopen unchanged.
    const canvasExtras =
      activeSource?.type === 'freeform'
        ? { canvasWidth: activeSource.canvasWidth, canvasHeight: activeSource.canvasHeight }
        : activeSource?.type === 'template' && activeSource.canvasWidth !== undefined
          ? {
              canvasWidth: activeSource.canvasWidth,
              canvasHeight: activeSource.canvasHeight,
              backgroundX: activeSource.backgroundX ?? 0,
              backgroundY: activeSource.backgroundY ?? 0,
            }
          : {}
    return { layers, ...canvasExtras } as unknown as Json
  }

  // The gallery card's thumbnail (and its Download) come from a PNG rendered
  // at Save time with the same code Export uses. Best-effort: if rendering
  // fails (e.g. a cross-origin image taints the canvas) the save must still
  // go through — the card just falls back to its grey placeholder.
  // The template image and where it sits on the canvas, for the renderer to
  // draw under every layer — undefined on a freeform canvas (nothing beneath).
  function currentBackground(): RenderOptions['background'] {
    if (!templateBackground || !bgImgRef.current) return undefined
    return { image: bgImgRef.current, ...templateBackground }
  }

  // The list only preloads thumbnails, so the full-size template image can
  // still be downloading when someone hits Export or Save right after picking a
  // template. Drawing an unfinished <img> would put a blank template in the
  // file, so wait for it. decode() also rejects for a broken image (and doesn't
  // exist in jsdom) — neither should block: that case just goes out without it.
  async function whenTemplateImageReady() {
    try {
      await bgImgRef.current?.decode?.()
    } catch {
      // see above
    }
  }

  async function renderPreviewBlob(): Promise<Blob | null> {
    if (!imgRef.current || !activeCanvas) return null
    try {
      await whenTemplateImageReady()
      const blob = await renderCreationToBlob(
        imgRef.current,
        { image_width: activeCanvas.width, image_height: activeCanvas.height },
        layers,
        { ...PREVIEW_RENDER_OPTIONS, background: currentBackground() },
      )
      return blob ?? null
    } catch {
      return null
    }
  }

  // Work that has just been saved is no longer "unsaved": the saved layers become the new
  // baseline and the canvas-adjusted flag resets. Without this, the editor kept treating
  // just-saved work as unsaved edits — it would ask to "discard your work" for something already
  // safe in My Saves, and the draft would keep claiming there was something to protect.
  function markSaved(savedLayers: Layer[]) {
    baselineLayersRef.current = savedLayers
    canvasEditedRef.current = false
    setSavedTick((tick) => tick + 1)
  }

  async function handleDialogSave(name: string, tags: string[]) {
    const activeSource = source! // guaranteed non-null: Save to Gallery only renders once source is set
    // Exactly what is being saved: edits made while the (slow) render/upload is in flight are NOT
    // in it, so they must still count as unsaved afterwards.
    const savedLayers = layers
    setSaving(true)
    try {
      // Captured before the (async) render so the saved layers and the saved
      // preview are guaranteed to describe the same moment.
      const canvasData = buildCanvasData(activeSource)
      const previewBlob = await renderPreviewBlob()
      const row = await createCreation.mutateAsync({
        name,
        tags,
        sourceType: activeSource.type,
        templateId: activeSource.type === 'template' ? activeSource.templateId : null,
        canvasData,
        previewBlob,
      })
      markSaved(savedLayers)
      setSavedMeta({ id: row.id, name: row.name, tags: row.tags })
      setDialogOpen(false)
      setToast({ message: 'Saved!', isError: false })
    } catch {
      // The dialog stays open, with its Save button live again, to retry.
      setToast({ message: 'Save failed — try again.', isError: true })
    } finally {
      setSaving(false)
    }
  }

  async function handleQuickSave() {
    if (!savedMeta) return
    const savedLayers = layers
    setSaving(true)
    try {
      const canvasData = buildCanvasData(source)
      const previewBlob = await renderPreviewBlob()
      await updateCreation.mutateAsync({ id: savedMeta.id, name: savedMeta.name, tags: savedMeta.tags, canvasData, previewBlob })
      markSaved(savedLayers)
      setToast({ message: 'Saved!', isError: false })
    } catch {
      setToast({ message: 'Save failed — try again.', isError: true })
    } finally {
      setSaving(false)
    }
  }

  async function handleExport() {
    if (!source || !activeCanvas || !imgRef.current) return
    // No template (freeform work) is logged as an empty template id.
    const templateId = source.type === 'template' ? source.templateId : null
    setExporting(true)
    try {
      await whenTemplateImageReady()
      const blob = await renderCreationToBlob(
        imgRef.current,
        { image_width: activeCanvas.width, image_height: activeCanvas.height },
        layers,
        { background: currentBackground() },
      )
      const filename = `${sanitizeFilename(savedMeta?.name ?? source.name)}.png`
      const file = new File([blob], filename, { type: 'image/png' })
      if (isMobileOrTabletDevice() && canShareFile(file)) {
        try {
          await shareFile(file, filename)
          logExport.mutate(templateId) // only a completed share counts; a cancelled sheet rejects below
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
        logExport.mutate(templateId)
        setToast({ message: 'Downloaded!', isError: false })
      }
    } catch {
      setToast({ message: 'Export failed — try again.', isError: true })
    } finally {
      setExporting(false)
    }
  }

  return (
    // Stacked on a phone: the template toggle sits ABOVE the canvas instead of beside
    // it (side by side, the toggle's column took width and squeezed the canvas).
    <div className="flex h-full flex-col gap-3 pb-20 sm:flex-row sm:gap-6 sm:pb-0">
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
              saving={saving}
              canSaveAs={savedMeta !== null}
              canAdjustCanvas={activeCanvas !== undefined}
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
            //
            // m-2 (8px all round, on top of the above on the right/bottom at
            // sm+) keeps the canvas off the scroll area's edges: canvas-resize
            // and layer-resize handles are centered ON the edge, so their outer
            // half sits outside the box, and a scroll container clips whatever
            // pokes past its own edge — flush against the top/left, that half
            // (and on a canvas wider than the space, the whole left side) was
            // cut off and could not be grabbed. The width/height budgets in the
            // canvas box's className below are reduced by exactly these margins.
            className="relative m-2 mb-16 inline-block rounded-lg bg-[repeating-conic-gradient(#00000010_0%_25%,transparent_0%_50%)] bg-[length:20px_20px] sm:mr-12 sm:mb-4"
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
              <div className="aspect-square w-[calc(100vw-3.75rem)] sm:h-[calc(100vh-19rem)] sm:w-auto sm:max-w-[calc(100vw-24rem)] sm:min-h-[240px]" />
            )}
            {source !== null && activeCanvas && (
              // One canvas box for both kinds of canvas — a plain <div>, sized to FIT
              // the space available at the canvas's true aspect ratio. A template's
              // image is just a picture inside it (see the <img> below), which is
              // what lets the canvas be adjusted independently of the image.
              //
              // A plain <div> isn't a "replaced element" the way <img> is, so it
              // has no built-in algorithm for deriving its width from a
              // max-height + intrinsic ratio: that combination silently collapses
              // it, since w-auto/max-w-full both resolve against this box's own
              // indeterminate (shrink-wrap) parent — the same circular-sizing trap
              // the blank placeholder above works around. So the width is explicit
              // (below) and aspect-ratio derives the height from it.
              //
              // No background color here — left transparent so the outer wrapper's
              // own checkerboard shows through in any canvas space not covered by
              // the image or a layer. Matters most right after enlarging the canvas:
              // that new space has to read as "empty canvas," not blend invisibly
              // into the page's own white background the way opaque white would.
              // overflow-hidden crops the image when the canvas is shrunk below it.
              //
              // Sized to FIT: width is the smaller of "all the width there is" and
              // "the width that makes the height fill the height there is"
              // (height x ratio); aspect-ratio derives the height from that. The
              // old formula fixed the height and only capped the width, so a canvas
              // wider than the space (easy after dragging its edge out) hit the cap
              // while the height stayed put — the box's own ratio no longer matched
              // the canvas's, which squashed everything on it and left the drag
              // handle trailing behind the cursor. Same measured constants as
              // before, less the m-2 margins around this box (65vh / 100vh-19.5rem
              // of height; 100vw-15rem / 100vw-27.5rem of width, below / at-or-above
              // `sm` — the latter also leaves room for the sm:mr-12 the FAB needs).
              // No min-h floor: it would fight the ratio for a very wide canvas.
              <div
                ref={imgRef as RefObject<HTMLDivElement>}
                style={{
                  aspectRatio: `${activeCanvas.width} / ${activeCanvas.height}`,
                  // The exact ratio, for the width formula in className below.
                  '--canvas-ratio': activeCanvas.width / activeCanvas.height,
                } as CSSProperties}
                className="relative block w-[min(calc(100vw-3.75rem),calc(65vh*var(--canvas-ratio)))] overflow-hidden sm:w-[min(calc(100vw-27.5rem),calc((100vh-19.5rem)*var(--canvas-ratio)))]"
              >
                {source.type === 'template' && templateBackground && (
                  <img
                    // A fresh element per template, not one reused with a new
                    // src: a reused <img> keeps painting the PREVIOUS template's
                    // bitmap until the new file arrives, which now (the list only
                    // preloads thumbnails, not full images) is a noticeable wait.
                    key={source.templateId}
                    ref={bgImgRef}
                    src={source.blankImageUrl}
                    alt={source.name}
                    draggable={false}
                    // Needed for canvas.toBlob() in renderCreationToBlob to not
                    // throw on a "tainted" canvas — the template-images bucket
                    // is public with permissive CORS, so this alone is enough.
                    crossOrigin="anonymous"
                    // Positioned and sized as percentages of the canvas, like a
                    // layer. object-contain matters when switching templates:
                    // this <img> is reused (only its src changes), so the
                    // browser keeps painting the OLD template's decoded bitmap
                    // while the new one downloads, and the box already has the
                    // new template's proportions — the default object-fit
                    // (fill) would stretch that old bitmap into the new shape
                    // for a moment (the "squished for a second" glitch).
                    // max-w-none overrides Tailwind Preflight's img max-width.
                    className="pointer-events-none absolute max-w-none select-none bg-contain bg-center bg-no-repeat object-contain"
                    style={{
                      // The thumbnail is already in the browser (the list shows
                      // it), so it appears instantly, blurry, behind the empty
                      // <img>; the sharp image paints over it once it arrives.
                      // bg-contain matches object-contain so they line up.
                      ...(source.thumbnailUrl ? { backgroundImage: `url(${source.thumbnailUrl})` } : {}),
                      left: `${(templateBackground.x / activeCanvas.width) * 100}%`,
                      top: `${(templateBackground.y / activeCanvas.height) * 100}%`,
                      width: `${(templateBackground.width / activeCanvas.width) * 100}%`,
                      height: `${(templateBackground.height / activeCanvas.height) * 100}%`,
                    }}
                  />
                )}
              </div>
            )}
            {source?.type === 'freeform' && !activeCanvas && (
              <div className="flex h-80 w-80 max-w-[calc(100vw-3.75rem)] items-center justify-center border border-border bg-muted text-sm text-muted-foreground">
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
                  // The selected layer's toolbar, placed either in the phone dock or in the
                  // floating wrapper below.
                  const propertyBar =
                    isSelected && !isCropping ? (
                      <PropertyBar
                        docked={isPhone}
                        fontSize={layer.type === 'text' ? layer.fontSize : undefined}
                        onChangeFontSize={layer.type === 'text' ? (px) => handleChangeFontSize(layer.id, px) : undefined}
                        textStyle={layer.type === 'text' ? resolveTextStyle(layer) : undefined}
                        onChangeTextStyle={layer.type === 'text' ? (patch) => handleChangeTextStyle(layer.id, patch) : undefined}
                        onCrop={layer.type === 'image' ? () => handleEnterCropMode(layer) : undefined}
                        onDelete={() => handleDeleteLayer(layer.id)}
                        onReorder={(action) => handleReorderLayer(layer.id, action)}
                        canMoveForward={layerIndex < layers.length - 1}
                        canMoveBackward={layerIndex > 0}
                      />
                    ) : null
                  // Anything hanging off the canvas (after shrinking it, or a layer
                  // dragged partway out) is cropped to it, as export does.
                  const clipPath = layerClipPath(layer, activeCanvas)

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
                          style={{ left: `${leftPct}%`, top: `${topPct}%`, width: `${widthPct}%`, height: `${heightPct}%`, clipPath }}
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
                                className="absolute z-10 h-2.5 w-2.5 touch-none pointer-coarse:h-4 pointer-coarse:w-4 pointer-coarse:before:absolute pointer-coarse:before:-inset-3 border border-blue-500 bg-white"
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
                                className="absolute h-2.5 w-2.5 touch-none pointer-coarse:h-4 pointer-coarse:w-4 pointer-coarse:before:absolute pointer-coarse:before:-inset-3 border border-blue-500 bg-white"
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
                          // Font, fill, outline and alignment come from the
                          // layer's own style (textLayerCssStyle in the style
                          // prop below); an unstyled legacy layer resolves to
                          // the original white-fill/black-outline/centered look.
                          // The outline is an em-sized -webkit-text-stroke so it
                          // scales with this box's own font-size (itself already
                          // scaled to the image via cqw). paint-order draws the
                          // stroke behind the fill so it doesn't eat into/thin
                          // the letterforms.
                          className={`absolute p-1 outline-none [paint-order:stroke_fill] ${
                            isSelected ? 'border border-blue-500' : 'border border-transparent'
                          } ${isEditing ? 'cursor-text' : 'cursor-grab touch-none active:cursor-grabbing'} ${
                            isSelected && !isEditing ? 'hover:underline hover:decoration-blue-500' : ''
                          }`}
                          style={{
                            left: `${leftPct}%`,
                            top: `${topPct}%`,
                            width: `${widthPct}%`,
                            ...textLayerCssStyle(layer),
                            // heightAuto (the default): no explicit height, so the
                            // box grows to fit wrapped text instead of clipping it
                            // — a bigger font or more text is never silently cut
                            // off. Dragging a resize handle below sets an explicit
                            // height and turns this off permanently for that box,
                            // same as any ordinary text box.
                            ...(layer.heightAuto ? {} : { height: `${heightPct}%` }),
                            fontSize: `calc(${(layer.fontSize / activeCanvas.width) * 100} * 1cqw)`,
                            clipPath,
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
                          onPointerUp={(e) => handleTextPointerUp(e, layer)}
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
                                className="absolute h-2.5 w-2.5 touch-none pointer-coarse:h-4 pointer-coarse:w-4 pointer-coarse:before:absolute pointer-coarse:before:-inset-3 border border-blue-500 bg-white"
                                style={{ top: handle.top, left: handle.left, transform: 'translate(-50%, -50%)', cursor: handle.cursor }}
                                onPointerDown={(e) => handleResizePointerDown(e, layer, handle.xSign, handle.ySign)}
                                onPointerMove={handleResizePointerMove}
                                onPointerUp={handleResizePointerUp}
                                onClick={(e) => e.stopPropagation()}
                              />
                            ))}
                        </div>
                      )}

                      {propertyBar &&
                        (isPhone
                          ? createPortal(
                              // Phone: docked to the bottom edge, full width. Not anchored to the
                              // layer, so it never covers or chases it. Lifted by the on-screen
                              // keyboard's height (phone browsers don't move fixed elements up
                              // themselves), and padded for the home-indicator area when the
                              // keyboard is closed. z-20: above the canvas + button (z-10), below
                              // the template drawer (z-30).
                              <div
                                data-property-dock
                                className="fixed inset-x-0 z-20"
                                style={{ bottom: keyboardInset, paddingBottom: keyboardInset > 0 ? 0 : 'env(safe-area-inset-bottom)' }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {propertyBar}
                              </div>,
                              document.body,
                            )
                          : propertyBarPos &&
                            createPortal(
                              <div
                                // w-max: a fixed box otherwise shrink-wraps to the space
                                // right of its own `left`, so the (wide) bar wrapped
                                // into a narrow column for any layer far to the right.
                                // The max-w caps it to the screen so it only wraps when
                                // it genuinely can't fit.
                                className="fixed z-50 w-max max-w-[calc(100vw-1rem)]"
                                // Centered on its layer, so a layer near any screen edge would
                                // push it off-screen; re-fitted on every render because the bar
                                // moves with the layer.
                                ref={(el) => fitToolbar(el)}
                                style={{
                                  left: propertyBarPos.left,
                                  top: propertyBarPos.top,
                                  // Anchored to the field's own position — sits
                                  // just above the field, horizontally centered on it.
                                  transform: 'translate(-50%, calc(-100% - 8px))',
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {propertyBar}
                              </div>,
                              document.body,
                            ))}
                    </Fragment>
                  )
                })}
              </div>
            )}
            {activeCanvas && adjustingCanvas && (
              <div className="absolute inset-0">
                {RESIZE_HANDLES.map((handle) => (
                  <div
                    key={handle.key}
                    data-canvas-handle={handle.key}
                    className="absolute z-10 h-2.5 w-2.5 touch-none pointer-coarse:h-4 pointer-coarse:w-4 pointer-coarse:before:absolute pointer-coarse:before:-inset-3 border border-neutral-500 bg-white"
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
            {/* Hidden while adjusting the canvas: it sits over the canvas's
                bottom-right corner, right on top of that resize handle. */}
            {!adjustingCanvas && <CanvasFab onAddText={handleAddText} onAddImage={handleAddImage} uploadingImage={uploadingImage} />}
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
        saving={saving}
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
          className={`fixed bottom-24 left-1/2 ${TOAST_Z} -translate-x-1/2 rounded-full px-4 py-2 text-sm text-white shadow-lg sm:bottom-6 ${
            toast.isError ? 'bg-red-600' : 'bg-neutral-900'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}
