// Barre latérale (ordinateur) : tout reste accessible, même sur un petit écran.
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test.describe('Barre latérale', () => {
  test.skip(({ isMobile }) => isMobile, 'La barre latérale n’existe que sur ordinateur');

  test('écran bas : le pied reste visible, la liste défile et montre la page ouverte', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 620 });
    const errors = await openApp(page);
    await page.evaluate(() => { location.hash = '#/parametres'; });
    const side = page.locator('.sidebar');
    const box = await side.boundingBox();
    expect(box.height).toBeLessThanOrEqual(620);
    await expect(page.locator('.sidebar .lock-link')).toBeInViewport();
    await expect(page.locator('.nav-link.active[data-nav="parametres"]')).toBeInViewport();
    await page.locator('.nav-link[data-nav="corbeille"]').click();
    await expect(page).toHaveURL(/#\/corbeille/);
    expect(errors).toEqual([]);
  });

  test('la caisse n’apparaît qu’une fois, avec son montant', async ({ page }) => {
    const errors = await openApp(page);
    await expect(page.locator('.sidebar a[href="#/tresorerie"]')).toHaveCount(1);
    const montant = await page.evaluate(() => money(cashBalance()));
    await expect(page.locator('#nav-caisse')).toHaveText(montant);
    await expect(page.locator('#side-version')).toContainText(await page.evaluate(() => APP_VERSION));
    expect(errors).toEqual([]);
  });

  test('la barre reste en place quand la page défile, et la molette sur la barre fait défiler la page', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const errors = await openApp(page);
    await page.evaluate(() => { location.hash = '#/clients'; });
    await expect(page.locator('.crow').first()).toBeVisible();
    await page.mouse.move(120, 300);
    await page.mouse.wheel(0, 400);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const box = await page.locator('.sidebar').boundingBox();
    expect(box.y).toBe(0);
    expect(box.height).toBe(800);
    expect(errors).toEqual([]);
  });
});

