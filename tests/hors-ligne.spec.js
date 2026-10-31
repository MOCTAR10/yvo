// L'application doit s'ouvrir et fonctionner sans réseau (service worker).
const { test, expect } = require('@playwright/test');

// L'installation du service worker (mise en cache) peut être lente sur une machine chargée.
test.describe.configure({ timeout: 60000 });

test('l’app s’ouvre hors ligne et garde les données', async ({ page, context }) => {
  await page.addInitScript(() => sessionStorage.setItem('yvo-acces', '1'));
  await page.goto('/');
  await page.click('[data-action="welcome-demo"]');
  await expect(page.locator('#app')).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // la page est maintenant contrôlée par le service worker
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const clients = await page.evaluate(() => db.clients.length);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#app')).toBeVisible();
  expect(await page.evaluate(() => db.clients.length)).toBe(clients);
  await page.evaluate(() => { location.hash = '#/pointage'; });
  await expect(page.locator('.pointage-page')).toBeVisible();
  await context.setOffline(false);
});

test('hors ligne, l’écran de connexion est toujours là', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.login-card')).toBeVisible();
  await context.setOffline(false);
});
