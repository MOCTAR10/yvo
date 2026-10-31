// Caisse : filtre par mode de paiement, totaux, clôture.
const { test, expect } = require('@playwright/test');
const { openApp, clientsToPoint, goto } = require('./helpers');

const parseAmount = s => Number(String(s).replace(/[^\d]/g, ''));

test.describe('Caisse et modes de paiement', () => {
  let errors;
  test.beforeEach(async ({ page }) => {
    errors = await openApp(page);
    const [a, b] = await clientsToPoint(page);
    // un paiement Airtel, un paiement Moov + espèces, sans passer par l'écran
    await page.evaluate(([a, b]) => {
      const t = todayISO();
      payLines = [];
      addPayment(carteById(a.card), t, 700, '', 'airtel', 'R1');
      addPayment(carteById(b.card), t, 400, '', 'moov', '');
      addPayment(carteById(b.card), t, 100, '', 'especes', '');
      saveDB();
      state.treasuryPeriod = 'jour';
    }, [a, b]);
    await goto(page, 'tresorerie');
  });
  test.afterEach(() => expect(errors).toEqual([]));

  test('le filtre par mode donne des totaux cohérents', async ({ page }) => {
    const totals = {};
    for (const m of ['tous', 'especes', 'mobile', 'airtel', 'moov']) {
      await page.selectOption('#treasury-mode', m);
      totals[m] = parseAmount(await page.locator('.journal-foot strong.in').textContent());
    }
    expect(totals.airtel).toBe(700);
    expect(totals.moov).toBe(400);
    expect(totals.mobile).toBe(totals.airtel + totals.moov);
    expect(totals.tous).toBe(totals.especes + totals.mobile);
  });

  test('la répartition par mode affiche les logos et les montants', async ({ page }) => {
    const split = page.locator('.mode-split');
    await expect(split.locator('img[alt="Airtel Money"]')).toBeVisible();
    await expect(split.locator('img[alt="Moov Money"]')).toBeVisible();
    expect(parseAmount(await split.locator('.mode-airtel strong').textContent())).toBe(700);
    expect(parseAmount(await split.locator('.mode-moov strong').textContent())).toBe(400);
  });

  test('un versement mixte n’apparaît que pour sa part dans chaque filtre', async ({ page }) => {
    await page.selectOption('#treasury-mode', 'especes');
    const rows = await page.evaluate(() => movementList()
      .filter(m => m.kind === 'versement' && m.modeKey === 'mixte')
      .map(m => ({ especes: movementAmountForMode(m, 'especes'), moov: movementAmountForMode(m, 'moov'), total: m.montant })));
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach(r => expect(r.especes + r.moov).toBe(r.total));
  });

  test('la clôture indique ce qui a été reçu sur Airtel / Moov', async ({ page }) => {
    await goto(page, 'cloture');
    await expect(page.locator('.cloture-lines .muted-line')).toContainText('Airtel / Moov');
    const expected = await page.evaluate(() => cashBalance());
    await page.fill('#cloture-compte', String(expected));
    await expect(page.locator('#cloture-ecart')).toContainText('0');
    await page.click('#form-cloture button[type="submit"]');
    expect(await page.evaluate(() => clotureOf(todayISO()).ecart)).toBe(0);
  });

  test('retrait : les modes Airtel et Moov sont proposés', async ({ page }) => {
    await page.click('[data-action="new-retrait"]');
    const options = await page.locator('select[name="mode"] option').allTextContents();
    expect(options).toEqual(expect.arrayContaining(['Espèces', 'Airtel Money', 'Moov Money']));
  });
});
