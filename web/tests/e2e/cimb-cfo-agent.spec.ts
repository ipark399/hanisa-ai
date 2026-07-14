import { test, expect } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// AC-17 uses service-role read to COUNT pending_rm_review rows in 3 tables.
// .env.local is loaded via playwright.config.ts (dotenv).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getSupabase(): SupabaseClient {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } });
}

async function countPendingRmReview(supabase: SupabaseClient, table: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending_rm_review');
  if (error) throw new Error(`COUNT failed on ${table}: ${error.message}`);
  return count ?? 0;
}

test.describe('CIMB CFO Agent — REQ-CIMB-03 verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/CIMB CFO Agent/);
  });

  test('Intro screen shows Sun 12 Jul 22:00 (shifted +35d)', async ({ page }) => {
    const scenarioLabel = page.locator('text=Sun 12 Jul · 22:00').first();
    await expect(scenarioLabel).toBeVisible();
  });

  test('Jump dropdown lists all steps with shifted timestamps', async ({ page }) => {
    const combo = page.getByRole('combobox', { name: /Jump to step/i });
    await expect(combo).toContainText('Mon 13 Jul · 09:00');
    await expect(combo).toContainText('Mon 13 Jul · 10:30');
    await expect(combo).toContainText('Mon 13 Jul · 10:33');
    await expect(combo).toContainText('Fri 31 Jul · 15:00');
    await expect(combo).toContainText('Fri 31 Jul · 15:03');
  });

  test('Act 1 completes: Bloomberg context + Lock → RM 접수 게이트', async ({ page }) => {
    await page.getByRole('button', { name: 'Act 1 — FX Hero' }).click();
    await expect(page.locator('header, [role="banner"]').first()).toContainText('Mon 13 Jul · 09:00');
    await page.getByRole('button', { name: 'Next ▶' }).click();

    // Step 2: FX Trigger + Bloomberg market context
    await expect(page.getByText(/Market context/i)).toBeVisible();
    await expect(page.getByText(/ECB dovish remarks \(Bloomberg\)/)).toBeVisible();
    await expect(page.getByText(/top 15% of the 90-day range/i)).toBeVisible();

    // Assert 예측 어휘 부재 (판단 보조 원칙) — Phone body만 검증
    // Right Panel의 tool 이름(infer_forecasted_payments 등)은 pre-existing, 범위 외
    const phoneBubble = page.locator('div').filter({ hasText: /From CIMB CFO Agent · INTEL/i }).nth(1);
    const bloombergMessage = await phoneBubble.innerText();
    const forbidden = [/\bforecast\b/i, /probability/i, /will rise/i, /will fall/i, /next week/i, /predict/i];
    for (const rx of forbidden) {
      expect(bloombergMessage).not.toMatch(rx);
    }

    // Step 4: Lock now → 접수 완료 메시지
    await page.getByRole('button', { name: 'Lock now' }).click();
    await expect(page.getByText(/Request received/)).toBeVisible();
    await expect(page.getByText('REQ-FXFW-2026-7142').first()).toBeVisible();
    await expect(page.getByText(/Your RM will contact you within 24 hours/)).toBeVisible();
    await expect(page.getByText('MYR 1,064')).toBeVisible();

    await page.screenshot({ path: 'test-results/act1-step4-rm-received.png', fullPage: true });
  });

  test('Act 2 completes: FlexiCash Apply → RM 접수 게이트', async ({ page }) => {
    await page.getByRole('button', { name: 'Act 2 — FlexiCash + Learning' }).click();
    await expect(page.locator('header, [role="banner"]').first()).toContainText('Fri 31 Jul · 15:00');

    // Step 5: FlexiCash Trigger 표시 확인
    await expect(page.getByText(/pre-approved/i).first()).toBeVisible();
    await expect(page.getByText('FlexiCash line of MYR 65K')).toBeVisible();

    // Apply → 접수 완료 메시지
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.getByText(/Request received/)).toBeVisible();
    await expect(page.getByText('REQ-FLX-2026-2284').first()).toBeVisible();
    await expect(page.getByText(/Your RM will contact you within 24 hours/)).toBeVisible();
    await expect(page.getByText('MYR 65,000').first()).toBeVisible();
    await expect(page.getByText('8.5% p.a.').first()).toBeVisible();

    await page.screenshot({ path: 'test-results/act2-step7-rm-received.png', fullPage: true });
  });

  test('Sankey trace at Step 2 includes bloomberg_market_snapshots node', async ({ page }) => {
    await page.getByRole('button', { name: 'Act 1 — FX Hero' }).click();
    await page.getByRole('button', { name: 'Next ▶' }).click();
    // Sankey diagram shows READ bloomberg_market... node
    await expect(page.getByText(/bloomberg_market/i).first()).toBeVisible();
  });

  test('Reset Act restarts current Act from Step 1 and preserves the other Act state', async ({ page }) => {
    // Enter Act 1 → header shows Step 1 (09:00)
    await page.getByRole('button', { name: 'Act 1 — FX Hero' }).click();
    const header = page.locator('header, [role="banner"]').first();
    await expect(header).toContainText('Mon 13 Jul · 09:00');

    // Reset Act should be enabled inside an Act
    const resetAct = page.getByRole('button', { name: /Reset Act/i });
    await expect(resetAct).toBeEnabled();

    // Advance to Step 2 (10:30 — FX Trigger + Bloomberg)
    await page.getByRole('button', { name: 'Next ▶' }).click();
    await expect(header).toContainText('Mon 13 Jul · 10:30');

    // Click Reset Act → back to Step 1
    await resetAct.click();
    await expect(header).toContainText('Mon 13 Jul · 09:00');

    // Switch to Act 2 → header jumps to Fri 31 Jul · 15:00 (other Act preserved / fresh)
    await page.getByRole('button', { name: 'Act 2 — FlexiCash + Learning' }).click();
    await expect(header).toContainText('Fri 31 Jul · 15:00');

    // Reset Act disabled in Free QA mode (Free QA is not an Act)
    // exact:true because Reset All aria-label contains "Free QA"
    await page.getByRole('button', { name: 'Free QA', exact: true }).click();
    await expect(resetAct).toBeDisabled();
  });

  test('Reset All clears state and returns to intro screen', async ({ page }) => {
    // Enter Act 2 → advance to Step 2 (15:01)
    await page.getByRole('button', { name: 'Act 2 — FlexiCash + Learning' }).click();
    const header = page.locator('header, [role="banner"]').first();
    await expect(header).toContainText('Fri 31 Jul · 15:00');
    await page.getByRole('button', { name: 'Next ▶' }).click();
    await expect(header).toContainText('Fri 31 Jul · 15:01');

    // Click Reset All → intro screen (Sun 12 Jul · 22:00)
    await page.getByRole('button', { name: /Reset all scenarios/i }).click();
    await expect(page.locator('text=Sun 12 Jul · 22:00').first()).toBeVisible();

    // Reset Act should now be disabled (mode = intro)
    await expect(page.getByRole('button', { name: /Reset Act/i })).toBeDisabled();

    // Re-enter Act 1 → fresh Step 1 (proves state was truly cleared)
    await page.getByRole('button', { name: 'Act 1 — FX Hero' }).click();
    await expect(header).toContainText('Mon 13 Jul · 09:00');
  });

  test('AC-17 Reset DB clears pending_rm_review rows in 3 tables (Supabase COUNT)', async ({ page }) => {
    const supabase = getSupabase();
    const TABLES = ['bank_scheduled_payments', 'bank_products_held', 'bank_credit_limits'] as const;

    // 1. Create a pending_rm_review row via Act 1 Lock now
    await page.getByRole('button', { name: 'Act 1 — FX Hero' }).click();
    await page.getByRole('button', { name: 'Next ▶' }).click();
    await page.getByRole('button', { name: 'Lock now' }).click();
    await expect(page.getByText(/Request received/)).toBeVisible();
    await expect(page.getByText(/REQ-FXFW-2026-7142/).first()).toBeVisible();

    // 2. Verify row exists (COUNT > 0 in bank_scheduled_payments)
    const beforeCount = await countPendingRmReview(supabase, 'bank_scheduled_payments');
    expect(beforeCount).toBeGreaterThan(0);

    // 3. Click Reset DB and capture API response
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('/api/reset-demo') && r.request().method() === 'POST'
    );
    await page.getByRole('button', { name: /Reset demo database/i }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.reset).toBe(true);
    expect(body.offer_status_restored).toBe(true);
    expect(body.deleted).toBeDefined();

    // 4. Verify COUNT = 0 in all 3 tables (AC-17)
    for (const table of TABLES) {
      const count = await countPendingRmReview(supabase, table);
      expect(count, `Expected 0 pending_rm_review rows in ${table}`).toBe(0);
    }
  });

  test('Free QA sends a message and receives an LLM response', async ({ page }) => {
    // Enter Free QA mode (open chat, no storyboard steps)
    await page.getByRole('button', { name: 'Free QA', exact: true }).click();

    // Compose and send a simple message
    const composer = page.locator('form.composer input[placeholder="Type a message"]');
    await expect(composer).toBeVisible();
    const prompt = 'Hi, can you briefly say hello?';
    await composer.fill(prompt);

    // Wait for POST /api/chat response after submit
    const chatResponsePromise = page.waitForResponse(
      (r) => r.url().includes('/api/chat') && r.request().method() === 'POST',
      { timeout: 45_000 }
    );
    await composer.press('Enter');
    const response = await chatResponsePromise;
    expect(response.status()).toBe(200);

    // User's message bubble must appear in the phone
    await expect(page.getByText(prompt).first()).toBeVisible();

    // Free QA History footer should show at least one exchange (self bubble = user)
    // (FreeQAHistory renders self+other messages tagged with mode='free')
    const freeQAFooter = page.locator('section.freeqa-footer, [aria-label="Free QA history"]').first();
    await expect(freeQAFooter).toBeVisible();
    await expect(freeQAFooter).toContainText(prompt);
  });
});
