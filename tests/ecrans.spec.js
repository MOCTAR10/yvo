// Chaque écran s'affiche sans erreur, avec la démo et avec une application vide.
const { test, expect } = require('@playwright/test');
const { openApp, goto } = require('./helpers');

const ROUTES = ['tableau', 'pointage', 'clients', 'tresorerie', 'plus', 'activite', 'risques', 'cloture',
  'recus', 'commission', 'sync', 'alertes', 'multi', 'corbeille', 'parametres'];

for (const demo of [true, false]) {
  test(`tous les écrans s’affichent (${demo ? 'démo' : 'app vide'})`, async ({ page }) => {
    const errors = await openApp(page, { demo });
    for (const r of ROUTES) {
      await goto(page, r);
      await expect(page.locator('#view .page, #view > *').first(), 'écran ' + r).toBeVisible();
      const crashed = await page.locator('#view .empty h3', { hasText: /erreur/i }).count();
      expect(crashed, 'écran ' + r + ' en erreur').toBe(0);
    }
    expect(errors).toEqual([]);
  });
}

test('fiche client et nouveau client', async ({ page }) => {
  const errors = await openApp(page);
  const id = await page.evaluate(() => db.clients[0].id);
  await goto(page, 'client/' + id);
  await expect(page.locator('#view')).toContainText(await page.evaluate(() => db.clients[0].nom));

  await page.evaluate(() => openClientModal(null));
  await page.fill('.modal input[name="nom"]', 'Client Test Régression');
  await page.fill('.modal input[name="telephone"]', '074000000');
  await page.fill('.modal input[name="quartier"]', 'Akanda');
  await page.locator('.modal [type="submit"]').first().click();
  expect(await page.evaluate(() => db.clients.some(c => c.nom === 'Client Test Régression'))).toBe(true);
  expect(errors).toEqual([]);
});

test('les données survivent au rechargement (stockage local)', async ({ page }) => {
  await openApp(page);
  const before = await page.evaluate(() => ({ clients: db.clients.length, versements: db.versements.length }));
  await page.reload();
  await expect(page.locator('#app')).toBeVisible();
  const after = await page.evaluate(() => ({ clients: db.clients.length, versements: db.versements.length }));
  expect(after).toEqual(before);
});

test('les logos Airtel et Moov sont servis', async ({ request }) => {
  for (const f of ['/img/airtel-money.png', '/img/moov-money.png']) {
    const r = await request.get(f);
    expect(r.status()).toBe(200);
    expect(r.headers()['content-type']).toBe('image/png');
  }
});
