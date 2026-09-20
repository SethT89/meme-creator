import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { getCurrentUserId } from '../currentUser'

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
      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .order('use_count_total', { ascending: false })
        .order('name', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

type UsageEventKind = 'pick' | 'save' | 'export'

// A null template means the work did not use one (freeform). Saves are logged by a database
// trigger on `creations`, so app code only logs picks and exports.
async function insertUsageEvent(kind: UsageEventKind, templateId: string | null) {
  const { error } = await supabase
    .from('template_usage_events')
    .insert({ template_id: templateId, kind, user_id: getCurrentUserId() })
  if (error) throw error
}

export function useLogTemplateUsage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (templateId: string) => insertUsageEvent('pick', templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates', 'by-usage'] })
    },
  })
}

// Logs a completed export. Nothing on screen depends on it, so no cache invalidation.
export function useLogExport() {
  return useMutation({
    mutationFn: (templateId: string | null) => insertUsageEvent('export', templateId),
  })
}
