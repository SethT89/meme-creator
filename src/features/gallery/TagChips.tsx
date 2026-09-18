import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Chip } from '../../components/ui/chip'
import { countVisibleChips } from '../../lib/chipLayout'

const GAP_PX = 4 // Tailwind gap-1
const MAX_LINES = 2

interface TagChipsProps {
  tags: string[]
  onShowAll: () => void
}

// A card's tags as chips, kept to two lines: whatever doesn't fit collapses
// into a trailing "+N" chip that opens the full list. Which chips fit depends
// on their rendered widths, so this measures rather than guessing.
//
// Two passes. Pass one (visibleCount === null) renders every chip plus a
// "+N" probe, and a layout effect reads their widths before the browser
// paints — so the extra chips are never actually seen. It then stores how
// many to keep, and pass two renders just those and the real +N chip. The
// final DOM has no hidden or duplicate chips. A resize goes back to pass one.
export function TagChips({ tags, onShowAll }: TagChipsProps) {
  const rowRef = useRef<HTMLSpanElement>(null)
  const measuredWidth = useRef(0)
  const [visibleCount, setVisibleCount] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (visibleCount !== null) return
    const row = rowRef.current
    if (!row) return
    const children = Array.from(row.children) as HTMLElement[]
    const probe = children.pop() // the "+N" probe is always last in pass one
    measuredWidth.current = row.clientWidth
    setVisibleCount(
      countVisibleChips(
        children.map((c) => c.offsetWidth),
        probe?.offsetWidth ?? 0,
        row.clientWidth,
        GAP_PX,
        MAX_LINES,
      ),
    )
  }, [visibleCount])

  // Re-measure when the card's width changes (window resize, grid reflow).
  useEffect(() => {
    const row = rowRef.current
    if (!row || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (row.clientWidth !== measuredWidth.current) setVisibleCount(null)
    })
    observer.observe(row)
    return () => observer.disconnect()
  }, [])

  const measuring = visibleCount === null
  const shown = measuring ? tags : tags.slice(0, visibleCount)
  const hidden = tags.length - shown.length

  return (
    <span ref={rowRef} className="flex flex-wrap gap-1">
      {shown.map((tag) => (
        <Chip key={tag} label={tag} />
      ))}
      {measuring && <Chip label={`+${tags.length}`} />}
      {!measuring && hidden > 0 && (
        <Chip label={`+${hidden}`} ariaLabel={`Show all ${tags.length} tags`} onClick={onShowAll} />
      )}
    </span>
  )
}
