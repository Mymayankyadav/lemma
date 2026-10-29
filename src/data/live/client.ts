import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { LemmaError } from '../api'
import { supabasePublishableKey, supabaseUrl } from '../env'

let instance: SupabaseClient | undefined

/** Use the owner's browser session and publishable key. Never use the service key in a browser. */
export function liveClient(): SupabaseClient {
  if (instance) return instance
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new LemmaError('server', 'Lemma Supabase configuration is missing')
  }
  instance = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      flowType: 'pkce',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  })
  return instance
}
