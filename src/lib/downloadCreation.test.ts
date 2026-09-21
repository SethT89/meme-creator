import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./queries/templates', () => ({ fetchTemplate: vi.fn(), fetchTemplateFields: vi.fn() }))
vi.mock('./renderSavedCreation', () => ({ renderSavedCreationToBlob: vi.fn() }))
import { fetchTemplate, fetchTemplateFields } from './queries/templates'
import { renderSavedCreationToBlob } from './renderSavedCreation'
import { renderCreationForDownload } from './downloadCreation'
import type { CreationRow } from './queries/creations'

const BLOB = new Blob(['png'], { type: 'image/png' })
const template = { id: 't1', image_width: 600, image_height: 908, blank_image_url: 'https://x/blank.jpg' }

function creation(overrides: Partial<CreationRow>): CreationRow {
  return {
    id: 'c1', name: 'Drake 1', tags: [], status: 'final', user_id: 'u', created_at: '', updated_at: '', preview_image_url: null,
    source_type: 'template', template_id: 't1', canvas_data: { layers: [] },
    ...overrides,
  } as CreationRow
}

beforeEach(() => {
  vi.mocked(fetchTemplate).mockReset().mockResolvedValue(template)
  vi.mocked(fetchTemplateFields).mockReset().mockResolvedValue([])
  vi.mocked(renderSavedCreationToBlob).mockReset().mockResolvedValue(BLOB)
})

describe('renderCreationForDownload', () => {
  it("looks up a template meme's template and renders it", async () => {
    const row = creation({})
    expect(await renderCreationForDownload(row)).toBe(BLOB)

    expect(fetchTemplate).toHaveBeenCalledWith('t1')
    expect(renderSavedCreationToBlob).toHaveBeenCalledWith(row, template, [])
  })

  it("does not fetch the template's caption fields when the meme stored its layers (the normal case)", async () => {
    await renderCreationForDownload(creation({ canvas_data: { layers: [] } }))
    expect(fetchTemplateFields).not.toHaveBeenCalled()
  })

  it('fetches the caption fields only for an older save that stored no layers at all', async () => {
    const fields = [{ id: 'f1', label: 'Caption 1' }] as never
    vi.mocked(fetchTemplateFields).mockResolvedValue(fields)
    const row = creation({ canvas_data: {} })

    await renderCreationForDownload(row)

    expect(fetchTemplateFields).toHaveBeenCalledWith('t1')
    expect(renderSavedCreationToBlob).toHaveBeenCalledWith(row, template, fields)
  })

  it('needs no template lookup for a freeform meme', async () => {
    const row = creation({ source_type: 'freeform', template_id: null, canvas_data: { layers: [], canvasWidth: 400, canvasHeight: 300 } })
    await renderCreationForDownload(row)

    expect(fetchTemplate).not.toHaveBeenCalled()
    expect(renderSavedCreationToBlob).toHaveBeenCalledWith(row, undefined, [])
  })

  it('hands over an undefined template when it no longer exists, so the render refuses it clearly', async () => {
    vi.mocked(fetchTemplate).mockResolvedValue(undefined)
    const row = creation({})
    await renderCreationForDownload(row)
    expect(renderSavedCreationToBlob).toHaveBeenCalledWith(row, undefined, [])
  })
})
