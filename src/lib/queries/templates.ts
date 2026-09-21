import { useMutation, useQuery } from '@tanstack/react-query'
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
    // The list is ordered by popularity, and reordering it while someone is using it (they click one
    // and it jumps, or they switch back to the tab and it shuffles) is disorienting. So the order is
    // worked out once per visit to the page: a click, a window regaining focus or a reconnect never
    // re-fetch it, and it is dropped from the cache the moment the sidebar goes away, so a page refresh
    // or coming back to the main page fetches a fresh order.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    gcTime: 0,
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

// Deliberately does NOT refresh the popularity order: the click is counted for the next visit, and the
// list stays exactly as it is now (see useTemplatesByUsage).
export function useLogTemplateUsage() {
  return useMutation({
    mutationFn: (templateId: string) => insertUsageEvent('pick', templateId),
  })
}

// Logs a completed export. Nothing on screen depends on it, so no cache invalidation.
export function useLogExport() {
  return useMutation({
    mutationFn: (templateId: string | null) => insertUsageEvent('export', templateId),
  })
}
