// Supabase client — read-only for tool functions (server-side service role).
// Reference: goals/architecture-v2.md §6.1
//
// SERVER-SIDE ONLY. Do NOT import this in client components.
// Service role key bypasses RLS — use only inside API routes.

import { createClient } from '@supabase/supabase-js';
import { AsyncLocalStorage } from 'async_hooks';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing Supabase env vars. Check .env.local.');
}

export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
  db: { schema: 'public' }
});

// Per-request "as of" override (ws-160). API routes wrap their handler in
// runWithDemoAsOf(iso, fn) when the active demo step has an asOfIso — tools
// then see that timestamp instead of the static env default. Fixes Act 2
// (Fri 26 Jun) reading Act 1 (Mon 8 Jun) snapshots.
const asOfStore = new AsyncLocalStorage<string>();

export function runWithDemoAsOf<T>(asOfIso: string | undefined, fn: () => Promise<T>): Promise<T> {
  if (!asOfIso) return fn();
  return asOfStore.run(asOfIso, fn);
}

// Demo state helper — all SQL queries should respect this "as of" timestamp.
// Priority: per-request store (set by runWithDemoAsOf) > env var > Act 1 default.
export function getDemoCurrentTimestamp(): string {
  return asOfStore.getStore() ?? process.env.DEMO_INITIAL_TIMESTAMP ?? '2026-07-13T01:00:00Z';
}

export const DEMO_CUSTOMER_ID = process.env.DEMO_CUSTOMER_ID || 'ahmad_01';
