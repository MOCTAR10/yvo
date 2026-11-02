// Bugs corrigés (chasse aux bugs v3.1) : chacun a son test pour ne jamais revenir.
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

const PASSWORD = process.env.YVO_PASSWORD;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

test.describe('Corrections — argent et clients', () => {
  let errors;
  test.beforeEach(async ({ page }) => { errors = await openApp(page); });
  test.afterEach(() => expect(errors).toEqual([]));

  test('WhatsApp : le 0 du numéro gabonais est gardé', async ({ page }) => {
    const links = await page.evaluate(() => [waLink('077814766'), waLink('+241 077814766'), waLink('077 81 47 66')]);
    links.forEach(l => expect(l).toBe('https://wa.me/241077814766'));
  });

  test('corbeille : restaurer un jour déjà pointé à nouveau ne compte pas deux fois', async ({ page }) => {
    const r = await page.evaluate(() => {
      const c = db.cartes.find(x => x.statut === 'active' && x.dateDebut <= todayISO() && x.dateFin >= todayISO());
      const d = todayISO();
      db.versements = db.versements.filter(v => !(v.carteId === c.id && v.date === d));
      const v = addPayment(c, d, 2000, '', 'especes');
      db.versements = db.versements.filter(x => x !== v);
      trashAdd('versement', 'test', { versements: [v] });
      addPayment(c, d, 3000, '', 'airtel');
      const res = trashRestore(db.trash[0].id);
      return { res, n: db.versements.filter(x => x.carteId === c.id && x.date === d).length, total: versementFor(c.id, d).montant };
    });
    expect(r.res).toEqual({ ok: true, skipped: 1 });
    expect(r.n).toBe(1);
    expect(r.total).toBe(3000);
  });

  test('corbeille : une carte dont le client est supprimé ne revient pas seule', async ({ page }) => {
    const r = await page.evaluate(() => {
      const carte = { id: 'k_orph', clientId: 'cl_inexistant', label: 'X', montantJournalier: 500, dateDebut: todayISO(), dateFin: todayISO(), statut: 'active' };
      trashAdd('carte', 'X', { cartes: [carte] });
      return { res: trashRestore(db.trash[0].id), back: !!carteById('k_orph') };
    });
    expect(r.res).toEqual({ ok: false, reason: 'parent' });
    expect(r.back).toBe(false);
  });

  test('avance sur une carte, épargne sur une autre : solde net et paiement limité', async ({ page }) => {
    const r = await page.evaluate(() => {
      const client = db.clients[0];
      const mk = (id, label) => { const k = { id, clientId: client.id, label, montantJournalier: 1000, dateDebut: addDays(todayISO(), -20), dateFin: addDays(todayISO(), 20), statut: 'active' }; db.cartes.push(k); return k; };
      db.cartes.filter(c => c.clientId === client.id).forEach(c => { c.statut = 'cloturee'; });
      const a = mk('k_net_a', 'A'), b = mk('k_net_b', 'B');
      for (let i = 1; i <= 18; i++) db.versements.push({ id: 'v_nb' + i, carteId: b.id, clientId: client.id, date: addDays(todayISO(), -i), montant: 1000, statut: 'complet', historique: [] });
      db.operations.push({ id: 'op_net', type: 'sortie', categorie: 'pret', montant: 13000, frais: 0, carteId: a.id, clientId: client.id, date: todayISO(), mode: 'Espèces' });
      const before = clientTotals(client);
      const others = sum(cartesOf(client.id).filter(c => c.id !== a.id && c.id !== b.id), c => cardTotals(c).soldeBrut);
      return { cardB: cardTotals(b).solde, dispo: retraitDispo(b), net: before.solde, others };
    });
    expect(r.cardB).toBe(18000);
    expect(r.dispo).toBe(Math.max(0, Math.min(18000, 18000 - 13000 + r.others)));
    expect(r.net).toBe(Math.max(0, 18000 - 13000 + r.others));
  });

  test('clôturer une carte qui doit une avance demande confirmation, et une alerte reste', async ({ page }) => {
    const id = await page.evaluate(() => {
      const c = db.cartes.find(x => x.statut === 'active');
      db.operations.push({ id: 'op_clo', type: 'sortie', categorie: 'pret', montant: cardTotals(c).solde + 7000, frais: 0, carteId: c.id, clientId: c.clientId, date: todayISO(), mode: 'Espèces' });
      saveDB(); location.hash = '#/client/' + c.clientId;
      return c.id;
    });
    await page.evaluate(i => openCarteModal(carteById(i).clientId, carteById(i)), id);
    await page.click('[data-action="toggle-carte"]');
    await expect(page.locator('.modal')).toContainText('7 000');
    expect(await page.evaluate(i => carteById(i).statut, id)).toBe('active');
    await page.click('[data-action="confirm-toggle-carte"]');
    await expect.poll(() => page.evaluate(i => carteById(i).statut, id)).toBe('cloturee');
    expect(await page.evaluate(() => computeAlerts().some(a => a.key.indexOf('avance-cloturee') === 0))).toBe(true);
  });

  test('alerte « clients à risque »', async ({ page }) => {
    const r = await page.evaluate(() => ({
      risque: db.clients.some(c => c.actif !== false && clientRisk(c).niveau === 'risque'),
      alerte: computeAlerts().some(a => a.key.indexOf('risque|') === 0)
    }));
    expect(r.alerte).toBe(r.risque);
  });

  test('corriger seulement le mode de paiement, ou baisser le montant dans un autre mode', async ({ page }) => {
    const r = await page.evaluate(() => {
      const c = db.cartes.find(x => x.statut === 'active' && x.dateDebut <= todayISO() && x.dateFin >= todayISO());
      const d = todayISO();
      db.versements = db.versements.filter(v => !(v.carteId === c.id && v.date === d));
      const v = addPayment(c, d, 5000, '', 'especes');
      correctVersementModes(v, 5000, 'airtel', new Date().toISOString());
      const apres1 = versementModes(v);
      correctVersementModes(v, 2500, 'especes', new Date().toISOString());
      v.montant = 2500;
      return { apres1, apres2: versementModes(v) };
    });
    expect(r.apres1).toEqual({ especes: 0, airtel: 5000, moov: 0 });
    expect(r.apres2).toEqual({ especes: 0, airtel: 2500, moov: 0 });
  });

  test('on ne pointe pas un jour à venir', async ({ page }) => {
    const r = await page.evaluate(() => {
      const c = db.cartes.find(x => x.statut === 'active' && x.dateFin > addDays(todayISO(), 2));
      openDayTap(c.id, addDays(todayISO(), 1));
      return !!document.querySelector('.modal form');
    });
    expect(r).toBe(false);
  });
});

test('connexion : une page Wi-Fi (200 non JSON) ne laisse pas entrer un faux mot de passe', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => lockApp());
  await page.route('**/api/login', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html>Portail Wi-Fi</html>' }));
  await page.fill('#unlock-pin', 'pas-le-bon-mot-de-passe');
  await page.click('.login-btn');
  await expect(page.locator('.login-card')).toBeVisible();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => !!sessionStorage.getItem('yvo-acces'))).toBe(false);
  expect(errors.filter(e => !/401|502/.test(e))).toEqual([]);
});

test.describe('Corrections — serveur', () => {
  async function login(request) {
    const r = await request.post('/api/login', { data: { password: PASSWORD, device: { id: 'dev-' + uid(), name: 'T' } } });
    expect(r.status()).toBe(200);
    return { Authorization: 'Bearer ' + (await r.json()).token };
  }
  const sync = async (request, headers, data) => { const r = await request.post('/api/sync', { headers, data }); expect(r.status()).toBe(200); return r.json(); };

  test('un nouveau téléphone n’écrase pas les données du serveur', async ({ request }) => {
    const a = await login(request);
    const b = await login(request);
    const id = 'cl_' + uid();
    const first = await sync(request, a, { since: 0, changes: [{ kind: 'clients', id, data: { id, nom: 'Version serveur' }, baseRev: 0, u: Date.now() }] });
    expect(first.applied[0].rev).toBe(1);
    const resp = await sync(request, b, { since: 0, changes: [{ kind: 'clients', id, data: { id, nom: 'Vieille copie' }, baseRev: 0, u: Date.now() + 1000 }] });
    expect(resp.applied[0]).toMatchObject({ serverWon: true, rev: 1 });
    expect(resp.changes.find(c => c.id === id).data.nom).toBe('Version serveur');
  });

  test('la modification la plus récente gagne, pas le dernier à se connecter', async ({ request }) => {
    const a = await login(request);
    const b = await login(request);
    const id = 'cl_' + uid();
    await sync(request, a, { since: 0, changes: [{ kind: 'clients', id, data: { id, nom: 'Départ' }, baseRev: 0, u: Date.now() }] });
    const t = Date.now();
    await sync(request, b, { since: 0, changes: [{ kind: 'clients', id, data: { id, nom: 'Récente (B)' }, baseRev: 1, u: t }] });
    const resp = await sync(request, a, { since: 0, changes: [{ kind: 'clients', id, data: { id, nom: 'Ancienne (A, hors réseau)' }, baseRev: 1, u: t - 60000 }] });
    expect(resp.conflicts[0].winner).toBe('server');
    expect(resp.changes.find(c => c.id === id).data.nom).toBe('Récente (B)');
  });

  test('entrées mal formées : réponse propre, pas d’erreur 500', async ({ request }) => {
    const h = await login(request);
    expect((await request.post('/api/login', { headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.9.9.' + Math.floor(Math.random() * 250) }, data: 'null' })).status()).toBe(401);
    expect((await request.post('/api/sync', { headers: { ...h, 'Content-Type': 'application/json' }, data: 'null' })).status()).toBe(200);
    expect((await request.post('/api/sync', { headers: h, data: { since: 1e30, changes: [{ kind: 'clients', id: 'cl_' + uid(), data: {}, baseRev: 0, u: 1.5 }] } })).status()).toBe(200);
    expect((await request.get('/api/audit?limit=-5', { headers: h })).status()).toBe(200);
  });
});

test('deux fenêtres ouvertes : l’ancienne s’arrête au lieu d’écraser les données', async ({ page, context }) => {
  const errors = await openApp(page);
  const other = await context.newPage();
  await other.route('**/api/sync', route => route.fulfill({ json: { ok: true, seq: 0, more: false, applied: [], conflicts: [], changes: [], serverTime: 0 } }));
  await other.goto('/');
  await expect(page.locator('.other-tab')).toBeVisible();
  expect(await page.evaluate(() => tabInactive)).toBe(true);
  await page.click('.other-tab button');
  await expect(other.locator('.other-tab')).toBeVisible();
  expect(errors).toEqual([]);
});

test('quartier : liste de Port-Gentil proposée, saisie libre, majuscules remises', async ({ page }) => {
  const errors = await openApp(page);
  const r = await page.evaluate(() => {
    openClientModal(null);
    const opts = Array.from(document.querySelectorAll('#quartiers-list option')).map(o => o.value);
    closeModal();
    return { opts, a: normalizeQuartier('  grand   village '), b: normalizeQuartier('ntchengue'), c: normalizeQuartier('Akosso Nord'), d: normalizeQuartier('') };
  });
  expect(r.opts).toEqual(expect.arrayContaining(['Grand Village', 'Balise', 'Ntchengué']));
  expect(r).toMatchObject({ a: 'Grand Village', b: 'Ntchengué', c: 'Akosso Nord', d: 'Non classé' });
  expect(errors).toEqual([]);
});
