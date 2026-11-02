// Barre latérale (ordinateur) : deux entrées, toujours en place.
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test.describe('Barre latérale', () => {
  test.skip(({ isMobile }) => isMobile, 'La barre latérale n’existe que sur ordinateur');

  test('Clients et Caisse, le bon onglet allumé, et Verrouiller visible', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 620 });
    const errors = await openApp(page);
    await expect(page.locator('.nav-link')).toHaveText(['Clients', 'Caisse']);
    await expect(page.locator('.nav-link.active')).toHaveText('Clients');
    await page.locator('.nav-link[data-nav="tresorerie"]').click();
    await expect(page).toHaveURL(/#\/tresorerie/);
    await expect(page.locator('.nav-link.active')).toHaveText('Caisse');
    await expect(page.locator('.sidebar .lock-link')).toBeInViewport();
    await expect(page.locator('#side-version')).toContainText(await page.evaluate(() => APP_VERSION));
    expect(errors).toEqual([]);
  });

  test('la barre reste en place quand la page défile', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 500 });
    const errors = await openApp(page);
    await expect(page.locator('.crow2').first()).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const box = await page.locator('.sidebar').boundingBox();
    expect(box.y).toBe(0);
    expect(box.height).toBe(500);
    expect(errors).toEqual([]);
  });
});
