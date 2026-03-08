import { createBrowserClient } from '@supabase/ssr'

// Browser Supabase client singleton.
// Safe to import in "use client" components.
// Never import next/headers or cookies() here.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
