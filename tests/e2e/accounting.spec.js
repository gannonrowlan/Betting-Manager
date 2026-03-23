const { test, expect } = require('@playwright/test');

function uniqueEmail(prefix = 'user') {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
  return `${prefix}.${stamp}@bankrolliq.local`;
}

async function registerAndLandOnDashboard(page, { name, email, password }) {
  await page.goto('/auth/register');
  await page.locator('input[name="name"]').fill(name);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('#register-password').fill(password);
  await page.locator('#register-confirm-password').fill(password);
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe('Bankroll Flows', () => {
  test('bankroll settings and adjustments save, render, and delete correctly', async ({ page }) => {
    await registerAndLandOnDashboard(page, {
      name: 'Bankroll Tester',
      email: uniqueEmail('bankroll'),
      password: 'vault-ladder-2026',
    });

    await page.goto('/settings/bankroll');
    await expect(page.getByRole('heading', { name: 'Keep the bankroll page focused on the numbers that matter.' })).toBeVisible();

    await page.locator('input[name="startingBankroll"]').fill('750');
    await page.locator('input[name="unitSize"]').fill('15');
    await page.getByRole('button', { name: 'Save Bankroll Settings' }).click();
    await expect(page.getByText('Bankroll settings updated.')).toBeVisible();
    await expect(page.locator('.bankroll-signal-card').filter({ hasText: 'Starting bankroll' }).locator('strong')).toHaveText('$750.00');
    await expect(page.locator('.bankroll-signal-card').filter({ hasText: 'Unit size' }).locator('strong')).toHaveText('$15.00');

    await page.locator('select[name="transactionType"]').selectOption('deposit');
    await page.locator('input[name="amount"]').fill('125.50');
    await page.locator('input[name="transactionDate"]').fill('2026-03-22');
    await page.locator('input[name="notes"]').fill('Weekend reload');
    await page.getByRole('button', { name: 'Save Adjustment' }).click();

    await expect(page.getByText('Bankroll adjustment saved.')).toBeVisible();
    await expect(page.locator('.bankroll-log-table')).toContainText('Weekend reload');
    await expect(page.locator('.bankroll-log-table')).toContainText('+$125.50');

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Bankroll adjustment removed.')).toBeVisible();
    await expect(page.getByText('No deposits or withdrawals yet. When you add one, it will appear here.')).toBeVisible();
  });
});
