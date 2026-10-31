// Les données de Yvo vivent sur le serveur : un nouveau téléphone retrouve tout après connexion.
const { test, expect } = require('@playwright/test');
const { login, trackErrors } = require('./helpers');

test.describe.configure({ mode: 'serial', timeout: 60000 });

test('nouveau téléphone : Yvo se connecte et retrouve ses clients et ses paiements', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'un seul passage suffit (compte partagé sur le serveur de test)');
  const marker = 'Client Sync ' + Date.now();

  // Téléphone A : crée un client, sa carte et un paiement Airtel
  const ctxA = await browser.newContext();
  const A = await ctxA.newPage();
  const errorsA = trackErrors(A);
  await login(A);
  const ids = await A.evaluate(name => {
    const now = new Date().toISOString();
    const client = { id: uid('cl'), nom: name, telephone: '074000001', quartier: 'Akanda', createdAt: now, updatedAt: now };
    db.clients.push(client);
    const carte = { id: uid('ca'), clientId: client.id, label: 'Carte 1', montantJournalier: 1000, dateDebut: addDays(todayISO(), -3), dateFin: addDays(todayISO(), 27), statut: 'active', createdAt: now };
    db.cartes.push(carte);
    payLines = [];
    addPayment(carte, todayISO(), 1000, '', 'airtel', 'AIR-77');
    const rec = createReceipt(client.id, todayISO(), payLines, 'airtel', 'AIR-77');
    saveDB();
    return syncNow(true).then(() => ({ client: client.id, carte: carte.id, token: rec.token, pending: countPending() }));
  }, marker);
  expect(ids.pending).toBe(0);

  // Téléphone B : jamais utilisé, il se connecte et récupère tout
  const ctxB = await browser.newContext();
  const B = await ctxB.newPage();
  const errorsB = trackErrors(B);
  await login(B);
  await expect.poll(() => B.evaluate(id => !!clientById(id), ids.client), { timeout: 15000 }).toBe(true);
  const got = await B.evaluate(id => { const v = versementFor(id, todayISO()); return v && versementModes(v); }, ids.carte);
  expect(got).toEqual({ especes: 0, airtel: 1000, moov: 0 });
  await B.evaluate(id => { location.hash = '#/client/' + id; }, ids.client);
  await expect(B.locator('#view')).toContainText(marker);

  // B encaisse en Moov, A le reçoit
  await B.evaluate(id => { payLines = []; addPayment(carteById(id), todayISO(), 500, '', 'moov', ''); saveDB(); return syncNow(true); }, ids.carte);
  await A.evaluate(() => syncNow(true));
  expect(await A.evaluate(id => versementModes(versementFor(id, todayISO())), ids.carte)).toEqual({ especes: 0, airtel: 1000, moov: 500 });

  // Reçu public vérifiable
  const html = await (await A.request.get('/r/' + ids.token)).text();
  expect(html).toContain('Reçu authentique');
  expect(html).toContain('Airtel Money');

  expect(errorsA).toEqual([]);
  expect(errorsB).toEqual([]);
  await ctxA.close();
  await ctxB.close();
});
