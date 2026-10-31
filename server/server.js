'use strict';

/* ============================================================
   YVO Épargne — serveur de synchronisation (zéro dépendance)
   Node 22+ : http + node:sqlite + crypto.

   - Sert l'application (fichiers statiques) ET l'API sur la même adresse
   - Comptes protégés par mot de passe (scrypt), jetons par appareil
   - Synchronisation par enregistrement avec détection de conflits
   - Journal d'audit IMMUABLE : chaque changement est conservé
   - Reçus publics vérifiables : GET /r/<jeton>
   - Sauvegarde quotidienne de la base (14 jours conservés)
   ============================================================ */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const ReceiptCode = require('../js/receipt-code.js');

const PORT = Number(process.env.PORT) || 8080;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const SETUP_CODE = process.env.SETUP_CODE || '';          // protège la création de compte
const REGISTRATION = (process.env.REGISTRATION || 'open'); // open | closed (après création)
const APP_DIR = path.resolve(__dirname, '..');
const MAX_BODY = 8 * 1024 * 1024;
const BATCH = 1500;

fs.mkdirSync(path.join(DATA_DIR, 'backups'), { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'yvo.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = FULL;
  CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, device_id TEXT, device_name TEXT, created_at TEXT NOT NULL, last_seen TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS records (account_id TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, rev INTEGER NOT NULL, u INTEGER NOT NULL, seq INTEGER NOT NULL, PRIMARY KEY (account_id, kind, id));
  CREATE INDEX IF NOT EXISTS records_seq ON records (account_id, seq);
  CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT NOT NULL, at TEXT NOT NULL, device_id TEXT, device_name TEXT, kind TEXT NOT NULL, rec_id TEXT NOT NULL, op TEXT NOT NULL, data TEXT, note TEXT);
  CREATE INDEX IF NOT EXISTS events_rec ON events (account_id, kind, rec_id);
  CREATE TABLE IF NOT EXISTS public_receipts (token TEXT PRIMARY KEY, account_id TEXT NOT NULL, rec_id TEXT NOT NULL);
`);

const KINDS = ['clients', 'cartes', 'versements', 'operations', 'activity', 'trash', 'clotures', 'recus', 'settings'];
const IMMUTABLE = { recus: true, activity: true };

const q = {
  accountByName: db.prepare('SELECT * FROM accounts WHERE name = ?'),
  accountCount: db.prepare('SELECT COUNT(*) AS n FROM accounts'),
  insertAccount: db.prepare('INSERT INTO accounts (id, name, salt, hash, created_at) VALUES (?,?,?,?,?)'),
  insertSession: db.prepare('INSERT INTO sessions (token_hash, account_id, device_id, device_name, created_at, last_seen) VALUES (?,?,?,?,?,?)'),
  sessionByHash: db.prepare('SELECT * FROM sessions WHERE token_hash = ?'),
  touchSession: db.prepare('UPDATE sessions SET last_seen = ? WHERE token_hash = ?'),
  deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
  getRecord: db.prepare('SELECT * FROM records WHERE account_id = ? AND kind = ? AND id = ?'),
  upsertRecord: db.prepare('INSERT INTO records (account_id, kind, id, data, deleted, rev, u, seq) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(account_id, kind, id) DO UPDATE SET data=excluded.data, deleted=excluded.deleted, rev=excluded.rev, u=excluded.u, seq=excluded.seq'),
  insertEvent: db.prepare('INSERT INTO events (account_id, at, device_id, device_name, kind, rec_id, op, data, note) VALUES (?,?,?,?,?,?,?,?,?)'),
  since: db.prepare('SELECT kind, id, data, deleted, rev, seq FROM records WHERE account_id = ? AND seq > ? ORDER BY seq LIMIT ?'),
  head: db.prepare('SELECT COALESCE(MAX(seq),0) AS s FROM records WHERE account_id = ?'),
  audit: db.prepare('SELECT seq, at, device_name, kind, rec_id, op, note FROM events WHERE account_id = ? ORDER BY seq DESC LIMIT ?'),
  auditRec: db.prepare('SELECT seq, at, device_name, kind, rec_id, op, data, note FROM events WHERE account_id = ? AND kind = ? AND rec_id = ? ORDER BY seq DESC LIMIT 100'),
  allRecords: db.prepare('SELECT kind, id, data, deleted, rev FROM records WHERE account_id = ? AND deleted = 0'),
  counts: db.prepare('SELECT kind, COUNT(*) AS n FROM records WHERE account_id = ? AND deleted = 0 GROUP BY kind'),
  insertPublic: db.prepare('INSERT OR IGNORE INTO public_receipts (token, account_id, rec_id) VALUES (?,?,?)'),
  publicByToken: db.prepare('SELECT * FROM public_receipts WHERE token = ?'),
  devices: db.prepare('SELECT device_id, device_name, created_at, last_seen FROM sessions WHERE account_id = ? ORDER BY last_seen DESC')
};

/* ---------- utilitaires ---------- */

const sha256 = function (s) { return crypto.createHash('sha256').update(s).digest('hex'); };
const nowIso = function () { return new Date().toISOString(); };
const esc = function (s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
};

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

/* limitation des tentatives de connexion */
const attempts = new Map();
function tooMany(key) {
  const now = Date.now();
  const list = (attempts.get(key) || []).filter(function (t) { return now - t < 10 * 60 * 1000; });
  attempts.set(key, list);
  return list.length >= 10;
}
function noteAttempt(key) { const l = attempts.get(key) || []; l.push(Date.now()); attempts.set(key, l); }

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function auth(req) {
  const h = String(req.headers.authorization || '');
  const m = /^Bearer\s+([a-f0-9]{64})$/i.exec(h);
  if (!m) return null;
  const hash = sha256(m[1]);
  const s = q.sessionByHash.get(hash);
  if (!s) return null;
  q.touchSession.run(nowIso(), hash);
  return s;
}

function newSession(accountId, device) {
  const token = crypto.randomBytes(32).toString('hex');
  q.insertSession.run(sha256(token), accountId, String(device.id || '').slice(0, 64), String(device.name || 'Appareil').slice(0, 60), nowIso(), nowIso());
  return token;
}

/* ---------- synchronisation ---------- */

function applyChanges(session, changes) {
  const applied = [];
  const conflicts = [];
  const forced = [];
  const acc = session.account_id;
  const dev = [session.device_id, session.device_name];
  const nowMs = Date.now();

  db.exec('BEGIN IMMEDIATE');
  try {
    changes.forEach(function (ch) {
      if (!ch || KINDS.indexOf(ch.kind) < 0 || !ch.id || typeof ch.id !== 'string') return;
      const id = ch.id.slice(0, 80);
      const u = Math.min(Number(ch.u) || nowMs, nowMs + 5 * 60 * 1000);
      const deleted = ch.deleted ? 1 : 0;
      const dataStr = JSON.stringify(ch.data == null ? null : ch.data);
      const cur = q.getRecord.get(acc, ch.kind, id);

      if (IMMUTABLE[ch.kind] && cur) {
        if (cur.data !== dataStr || deleted) {
          q.insertEvent.run(acc, nowIso(), dev[0], dev[1], ch.kind, id, 'rejected', dataStr, 'Modification refusée : cet élément est immuable (traçabilité).');
        }
        applied.push({ kind: ch.kind, id: id, rev: cur.rev, serverWon: true });
        forced.push({ kind: ch.kind, id: id, data: JSON.parse(cur.data), deleted: !!cur.deleted, rev: cur.rev });
        return;
      }

      if (cur && !deleted && !cur.deleted && cur.data === dataStr) {
        applied.push({ kind: ch.kind, id: id, rev: cur.rev });
        return;
      }

      if (cur && cur.rev !== (Number(ch.baseRev) || 0)) {
        // l'enregistrement a changé ailleurs depuis la dernière synchronisation de cet appareil
        const mineWins = u >= cur.u;
        q.insertEvent.run(acc, nowIso(), dev[0], dev[1], ch.kind, id, 'conflict', dataStr,
          'Conflit : version de ' + dev[1] + ' ' + (mineWins ? 'retenue (plus récente)' : 'non retenue (plus ancienne)') + '. Les deux versions sont conservées dans l’historique.');
        conflicts.push({ kind: ch.kind, id: id, winner: mineWins ? 'device' : 'server', at: nowIso() });
        if (!mineWins) {
          applied.push({ kind: ch.kind, id: id, rev: cur.rev, serverWon: true });
          forced.push({ kind: ch.kind, id: id, data: JSON.parse(cur.data), deleted: !!cur.deleted, rev: cur.rev });
          return;
        }
      }

      const rev = (cur ? cur.rev : 0) + 1;
      const op = !cur ? 'created' : deleted ? 'deleted' : 'updated';
      const r = q.insertEvent.run(acc, nowIso(), dev[0], dev[1], ch.kind, id, op, dataStr, null);
      const seq = Number(r.lastInsertRowid);
      q.upsertRecord.run(acc, ch.kind, id, dataStr, deleted, rev, u, seq);
      applied.push({ kind: ch.kind, id: id, rev: rev });

      if (ch.kind === 'recus' && ch.data && ch.data.token) q.insertPublic.run(String(ch.data.token), acc, id);
    });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { applied: applied, conflicts: conflicts, forced: forced };
}

function handleSync(session, body) {
  const changes = Array.isArray(body.changes) ? body.changes.slice(0, BATCH) : [];
  const since = Number(body.since) || 0;
  const res = applyChanges(session, changes);
  const rows = q.since.all(session.account_id, since, BATCH);
  const own = {};
  res.applied.forEach(function (a) { own[a.kind + ':' + a.id] = true; });
  const out = [];
  rows.forEach(function (r) {
    const k = r.kind + ':' + r.id;
    if (own[k]) return; // déjà connu de l'appareil (il vient de l'envoyer)
    out.push({ kind: r.kind, id: r.id, data: JSON.parse(r.data), deleted: !!r.deleted, rev: r.rev, seq: r.seq });
  });
  res.forced.forEach(function (f) { out.push(f); });
  const more = rows.length >= BATCH;
  const seq = more ? rows[rows.length - 1].seq : q.head.get(session.account_id).s;
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
    '<div class="h"><small>Reçu de versement</small><h1>' + esc(rec.entreprise || 'YVO Épargne') + '</h1></div>' +
    '<div class="a"><span>Montant reçu</span><strong>' + esc(Number(rec.total).toLocaleString('fr-FR')) + ' ' + esc(rec.devise || '') + '</strong><span>' + esc(rec.clientNom) + '</span></div>' +
    '<table>' + lignes +
    '<tr><td>Total cotisé à ce jour</td><td class="r">' + esc(Number(rec.cumul).toLocaleString('fr-FR')) + '</td></tr>' +
    '<tr><td>Retard restant</td><td class="r">' + esc(Number(rec.retard) > 0 ? Number(rec.retard).toLocaleString('fr-FR') : 'À jour') + '</td></tr>' +
    '<tr><td>Payé par</td><td class="r">' + (rec.mode === 'airtel' || rec.mode === 'moov' ? '<img src="/img/' + rec.mode + '-money.png" alt="" height="22" style="vertical-align:middle;border-radius:4px;margin-right:6px">' : '') + esc(({ airtel: 'Airtel Money', moov: 'Moov Money' })[rec.mode] || 'Espèces') + (rec.ref ? ' · réf. ' + esc(rec.ref) : '') + '</td></tr>' +
    '<tr><td>Date</td><td class="r">' + esc(rec.date) + '</td></tr><tr><td>N° du reçu</td><td class="r">' + esc(rec.numero) + '</td></tr></table>' +
    '<div class="v ' + (verified ? 'ok' : 'bad') + '">' + (verified
      ? '✔ <b>Reçu authentique.</b> Il est enregistré sur le serveur de ' + esc(rec.entreprise || 'l’entreprise') + ' et son contenu n’a pas été modifié. Code de contrôle : <code>' + esc(rec.code) + '</code>'
      : '✖ <b>Attention :</b> le contenu de ce reçu ne correspond pas à son code de contrôle.') + '</div>' +
    '<div class="f">Établi par ' + esc(rec.collecteur || '') + ' · ' + esc(rec.at || '') + '</div></div></body></html>';
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

async function route(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

  if (p === '/api/health') return send(res, 200, { ok: true, time: nowIso(), accounts: q.accountCount.get().n });

  if (p === '/api/register' && req.method === 'POST') {
    const b = await readBody(req);
    const name = String(b.name || '').trim().toLowerCase();
    const password = String(b.password || '');
    if (!/^[a-z0-9._-]{3,40}$/.test(name)) return send(res, 400, { error: 'Nom d’espace invalide (3 à 40 lettres, chiffres, . _ -).' });
    if (password.length < 6) return send(res, 400, { error: 'Mot de passe trop court (6 caractères minimum).' });
    if (SETUP_CODE && String(b.setupCode || '') !== SETUP_CODE) return send(res, 403, { error: 'Code d’installation incorrect.' });
    if (REGISTRATION === 'closed' && q.accountCount.get().n > 0) return send(res, 403, { error: 'La création d’espace est fermée sur ce serveur.' });
    if (q.accountByName.get(name)) return send(res, 409, { error: 'Cet espace existe déjà. Utilisez « Se connecter ».' });
    const id = crypto.randomUUID();
    const salt = crypto.randomBytes(16).toString('hex');
    q.insertAccount.run(id, name, salt, hashPassword(password, salt), nowIso());
    const token = newSession(id, b.device || {});
    return send(res, 200, { ok: true, token: token, account: name });
  }

  if (p === '/api/login' && req.method === 'POST') {
    const b = await readBody(req);
    const name = String(b.name || '').trim().toLowerCase();
    const key = ip + '|' + name;
    if (tooMany(key)) return send(res, 429, { error: 'Trop de tentatives. Réessayez dans quelques minutes.' });
    const acc = q.accountByName.get(name);
    const ok = acc && crypto.timingSafeEqual(Buffer.from(hashPassword(String(b.password || ''), acc.salt), 'hex'), Buffer.from(acc.hash, 'hex'));
    if (!ok) { noteAttempt(key); return send(res, 401, { error: 'Nom d’espace ou mot de passe incorrect.' }); }
    return send(res, 200, { ok: true, token: newSession(acc.id, b.device || {}), account: name });
  }

  if (p.indexOf('/r/') === 0 && req.method === 'GET') {
    const token = p.slice(3).replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);
    const pub = q.publicByToken.get(token);
    if (!pub) return send(res, 404, 'Reçu introuvable.');
    const row = q.getRecord.get(pub.account_id, 'recus', pub.rec_id);
    if (!row || row.deleted) return send(res, 404, 'Reçu introuvable.');
    const rec = JSON.parse(row.data);
    const verified = ReceiptCode.compute(rec) === rec.code;
    return send(res, 200, receiptPage(rec, verified), {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'"
    });
  }

  if (p.indexOf('/api/') === 0) {
    const session = auth(req);
    if (!session) return send(res, 401, { error: 'Session expirée. Reconnectez-vous.' });

    if (p === '/api/sync' && req.method === 'POST') return send(res, 200, handleSync(session, await readBody(req)));
    if (p === '/api/logout' && req.method === 'POST') {
      q.deleteSession.run(sha256(String(req.headers.authorization).slice(7)));
      return send(res, 200, { ok: true });
    }
    if (p === '/api/me') {
      const counts = {};
      q.counts.all(session.account_id).forEach(function (r) { counts[r.kind] = r.n; });
      return send(res, 200, { ok: true, counts: counts, head: q.head.get(session.account_id).s, devices: q.devices.all(session.account_id) });
    }
    if (p === '/api/audit') {
      const kind = url.searchParams.get('kind');
      const id = url.searchParams.get('id');
      if (kind && id) return send(res, 200, { ok: true, events: q.auditRec.all(session.account_id, kind, id) });
      return send(res, 200, { ok: true, events: q.audit.all(session.account_id, Math.min(Number(url.searchParams.get('limit')) || 100, 500)) });
    }
    if (p === '/api/export') {
      const out = {};
      q.allRecords.all(session.account_id).forEach(function (r) { (out[r.kind] = out[r.kind] || []).push(JSON.parse(r.data)); });
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

/* ---------- sauvegarde quotidienne ---------- */

function backupNow() {
  const file = path.join(DATA_DIR, 'backups', 'yvo-' + nowIso().slice(0, 10) + '.db');
  try {
    if (!fs.existsSync(file)) db.exec("VACUUM INTO '" + file.replace(/'/g, "''") + "'");
    const files = fs.readdirSync(path.join(DATA_DIR, 'backups')).filter(function (f) { return /^yvo-.*\.db$/.test(f); }).sort();
    files.slice(0, Math.max(0, files.length - 14)).forEach(function (f) { fs.unlinkSync(path.join(DATA_DIR, 'backups', f)); });
  } catch (e) { console.error('Sauvegarde impossible', e.message); }
}

if (require.main === module) {
  backupNow();
  setInterval(backupNow, 6 * 3600 * 1000).unref();
  server.listen(PORT, function () { console.log('YVO Épargne — serveur prêt sur http://localhost:' + PORT + ' (données : ' + DATA_DIR + ')'); });
}

module.exports = { server, db };
