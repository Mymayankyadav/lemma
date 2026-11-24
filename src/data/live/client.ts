import {publishAuth} from '../authBoundary';
import {readDeviceSession} from '../deviceSession'
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
  instance.auth.onAuthStateChange((event, session) => {
    // The SDK can emit this after a transient failure refreshing an expired token.
    // It retains the session in storage and emits SIGNED_OUT for a real logout.
    if (event === 'INITIAL_SESSION' && !session && readDeviceSession()) return
    publishAuth(session?.user ? {id:session.user.id,email:session.user.email} : null)
  })
  return instance
}
