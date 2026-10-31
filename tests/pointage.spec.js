// Pointage : montants libres, mode de paiement (Espèces / Airtel / Moov), reçus.
const { test, expect } = require('@playwright/test');
const { openApp, clientsToPoint, goto } = require('./helpers');

const versementOf = (page, carteId) =>
  page.evaluate(id => JSON.parse(JSON.stringify(versementFor(id, todayISO()))), carteId);
const lastReceipt = page =>
  page.evaluate(() => { const r = db.recus[db.recus.length - 1]; return { ...r, valid: receiptValid(r), text: receiptText(r) }; });

test.describe('Pointage', () => {
  let errors;
  test.beforeEach(async ({ page }) => {
    errors = await openApp(page);
    await goto(page, 'pointage');
  });
  test.afterEach(() => expect(errors).toEqual([]));

  test('paiement Airtel Money avec référence → historique, reçu et texte WhatsApp', async ({ page }) => {
    const [c] = await clientsToPoint(page);
    await page.evaluate(id => openPaySheet(id, todayISO()), c.id);
    await expect(page.locator('.mode-ref')).toBeHidden();
    await expect(page.locator('input[name="mode"][value="especes"]')).toBeChecked();
    await page.locator('.mode-opt.mode-airtel').click();
    await expect(page.locator('.mode-ref')).toBeVisible();
    await expect(page.locator('.mode-opt.mode-airtel img.mode-logo')).toBeVisible();
    await page.fill('#pay-' + c.card, '700');
    await page.fill('input[name="ref"]', 'MP2610.1234');
    await page.click('button[form="form-pay"]');
    await expect(page.locator('.paid-ok')).toContainText('Airtel Money');

    const v = await versementOf(page, c.card);
    expect(v.montant).toBe(700);
    expect(v.historique.at(-1)).toMatchObject({ montant: 700, mode: 'airtel', ref: 'MP2610.1234' });
    const rec = await lastReceipt(page);
    expect(rec).toMatchObject({ mode: 'airtel', ref: 'MP2610.1234', total: 700, valid: true });
    expect(rec.text).toContain('Payé par : Airtel Money · réf. MP2610.1234');
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
    await page.evaluate(() => { state.pointageTab = 'tous'; rerender(); });
    await expect(page.locator('.mode-tag.mode-mixte').first()).toBeVisible();
  });

  test('bouton ✓ : Yvo choisit le mode, le journalier complet est enregistré', async ({ page }) => {
    const [c] = await clientsToPoint(page);
    const expected = await page.evaluate(id => dueCards(todayISO()).filter(x => x.clientId === id)
      .reduce((s, x) => s + Number(x.montantJournalier), 0), c.id);
    await page.click('[data-action="pointage-full"][data-client="' + c.id + '"]');
    await expect(page.locator('.mode-quick .mode-opt-btn')).toHaveCount(3);
    await page.fill('#quick-ref', 'TX-99');
    await page.click('[data-action="pointage-full-mode"][data-mode="moov"]');
    await expect(page.locator('.modal')).toHaveCount(0);

    const total = await page.evaluate(ids => ids.reduce((s, id) => { const v = versementFor(id, todayISO()); return s + (v ? v.montant : 0); }, 0), c.cards);
    expect(total).toBe(expected);
    const rec = await lastReceipt(page);
    expect(rec).toMatchObject({ mode: 'moov', ref: 'TX-99', total: expected, valid: true });
    await page.evaluate(() => { state.pointageTab = 'faits'; rerender(); });
    await expect(page.locator('.prow', { hasText: c.nom }).locator('.mode-tag img[alt="Moov Money"]')).toBeVisible();
  });

  test('« Rien reçu » marque le client non versé sans créer de reçu', async ({ page }) => {
    const [c] = await clientsToPoint(page);
    const before = await page.evaluate(() => db.recus.length);
    await page.evaluate(id => openPaySheet(id, todayISO()), c.id);
    await page.click('[data-action="pay-none"]');
    const v = await versementOf(page, c.card);
    expect(v).toMatchObject({ montant: 0, statut: 'absent' });
    expect(await page.evaluate(() => db.recus.length)).toBe(before);
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
    const [c] = await clientsToPoint(page);
    await page.evaluate(id => openPaySheet(id, todayISO()), c.id);
    await page.click('button[form="form-pay"]');
    await expect(page.locator('.toast').last()).toContainText('Saisissez le montant');
    expect(await versementOf(page, c.card)).toBeNull();
  });
});
