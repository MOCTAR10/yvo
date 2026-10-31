// L'application doit s'ouvrir et fonctionner sans réseau (service worker + copie locale).
const { test, expect } = require('@playwright/test');
const { openApp, PASSWORD, waitOfflineReady } = require('./helpers');

// L'installation du service worker (mise en cache) peut être lente sur une machine chargée.
test.describe.configure({ timeout: 60000 });

test('sans réseau : l’app s’ouvre avec les données et permet de pointer', async ({ page, context }) => {
  await openApp(page);
  await waitOfflineReady(page);
  const clients = await page.evaluate(() => db.clients.length);

  await context.setOffline(true);
  await page.evaluate(() => lockApp());
  await page.reload();
  await page.fill('#unlock-pin', PASSWORD);
  await page.click('.login-btn');
  await expect(page.locator('#app')).toBeVisible();
  expect(await page.evaluate(() => db.clients.length)).toBe(clients);

  await page.evaluate(() => { location.hash = '#/pointage'; });
  await expect(page.locator('.pointage-page')).toBeVisible();
  const paid = await page.evaluate(() => {
    const e = pointageEntries(todayISO()).find(x => !x.touched);
    payLines = [];
    addPayment(e.cards[0], todayISO(), 500, '', 'especes', '');
    saveDB();
    return versementFor(e.cards[0].id, todayISO()).montant;
  });
  expect(paid).toBe(500);
  await context.setOffline(false);
});
