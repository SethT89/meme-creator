import { Button } from './button'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div role="dialog" className="fixed inset-0 flex items-center justify-center bg-black/50">
      <div className="w-80 max-w-[calc(100vw-2rem)] rounded-lg bg-background p-4 shadow-lg">
        <h2 className="mb-2 text-sm font-semibold">{title}</h2>
        <p className="mb-4 text-sm text-muted-foreground">{message}</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
