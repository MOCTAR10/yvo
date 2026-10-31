// Serveur : API, sécurité des fichiers, synchronisation entre deux téléphones, reçu public.
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

const uniqueName = () => 'test-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

test.describe('Serveur', () => {
  test('santé', async ({ request }) => {
    const r = await request.get('/api/health');
    expect(r.ok()).toBe(true);
    expect(await r.json()).toMatchObject({ ok: true });
  });

  test('seuls les fichiers publics sont servis', async ({ request }) => {
    for (const f of ['/server/server.js', '/package.json', '/Dockerfile', '/../server/server.js', '/tests/login.spec.js']) {
      expect((await request.get(f)).status(), f).toBe(404);
    }
    const html = await request.get('/');
    expect(html.headers()['content-security-policy']).toContain("default-src 'self'");
    expect(html.headers()['x-frame-options']).toBe('DENY');
  });

  test('API protégée sans jeton', async ({ request }) => {
    expect((await request.post('/api/sync', { data: {} })).status()).toBe(401);
    expect((await request.get('/api/me')).status()).toBe(401);
  });

  test('création d’espace, connexion, mauvais mot de passe', async ({ request }) => {
    const name = uniqueName();
    expect((await request.post('/api/register', { data: { name, password: 'court' } })).status()).toBe(400);
    const reg = await request.post('/api/register', { data: { name, password: 'motdepasse-test', device: { id: 'd1', name: 'Test' } } });
    expect(reg.ok()).toBe(true);
    expect((await request.post('/api/register', { data: { name, password: 'motdepasse-test' } })).status()).toBe(409);
    expect((await request.post('/api/login', { data: { name, password: 'faux-faux-faux' } })).status()).toBe(401);
    const login = await request.post('/api/login', { data: { name, password: 'motdepasse-test' } });
    const { token } = await login.json();
    const me = await request.get('/api/me', { headers: { Authorization: 'Bearer ' + token } });
    expect(me.ok()).toBe(true);
  });

  test('les reçus sont immuables sur le serveur', async ({ request }) => {
    const reg = await request.post('/api/register', { data: { name: uniqueName(), password: 'motdepasse-test' } });
    const headers = { Authorization: 'Bearer ' + (await reg.json()).token };
    const rec = { id: 'rc_1', numero: 'RV-1', total: 1000 };
    await request.post('/api/sync', { headers, data: { since: 0, changes: [{ kind: 'recus', id: 'rc_1', data: rec, u: Date.now() }] } });
    const r = await request.post('/api/sync', { headers, data: { since: 0, changes: [{ kind: 'recus', id: 'rc_1', data: { ...rec, total: 1 }, u: Date.now(), baseRev: 1 }] } });
    const body = await r.json();
    expect(body.applied[0].serverWon).toBe(true);
    expect(body.changes.find(c => c.id === 'rc_1').data.total).toBe(1000);
  });

  test('deux téléphones : un paiement Airtel arrive sur l’autre, le reçu public est vérifiable', async ({ browser }) => {
    const name = uniqueName();
    const password = 'motdepasse-test';

    // Téléphone A : démo, crée l'espace, encaisse en Airtel
    const ctxA = await browser.newContext();
    const A = await ctxA.newPage();
    const errorsA = await openApp(A);
    await A.evaluate(({ name, password }) => syncConnect('register', { name, password, deviceName: 'Téléphone A' }).then(() => syncNow(true)), { name, password });
    const paid = await A.evaluate(() => {
      const e = pointageEntries(todayISO()).find(x => !x.touched);
      payLines = [];
      addPayment(e.cards[0], todayISO(), 1200, '', 'airtel', 'AIR-42');
      const rec = createReceipt(e.client.id, todayISO(), payLines, 'airtel', 'AIR-42');
      saveDB();
      return syncNow(true).then(() => ({ carte: e.cards[0].id, token: rec.token, numero: rec.numero }));
    });

    // Téléphone B : vide, se connecte et récupère tout
    const ctxB = await browser.newContext();
    const B = await ctxB.newPage();
    const errorsB = await openApp(B, { demo: false });
    await B.evaluate(({ name, password }) => syncConnect('login', { name, password, deviceName: 'Téléphone B' }).then(() => syncNow(true)), { name, password });
    await expect.poll(() => B.evaluate(id => { const v = versementFor(id, todayISO()); return v && versementModes(v).airtel; }, paid.carte)).toBe(1200);
    expect(await B.evaluate(n => db.recus.some(r => r.numero === n && r.mode === 'airtel'), paid.numero)).toBe(true);

    // Page publique du reçu
    const pub = await B.request.get('/r/' + paid.token);
    expect(pub.status()).toBe(200);
    const html = await pub.text();
    expect(html).toContain('Reçu authentique');
    expect(html).toContain('Airtel Money');
    expect(html).toContain('AIR-42');

    expect(errorsA).toEqual([]);
    expect(errorsB).toEqual([]);
    await ctxA.close();
    await ctxB.close();
  });
});
