// Accès réservé à Yvo : écran de connexion premium.
// Le mot de passe n'est jamais écrit dans le dépôt : il vient du secret GitHub YVO_PASSWORD.
const { test, expect } = require('@playwright/test');
const { trackErrors } = require('./helpers');

const PASSWORD = process.env.YVO_PASSWORD;

test.describe('Connexion', () => {
  test.beforeAll(() => {
    if (!PASSWORD) throw new Error('Variable YVO_PASSWORD absente : ajoutez le secret GitHub « YVO_PASSWORD » (ou exportez-la en local).');
  });

  test('l’écran de connexion s’affiche avant toute donnée', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/');
    await expect(page.locator('.login-card')).toBeVisible();
    await expect(page.locator('.login-hello')).toContainText('Yvo');
    await expect(page.locator('#welcome')).toBeHidden();
    await expect(page.locator('#app')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('le mot de passe n’est pas en clair dans le code', async ({ request }) => {
    for (const f of ['/js/core.js', '/js/app.js', '/index.html']) {
      const body = await (await request.get(f)).text();
      expect(body).not.toContain(PASSWORD);
    }
  });

  test('mauvais mot de passe : refusé', async ({ page }) => {
    await page.goto('/');
    await page.fill('#unlock-pin', 'pas-le-bon');
    await page.click('.login-btn');
    await expect(page.locator('#lock-error')).toHaveText('Mot de passe incorrect.');
    await expect(page.locator('#unlock-pin')).toHaveValue('');
    await expect(page.locator('#welcome')).toBeHidden();
  });

  test('bon mot de passe : accès à l’espace, puis la session tient au rechargement', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/');
    await page.fill('#unlock-pin', PASSWORD);
    await page.keyboard.press('Enter');
    await expect(page.locator('#welcome')).toBeVisible();
    await page.click('[data-action="welcome-demo"]');
    await expect(page.locator('#app')).toBeVisible();
    await page.reload();
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#lock-screen')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('le bouton œil affiche le mot de passe', async ({ page }) => {
    await page.goto('/');
    await page.fill('#unlock-pin', 'abc');
    await page.click('.login-eye');
    await expect(page.locator('#unlock-pin')).toHaveAttribute('type', 'text');
    await page.click('.login-eye');
    await expect(page.locator('#unlock-pin')).toHaveAttribute('type', 'password');
  });

  test('« Verrouiller » ramène à l’écran de connexion', async ({ page }) => {
    await page.goto('/');
    await page.fill('#unlock-pin', PASSWORD);
    await page.click('.login-btn');
    await page.click('[data-action="welcome-demo"]');
    await expect(page.locator('#app')).toBeVisible();
    await page.evaluate(() => { location.hash = '#/parametres'; });
    await expect(page.getByRole('heading', { name: 'Accès réservé à Yvo' })).toBeVisible();
    await page.locator('.setting-card [data-action="lock-now"]').click();
    await expect(page.locator('.login-card')).toBeVisible();
    await expect(page.locator('#app')).toBeHidden();
    await page.reload();
    await expect(page.locator('.login-card')).toBeVisible();
    await page.fill('#unlock-pin', PASSWORD);
    await page.click('.login-btn');
    await expect(page.locator('#app')).toBeVisible();
  });

  test('une nouvelle session redemande le mot de passe', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/');
    await page.fill('#unlock-pin', PASSWORD);
    await page.click('.login-btn');
    await page.click('[data-action="welcome-demo"]');
    await expect(page.locator('#app')).toBeVisible();
    const page2 = await ctx.newPage(); // nouvel onglet = nouvelle session
    await page2.goto('/');
    await expect(page2.locator('.login-card')).toBeVisible();
    await ctx.close();
  });

  test('5 erreurs : attente de 30 s, même avec le bon mot de passe', async ({ page }) => {
    await page.goto('/');
    for (let i = 0; i < 5; i += 1) {
      await page.fill('#unlock-pin', 'faux-' + i);
      await page.click('.login-btn');
      await expect(page.locator('#unlock-pin')).toHaveValue('');
    }
    await page.fill('#unlock-pin', PASSWORD);
    await page.click('.login-btn');
    await expect(page.locator('#lock-error')).toContainText('Patientez');
    await expect(page.locator('.login-card')).toBeVisible();
  });
});
