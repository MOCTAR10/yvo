'use strict';

/* ============================================================
   YVO Épargne — serveur de synchronisation (PostgreSQL)
   Node 22+ : http + crypto + pg.

   - Sert l'application (fichiers statiques) ET l'API sur la même adresse
   - Un seul compte : « yvo », protégé par mot de passe (scrypt), jetons par appareil
   - Synchronisation par enregistrement avec détection de conflits
   - Journal d'audit IMMUABLE : chaque changement est conservé
   - Reçus publics vérifiables : GET /r/<jeton>

   Variables : DATABASE_URL, PORT, YVO_PASSWORD (premier démarrage uniquement).
   ============================================================ */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ReceiptCode = require('../js/receipt-code.js');
const { DATABASE_URL, ACCOUNT_NAME, createPool, hashPassword, ensureSchema, setPassword } = require('./db.js');

const PORT = Number(process.env.PORT) || 8080;
const APP_DIR = path.resolve(__dirname, '..');
const MAX_BODY = 8 * 1024 * 1024;
const BATCH = 1500;

const KINDS = ['clients', 'cartes', 'versements', 'operations', 'activity', 'trash', 'clotures', 'recus', 'settings'];
const IMMUTABLE = { recus: true, activity: true };

const pool = createPool();

/* Schéma + compte unique. YVO_PASSWORD n'est lu que si aucun compte n'existe encore. */
async function init() {
  await ensureSchema(pool);
  const r = await pool.query('SELECT id FROM accounts WHERE name = $1', [ACCOUNT_NAME]);
  if (r.rows.length) return;
  const password = process.env.YVO_PASSWORD || '';
  if (!password) {
    const err = new Error('Premier démarrage : aucun compte n’existe. Définissez la variable YVO_PASSWORD (mot de passe d’Yvo) puis relancez le serveur.');
    err.fatal = true;
    throw err;
  }
  if (password.length < 6) {
    const err = new Error('YVO_PASSWORD est trop court (6 caractères minimum).');
    err.fatal = true;
    throw err;
  }
  await setPassword(pool, password);
  console.log('Compte « ' + ACCOUNT_NAME + ' » créé.');
}
const ready = init();
ready.catch(function () {}); // l'erreur est traitée par l'appelant (voir bas du fichier)

/* ---------- utilitaires ---------- */

const sha256 = function (s) { return crypto.createHash('sha256').update(s).digest('hex'); };
const nowIso = function () { return new Date().toISOString(); };
const esc = function (s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
};

/* Dates lisibles sur la page publique du reçu (heure du Gabon). */
function frDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? m[3] + '/' + m[2] + '/' + m[1] : String(iso || '');
}
function frDateTime(iso) {
  const d = new Date(iso);
  if (!iso || isNaN(d)) return '';
  return d.toLocaleString('fr-FR', { timeZone: 'Africa/Libreville', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function send(res, status, body, headers) {
  const isStr = typeof body === 'string' || Buffer.isBuffer(body);
  res.writeHead(status, Object.assign({
    'Content-Type': isStr ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store'
  }, headers || {}));
  res.end(isStr ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    const chunks = [];
    let size = 0;
    req.on('data', function (c) {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('too-large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', function () {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (e) { reject(new Error('bad-json')); }
    });
    req.on('error', reject);
  });
}

/* limitation des tentatives de connexion (par adresse IP) */
const TRUST_PROXY = /^(1|true|yes)$/i.test(String(process.env.TRUST_PROXY || ''));
const attempts = new Map();
function tooMany(key) {
  const now = Date.now();
  const list = (attempts.get(key) || []).filter(function (t) { return now - t < 10 * 60 * 1000; });
  if (list.length) attempts.set(key, list); else attempts.delete(key);
  return list.length >= 10;
}
function noteAttempt(key) { const l = attempts.get(key) || []; l.push(Date.now()); attempts.set(key, l); }
function forgetAttempt(key) { const l = attempts.get(key); if (l) { l.pop(); if (!l.length) attempts.delete(key); } }
// ménage régulier : la table des essais ne grossit pas sans fin
setInterval(function () { attempts.forEach(function (l, k) { tooMany(k); }); }, 10 * 60 * 1000).unref();

async function auth(req) {
  const h = String(req.headers.authorization || '');
  const m = /^Bearer\s+([a-f0-9]{64})$/i.exec(h);
  if (!m) return null;
  const r = await pool.query('UPDATE sessions SET last_seen = now() WHERE token_hash = $1 RETURNING *', [sha256(m[1])]);
  return r.rows[0] || null;
}

async function newSession(accountId, device) {
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query('INSERT INTO sessions (token_hash, account_id, device_id, device_name) VALUES ($1, $2, $3, $4)',
    [sha256(token), accountId, String(device.id || '').slice(0, 64), String(device.name || 'Appareil').slice(0, 60)]);
  return token;
}

/* ---------- synchronisation ---------- */

async function applyChanges(session, changes) {
  const applied = [];
  const conflicts = [];
  const forced = [];
  const acc = session.account_id;
  const dev = [session.device_id, session.device_name];
  const nowMs = Date.now();

  const c = await pool.connect();
  const event = async function (kind, id, op, dataStr, note) {
    const r = await c.query('INSERT INTO events (account_id, device_id, device_name, kind, rec_id, op, data, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING seq',
      [acc, dev[0], dev[1], kind, id, op, dataStr, note]);
    return r.rows[0].seq;
  };
  try {
    await c.query('BEGIN');
    // un seul envoi à la fois par compte : les seq sont attribués et validés dans l'ordre
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [acc]);
    for (const ch of changes) {
      if (!ch || KINDS.indexOf(ch.kind) < 0 || !ch.id || typeof ch.id !== 'string') continue;
      const id = ch.id.slice(0, 80);
      const u = Math.max(0, Math.min(Math.trunc(Number(ch.u)) || nowMs, nowMs + 5 * 60 * 1000));
      const deleted = !!ch.deleted;
      const dataStr = JSON.stringify(ch.data == null ? null : ch.data);
      const cur = (await c.query('SELECT * FROM records WHERE account_id = $1 AND kind = $2 AND id = $3', [acc, ch.kind, id])).rows[0];

      if (IMMUTABLE[ch.kind] && cur) {
        if (cur.data !== dataStr || deleted) {
          await event(ch.kind, id, 'rejected', dataStr, 'Modification refusée : cet élément est immuable (traçabilité).');
        }
        applied.push({ kind: ch.kind, id: id, rev: cur.rev, serverWon: true });
        forced.push({ kind: ch.kind, id: id, data: JSON.parse(cur.data), deleted: cur.deleted, rev: cur.rev });
        continue;
      }

      if (cur && !deleted && !cur.deleted && cur.data === dataStr) {
        applied.push({ kind: ch.kind, id: id, rev: cur.rev });
        continue;
      }

      if (cur && cur.rev !== (Number(ch.baseRev) || 0)) {
        // l'enregistrement a changé ailleurs depuis la dernière synchronisation de cet appareil
        // un appareil qui n'a jamais reçu cet enregistrement (nouveau téléphone) ne l'écrase pas
        const mineWins = (Number(ch.baseRev) || 0) > 0 && u >= Number(cur.u);
        await event(ch.kind, id, 'conflict', dataStr,
          'Conflit : version de ' + dev[1] + ' ' + (mineWins ? 'retenue (plus récente)' : 'non retenue (plus ancienne)') + '. Les deux versions sont conservées dans l’historique.');
        conflicts.push({ kind: ch.kind, id: id, winner: mineWins ? 'device' : 'server', at: nowIso() });
        if (!mineWins) {
          applied.push({ kind: ch.kind, id: id, rev: cur.rev, serverWon: true });
          forced.push({ kind: ch.kind, id: id, data: JSON.parse(cur.data), deleted: cur.deleted, rev: cur.rev });
          continue;
        }
      }

      const rev = (cur ? cur.rev : 0) + 1;
      const op = !cur ? 'created' : deleted ? 'deleted' : 'updated';
      const seq = await event(ch.kind, id, op, dataStr, null);
      await c.query('INSERT INTO records (account_id, kind, id, data, deleted, rev, u, seq) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ' +
        'ON CONFLICT (account_id, kind, id) DO UPDATE SET data = EXCLUDED.data, deleted = EXCLUDED.deleted, rev = EXCLUDED.rev, u = EXCLUDED.u, seq = EXCLUDED.seq',
        [acc, ch.kind, id, dataStr, deleted, rev, u, seq]);
      applied.push({ kind: ch.kind, id: id, rev: rev });

      if (ch.kind === 'recus' && ch.data && ch.data.token) {
        await c.query('INSERT INTO public_receipts (token, account_id, rec_id) VALUES ($1,$2,$3) ON CONFLICT (token) DO NOTHING', [String(ch.data.token), acc, id]);
      }
    }
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK').catch(function () {});
    throw e;
  } finally {
    c.release();
  }
  return { applied: applied, conflicts: conflicts, forced: forced };
}

async function head(accountId) {
  return (await pool.query('SELECT COALESCE(MAX(seq), 0) AS s FROM records WHERE account_id = $1', [accountId])).rows[0].s;
}

async function handleSync(session, body) {
  body = body && typeof body === 'object' ? body : {};
  const changes = Array.isArray(body.changes) ? body.changes.slice(0, BATCH) : [];
  const since = Math.max(0, Math.min(Math.trunc(Number(body.since)) || 0, Number.MAX_SAFE_INTEGER));
  const res = await applyChanges(session, changes);
  const rows = (await pool.query('SELECT kind, id, data, deleted, rev, seq FROM records WHERE account_id = $1 AND seq > $2 ORDER BY seq LIMIT $3',
    [session.account_id, since, BATCH])).rows;
  const own = {};
  res.applied.forEach(function (a) { own[a.kind + ':' + a.id] = true; });
  const out = [];
  rows.forEach(function (r) {
    const k = r.kind + ':' + r.id;
    if (own[k]) return; // déjà connu de l'appareil (il vient de l'envoyer)
    out.push({ kind: r.kind, id: r.id, data: JSON.parse(r.data), deleted: r.deleted, rev: r.rev, seq: r.seq });
  });
  res.forced.forEach(function (f) { out.push(f); });
  const more = rows.length >= BATCH;
  // le curseur ne dépasse jamais les lignes réellement lues (sinon une écriture concurrente serait sautée)
  const seq = rows.length ? Number(rows[rows.length - 1].seq) : since;
  return { ok: true, seq: seq, more: more, applied: res.applied, conflicts: res.conflicts, changes: out, serverTime: Date.now() };
}

/* ---------- reçu public ---------- */

function receiptPage(rec, verified) {
  const lignes = (rec.lignes || []).map(function (l) {
    return '<tr><td>' + esc(l.carte) + '</td><td class="r">' + esc(Number(l.montant).toLocaleString('fr-FR')) + ' ' + esc(rec.devise || '') + '</td></tr>';
  }).join('');
  return '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="robots" content="noindex"><title>Reçu ' + esc(rec.numero) + '</title><style>' +
    'body{margin:0;background:#efeadc;font-family:system-ui,Segoe UI,Arial,sans-serif;color:#15231d;padding:18px}' +
    '.c{max-width:440px;margin:0 auto;background:#fffdf9;border-radius:22px;overflow:hidden;box-shadow:0 20px 50px -20px rgba(10,40,30,.5)}' +
    '.h{background:linear-gradient(150deg,#0e5c45,#062a1f);color:#fff;padding:22px}.h small{opacity:.75;letter-spacing:.12em;text-transform:uppercase;font-size:11px}' +
    '.h h1{margin:4px 0 0;font-size:22px}.a{padding:22px;text-align:center}.a strong{font-size:34px;display:block}.a span{color:#77817a;font-size:13px}' +
    'table{width:100%;border-collapse:collapse;margin:0 22px;width:calc(100% - 44px)}td{padding:9px 0;border-top:1px solid #e5dfd1;font-size:14px}.r{text-align:right;font-weight:600}' +
    '.v{margin:18px 22px;padding:12px 14px;border-radius:14px;font-size:13px;line-height:1.45}.ok{background:#e3f3ea;color:#0f7656}.bad{background:#fbe9e6;color:#a63c33}' +
    '.f{padding:0 22px 22px;color:#77817a;font-size:12px;line-height:1.5}code{background:#f3f0e7;padding:2px 6px;border-radius:6px}</style></head><body><div class="c">' +
    '<div class="h"><small>Reçu de paiement</small><h1>' + esc(rec.entreprise || 'YVO Épargne') + '</h1></div>' +
    '<div class="a"><span>Montant reçu</span><strong>' + esc(Number(rec.total).toLocaleString('fr-FR')) + ' ' + esc(rec.devise || '') + '</strong><span>' + esc(rec.clientNom) + '</span></div>' +
    '<table>' + lignes +
    '<tr><td>Total payé à ce jour</td><td class="r">' + esc(Number(rec.cumul).toLocaleString('fr-FR')) + '</td></tr>' +
    '<tr><td>Retard restant</td><td class="r">' + esc(Number(rec.retard) > 0 ? Number(rec.retard).toLocaleString('fr-FR') : 'À jour') + '</td></tr>' +
    '<tr><td>Payé par</td><td class="r">' + (rec.mode === 'airtel' || rec.mode === 'moov' ? '<img src="/img/' + rec.mode + '-money.png" alt="" height="22" style="vertical-align:middle;border-radius:4px;margin-right:6px">' : '') + esc(({ airtel: 'Airtel Money', moov: 'Moov Money' })[rec.mode] || 'Espèces') + (rec.ref ? ' · réf. ' + esc(rec.ref) : '') + '</td></tr>' +
    '<tr><td>Date</td><td class="r">' + esc(frDate(rec.date)) + '</td></tr><tr><td>N° du reçu</td><td class="r">' + esc(rec.numero) + '</td></tr></table>' +
    '<div class="v ' + (verified ? 'ok' : 'bad') + '">' + (verified
      ? '✔ <b>Reçu authentique.</b> Il est enregistré sur le serveur de ' + esc(rec.entreprise || 'l’entreprise') + ' et son contenu n’a pas été modifié. Code de contrôle : <code>' + esc(rec.code) + '</code>'
      : '✖ <b>Attention :</b> le contenu de ce reçu ne correspond pas à son code de contrôle.') + '</div>' +
    '<div class="f">Établi par ' + esc(rec.collecteur || '') + ' · ' + esc(frDateTime(rec.at)) + '</div></div></body></html>';
}

/* ---------- fichiers statiques ---------- */

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json'
};
const PUBLIC_FILES = /^(\/index\.html|\/styles\.css|\/premium\.css|\/sw\.js|\/manifest\.webmanifest|\/icon\.svg|\/icon-192\.png|\/icon-512\.png|\/apple-touch-icon\.png|\/js\/[a-z0-9-]+\.js|\/img\/[a-z0-9-]+\.png)$/;
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

function serveStatic(req, res, pathname) {
  if (pathname === '/') pathname = '/index.html';
  if (!PUBLIC_FILES.test(pathname)) return send(res, 404, 'Introuvable');
  const file = path.join(APP_DIR, pathname);
  if (!file.startsWith(APP_DIR)) return send(res, 403, 'Interdit');
  fs.readFile(file, function (err, buf) {
    if (err) return send(res, 404, 'Introuvable');
    const ext = path.extname(file);
    const h = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    };
    if (ext === '.html') { h['Content-Security-Policy'] = CSP; h['X-Frame-Options'] = 'DENY'; }
    if (ext === '.js' && pathname === '/sw.js') h['Service-Worker-Allowed'] = '/';
    if (req.headers['x-forwarded-proto'] === 'https') h['Strict-Transport-Security'] = 'max-age=31536000';
    res.writeHead(200, h);
    res.end(buf);
  });
}


/* ---------- routes ---------- */

const API_ROUTES = { '/api/health': 1, '/api/login': 1, '/api/sync': 1, '/api/logout': 1, '/api/me': 1, '/api/audit': 1, '/api/export': 1 };

async function route(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  // derrière un proxy inverse, la DERNIÈRE adresse de X-Forwarded-For est celle ajoutée par le proxy (non falsifiable)
  // X-Forwarded-For n'est cru que derrière un proxy inverse déclaré (TRUST_PROXY=1) : sa DERNIÈRE adresse est celle ajoutée par le proxy
  const ip = TRUST_PROXY && req.headers['x-forwarded-for']
    ? String(req.headers['x-forwarded-for']).split(',').pop().trim()
    : String(req.socket.remoteAddress || '');

  if (p === '/api/health') {
    try {
      await ready;
      await pool.query('SELECT 1');
      return send(res, 200, { ok: true, time: nowIso(), db: true });
    } catch (e) {
      return send(res, 503, { ok: false });
    }
  }

  if (p.indexOf('/api/') === 0 && !API_ROUTES[p]) return send(res, 404, { error: 'Route inconnue.' });
  if (p.indexOf('/api/') === 0 || p.indexOf('/r/') === 0) await ready;

  if (p === '/api/login' && req.method === 'POST') {
    let b = await readBody(req);
    b = b && typeof b === 'object' ? b : {};
    const key = ip;
    if (tooMany(key)) return send(res, 429, { error: 'Trop de tentatives. Réessayez dans quelques minutes.' });
    noteAttempt(key); // compté AVANT le calcul (lent) : des essais en parallèle ne passent pas entre les mailles
    const acc = (await pool.query('SELECT * FROM accounts WHERE name = $1', [ACCOUNT_NAME])).rows[0];
    const ok = !!acc && crypto.timingSafeEqual(Buffer.from(await hashPassword(String(b.password || ''), acc.salt), 'hex'), Buffer.from(acc.hash, 'hex'));
    if (!ok) return send(res, 401, { error: 'Mot de passe incorrect.' });
    forgetAttempt(key);
    const device = b.device && typeof b.device === 'object' ? b.device : {};
    return send(res, 200, { ok: true, token: await newSession(acc.id, device), account: ACCOUNT_NAME });
  }

  if (p.indexOf('/r/') === 0 && req.method === 'GET') {
    const token = p.slice(3).replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);
    const pub = (await pool.query('SELECT * FROM public_receipts WHERE token = $1', [token])).rows[0];
    if (!pub) return send(res, 404, 'Reçu introuvable.');
    const row = (await pool.query("SELECT data, deleted FROM records WHERE account_id = $1 AND kind = 'recus' AND id = $2", [pub.account_id, pub.rec_id])).rows[0];
    if (!row || row.deleted) return send(res, 404, 'Reçu introuvable.');
    const rec = JSON.parse(row.data);
    const verified = ReceiptCode.compute(rec) === rec.code;
    return send(res, 200, receiptPage(rec, verified), {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'"
    });
  }

  if (p.indexOf('/api/') === 0) {
    const session = await auth(req);
    if (!session) return send(res, 401, { error: 'Session expirée. Reconnectez-vous.' });
    const acc = session.account_id;

    if (p === '/api/sync' && req.method === 'POST') return send(res, 200, await handleSync(session, await readBody(req)));
    if (p === '/api/logout' && req.method === 'POST') {
      await pool.query('DELETE FROM sessions WHERE token_hash = $1', [session.token_hash]);
      return send(res, 200, { ok: true });
    }
    if (p === '/api/me') {
      const counts = {};
      (await pool.query('SELECT kind, COUNT(*) AS n FROM records WHERE account_id = $1 AND NOT deleted GROUP BY kind', [acc])).rows
        .forEach(function (r) { counts[r.kind] = r.n; });
      const devices = (await pool.query('SELECT device_id, device_name, created_at, last_seen FROM sessions WHERE account_id = $1 ORDER BY last_seen DESC', [acc])).rows;
      return send(res, 200, { ok: true, counts: counts, head: await head(acc), devices: devices });
    }
    if (p === '/api/audit') {
      const kind = url.searchParams.get('kind');
      const id = url.searchParams.get('id');
      if (kind && id) {
        return send(res, 200, { ok: true, events: (await pool.query('SELECT seq, at, device_name, kind, rec_id, op, data, note FROM events WHERE account_id = $1 AND kind = $2 AND rec_id = $3 ORDER BY seq DESC LIMIT 100', [acc, kind, id])).rows });
      }
      const limit = Math.max(1, Math.min(Math.trunc(Number(url.searchParams.get('limit'))) || 100, 500));
      return send(res, 200, { ok: true, events: (await pool.query('SELECT seq, at, device_name, kind, rec_id, op, note FROM events WHERE account_id = $1 ORDER BY seq DESC LIMIT $2', [acc, limit])).rows });
    }
    if (p === '/api/export') {
      const out = {};
      (await pool.query('SELECT kind, data FROM records WHERE account_id = $1 AND NOT deleted ORDER BY seq', [acc])).rows
        .forEach(function (r) { (out[r.kind] = out[r.kind] || []).push(JSON.parse(r.data)); });
      return send(res, 200, { ok: true, exportedAt: nowIso(), data: out }, { 'Content-Disposition': 'attachment; filename="yvo-serveur-' + nowIso().slice(0, 10) + '.json"' });
    }
    return send(res, 404, { error: 'Route inconnue.' });
  }

  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, p);
  return send(res, 405, 'Méthode non autorisée');
}

const server = http.createServer(function (req, res) {
  route(req, res).catch(function (err) {
    const status = err.message === 'too-large' ? 413 : err.message === 'bad-json' ? 400 : 500;
    if (status === 500) console.error(err);
    if (!res.headersSent) send(res, status, { error: status === 500 ? 'Erreur du serveur.' : 'Requête invalide.' });
  });
});

/* ---------- démarrage / arrêt ---------- */

function shutdown(signal) {
  console.log('Arrêt demandé (' + signal + ')…');
  const force = setTimeout(function () { process.exit(1); }, 10000);
  force.unref();
  server.close(function () {
    pool.end().then(function () { process.exit(0); }, function () { process.exit(1); });
  });
  server.closeIdleConnections();
}

if (require.main === module) {
  ready.then(function () {
    server.listen(PORT, function () {
      console.log('YVO Épargne — serveur prêt sur http://localhost:' + PORT + ' (base : ' + DATABASE_URL.replace(/\/\/([^:@/]+):[^@/]*@/, '//$1:***@') + ')');
    });
    process.on('SIGTERM', function () { shutdown('SIGTERM'); });
    process.on('SIGINT', function () { shutdown('SIGINT'); });
  }, function (err) {
    console.error(err.fatal ? '✖ ' + err.message : '✖ Impossible de préparer la base PostgreSQL : ' + err.message);
    pool.end().catch(function () {}).then(function () { process.exit(1); });
  });
}

module.exports = { server, pool, ready };
