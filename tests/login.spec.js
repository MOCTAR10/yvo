// Accès réservé à Yvo : le serveur vérifie le mot de passe ; hors réseau, le téléphone
// se souvient de la dernière connexion réussie. Le mot de passe vient du secret YVO_PASSWORD.
const { test, expect } = require('@playwright/test');
const { PASSWORD, login, trackErrors } = require('./helpers');

/* Chaque test a sa propre adresse IP simulée : les limites d'essais du serveur ne se mélangent pas. */
test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ 'X-Forwarded-For': '10.' + [1, 2, 3].map(() => Math.floor(Math.random() * 250) + 1).join('.') });
});

test('l’écran « Bonjour Yvo » s’affiche avant toute donnée', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.locator('.login-card')).toBeVisible();
  await expect(page.locator('.login-hello')).toContainText('Yvo');
  await expect(page.locator('#welcome')).toBeHidden();
  await expect(page.locator('#app')).toBeHidden();
  expect(errors).toEqual([]);
});

test('ni le mot de passe ni son empreinte ne sont dans le code', async ({ request }) => {
  for (const f of ['/js/core.js', '/js/app.js', '/js/sync.js', '/index.html']) {
    const body = await (await request.get(f)).text();
    expect(body).not.toContain(PASSWORD);
    expect(body).not.toMatch(/ACCESS_HASH/);
  }
});

test('mauvais mot de passe : refusé par le serveur', async ({ page }) => {
  await page.goto('/');
  await page.fill('#unlock-pin', 'pas-le-bon');
  await page.click('.login-btn');
  await expect(page.locator('#lock-error')).toHaveText('Mot de passe incorrect.');
  await expect(page.locator('#unlock-pin')).toHaveValue('');
  await expect(page.locator('#app')).toBeHidden();
});

test('bon mot de passe : l’espace s’ouvre directement, profil de Yvo déjà rempli', async ({ page }) => {
  const errors = trackErrors(page);
  await login(page);
  await expect(page.locator('#welcome')).toBeHidden();
  const profile = await page.evaluate(() => ({ ...db.settings.company, indicatif: db.settings.indicatif, token: !!(syncCfg && syncCfg.token) }));
  expect(profile).toMatchObject({ responsable: 'Yvo', telephone: '077814766', nom: 'YVO Épargne', indicatif: '241', token: true });
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

test('« Verrouiller » ramène à la connexion, même après rechargement', async ({ page }) => {
  await login(page);
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

test('un nouvel onglet redemande le mot de passe', async ({ page, context }) => {
  await login(page);
  const page2 = await context.newPage();
  await page2.goto('/');
  await expect(page2.locator('.login-card')).toBeVisible();
});

test('sans réseau : connexion possible après une première connexion en ligne', async ({ page, context }) => {
  await login(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  const page2 = await context.newPage();
  await page2.goto('/');
  await page2.fill('#unlock-pin', 'pas-le-bon');
  await page2.click('.login-btn');
  await expect(page2.locator('#lock-error')).toHaveText('Mot de passe incorrect.');
  await page2.fill('#unlock-pin', PASSWORD);
  await page2.click('.login-btn');
  await expect(page2.locator('#app')).toBeVisible();
  await context.setOffline(false);
});

test('sans réseau sur un téléphone jamais connecté : message clair', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.fill('#unlock-pin', PASSWORD);
  await page.click('.login-btn');
  await expect(page.locator('#lock-error')).toContainText('il faut Internet');
  await expect(page.locator('#app')).toBeHidden();
  await context.setOffline(false);
});

test('trop d’erreurs : il faut patienter, même avec le bon mot de passe', async ({ page }) => {
  await page.goto('/');
  for (let i = 0; i < 5; i += 1) {
    await page.fill('#unlock-pin', 'faux-' + i);
    await page.click('.login-btn');
    await expect(page.locator('#unlock-pin')).toHaveValue('');
  }
  await page.fill('#unlock-pin', PASSWORD);
  await page.click('.login-btn');
  await expect(page.locator('#lock-error')).toContainText('Patientez');
  await expect(page.locator('#app')).toBeHidden();
});

test('Réglages : profil de Yvo, plus de sauvegarde à gérer', async ({ page }) => {
  await login(page);
  await page.evaluate(() => { location.hash = '#/parametres'; });
  await expect(page.getByRole('heading', { name: 'Mon profil' })).toBeVisible();
  await expect(page.locator('input[name="responsable"]')).toHaveValue('Yvo');
  await expect(page.locator('input[name="telephone"]')).toHaveValue('077814766');
  await expect(page.locator('[data-action="share-backup"], #import-file, [data-action="export-data"]')).toHaveCount(0);
  await page.evaluate(() => { location.hash = '#/plus'; });
  await expect(page.locator('a[href="#/sync"]')).toHaveCount(0);
});
