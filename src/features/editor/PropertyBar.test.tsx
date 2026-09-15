import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PropertyBar } from './PropertyBar'

describe('PropertyBar', () => {
  it('shows a size dropdown with presets, defaulting to Medium', async () => {
    render(<PropertyBar />)

    expect(screen.getByText(/size: medium/i)).toBeInTheDocument()
    await userEvent.click(screen.getByText(/size: medium/i))
    expect(screen.getByText('Extra Large')).toBeInTheDocument()

    await userEvent.click(screen.getByText('Large'))
    expect(screen.getByText(/size: large/i)).toBeInTheDocument()
    expect(screen.queryByText('Extra Large')).not.toBeInTheDocument()
  })
})
