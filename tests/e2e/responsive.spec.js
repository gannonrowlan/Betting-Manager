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

test.describe('Responsive Sanity', () => {
  test('landing page mobile nav opens and shows auth actions', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Track every wager with clarity.' })).toBeVisible();
    await expect(page.locator('main').getByRole('link', { name: 'Create Free Account' }).first()).toBeVisible();
    await expect(page.locator('main').getByText('Illustrative demo data')).toBeVisible();

    await page.getByRole('button', { name: 'Toggle navigation' }).click();
    const nav = page.locator('#site-nav');
    await expect(nav.getByRole('link', { name: 'Get Started' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Login' })).toBeVisible();
  });

  test('dashboard mobile nav opens and key actions stay reachable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await registerAndLandOnDashboard(page, {
      name: 'Mobile Tester',
      email: uniqueEmail('mobile'),
      password: 'vault-ladder-2026',
    });

    await expect(page.getByRole('heading', { name: 'Your betting command center.' })).toBeVisible();
    await page.getByRole('button', { name: 'Toggle navigation' }).click();
    const nav = page.locator('#site-nav');
    await expect(nav.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Add Bet' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'History' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Stats' })).toBeVisible();

    await nav.getByRole('link', { name: 'Add Bet' }).click();
    await expect(page).toHaveURL(/\/bets\/new$/);
    await expect(page.getByText('What did you bet?')).toBeVisible();
  });
});
