import { createBrowserClient } from '@supabase/ssr'

// Browser Supabase client singleton.
// Safe to import in "use client" components.
// Never import next/headers or cookies() here.
//
// Fallback values allow the module to load in environments where Supabase is
// not configured (CI, E2E tests without a real project). Auth API calls will
// fail gracefully — components still render; user is null; loading resolves.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlhdCI6MTYwMDAwMDAwMCwiZXhwIjo5OTk5OTk5OTk5fQ.placeholder'
)
