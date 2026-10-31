// Serveur (API uniquement, sans navigateur) : sécurité, connexion d'Yvo, synchronisation, reçus publics.
const { test, expect } = require('@playwright/test');
const ReceiptCode = require('../js/receipt-code.js');

const PASSWORD = process.env.YVO_PASSWORD;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
// adresse IP fictive propre à chaque test : la limitation des tentatives ne gêne pas les autres
const fakeIp = () => '10.' + [1, 2, 3].map(() => Math.floor(Math.random() * 250) + 1).join('.');

async function login(request, deviceName = 'Test') {
  const r = await request.post('/api/login', { data: { password: PASSWORD, device: { id: 'dev-' + uid(), name: deviceName } } });
  expect(r.status()).toBe(200);
  const body = await r.json();
  return { Authorization: 'Bearer ' + body.token };
}

async function sync(request, headers, data) {
  const r = await request.post('/api/sync', { headers, data });
  expect(r.status()).toBe(200);
  return r.json();
}

/* Reçu de versement complet, avec son code de contrôle calculé comme dans l'application. */
function makeReceipt(over = {}) {
  const rec = {
    id: 'rc_' + uid(), token: 'T' + uid() + uid(), numero: 'RV-' + uid(), date: '2026-10-31', at: '31/10/2026 09:15',
    clientNom: 'Mme Test Nzé', total: 1200, devise: 'FCFA', lignes: [{ carte: 'Carte A', montant: 1200 }],
    cumul: 24000, retard: 0, entreprise: 'YVO Épargne', collecteur: 'Yvo', mode: 'airtel', ref: 'AIR-42', ...over
  };
  rec.code = ReceiptCode.compute(rec);
  return rec;
}

test.describe('Serveur', () => {
  test('santé', async ({ request }) => {
    const r = await request.get('/api/health');
    expect(r.status()).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, db: true });
  });

  test('seuls les fichiers publics sont servis, avec CSP', async ({ request }) => {
    for (const f of ['/server/server.js', '/server/db.js', '/package.json', '/Dockerfile', '/docker-compose.yml', '/.env', '/../server/server.js', '/tests/serveur.spec.js']) {
      expect((await request.get(f)).status(), f).toBe(404);
    }
    const html = await request.get('/');
    expect(html.status()).toBe(200);
    expect(html.headers()['content-security-policy']).toContain("default-src 'self'");
    expect(html.headers()['x-frame-options']).toBe('DENY');
    expect(html.headers()['x-content-type-options']).toBe('nosniff');
    expect((await request.get('/img/airtel-money.png')).status()).toBe(200);
  });

  test('API protégée sans jeton', async ({ request }) => {
    expect((await request.post('/api/sync', { data: {} })).status()).toBe(401);
    expect((await request.get('/api/me')).status()).toBe(401);
    expect((await request.get('/api/audit')).status()).toBe(401);
    expect((await request.get('/api/export')).status()).toBe(401);
    expect((await request.get('/api/me', { headers: { Authorization: 'Bearer ' + 'a'.repeat(64) } })).status()).toBe(401);
  });

  test('la création d’espace n’existe plus', async ({ request }) => {
    expect((await request.post('/api/register', { data: { name: 'x', password: 'motdepasse' } })).status()).toBe(404);
  });

  test('mauvais mot de passe refusé', async ({ request }) => {
    const r = await request.post('/api/login', { headers: { 'X-Forwarded-For': fakeIp() }, data: { password: 'faux-faux-faux', device: { id: 'x', name: 'X' } } });
    expect(r.status()).toBe(401);
    expect(await r.json()).toEqual({ error: 'Mot de passe incorrect.' });
  });

  test('connexion, /api/me, déconnexion', async ({ request }) => {
    const r = await request.post('/api/login', { data: { name: 'ignoré', password: PASSWORD, device: { id: 'd-me', name: 'Téléphone test' } } });
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body).toMatchObject({ ok: true, account: 'yvo' });
    expect(body.token).toMatch(/^[a-f0-9]{64}$/);
    const headers = { Authorization: 'Bearer ' + body.token };

    const me = await request.get('/api/me', { headers });
    expect(me.status()).toBe(200);
    const meBody = await me.json();
    expect(meBody.ok).toBe(true);
    expect(typeof meBody.head).toBe('number');
    expect(meBody.devices.some(d => d.device_name === 'Téléphone test')).toBe(true);

    expect((await request.get('/api/unknown', { headers })).status()).toBe(404);
    expect((await request.post('/api/logout', { headers })).status()).toBe(200);
    expect((await request.get('/api/me', { headers })).status()).toBe(401);
  });

  test('trop de tentatives : 429', async ({ request }) => {
    const headers = { 'X-Forwarded-For': fakeIp() };
    for (let i = 0; i < 10; i++) {
      expect((await request.post('/api/login', { headers, data: { password: 'faux-' + i } })).status()).toBe(401);
    }
    const r = await request.post('/api/login', { headers, data: { password: PASSWORD } });
    expect(r.status()).toBe(429);
    expect(await r.json()).toEqual({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' });
    // une autre adresse n'est pas bloquée
    expect((await request.post('/api/login', { headers: { 'X-Forwarded-For': fakeIp() }, data: { password: PASSWORD } })).status()).toBe(200);
  });

  test('deux appareils : un versement Airtel arrive sur l’autre', async ({ request }) => {
    const A = await login(request, 'Téléphone A');
    const B = await login(request, 'Téléphone B');
    const start = (await sync(request, B, { since: 0, changes: [] })).seq;

    const client = { id: 'cl_' + uid(), nom: 'Client Sync', quartier: 'Nzeng-Ayong' };
    const versement = { id: 'vs_' + uid(), clientId: client.id, montant: 1200, date: '2026-10-31', historique: [{ montant: 1200, mode: 'airtel', ref: 'AIR-42' }] };
    const pushed = await sync(request, A, {
      since: 0,
      changes: [
        { kind: 'clients', id: client.id, data: client, u: Date.now(), baseRev: 0 },
        { kind: 'versements', id: versement.id, data: versement, u: Date.now(), baseRev: 0 }
      ]
    });
    expect(pushed.ok).toBe(true);
    expect(pushed.conflicts).toEqual([]);
    expect(pushed.applied.map(a => a.rev)).toEqual([1, 1]);
    // l'appareil émetteur ne reçoit pas en retour ce qu'il vient d'envoyer
    expect(pushed.changes.find(c => c.id === client.id)).toBeUndefined();

    const pulled = await sync(request, B, { since: start, changes: [] });
    expect(pulled.seq).toBeGreaterThan(start);
    const v = pulled.changes.find(c => c.id === versement.id);
    expect(v).toMatchObject({ kind: 'versements', deleted: false, rev: 1 });
    expect(v.data.historique[0].mode).toBe('airtel');
    expect(pulled.changes.find(c => c.id === client.id).data.nom).toBe('Client Sync');

    // journal d'audit et export
    const audit = await (await request.get('/api/audit?kind=versements&id=' + versement.id, { headers: B })).json();
    expect(audit.events[0]).toMatchObject({ op: 'created', device_name: 'Téléphone A' });
    const exp = await request.get('/api/export', { headers: B });
    expect(exp.headers()['content-disposition']).toContain('attachment');
    expect((await exp.json()).data.clients.some(c => c.id === client.id)).toBe(true);
  });

  test('conflit : deux appareils modifient la même fiche, la plus récente gagne', async ({ request }) => {
    const A = await login(request, 'Téléphone A');
    const B = await login(request, 'Téléphone B');
    const id = 'cl_' + uid();
    const t0 = Date.now();
    await sync(request, A, { since: 0, changes: [{ kind: 'clients', id, data: { id, nom: 'v1' }, u: t0, baseRev: 0 }] });

    // A modifie (rev 1 → 2)
    const a2 = await sync(request, A, { since: 0, changes: [{ kind: 'clients', id, data: { id, nom: 'v2-A' }, u: t0 + 1000, baseRev: 1 }] });
    expect(a2.conflicts).toEqual([]);
    expect(a2.applied[0].rev).toBe(2);

    // B modifie encore à partir de la rev 1 (périmée), plus récemment → B gagne
    const b = await sync(request, B, { since: 0, changes: [{ kind: 'clients', id, data: { id, nom: 'v3-B' }, u: t0 + 2000, baseRev: 1 }] });
    expect(b.conflicts).toEqual([expect.objectContaining({ kind: 'clients', id, winner: 'device' })]);
    expect(b.applied[0].rev).toBe(3);

    // A envoie une version plus ANCIENNE à partir de la rev 2 → le serveur garde celle de B
    const a3 = await sync(request, A, { since: 0, changes: [{ kind: 'clients', id, data: { id, nom: 'vieux-A' }, u: t0 + 1500, baseRev: 2 }] });
    expect(a3.conflicts).toEqual([expect.objectContaining({ id, winner: 'server' })]);
    expect(a3.applied[0]).toMatchObject({ rev: 3, serverWon: true });
    expect(a3.changes.find(c => c.id === id).data.nom).toBe('v3-B');

    const audit = await (await request.get('/api/audit?kind=clients&id=' + id, { headers: A })).json();
    expect(audit.events.filter(e => e.op === 'conflict')).toHaveLength(2);
  });

  test('les reçus et le journal d’activité sont immuables', async ({ request }) => {
    const headers = await login(request);
    const rec = makeReceipt();
    await sync(request, headers, { since: 0, changes: [{ kind: 'recus', id: rec.id, data: rec, u: Date.now() }] });
    const r = await sync(request, headers, { since: 0, changes: [{ kind: 'recus', id: rec.id, data: { ...rec, total: 1 }, u: Date.now() + 1000, baseRev: 1 }] });
    expect(r.applied[0].serverWon).toBe(true);
    expect(r.changes.find(c => c.id === rec.id).data.total).toBe(1200);
    const del = await sync(request, headers, { since: 0, changes: [{ kind: 'recus', id: rec.id, data: rec, deleted: true, u: Date.now() + 2000, baseRev: 1 }] });
    expect(del.changes.find(c => c.id === rec.id).deleted).toBe(false);

    const actId = 'act_' + uid();
    await sync(request, headers, { since: 0, changes: [{ kind: 'activity', id: actId, data: { id: actId, texte: 'original' }, u: Date.now() }] });
    const act = await sync(request, headers, { since: 0, changes: [{ kind: 'activity', id: actId, data: { id: actId, texte: 'falsifié' }, u: Date.now() + 1000, baseRev: 1 }] });
    expect(act.changes.find(c => c.id === actId).data.texte).toBe('original');

    const audit = await (await request.get('/api/audit?kind=recus&id=' + rec.id, { headers })).json();
    expect(audit.events.filter(e => e.op === 'rejected')).toHaveLength(2);
  });

  test('reçu public : authentique, ou signalé s’il a été falsifié', async ({ request }) => {
    const headers = await login(request);
    const good = makeReceipt();
    const bad = makeReceipt();
    bad.total = 99000; // modifié après calcul du code de contrôle
    await sync(request, headers, { since: 0, changes: [good, bad].map(r => ({ kind: 'recus', id: r.id, data: r, u: Date.now() })) });

    const pub = await request.get('/r/' + good.token);
    expect(pub.status()).toBe(200);
    expect(pub.headers()['content-type']).toContain('text/html');
    const html = await pub.text();
    expect(html).toContain('Reçu authentique');
    expect(html).toContain('Airtel Money');
    expect(html).toContain('/img/airtel-money.png');
    expect(html).toContain('AIR-42');
    expect(html).toContain(good.code);

    const tampered = await (await request.get('/r/' + bad.token)).text();
    expect(tampered).not.toContain('Reçu authentique');
    expect(tampered).toContain('ne correspond pas à son code de contrôle');

    expect((await request.get('/r/inconnu' + uid())).status()).toBe(404);
  });

  test('synchronisations simultanées : tout est appliqué, seq distincts', async ({ request }) => {
    const headers = await login(request);
    const ids = Array.from({ length: 5 }, () => 'cl_' + uid());
    const results = await Promise.all(ids.map(id => sync(request, headers, {
      since: 0, changes: [{ kind: 'clients', id, data: { id, nom: 'Parallèle ' + id }, u: Date.now(), baseRev: 0 }]
    })));
    results.forEach(r => expect(r.applied[0]).toMatchObject({ rev: 1 }));

    const audit = await Promise.all(ids.map(async id => (await (await request.get('/api/audit?kind=clients&id=' + id, { headers })).json()).events));
    const seqs = audit.map(ev => ev.find(e => e.op === 'created').seq);
    expect(new Set(seqs).size).toBe(5);

    // un appareil neuf retrouve les 5 fiches
    const all = await sync(request, await login(request), { since: 0, changes: [] });
    const got = all.changes.filter(c => ids.includes(c.id));
    expect(got).toHaveLength(5);
    expect(new Set(got.map(c => c.seq)).size).toBe(5);
  });
});
