import { fetchTemplate, fetchTemplateFields } from './queries/templates'
import { renderSavedCreationToBlob } from './renderSavedCreation'
import type { CreationRow } from './queries/creations'

// Gathers what a saved meme needs to be rebuilt (its template, and the template's caption fields only
// for an older save that stored no layers) and renders it: a lossless full-size PNG, exactly what the
// Export button would have produced. Used by the gallery's Download.
export async function renderCreationForDownload(creation: CreationRow): Promise<Blob> {
  const template =
    creation.source_type === 'template' && creation.template_id ? await fetchTemplate(creation.template_id) : undefined
  const storedLayers = Array.isArray((creation.canvas_data as { layers?: unknown } | null)?.layers)
  const fields = template && !storedLayers ? await fetchTemplateFields(template.id) : []
  return renderSavedCreationToBlob(creation, template, fields)
}
