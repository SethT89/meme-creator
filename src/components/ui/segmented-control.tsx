import { cn } from '../../lib/cn'

export interface SegmentedControlOption {
  value: string
  label: string
}

export interface SegmentedControlProps {
  options: SegmentedControlOption[]
  value: string
  onChange: (value: string) => void
}

export function SegmentedControl({ options, value, onChange }: SegmentedControlProps) {
  return (
    // No gap between segments — one continuous pill (bold bg-primary fill),
    // active segment reads as a white pill inset flush against the container
    // edge, inactive segment is just text directly on the colored fill.
    <div className="inline-flex items-center rounded-full bg-primary p-1">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-full px-5 py-2 text-sm font-semibold transition-colors',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-primary-foreground/80 hover:text-primary-foreground',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
