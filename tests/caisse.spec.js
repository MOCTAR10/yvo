// Caisse : mon argent, réparti par mode, et ce qui s'est passé jour par jour.
const { test, expect } = require('@playwright/test');
const { openApp, clientsToPoint, goto } = require('./helpers');

const parseAmount = s => Number(String(s).replace(/[^\d]/g, ''));

test.describe('Caisse', () => {
  let errors;
  test.beforeEach(async ({ page }) => {
    errors = await openApp(page);
  });
  test.afterEach(() => expect(errors).toEqual([]));

  test('le total et la répartition Espèces / Airtel / Moov sont justes', async ({ page }) => {
    const [a, b] = await clientsToPoint(page);
    await page.evaluate(([a, b]) => {
      const t = todayISO();
      payLines = [];
      addPayment(carteById(a.card), t, 700, '', 'airtel', 'R1');
      addPayment(carteById(b.card), t, 400, '', 'moov', '');
      addPayment(carteById(b.card), t, 100, '', 'especes', '');
      saveDB();
    }, [a, b]);
    await goto(page, 'tresorerie');
    const r = await page.evaluate(() => { const m = cashByMode(); return { sum: m.especes + m.airtel + m.moov, total: cashBalance() }; });
    expect(r.sum).toBe(r.total);
    expect(parseAmount(await page.locator('#caisse-total').textContent())).toBe(r.total);
    await expect(page.locator('.simple-split').first()).toContainText('Airtel');
    await expect(page.locator('#caisse-list')).toContainText(a.nom);
  });

  test('argent reçu aujourd’hui pour un jour passé : il compte dans la caisse d’aujourd’hui', async ({ page }) => {
    const [a] = await clientsToPoint(page);
    const r = await page.evaluate(card => {
      const t = todayISO();
      const avant = { jour: cashTotals(t, t).entrees, total: cashBalance(), hier: cashTotals(addDays(t, -1), addDays(t, -1)).entrees };
      const c = carteById(card);
      // on choisit un jour passé sans paiement (ou le premier jour de la carte)
      const d = addDays(t, -1);
      payLines = [];
      addPayment(c, d, 1500, '', 'especes', '');
      saveDB();
      return { avant, apres: { jour: cashTotals(t, t).entrees, total: cashBalance(), hier: cashTotals(d, d).entrees } };
    }, a.card);
    expect(r.apres.jour).toBe(r.avant.jour + 1500);
    expect(r.apres.total).toBe(r.avant.total + 1500);
    expect(r.apres.hier).toBe(r.avant.hier);
    await goto(page, 'tresorerie');
    expect(parseAmount(await page.locator('#caisse-in').textContent())).toBe(r.apres.jour);
  });

  test('les anciens versements sans date de réception restent sur leur jour', async ({ page }) => {
    const r = await page.evaluate(() => {
      const v = { id: 'v_old', carteId: 'x', clientId: 'y', date: '2026-01-15', montant: 800 };
      const w = { id: 'v_old2', carteId: 'x', clientId: 'y', date: '2026-01-16', montant: 900, historique: [{ montant: 500, at: '2026-01-16', mode: 'moov' }] };
      return { a: versementReceipts(v), b: versementReceipts(w).reduce((s, g) => s + g.montant, 0) };
    });
    expect(r.a).toHaveLength(1);
    expect(r.a[0]).toMatchObject({ date: '2026-01-15', montant: 800 });
    expect(r.b).toBe(900);
  });

  test('une correction garde la caisse juste', async ({ page }) => {
    const r = await page.evaluate(() => {
      const c = dueCards(todayISO())[0];
      const t = todayISO();
      db.versements = db.versements.filter(v => !(v.carteId === c.id && v.date === t));
      const avant = cashBalance();
      payLines = [];
      const v = addPayment(c, t, 5000, '', 'especes', '');
      correctVersementModes(v, 2000, 'especes', new Date().toISOString());
      v.montant = 2000;
      return { diff: cashBalance() - avant, jour: versementReceipts(v).reduce((s, g) => s + g.montant, 0) };
    });
    expect(r).toEqual({ diff: 2000, jour: 2000 });
  });

  test('changer de jour : ‹ recule, › ne dépasse pas aujourd’hui', async ({ page }) => {
    await goto(page, 'tresorerie');
    await expect(page.locator('.simple-day strong')).toHaveText('Aujourd’hui');
    await expect(page.locator('[data-action="caisse-day"][data-delta="1"]')).toBeDisabled();
    await page.click('[data-action="caisse-day"][data-delta="-1"]');
    await expect(page.locator('.simple-day strong')).not.toHaveText('Aujourd’hui');
    await page.click('[data-action="caisse-day"][data-delta="1"]');
    await expect(page.locator('.simple-day strong')).toHaveText('Aujourd’hui');
  });

  test('« Compter mon argent » : juste si le compte est bon', async ({ page }) => {
    const [a] = await clientsToPoint(page);
    await page.evaluate(card => { payLines = []; addPayment(carteById(card), todayISO(), 700, '', 'airtel', ''); saveDB(); }, a.card);
    await goto(page, 'cloture');
    await expect(page.locator('.cloture-lines .muted-line')).toContainText('Airtel / Moov');
    const expected = await page.evaluate(() => cashBalance());
    await page.fill('#cloture-compte', String(expected));
    await expect(page.locator('#cloture-ecart')).toContainText('0');
    await page.click('#form-cloture button[type="submit"]');
    expect(await page.evaluate(() => clotureOf(todayISO()).ecart)).toBe(0);
  });

  test('rendre l’argent : Airtel et Moov sont proposés', async ({ page }) => {
    await page.evaluate(() => openRetraitModal({}));
    const options = await page.locator('select[name="mode"] option').allTextContents();
    expect(options).toEqual(expect.arrayContaining(['Espèces', 'Airtel Money', 'Moov Money']));
  });
});
