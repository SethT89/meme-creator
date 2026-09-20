import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { removePreview, uploadPreview } from '../previewStorage'
import { removeUnusedAssets } from '../assetStorage'
import { clearDraft, readDraft } from '../editorDraft'
import type { Tables, Json } from '../../types/database'

export type CreationRow = Tables<'creations'>

export function useCreations() {
  return useQuery({
    queryKey: ['creations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('creations')
        .select('*')
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useCreation(id: string | undefined) {
  return useQuery({
    queryKey: ['creations', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('creations').select('*').eq('id', id!).single()
      if (error) throw error
      return data
    },
    enabled: !!id,
  })
}

interface CreateCreationInput {
  name: string
  tags: string[]
  sourceType: 'template' | 'freeform'
  templateId: string | null
  canvasData: Json
  // A freshly rendered PNG of the creation, uploaded alongside the row.
  // Optional and best-effort — see previewStorage.ts.
  previewBlob?: Blob | null
}

export function useCreateCreation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateCreationInput) => {
      const previewUrl = await uploadPreview(input.previewBlob)
      const { data, error } = await supabase
        .from('creations')
        .insert({
          name: input.name,
          tags: input.tags,
          source_type: input.sourceType,
          template_id: input.templateId,
          status: 'final',
          canvas_data: input.canvasData,
          preview_image_url: previewUrl,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creations'] })
    },
  })
}

interface UpdateCreationInput {
  id: string
  name: string
  tags: string[]
  canvasData: Json
  previewBlob?: Blob | null
}

export function useUpdateCreation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateCreationInput) => {
      // Only touch the preview column when there's a new one to store: a
      // failed render/upload keeps the old preview rather than wiping it.
      let previousUrl: string | null = null
      if (input.previewBlob) {
        const { data: existing } = await supabase.from('creations').select('preview_image_url').eq('id', input.id).single()
        previousUrl = existing?.preview_image_url ?? null
      }
      const newUrl = input.previewBlob ? await uploadPreview(input.previewBlob) : null
      const { data, error } = await supabase
        .from('creations')
        .update({
          name: input.name,
          tags: input.tags,
          canvas_data: input.canvasData,
          ...(newUrl ? { preview_image_url: newUrl } : {}),
        })
        .eq('id', input.id)
        .select()
        .single()
      if (error) throw error
      if (newUrl) void removePreview(previousUrl)
      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['creations'] })
      queryClient.invalidateQueries({ queryKey: ['creations', variables.id] })
    },
  })
}

export function useDeleteCreation() {
  const queryClient = useQueryClient()
  return useMutation({
    // The caller already has the row (it's showing it), so it passes the
    // preview URL and canvas data along rather than this hook re-fetching them
    // just to clean up. Both cleanups run only once the row is really gone, and
    // neither can fail the delete.
    mutationFn: async ({
      id,
      previewImageUrl,
      canvasData,
    }: {
      id: string
      previewImageUrl: string | null
      canvasData: Json | null
    }) => {
      const { error } = await supabase.from('creations').delete().eq('id', id)
      if (error) throw error
      // Unsaved edits to a meme that no longer exists have nothing to be saved into.
      if (readDraft()?.savedMeta?.id === id) clearDraft()
      void removePreview(previewImageUrl)
      // Frees the images this creation uploaded (unless another creation, e.g.
      // a Save As copy, still uses them). The .catch is belt and braces:
      // removeUnusedAssets already never throws.
      void removeUnusedAssets(canvasData).catch(() => {})
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creations'] })
    },
  })
}
