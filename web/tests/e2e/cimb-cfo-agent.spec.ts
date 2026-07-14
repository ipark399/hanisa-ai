import { test, expect } from '@playwright/test';

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
});
