const fs = require('fs/promises');
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

test.describe('Bet Flows', () => {
  test('add bet saves a straight wager and shows it in history', async ({ page }) => {
    await registerAndLandOnDashboard(page, {
      name: 'Bet Tester',
      email: uniqueEmail('addbet'),
      password: 'vault-ladder-2026',
    });

    await page.goto('/bets/new');
    await expect(page.getByText('What did you bet?')).toBeVisible();

    await page.locator('input[name="sport"]').fill('NBA');
    await page.locator('input[name="sportsbook"]').fill('FanDuel');
    await page.locator('select[name="betTypeChoice"]').selectOption('Spread');
    await page.locator('input[name="market"]').fill('Lakers -4.5');
    await page.locator('input[name="odds"]').fill('-110');
    await page.locator('input[name="stake"]').fill('22');
    await page.locator('select[name="result"]').selectOption('win');
    await expect(page.locator('[data-preview-win]')).toHaveText('$20.00');
    await expect(page.locator('[data-preview-graded]')).toHaveText('$20.00');

    await page.getByRole('button', { name: 'Save Bet' }).click();
    await expect(page).toHaveURL(/\/bets\/history$/);
    await expect(page.getByText('Bet added.')).toBeVisible();
    await expect(page.locator('.history-market-cell div', { hasText: 'Lakers -4.5' })).toBeVisible();
    await expect(page.getByText('+$20.00')).toBeVisible();
  });

  test('csv import previews rows and imports them into history', async ({ page }) => {
    await registerAndLandOnDashboard(page, {
      name: 'Import Tester',
      email: uniqueEmail('import'),
      password: 'vault-ladder-2026',
    });

    await page.goto('/bets/import');
    await expect(page.getByRole('heading', { name: 'Bring spreadsheet bets into Bankroll IQ.' })).toBeVisible();

    const csvText = [
      'Bet Date,Sport,Sportsbook,Bet Type,Market,Odds,Stake,Result,Notes',
      '2026-03-22,NBA,FanDuel,Spread,Lakers -4.5,-110,22,win,Late edge',
      '2026-03-23,NHL,bet365,Moneyline,Rangers,135,16,loss,Dog miss',
    ].join('\n');

    await page.locator('textarea[name="csvText"]').fill(csvText);
    await expect(page.getByText('2 rows ready to review before import.')).toBeVisible();
    await expect(page.getByText('All required columns detected.')).toBeVisible();
    await expect(page.getByText('Lakers -4.5')).toBeVisible();
    await expect(page.getByText('Rangers')).toBeVisible();

    await page.getByRole('button', { name: 'Import Bets' }).click();
    await expect(page).toHaveURL(/\/bets\/history$/);
    await expect(page.getByText('2 bets imported successfully.')).toBeVisible();
    await expect(page.locator('.history-market-cell div', { hasText: 'Lakers -4.5' })).toBeVisible();
    await expect(page.locator('.history-market-cell div', { hasText: 'Rangers' })).toBeVisible();
  });

  test('editing a bet updates history and dashboard reporting', async ({ page }) => {
    await registerAndLandOnDashboard(page, {
      name: 'Edit Tester',
      email: uniqueEmail('editbet'),
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

    await page.locator('.history-market-cell div', { hasText: 'Lakers -4.5' }).click();
    await expect(page).toHaveURL(/\/bets\/\d+\/edit$/);
    await expect(page.getByRole('heading', { name: 'Update your saved bet' })).toBeVisible();

    await page.locator('input[name="market"]').fill('Lakers -3.5');
    await page.locator('select[name="result"]').selectOption('loss');
    await page.getByRole('button', { name: 'Update Bet' }).click();
    await expect(page).toHaveURL(/\/bets\/history$/);
    await expect(page.getByText('Bet updated.')).toBeVisible();
    await expect(page.locator('.history-market-cell div', { hasText: 'Lakers -3.5' })).toBeVisible();
    await expect(page.getByText('-$22.00')).toBeVisible();

    await page.goto('/dashboard');
    await expect(page.locator('.dashboard-essential-card-primary strong')).toHaveText('$-22.00');
    await expect(page.locator('.dashboard-essential-card').filter({ hasText: 'Record' }).locator('strong')).toHaveText('0-1-0');
  });

  test('single delete, bulk delete, and csv export work from history', async ({ page }) => {
    await registerAndLandOnDashboard(page, {
      name: 'Delete Tester',
      email: uniqueEmail('deletebet'),
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
      betDate: '2026-03-23',
    });

    await addStraightBet(page, {
      sport: 'MLB',
      sportsbook: 'DraftKings',
      betType: 'Total',
      market: 'Dodgers Over 8.5',
      odds: -105,
      stake: 18,
      result: 'win',
      betDate: '2026-03-24',
    });

    await page.locator('.history-market-cell div', { hasText: 'Lakers -4.5' }).click();
    await expect(page).toHaveURL(/\/bets\/\d+\/edit$/);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete Bet' }).click();
    await expect(page).toHaveURL(/\/bets\/history$/);
    await expect(page.getByText('Bet deleted.')).toBeVisible();
    await expect(page.locator('.history-market-cell div', { hasText: 'Lakers -4.5' })).toHaveCount(0);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: 'Export CSV' }).click(),
    ]);

    expect(download.suggestedFilename()).toBe('bet-history-export.csv');
    const filePath = await download.path();
    const csvText = await fs.readFile(filePath, 'utf8');
    expect(csvText).toContain('Bet Date,Sport,Sportsbook,Bet Type,Leg Count,Market,Odds,Stake,Result,Profit/Loss,Notes,Created At');
    expect(csvText).toContain('Rangers');
    expect(csvText).toContain('Dodgers Over 8.5');
    expect(csvText).not.toContain('Lakers -4.5');

    await page.getByRole('button', { name: 'Delete Bets' }).click();
    await page.locator('input[data-history-checkbox]').nth(0).check();
    await page.locator('input[data-history-checkbox]').nth(1).check();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete Selected' }).click();
    await expect(page.getByText('2 bets deleted.')).toBeVisible();
    await expect(page.getByText('No bets match this filter set yet. Reset the filters or log a new wager.')).toBeVisible();
  });
});
