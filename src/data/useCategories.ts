import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Category } from './types'

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from('categories').select('id, name').order('name')
      if (error) throw error
      return data as Category[]
    },
  })
}
