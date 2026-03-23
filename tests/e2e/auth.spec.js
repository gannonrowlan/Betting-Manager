const { test, expect } = require('@playwright/test');

function uniqueEmail(prefix = 'user') {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
  return `${prefix}.${stamp}@bankrolliq.local`;
}

async function logout(page) {
  await page.getByLabel('Account menu').click();
  await page.locator('form[action="/auth/logout"] button').click();
}

test.describe('Auth Flows', () => {
  test('register validates inputs, logs in, and logs out cleanly', async ({ page }) => {
    const email = uniqueEmail('register');

    await page.goto('/auth/register');
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();

    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.getByText('Enter your name.')).toBeVisible();
    await expect(page.getByText('Enter your email address.')).toBeVisible();
    await expect(page.getByText('Create a password.')).toBeVisible();
    await expect(page.getByText('Confirm your password.')).toBeVisible();

    await page.locator('input[name="name"]').fill('Register Tester');
    await page.locator('input[name="email"]').fill(email);
    await page.locator('#register-password').fill('registertester2026');
    await page.locator('#register-password').blur();
    await expect(page.getByText('Password cannot include your name or email.')).toBeVisible();

    await page.locator('#register-password').fill('vault-ladder-2026');
    await page.locator('#register-confirm-password').fill('mismatch-value');
    await page.locator('#register-confirm-password').blur();
    await expect(page.getByText('Passwords do not match.')).toBeVisible();

    await page.locator('#register-confirm-password').fill('vault-ladder-2026');
    await page.getByRole('button', { name: 'Show password' }).first().click();
    await expect(page.locator('#register-password')).toHaveAttribute('type', 'text');

    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText('Account created successfully.')).toBeVisible();

    await logout(page);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('header').getByRole('link', { name: 'Get Started' })).toBeVisible();
    await expect(page.locator('header').getByRole('link', { name: 'Login' })).toBeVisible();
  });

  test('login rejects invalid credentials, accepts valid ones, and logs out', async ({ page }) => {
    const email = uniqueEmail('login');
    const password = 'vault-ladder-2026';

    await page.goto('/auth/register');
    await page.locator('input[name="name"]').fill('Login Tester');
    await page.locator('input[name="email"]').fill(email);
    await page.locator('#register-password').fill(password);
    await page.locator('#register-confirm-password').fill(password);
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await logout(page);
    await expect(page).toHaveURL(/\/$/);

    await page.goto('/auth/login');
    await page.locator('input[name="email"]').fill(email);
    await page.locator('#login-password').fill('wrong-password-2026');
    await page.getByRole('button', { name: 'Log In' }).click();
    await expect(page).toHaveURL(/\/auth\/login$/);
    await expect(page.getByText('Invalid credentials.')).toBeVisible();

    await page.locator('input[name="email"]').fill(email);
    await page.locator('#login-password').fill(password);
    await page.getByRole('button', { name: 'Log In' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText('Welcome back!')).toBeVisible();

    await logout(page);
    await expect(page).toHaveURL(/\/$/);
  });

  test('forgot/reset password shows local reset link and accepts the new password', async ({ page }) => {
    const email = uniqueEmail('reset');
    const originalPassword = 'vault-ladder-2026';
    const nextPassword = 'anchor-harbor-2027';

    await page.goto('/auth/register');
    await page.locator('input[name="name"]').fill('Reset Tester');
    await page.locator('input[name="email"]').fill(email);
    await page.locator('#register-password').fill(originalPassword);
    await page.locator('#register-confirm-password').fill(originalPassword);
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await logout(page);
    await page.goto('/auth/forgot-password');
    await page.locator('input[name="email"]').fill(email);
    await page.getByRole('button', { name: 'Send Reset Link' }).click();

    const devResetLink = page.getByRole('link', { name: /reset-password\?token=/ });
    await expect(devResetLink).toBeVisible();

    await devResetLink.click();
    await expect(page).toHaveURL(/\/auth\/reset-password\?token=/);
    await page.locator('#reset-password').fill(nextPassword);
    await page.locator('#reset-confirm-password').fill(nextPassword);
    await page.getByRole('button', { name: 'Reset Password' }).click();

    await expect(page).toHaveURL(/\/auth\/login$/);
    await expect(page.getByText('Password updated. You can log in with your new password.')).toBeVisible();

    await page.locator('input[name="email"]').fill(email);
    await page.locator('#login-password').fill(nextPassword);
    await page.getByRole('button', { name: 'Log In' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
