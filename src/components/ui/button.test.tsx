import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './button'

describe('Button', () => {
  it('renders its children and responds to clicks', async () => {
    const handleClick = vi.fn()
    render(<Button onClick={handleClick}>Save</Button>)

    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toBeInTheDocument()

    await userEvent.click(button)
    expect(handleClick).toHaveBeenCalledOnce()
  })

  it('applies the outline variant class', () => {
    render(<Button variant="outline">Cancel</Button>)
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass('border')
  })

  describe('touch sizes', () => {
    // jsdom can't measure a real button, so guard the classes that make each size
    // finger-friendly on touch screens (and leave desktop as it was).
    it.each([
      ['sm', 'pointer-coarse:h-11'],
      ['default', 'pointer-coarse:h-12'],
    ] as const)('the %s size grows to %s on a touch screen', (size, expected) => {
      render(<Button size={size}>Go</Button>)
      expect(screen.getByRole('button', { name: 'Go' })).toHaveClass(expected)
    })

    it('keeps its compact desktop height alongside', () => {
      render(<Button size="sm">Go</Button>)
      expect(screen.getByRole('button', { name: 'Go' })).toHaveClass('h-8')
    })
  })
})
