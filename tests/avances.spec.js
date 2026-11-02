// Avance d'argent : Yvo donne plus que ce que le client a cotisé ; remboursement par les cotisations.
const { test, expect } = require('@playwright/test');
const { openApp, goto } = require('./helpers');

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
    await expect(page.locator('.receipt-title')).toHaveText('Reçu de prêt');
    await expect(page.locator('.receipt-note')).toContainText('rembourse par mes paiements');
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
    await expect(page.locator('.toast').last()).toContainText('Pas assez d’argent');
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

test('un gros prêt : la carte passe sous zéro, puis il rembourse après la fin de la carte', async ({ page }) => {
  const errors = await openApp(page, { demo: false });
  const ids = await page.evaluate(() => {
    db.settings.soldeInitial = 100000;
    const t = todayISO();
    db.clients.push({ id: 'c_p', nom: 'Awa Ndong', telephone: '077000000', quartier: 'Balise', actif: true });
    db.cartes.push({ id: 'k_p', clientId: 'c_p', label: 'Carte 1', montantJournalier: 1000, dateDebut: t, dateFin: addDays(t, 4), statut: 'active' });
    saveDB();
    return { caisse: cashBalance() };
  });
  await goto(page, 'client/c_p');

  // prêter plus que tout ce qu'il paiera : ce n'est pas bloqué, c'est dit clairement
  await page.click('.fab');
  await page.locator('.fab-item', { hasText: 'Prêter de l’argent' }).click();
  await page.fill('#pret-montant', '20000');
  await expect(page.locator('.pret-alert')).toContainText('il devra encore 15 000');
  await expect(page.locator('.pret-alert')).toContainText('quand même');
  await page.click('button[form="form-pret"]');
  await expect(page.locator('.simple-status')).toContainText('Doit rembourser 20 000');
  expect(await page.evaluate(() => cardTotals(carteById('k_p')).soldeBrut)).toBe(-20000);

  // la carte se termine : le remboursement reste possible
  await page.evaluate(() => { carteById('k_p').statut = 'cloturee'; saveDB(); rerender(); });
  await page.click('.fab');
  await expect(page.locator('.fab-item', { hasText: 'Recevoir l’argent' })).toHaveCount(0);
  await page.locator('.fab-item', { hasText: 'Rembourser le prêt' }).click();
  await expect(page.locator('#remb-montant')).toHaveValue('20000');

  // pas plus que ce qu'il doit
  await page.fill('#remb-montant', '25000');
  await page.click('button[form="form-remboursement"]');
  await expect(page.locator('.toast').last()).toContainText('il doit seulement 20 000');
  expect(await page.evaluate(() => db.operations.filter(o => o.categorie === 'remboursement').length)).toBe(0);

  await page.fill('#remb-montant', '8000');
  await page.locator('.mode-opt.mode-moov').click();
  await page.click('button[form="form-remboursement"]');
  await expect(page.locator('.simple-status')).toContainText('Doit rembourser 12 000');
  const r = await page.evaluate(() => ({ brut: cardTotals(carteById('k_p')).soldeBrut, caisse: cashBalance(), moov: cashByMode().moov, jours: versementsOf('k_p').length }));
  expect(r).toEqual({ brut: -12000, caisse: ids.caisse - 20000 + 8000, moov: 8000, jours: 0 });

  // il apparaît dans les clients à appeler, puisque rien ne rembourse tout seul
  await goto(page, 'risques');
  await expect(page.locator('.relance')).toContainText('Prêt 12 000');

  // reçu, et l'erreur se corrige
  await goto(page, 'client/c_p');
  await page.evaluate(() => { const o = db.operations.find(x => x.categorie === 'remboursement'); openReceipt(o.id); });
  await expect(page.locator('.receipt-title')).toHaveText('Reçu de remboursement');
  await expect(page.locator('.receipt')).toContainText('12 000');
  await page.locator('.modal-body [data-action="delete-op"]').click();
  await page.click('[data-action="confirm-delete-op"]');
  await expect(page.locator('.simple-status')).toContainText('Doit rembourser 20 000');

  // tout rembourser : il ne doit plus rien et le bouton s'en va
  await page.click('.fab');
  await page.locator('.fab-item', { hasText: 'Rembourser le prêt' }).click();
  await page.click('button[form="form-remboursement"]');
  await expect(page.locator('.simple-status')).toContainText('Son argent');
  await page.click('.fab');
  await expect(page.locator('.fab-item', { hasText: 'Rembourser le prêt' })).toHaveCount(0);
  expect(errors).toEqual([]);
});
