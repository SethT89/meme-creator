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

// One-off fetches for callers that need a single template on demand (the gallery's Download) without
// loading the whole list. `fetchTemplate` resolves to undefined for a template that no longer exists.
export async function fetchTemplate(id: string) {
  const { data, error } = await supabase.from('templates').select('id, image_width, image_height, blank_image_url').eq('id', id).maybeSingle()
  if (error) throw error
  return data ?? undefined
}

export async function fetchTemplateFields(templateId: string) {
  const { data, error } = await supabase
    .from('template_fields')
    .select('*')
    .eq('template_id', templateId)
    .order('order_index', { ascending: true })
  if (error) throw error
  return data
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

type UsageEventType = 'pick' | 'save' | 'export'

// A null template means the work did not use one (freeform). Saves are logged by a database
// trigger on `creations`, so app code only logs picks and exports.
async function insertUsageEvent(eventType: UsageEventType, templateId: string | null) {
  const { error } = await supabase
    .from('template_usage_events')
    .insert({ template_id: templateId, event_type: eventType, user_id: getCurrentUserId() })
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
