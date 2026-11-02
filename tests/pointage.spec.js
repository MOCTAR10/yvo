// Recevoir l'argent : montant écrit d'avance, mode de paiement (Espèces / Airtel / Moov), reçus.
const { test, expect } = require('@playwright/test');
const { openApp, clientsToPoint, goto } = require('./helpers');

const versementOf = (page, carteId) =>
  page.evaluate(id => JSON.parse(JSON.stringify(versementFor(id, todayISO()))), carteId);
const lastReceipt = page =>
  page.evaluate(() => { const r = db.recus[db.recus.length - 1]; return { ...r, valid: receiptValid(r), text: receiptText(r) }; });

test.describe('Recevoir l’argent', () => {
  let errors;
  test.beforeEach(async ({ page }) => {
    errors = await openApp(page);
    await goto(page, 'clients');
  });
  test.afterEach(() => expect(errors).toEqual([]));

  test('paiement Airtel : le montant est déjà écrit, reçu et texte WhatsApp justes', async ({ page }) => {
    const c = (await clientsToPoint(page)).find(x => x.cards.length === 1);
    await page.evaluate(id => openPaySheet(id, todayISO()), c.id);
    await expect(page.locator('input[name="mode"][value="especes"]')).toBeChecked();
    await expect(page.locator('.mode-ref, input[name="ref"], input[name="note"]')).toHaveCount(0);
    await page.locator('.mode-opt.mode-airtel').click();
    await expect(page.locator('.mode-opt.mode-airtel img.mode-logo')).toBeVisible();
    await page.fill('#pay-' + c.card, '700');
    await page.click('button[form="form-pay"]');
    await expect(page.locator('.paid-ok')).toContainText('Airtel');
    await expect(page.locator('.paid-sheet .modal-foot a.btn, .paid-sheet .modal-foot .simple-big')).toHaveCount(1);

    const v = await versementOf(page, c.card);
    expect(v.montant).toBe(700);
    expect(v.historique.at(-1)).toMatchObject({ montant: 700, mode: 'airtel' });
    const rec = await lastReceipt(page);
    expect(rec).toMatchObject({ mode: 'airtel', total: 700, valid: true });
    expect(rec.text).toContain('Payé par : Airtel Money');
  });

  test('deux paiements le même jour (Moov puis espèces) → répartition « mixte »', async ({ page }) => {
    const [c] = await clientsToPoint(page);
    for (const [mode, amount] of [['moov', '500'], ['especes', '300']]) {
      await page.evaluate(id => openPaySheet(id, todayISO()), c.id);
      await page.locator('.mode-opt.mode-' + mode).click();
      await page.fill('#pay-' + c.card, amount);
      await page.click('button[form="form-pay"]');
      await expect(page.locator('.paid-ok')).toBeVisible();
      await page.evaluate(() => closeModal());
    }
    const modes = await page.evaluate(id => versementModes(versementFor(id, todayISO())), c.card);
    expect(modes).toEqual({ especes: 300, airtel: 0, moov: 500 });
  });

  test('correction d’un jour : le mode est repris et la correction tracée', async ({ page }) => {
    const [c] = await clientsToPoint(page);
    await page.evaluate(id => openPaySheet(id, todayISO()), c.id);
    await page.locator('.mode-opt.mode-airtel').click();
    await page.fill('#pay-' + c.card, '1000');
    await page.click('button[form="form-pay"]');
    await page.evaluate(() => closeModal());
    await page.evaluate(id => openDayModal(id, todayISO()), c.card);
    await expect(page.locator('input[name="mode"]:checked')).toHaveValue('airtel');
    await page.fill('#day-montant', '1500');
    await page.click('button[form="form-day"]');
    const v = await versementOf(page, c.card);
    expect(v.montant).toBe(1500);
    expect(v.historique.at(-1)).toMatchObject({ montant: 500, mode: 'airtel', correction: true });
  });

  test('saisie vide refusée', async ({ page }) => {
    const c = (await clientsToPoint(page)).find(x => x.cards.length === 1);
    await page.evaluate(id => openPaySheet(id, todayISO()), c.id);
    await page.fill('#pay-' + c.card, '');
    await page.click('button[form="form-pay"]');
    await expect(page.locator('.toast').last()).toContainText('Écrivez le montant');
    expect(await versementOf(page, c.card)).toBeNull();
  });
});
