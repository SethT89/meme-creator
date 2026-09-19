import { useRef } from 'react'

interface TemplateSearchInputProps {
  value: string
  onChange: (value: string) => void
  // Enter: the sidebar picks the top result.
  onSubmit: () => void
  // Down arrow: the sidebar moves focus into the results. Handed the input so
  // it can find the results relative to it (this component renders in two
  // places at once — desktop column and mobile drawer — so it can't use a ref).
  onArrowDown: (input: HTMLInputElement) => void
}

export function TemplateSearchInput({ value, onChange, onSubmit, onArrowDown }: TemplateSearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="relative mb-2 shrink-0">
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        <circle cx="6" cy="6" r="4.25" />
        <path d="M9.25 9.25 12.5 12.5" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        aria-label="Search memes"
        placeholder="Search memes…"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onChange('')
          } else if (e.key === 'Enter') {
            onSubmit()
          } else if (e.key === 'ArrowDown') {
            // Stop the caret jumping to the end of the text as focus leaves.
            e.preventDefault()
            onArrowDown(e.currentTarget)
          }
        }}
        // type="search" brings a native cancel ✕ in WebKit; hidden so the
        // app's own (consistent, keyboard-reachable) clear button is the only one.
        className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-8 text-base outline-none sm:text-sm placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-blue-500 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value !== '' && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onChange('')
            inputRef.current?.focus()
          }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-1.5 text-sm text-muted-foreground hover:bg-muted"
        >
          ✕
        </button>
      )}
    </div>
  )
}
