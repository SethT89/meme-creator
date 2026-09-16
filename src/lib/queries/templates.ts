import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { sortTemplatesByUsage } from '../templateUsage'

export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('templates').select('*')
      if (error) throw error
      return data
    },
  })
}

export function useTemplateFields(templateId: string | undefined) {
  return useQuery({
    queryKey: ['template_fields', templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('template_fields')
        .select('*')
        .eq('template_id', templateId!)
        .order('order_index', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!templateId,
  })
}

export function useTemplatesByUsage() {
  return useQuery({
    queryKey: ['templates', 'by-usage'],
    queryFn: async () => {
      const [templatesRes, usageRes] = await Promise.all([
        supabase.from('templates').select('*'),
        supabase.from('template_usage_events').select('template_id'),
      ])
      if (templatesRes.error) throw templatesRes.error
      if (usageRes.error) throw usageRes.error
      return sortTemplatesByUsage(templatesRes.data, usageRes.data)
    },
  })
}

export function useLogTemplateUsage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (templateId: string) => {
      const { error } = await supabase.from('template_usage_events').insert({ template_id: templateId })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates', 'by-usage'] })
    },
  })
}
