import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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

export function useSaveCategory() {
  const qc = useQueryClient()
  return useMutation<void, Error, { id?: string; name: string }>({
    mutationFn: async (c) => {
      const row = { ...(c.id ? { id: c.id } : {}), name: c.name }
      const { error } = await supabase.from('categories').upsert(row)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })
}

export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await supabase.from('categories').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })
}
