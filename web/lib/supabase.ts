// Supabase client — read-only for tool functions (server-side service role).
// Reference: goals/architecture-v2.md §6.1
//
// SERVER-SIDE ONLY. Do NOT import this in client components.
// Service role key bypasses RLS — use only inside API routes.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing Supabase env vars. Check .env.local.');
}

export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
  db: { schema: 'public' }
});

// Demo state helper — all SQL queries should respect this "as of" timestamp.
// In production this would be NOW(). For demo, it's the simulated time.
export function getDemoCurrentTimestamp(): string {
  return process.env.DEMO_INITIAL_TIMESTAMP || '2026-06-08T01:00:00Z';
}

export const DEMO_CUSTOMER_ID = process.env.DEMO_CUSTOMER_ID || 'ahmad_01';
