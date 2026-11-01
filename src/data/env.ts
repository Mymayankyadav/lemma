/// <reference types="vite/client" />

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
export const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** Public application server key, supplied when Web Push is configured. */
export const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
