import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'

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
