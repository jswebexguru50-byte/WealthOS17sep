import { test, expect } from '@playwright/test';

test('application health endpoint and shell are reachable', async ({ request, page }) => {
  let health = await request.get('/api/health');
  const deadline = Date.now() + 120_000;
  while (!health.ok() && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    health = await request.get('/api/health');
  }
  expect(health.ok()).toBe(true);
  const body = await health.json();
  expect(body.process || body.status || body.ok).toBeTruthy();

  await page.goto('/');
  await expect(page).toHaveTitle(/WealthOS|Portfolio/i);
});
