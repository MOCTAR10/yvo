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

  test('donner une avance avec 10 % de frais : la carte doit de l’argent, reçu à signer', async ({ page }) => {
    const before = await page.evaluate(id => { const t = cardTotals(carteById(id)); return { solde: t.solde, caisse: cashBalance() }; }, carte.id);
    const montant = before.solde + 20000;
    await page.evaluate(c => openPretModal(c.clientId, c.id), carte);
    await page.fill('#pret-montant', String(montant));
    await page.fill('#pret-frais', '10');
    await page.selectOption('#pret-frais-type', 'pct');
    await expect(page.locator('#pret-preview .total')).toContainText('rembourser');
    await page.locator('.mode-opt.mode-moov').click();
    await page.click('button[form="form-pret"]');

    const r = await page.evaluate(id => {
      const op = db.operations.filter(o => o.categorie === 'pret').at(-1);
      const t = cardTotals(carteById(id));
      return { op, solde: t.solde, reste: t.resteARembourser, caisse: cashBalance() };
    }, carte.id);
    const frais = Math.round(montant * 0.1);
    expect(r.op).toMatchObject({ type: 'sortie', montant, frais, mode: 'Moov Money', carteId: carte.id });
    expect(r.solde).toBe(0);
    expect(r.reste).toBe(montant + frais - before.solde);
    expect(r.caisse).toBe(before.caisse - montant);

    await page.evaluate(id => openReceipt(id), r.op.id);
    await expect(page.locator('.receipt-title')).toHaveText('Reçu d’avance d’argent');
    await expect(page.locator('.receipt-note')).toContainText('rembourse par mes cotisations');
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

  test('la Caisse filtre les avances et le statut « En avance » reste distinct', async ({ page }) => {
    await page.evaluate(id => { const c = carteById(id); db.operations.push({ id: 'op_pret_t', type: 'sortie', categorie: 'pret', libelle: 'Avance d’argent · test', montant: 1000, frais: 0, carteId: id, clientId: c.clientId, date: todayISO(), mode: 'Espèces' }); saveDB(); state.treasuryPeriod = 'jour'; location.hash = '#/tresorerie'; }, carte.id);
    await page.selectOption('#treasury-type', 'prets');
    await expect(page.locator('.journal-foot strong.out')).toContainText('1 000');
    expect(await page.evaluate(() => STATUT_LABELS.avance)).toBe('En avance');
  });
});

test('fiche client : bouton « Avance d’argent » sur la carte et reste à rembourser affiché', async ({ page }) => {
  const errors = await openApp(page);
  const c = await page.evaluate(() => db.cartes.find(x => x.statut === 'active'));
  await page.evaluate(id => { location.hash = '#/client/' + id; }, c.clientId);
  await page.locator('#carte-' + c.id + ' [data-action="new-pret"]').click();
  await expect(page.locator('#form-pret')).toBeVisible();
  const solde = await page.evaluate(id => cardTotals(carteById(id)).solde, c.id);
  await page.fill('#pret-montant', String(solde + 3000));
  await page.click('button[form="form-pret"]');
  await expect(page.locator('#carte-' + c.id + ' .fc-pret')).toContainText('3 000');
  expect(errors).toEqual([]);
});
