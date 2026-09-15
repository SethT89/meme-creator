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
})
