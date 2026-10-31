'use strict';

/* ============================================================
   YVO Épargne — synchronisation avec le serveur

   L'application reste 100 % utilisable hors ligne : toutes les
   modifications sont gardées sur l'appareil puis envoyées dès
   qu'une connexion est disponible. Si le téléphone est perdu,
   il suffit de se connecter depuis un autre appareil.
   ============================================================ */

const SYNC_CFG_KEY = 'yvo.sync.v1';
const SYNC_KINDS = ['clients', 'cartes', 'versements', 'operations', 'activity', 'trash', 'clotures', 'recus'];
const SYNC_BATCH = 800;

let syncCfg = null;     // { server, token, account, deviceId, deviceName, lastSeq, lastOkAt }
let syncBase = null;    // { 'kind:id': { h: hash, r: rev } }
let syncTimer = 0;
let syncRunning = false;
let syncApplying = false;

const syncState = { status: 'off', pending: 0, error: null, lastOkAt: null, conflicts: [] };

function loadSyncCfg() {
  try { syncCfg = JSON.parse(localStorage.getItem(SYNC_CFG_KEY) || 'null'); } catch (err) { syncCfg = null; }
  if (syncCfg && !syncCfg.token) syncCfg = null;
  syncState.status = syncCfg ? 'idle' : 'off';
  syncState.lastOkAt = syncCfg ? syncCfg.lastOkAt || null : null;
}

function saveSyncCfg() {
  try {
    if (syncCfg) localStorage.setItem(SYNC_CFG_KEY, JSON.stringify(syncCfg));
    else localStorage.removeItem(SYNC_CFG_KEY);
  } catch (err) { /* ignore */ }
}

function loadSyncBase() {
  if (syncBase) return Promise.resolve(syncBase);
  return idbRun('kv', 'readonly', function (os) { return os.get('syncbase'); }).then(function (b) {
    syncBase = b && typeof b === 'object' ? b : {};
    return syncBase;
  });
}

function saveSyncBase() {
  return idbRun('kv', 'readwrite', function (os) { return os.put(syncBase || {}, 'syncbase'); });
}

function initSync() {
  loadSyncCfg();
  window.addEventListener('online', function () { scheduleSync(800); });
  window.addEventListener('offline', function () { if (syncCfg) { syncState.status = 'offline'; updateSyncPill(); } });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') scheduleSync(1200);
  });
  setInterval(function () { scheduleSync(0); }, 60000);
  if (syncCfg) scheduleSync(1500);
}

function deviceDefaultName() {
  const ua = navigator.userAgent || '';
  const kind = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Téléphone Android' : /Windows/.test(ua) ? 'Ordinateur Windows' : /Mac/.test(ua) ? 'Mac' : 'Appareil';
  return kind;
}

function newDeviceId() {
  return 'dv_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ------------------------------------------------------------
   Données synchronisées
   ------------------------------------------------------------ */

function syncedSettings() {
  const s = db.settings;
  return { company: s.company, devise: s.devise, indicatif: s.indicatif || '', soldeInitial: s.soldeInitial, seuilRisque: s.seuilRisque, commission: s.commission, cardTypes: s.cardTypes || null };
}

function hashOf(data) {
  return cyrb53text(JSON.stringify(data));
}

function cyrb53text(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i += 1) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function currentRecords() {
  const m = {};
  SYNC_KINDS.forEach(function (k) {
    (db[k] || []).forEach(function (r) { m[k + ':' + r.id] = { kind: k, id: r.id, data: r }; });
  });
  m['settings:main'] = { kind: 'settings', id: 'main', data: syncedSettings() };
  return m;
}

function computeChanges() {
  const cur = currentRecords();
  const now = Date.now();
  const changes = [];
  const hashes = {};
  Object.keys(cur).forEach(function (key) {
    const b = syncBase[key];
    const h = hashOf(cur[key].data);
    if (!b || b.h !== h) {
      changes.push({ kind: cur[key].kind, id: cur[key].id, data: cur[key].data, deleted: false, baseRev: b ? b.r : 0, u: now });
      hashes[key] = h;
    }
  });
  Object.keys(syncBase).forEach(function (key) {
    if (!cur[key]) {
      const i = key.indexOf(':');
      changes.push({ kind: key.slice(0, i), id: key.slice(i + 1), data: null, deleted: true, baseRev: syncBase[key].r, u: now });
      hashes[key] = 'deleted';
    }
  });
  return { changes: changes, hashes: hashes, total: changes.length };
}

function countPending() {
  if (!db || !syncBase) return 0;
  return computeChanges().total;
}

/* ------------------------------------------------------------
   Appels serveur
   ------------------------------------------------------------ */

function syncBaseUrl() {
  if (syncCfg && syncCfg.server) return syncCfg.server.replace(/\/+$/, '');
  return /^https?:$/.test(location.protocol) ? location.origin : '';
}

function syncApi(path, body, token) {
  const base = syncBaseUrl();
  if (!base) return Promise.reject(new Error('Adresse du serveur manquante.'));
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 30000) : 0;
  const headers = { 'Content-Type': 'application/json' };
  const tk = token || (syncCfg && syncCfg.token);
  if (tk) headers.Authorization = 'Bearer ' + tk;
  return fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined })
    .then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) {
          const err = new Error(j.error || 'Erreur ' + r.status);
          err.status = r.status;
          throw err;
        }
        return j;
      });
    })
    .finally(function () { if (timer) clearTimeout(timer); });
}

/* ------------------------------------------------------------
   Boucle de synchronisation
   ------------------------------------------------------------ */

function scheduleSync(delay) {
  if (!syncCfg) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(function () { syncNow(false); }, delay == null ? 2500 : delay);
}

function replaceInList(list, item) {
  const i = list.findIndex(function (x) { return x.id === item.id; });
  if (i >= 0) list[i] = item;
  else list.push(item);
}

function applyServerChange(ch, force) {
  const key = ch.kind + ':' + ch.id;
  if (ch.kind === 'settings') {
    const d = ch.data || {};
    const cur = hashOf(syncedSettings());
    const b = syncBase[key];
    if (!force && b && b.h !== cur) return false;
    db.settings.company = Object.assign({}, db.settings.company, d.company || {});
    ['devise', 'indicatif', 'soldeInitial', 'seuilRisque', 'commission'].forEach(function (f) { if (d[f] != null) db.settings[f] = d[f]; });
    syncBase[key] = { h: hashOf(syncedSettings()), r: ch.rev };
    return true;
  }
  if (SYNC_KINDS.indexOf(ch.kind) < 0) return false;
  const list = db[ch.kind];
  const local = list.find(function (x) { return x.id === ch.id; });
  const b = syncBase[key];
  if (!force) {
    if (local && (!b || b.h !== hashOf(local))) return false;   // modifié ici depuis : on ne l'écrase pas
    if (!local && b) return false;                              // supprimé ici, en attente d'envoi
  }
  if (ch.deleted) {
    if (local) db[ch.kind] = list.filter(function (x) { return x.id !== ch.id; });
    delete syncBase[key];
  } else {
    replaceInList(list, ch.data);
    syncBase[key] = { h: hashOf(ch.data), r: ch.rev };
  }
  return true;
}

/* Deux appareils ont pointé le même client le même jour : on additionne. */
function dedupeVersements() {
  const groups = {};
  db.versements.forEach(function (v) { (groups[v.carteId + '|' + v.date] = groups[v.carteId + '|' + v.date] || []).push(v); });
  let merged = 0;
  Object.keys(groups).forEach(function (k) {
    const g = groups[k];
    if (g.length < 2) return;
    g.sort(function (a, b) { return a.id.localeCompare(b.id); });
    const keep = g[0];
    const carte = carteById(keep.carteId);
    for (let i = 1; i < g.length; i += 1) {
      keep.montant = (Number(keep.montant) || 0) + (Number(g[i].montant) || 0);
      keep.historique = (keep.historique || []).concat(g[i].historique || []).sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); });
      if (g[i].note && keep.note !== g[i].note) keep.note = keep.note ? keep.note + ' · ' + g[i].note : g[i].note;
      db.versements = db.versements.filter(function (x) { return x.id !== g[i].id; });
      merged += 1;
    }
    keep.statut = statutFor(keep.montant, carte ? carte.montantJournalier : 0);
    keep.updatedAt = new Date().toISOString();
  });
  if (merged) {
    logActivity('systeme', merged + ' versement(s) saisi(s) le même jour sur deux appareils ont été additionnés (rien n’est perdu).');
  }
  return merged;
}

function syncNow(manual) {
  if (!syncCfg || !db || syncRunning) return Promise.resolve();
  if (state.locked && !manual) return Promise.resolve();
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    syncState.status = 'offline';
    updateSyncPill();
    return Promise.resolve();
  }
  syncRunning = true;
  syncState.status = 'syncing';
  syncState.error = null;
  updateSyncPill();

  const run = function (round) {
    return loadSyncBase().then(function () {
      const diff = computeChanges();
      const batch = diff.changes.slice(0, SYNC_BATCH);
      return syncApi('/api/sync', { since: syncCfg.lastSeq || 0, changes: batch }).then(function (resp) {
        syncApplying = true;
        try {
          const serverWon = {};
          resp.applied.forEach(function (a) {
            const key = a.kind + ':' + a.id;
            if (a.serverWon) serverWon[key] = true;
            const h = diff.hashes[key];
            if (h === 'deleted') delete syncBase[key];
            else if (h) syncBase[key] = { h: h, r: a.rev };
          });
          let changed = false;
          resp.changes.forEach(function (ch) {
            if (applyServerChange(ch, !!serverWon[ch.kind + ':' + ch.id])) changed = true;
          });
          if (resp.conflicts && resp.conflicts.length) {
            resp.conflicts.forEach(function (c) {
              syncState.conflicts.unshift({ at: new Date().toISOString(), kind: c.kind, id: c.id, winner: c.winner });
              logActivity('systeme', 'Conflit de modification détecté (' + c.kind + ') : la version ' + (c.winner === 'server' ? 'du serveur (plus récente)' : 'de cet appareil (plus récente)') + ' a été retenue. L’autre version reste dans l’historique du serveur.');
            });
            syncState.conflicts = syncState.conflicts.slice(0, 30);
            changed = true;
          }
          if (dedupeVersements()) changed = true;
          if (changed) saveDB();
        } finally { syncApplying = false; }
        syncCfg.lastSeq = resp.seq;
        saveSyncCfg();
        return saveSyncBase().then(function () {
          const remaining = diff.changes.length > batch.length || resp.more;
          if (remaining && round < 60) return run(round + 1);
          return null;
        });
      });
    });
  };

  return run(0).then(function () {
    syncState.status = 'idle';
    syncState.lastOkAt = Date.now();
    syncCfg.lastOkAt = syncState.lastOkAt;
    saveSyncCfg();
    syncState.pending = countPending();
  }).catch(function (err) {
    if (err && err.status === 401) {
      syncState.status = 'error';
      syncState.error = 'Session expirée : verrouillez puis reconnectez-vous avec Internet.';
    } else if (err && (err.name === 'AbortError' || err instanceof TypeError)) {
      syncState.status = 'offline';
      syncState.error = null;
    } else {
      syncState.status = 'error';
      syncState.error = (err && err.message) || 'Erreur de synchronisation';
    }
    try { syncState.pending = countPending(); } catch (e) { /* ignore */ }
  }).then(function () {
    syncRunning = false;
    updateSyncPill();
    if (typeof state !== 'undefined' && state.route && (state.route.name === 'sync' || state.route.name === 'tableau' || state.route.name === 'plus')) {
      if (typeof rerender === 'function') rerender();
    } else if (typeof rerender === 'function' && !syncApplying) {
      /* les écrans de saisie ne sont pas rafraîchis pour ne pas gêner l'utilisateur */
    }
    if (manual && typeof toast === 'function') {
      toast(syncState.status === 'idle' ? 'Synchronisé avec le serveur.' : syncState.status === 'offline' ? 'Hors ligne : les modifications sont gardées et seront envoyées plus tard.' : (syncState.error || 'Erreur'), syncState.status === 'idle' ? 'success' : 'info');
    }
  });
}

function updateSyncPill() {
  document.querySelectorAll('[data-sync-pill]').forEach(function (el) {
    el.hidden = !syncCfg;
    el.setAttribute('data-sync', syncState.status);
    el.setAttribute('title', syncStatusLabel());
  });
  const s = document.getElementById('side-sync');
  if (s) s.textContent = syncStatusLabel();
}

function syncStatusLabel() {
  if (!syncCfg) return 'Pas encore relié au serveur';
  if (syncState.status === 'syncing') return 'Envoi en cours…';
  if (syncState.status === 'offline') return 'Pas de réseau : tout est gardé sur le téléphone';
  if (syncState.status === 'error') return syncState.error || 'Erreur de synchronisation';
  return syncState.lastOkAt ? 'À jour · ' + fmtDateTime(new Date(syncState.lastOkAt).toISOString()).split(' à ')[1] : 'Connecté';
}

/* ------------------------------------------------------------
   Connexion / déconnexion
   ------------------------------------------------------------ */

function syncConnect(mode, form) {
  const device = { id: (syncCfg && syncCfg.deviceId) || newDeviceId(), name: form.deviceName || deviceDefaultName() };
  const body = { name: form.name, password: form.password, setupCode: form.setupCode, device: device };
  const prev = syncCfg;
  syncCfg = { server: form.server || '', token: '', account: form.name };
  return syncApi(mode === 'register' ? '/api/register' : '/api/login', body).then(function (r) {
    syncCfg = { server: form.server || '', token: r.token, account: r.account, deviceId: device.id, deviceName: device.name, lastSeq: 0, lastOkAt: null };
    saveSyncCfg();
    syncBase = {};
    return saveSyncBase().then(function () { return r; });
  }).catch(function (err) {
    syncCfg = prev;
    throw err;
  });
}

function syncDisconnect() {
  const tk = syncCfg && syncCfg.token;
  const done = function () {
    syncCfg = null;
    syncBase = {};
    saveSyncCfg();
    saveSyncBase();
    syncState.status = 'off';
    syncState.error = null;
  };
  if (!tk) { done(); return Promise.resolve(); }
  return syncApi('/api/logout', {}, tk).catch(function () { /* hors ligne : on déconnecte quand même */ }).then(done);
}
