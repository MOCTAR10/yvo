// Avance d'argent : Yvo donne plus que ce que le client a cotisé ; remboursement par les cotisations.
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test.describe('Avance d’argent', () => {
  let errors;
  let carte;
  test.beforeEach(async ({ page }) => {
    errors = await openApp(page);
    carte = await page.evaluate(() => {
      const c = db.cartes.find(x => x.statut === 'active' && x.dateFin > addDays(todayISO(), 10));
      return { id: c.id, clientId: c.clientId, j: Number(c.montantJournalier) };
    });
  });
  test.afterEach(() => expect(errors).toEqual([]));

  test('donner une avance, sans aucun frais : la carte doit de l’argent, reçu à signer', async ({ page }) => {
    const before = await page.evaluate(id => { const t = cardTotals(carteById(id)); return { solde: t.solde, caisse: cashBalance() }; }, carte.id);
    const montant = before.solde + 20000;
    await page.evaluate(c => openPretModal(c.clientId, c.id), carte);
    await page.fill('#pret-montant', String(montant));
    await expect(page.locator('.modal')).not.toContainText(/frais|commission/i);
    await expect(page.locator('#pret-preview .total')).toContainText('rembourser');
    await page.locator('.mode-opt.mode-moov').click();
    await page.click('button[form="form-pret"]');

    const r = await page.evaluate(id => {
      const op = db.operations.filter(o => o.categorie === 'pret').at(-1);
      const t = cardTotals(carteById(id));
      return { op, solde: t.solde, reste: t.resteARembourser, caisse: cashBalance() };
    }, carte.id);
    expect(r.op).toMatchObject({ type: 'sortie', montant, frais: 0, mode: 'Moov Money', carteId: carte.id });
    expect(r.solde).toBe(0);
    expect(r.reste).toBe(montant - before.solde);
    expect(r.caisse).toBe(before.caisse - montant);

    await page.evaluate(id => openReceipt(id), r.op.id);
    await expect(page.locator('.receipt-title')).toHaveText('Reçu d’avance d’argent');
    await expect(page.locator('.receipt-note')).toContainText('rembourse par mes cotisations');
  });

  test('une ancienne avance avec des frais garde ses comptes et son reçu', async ({ page }) => {
    const r = await page.evaluate(id => {
      const k = carteById(id);
      const avant = cardTotals(k).solde;
      db.operations.push({ id: 'op_vieux', type: 'sortie', categorie: 'pret', montant: 1000, frais: 100, fraisRegle: { type: 'fixe', valeur: 100 }, carteId: id, clientId: k.clientId, date: todayISO(), mode: 'Espèces', recuNumero: 'R-OLD', createdAt: new Date().toISOString(), snapshot: { clientNom: 'X', carteLabel: 'Carte 1', montantJournalier: 1000, dateFin: k.dateFin, totalVerse: 0, doitApres: 0 } });
      return avant - cardTotals(k).solde + cardTotals(k).resteARembourser;
    }, carte.id);
    expect(r).toBe(1100);
    await page.evaluate(() => openReceipt('op_vieux'));
    await expect(page.locator('.receipt-note')).toContainText('frais');
  });

  test('les cotisations suivantes remboursent l’avance', async ({ page }) => {
    const reste = await page.evaluate(id => {
      const c = carteById(id);
      const t = cardTotals(c);
      db.operations.push({ id: uid('op'), type: 'sortie', categorie: 'pret', montant: t.solde + 5000, frais: 0, carteId: id, clientId: c.clientId, date: todayISO(), mode: 'Espèces' });
      return cardTotals(c).resteARembourser;
    }, carte.id);
    expect(reste).toBe(5000);
    const after = await page.evaluate(id => {
      const c = carteById(id);
      payLines = [];
      addPayment(c, addDays(todayISO(), 1), 3000, '', 'especes', '');
      const mid = cardTotals(c).resteARembourser;
      addPayment(c, addDays(todayISO(), 2), 4000, '', 'airtel', '');
      const t = cardTotals(c);
      return { mid, reste: t.resteARembourser, solde: t.solde };
    }, carte.id);
    expect(after).toEqual({ mid: 2000, reste: 0, solde: 2000 });
  });

  test('alerte si les cotisations jusqu’à la fin de la carte ne suffisent pas (sans bloquer)', async ({ page }) => {
    await page.evaluate(c => openPretModal(c.clientId, c.id), carte);
    await page.fill('#pret-montant', '9999999');
    await expect(page.locator('#pret-preview.warn .pret-alert')).toBeVisible();
    await page.fill('#pret-montant', '1000');
    await expect(page.locator('#pret-preview .pret-alert')).toHaveCount(0);
  });

  test('caisse insuffisante : refusé', async ({ page }) => {
    const caisse = await page.evaluate(() => cashBalance());
    await page.evaluate(c => openPretModal(c.clientId, c.id), carte);
    await page.fill('#pret-montant', String(caisse + 1));
    await page.click('button[form="form-pret"]');
    await expect(page.locator('.toast').last()).toContainText('Caisse insuffisante');
    expect(await page.evaluate(() => db.operations.filter(o => o.categorie === 'pret').length)).toBe(0);
  });
});

test('page du client : « Prêter de l’argent » dans le bouton +, et ce qu’il doit rembourser est affiché', async ({ page }) => {
  const errors = await openApp(page);
  const c = await page.evaluate(() => db.cartes.find(x => x.statut === 'active' && cartesOf(x.clientId).length === 1));
  await page.evaluate(id => { location.hash = '#/client/' + id; }, c.clientId);
  await page.click('.fab');
  await page.locator('.fab-item', { hasText: 'Prêter de l’argent' }).click();
  await expect(page.locator('#form-pret')).toBeVisible();
  const solde = await page.evaluate(id => cardTotals(carteById(id)).solde, c.id);
  await page.fill('#pret-montant', String(solde + 3000));
  await page.click('button[form="form-pret"]');
  await expect(page.locator('.simple-status')).toContainText('Doit rembourser 3 000');
  expect(errors).toEqual([]);
});
