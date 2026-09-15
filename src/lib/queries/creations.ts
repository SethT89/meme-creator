import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import type { Tables } from '../../types/database'

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
}

export function useCreateCreation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateCreationInput) => {
      const { data, error } = await supabase
        .from('creations')
        .insert({
          name: input.name,
          tags: input.tags,
          source_type: input.sourceType,
          template_id: input.templateId,
          status: 'final',
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
}

export function useUpdateCreation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateCreationInput) => {
      const { data, error } = await supabase
        .from('creations')
        .update({ name: input.name, tags: input.tags })
        .eq('id', input.id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['creations'] })
      queryClient.invalidateQueries({ queryKey: ['creations', variables.id] })
    },
  })
}
