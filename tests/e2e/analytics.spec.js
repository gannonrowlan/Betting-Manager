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

async function addStraightBet(page, { sport, sportsbook, betType, market, odds, stake, result, betDate }) {
  await page.goto('/bets/new');
  await page.locator('input[name="sport"]').fill(sport);
  await page.locator('input[name="sportsbook"]').fill(sportsbook);
  await page.locator('select[name="betTypeChoice"]').selectOption(betType);
  await page.locator('input[name="market"]').fill(market);
  await page.locator('input[name="odds"]').fill(String(odds));
  await page.locator('input[name="stake"]').fill(String(stake));
  await page.locator('select[name="result"]').selectOption(result);
  await page.locator('input[name="betDate"]').fill(betDate);
  await page.getByRole('button', { name: 'Save Bet' }).click();
  await expect(page).toHaveURL(/\/bets\/history$/);
}

test.describe('History And Stats Flows', () => {
  test('history filters and stats window filters respond to the selected range', async ({ page }) => {
    await registerAndLandOnDashboard(page, {
      name: 'Analytics Tester',
      email: uniqueEmail('analytics'),
      password: 'vault-ladder-2026',
    });

    await addStraightBet(page, {
      sport: 'NBA',
      sportsbook: 'FanDuel',
      betType: 'Spread',
      market: 'Lakers -4.5',
      odds: -110,
      stake: 22,
      result: 'win',
      betDate: '2026-03-22',
    });

    await addStraightBet(page, {
      sport: 'NHL',
      sportsbook: 'bet365',
      betType: 'Moneyline',
      market: 'Rangers',
      odds: 135,
      stake: 16,
      result: 'loss',
      betDate: '2026-03-10',
    });

    await page.goto('/bets/history?filtersOpen=1');
    await page.locator('select[name="sport"]').selectOption('NBA');
    await page.locator('select[name="result"]').selectOption('win');
    await page.getByRole('button', { name: 'Apply Filters' }).click();

    await expect(page.locator('.history-market-cell div', { hasText: 'Lakers -4.5' })).toBeVisible();
    await expect(page.locator('.history-market-cell div', { hasText: 'Rangers' })).toHaveCount(0);
    await expect(page.getByText('Filtered view active')).toBeVisible();

    await page.goto('/stats?filtersOpen=1');
    await page.locator('select[name="range"]').selectOption('custom');
    await page.locator('input[name="startDate"]').fill('2026-03-16');
    await page.locator('input[name="endDate"]').fill('2026-03-22');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.locator('.stats-filter-summary small')).toHaveText('2026-03-16 to 2026-03-22');
    await expect(page.locator('.stat-card.stat-card-featured p')).toHaveText('$20.00');

    await page.locator('select[name="range"]').selectOption('all');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.locator('.stats-filter-summary small')).toHaveText('All-time performance');
    await expect(page.locator('.stat-card.stat-card-featured p')).toHaveText('$4.00');
  });
});
