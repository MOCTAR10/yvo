'use strict';

/* ============================================================
   YVO Épargne — stockage durable (zéro perte de données)

   Trois couches :
   1. localStorage  — copie synchrone, écrite à chaque modification
   2. IndexedDB     — stockage principal, plus robuste et plus grand
   3. Points de restauration automatiques (IndexedDB), conservés 40 versions
   + demande de stockage « persistant » pour que le navigateur
     ne nettoie jamais les données de l'application.
   ============================================================ */

const IDB_NAME = 'yvo-epargne';
const IDB_VERSION = 1;
const SNAP_MAX = 40;
const SNAP_EVERY_CHANGES = 20;
const SNAP_EVERY_MS = 4 * 3600 * 1000;

const storageInfo = {
  idb: false,
  persisted: null,
  lastSaveAt: null,
  lastSnapshotAt: null,
  snapshots: 0,
  recovered: null,
  error: null,
  quota: null,
  usage: null
};

let idbPromise = null;
let idbWriting = false;
let idbDirty = false;
let changesSinceSnapshot = 0;

/* ------------------------------------------------------------
   IndexedDB — primitives
   ------------------------------------------------------------ */

function idbOpen() {
  if (idbPromise) return idbPromise;
  idbPromise = new Promise(function (resolve) {
    if (!('indexedDB' in window)) { resolve(null); return; }
    let req;
    try { req = indexedDB.open(IDB_NAME, IDB_VERSION); } catch (err) { resolve(null); return; }
    req.onupgradeneeded = function () {
      const d = req.result;
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      if (!d.objectStoreNames.contains('snaps')) d.createObjectStore('snaps', { keyPath: 'id' });
    };
    req.onsuccess = function () { storageInfo.idb = true; resolve(req.result); };
    req.onerror = function () { storageInfo.error = 'IndexedDB indisponible'; resolve(null); };
    req.onblocked = function () { resolve(null); };
  });
  return idbPromise;
}

function idbRun(store, mode, fn) {
  return idbOpen().then(function (d) {
    if (!d) return null;
    return new Promise(function (resolve) {
      let out = null;
      try {
        const tx = d.transaction(store, mode);
        const os = tx.objectStore(store);
        const r = fn(os);
        if (r) r.onsuccess = function () { out = r.result; };
        tx.oncomplete = function () { resolve(out); };
        tx.onerror = tx.onabort = function () { storageInfo.error = 'Écriture IndexedDB échouée'; resolve(null); };
      } catch (err) {
        storageInfo.error = String(err && err.message || err);
        resolve(null);
      }
    });
  });
}

/* ------------------------------------------------------------
   Sauvegarde automatique (appelée par saveDB)
   ------------------------------------------------------------ */

function persistDB() {
  if (!db) return false;
  db.savedAt = Date.now();
  db.revision = (Number(db.revision) || 0) + 1;
  let json;
  /* l'application est utilisée dans une autre fenêtre : celle-ci n'écrit plus rien */
  if (typeof tabInactive !== 'undefined' && tabInactive) return true;
  try { json = JSON.stringify(db); } catch (err) { storageInfo.error = 'Sérialisation impossible'; return false; }

  let lsOk = true;
  try { localStorage.setItem(DB_KEY, json); } catch (err) { lsOk = false; }

  storageInfo.lastSaveAt = db.savedAt;
  if (typeof scheduleSync === 'function' && !syncApplying) { markDirtySoon(); scheduleSync(); }
  idbDirty = true;
  flushIdb();

  changesSinceSnapshot += 1;
  if (changesSinceSnapshot >= SNAP_EVERY_CHANGES ||
      (storageInfo.lastSnapshotAt && Date.now() - storageInfo.lastSnapshotAt > SNAP_EVERY_MS)) {
    takeSnapshot('auto');
  }
  return lsOk || storageInfo.idb;
}

function flushIdb() {
  if (idbWriting || !idbDirty) return;
  idbWriting = true;
  idbDirty = false;
  let json;
  try { json = JSON.stringify(db); } catch (err) { idbWriting = false; return; }
  idbRun('kv', 'readwrite', function (os) { return os.put(json, 'db'); }).then(function () {
    idbWriting = false;
    if (idbDirty) flushIdb();
  });
}

/* ------------------------------------------------------------
   Chargement : on retient la copie la plus récente
   ------------------------------------------------------------ */

function parseStored(text) {
  if (!text) return null;
  try {
    const o = JSON.parse(text);
    return o && typeof o === 'object' && Array.isArray(o.clients) ? o : null;
  } catch (err) { return null; }
}

function loadBestDB() {
  let ls = null;
  try { ls = parseStored(localStorage.getItem(DB_KEY)); } catch (err) { ls = null; }

  return idbRun('kv', 'readonly', function (os) { return os.get('db'); }).then(function (raw) {
    const idbCopy = parseStored(raw);
    let best = null;
    if (ls && idbCopy) best = (Number(idbCopy.savedAt) || 0) >= (Number(ls.savedAt) || 0) ? idbCopy : ls;
    else best = idbCopy || ls;
    if (best) return { data: best, source: best === idbCopy ? 'idb' : 'local' };
    // Aucune copie lisible : on tente le dernier point de restauration
    return listSnapshots(true).then(function (snaps) {
      for (let i = 0; i < snaps.length; i += 1) {
        const o = parseStored(snaps[i].data);
        if (o) {
          storageInfo.recovered = snaps[i].id;
          return { data: o, source: 'snapshot' };
        }
      }
      return null;
    });
  });
}

/* ------------------------------------------------------------
   Points de restauration
   ------------------------------------------------------------ */

function takeSnapshot(reason) {
  if (!db) return Promise.resolve(false);
  changesSinceSnapshot = 0;
  storageInfo.lastSnapshotAt = Date.now();
  let json;
  try { json = JSON.stringify(db); } catch (err) { return Promise.resolve(false); }
  const snap = {
    id: new Date().toISOString(),
    reason: reason || 'auto',
    clients: db.clients.length,
    versements: db.versements.length,
    caisse: typeof cashBalance === 'function' ? cashBalance() : 0,
    data: json
  };
  return idbRun('snaps', 'readwrite', function (os) { return os.put(snap); }).then(function () {
    return pruneSnapshots();
  }).then(function () { return true; });
}

function pruneSnapshots() {
  return idbRun('snaps', 'readonly', function (os) { return os.getAllKeys(); }).then(function (keys) {
    keys = keys || [];
    storageInfo.snapshots = Math.min(keys.length, SNAP_MAX);
    if (keys.length <= SNAP_MAX) return null;
    keys.sort();
    const drop = keys.slice(0, keys.length - SNAP_MAX);
    return idbRun('snaps', 'readwrite', function (os) {
      drop.forEach(function (k) { os.delete(k); });
      return null;
    });
  });
}

function listSnapshots(withData) {
  return idbRun('snaps', 'readonly', function (os) { return os.getAll(); }).then(function (all) {
    all = (all || []).sort(function (a, b) { return b.id.localeCompare(a.id); });
    storageInfo.snapshots = all.length;
    if (withData) return all;
    return all.map(function (s) {
      return { id: s.id, reason: s.reason, clients: s.clients, versements: s.versements, caisse: s.caisse };
    });
  });
}

function restoreSnapshot(id) {
  return idbRun('snaps', 'readonly', function (os) { return os.get(id); }).then(function (snap) {
    if (!snap) return false;
    const o = parseStored(snap.data);
    if (!o) return false;
    return takeSnapshot('avant-restauration').then(function () {
      db = normalizeDB(o);
      logActivity('systeme', 'Restauration du point du ' + fmtDateTime(snap.id));
      saveDB();
      return true;
    });
  });
}

/* ------------------------------------------------------------
   Stockage persistant + occupation
   ------------------------------------------------------------ */

function requestPersistence() {
  if (!navigator.storage) return Promise.resolve();
  const steps = [];
  if (navigator.storage.persisted) {
    steps.push(navigator.storage.persisted().then(function (p) { storageInfo.persisted = p; }).catch(function () {}));
  }
  return Promise.all(steps).then(function () {
    if (storageInfo.persisted || !navigator.storage.persist) return null;
    return navigator.storage.persist().then(function (granted) { storageInfo.persisted = granted; }).catch(function () {});
  }).then(function () {
    if (!navigator.storage.estimate) return null;
    return navigator.storage.estimate().then(function (e) {
      storageInfo.quota = e.quota || null;
      storageInfo.usage = e.usage || null;
    }).catch(function () {});
  });
}

function initStorageGuards() {
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && db) {
      idbDirty = true;
      flushIdb();
      if (changesSinceSnapshot > 0) takeSnapshot('fermeture');
    }
  });
  window.addEventListener('pagehide', function () {
    if (db) { idbDirty = true; flushIdb(); }
  });
}

/* ------------------------------------------------------------
   Export / partage
   ------------------------------------------------------------ */

function backupPayload() {
  return {
    app: 'YVO Épargne',
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    data: db
  };
}

function downloadFile(filename, text, mime) {
  const blob = new Blob([text], { type: mime || 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
}

function shareFileOrDownload(filename, text, mime, title) {
  try {
    const file = new File([text], filename, { type: mime || 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
      return navigator.share({ files: [file], title: title || filename }).then(function () { return 'shared'; }).catch(function (err) {
        if (err && err.name === 'AbortError') return 'cancelled';
        downloadFile(filename, text, mime);
        return 'downloaded';
      });
    }
  } catch (err) { /* repli téléchargement */ }
  downloadFile(filename, text, mime);
  return Promise.resolve('downloaded');
}

function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCSV(rows) {
  return '﻿' + rows.map(function (r) { return r.map(csvCell).join(';'); }).join('\r\n');
}

function csvClients() {
  const rows = [['Nom', 'Téléphone', 'Quartier', 'Adresse', 'Profession', 'Pièce', 'Inscription', 'Cartes', 'Journalier', 'Total cotisé', 'Total retiré', 'Solde dû', 'Retard', 'Dernier versement', 'Statut']];
  db.clients.forEach(function (c) {
    const t = clientTotals(c);
    rows.push([c.nom, c.telephone, c.quartier, c.adresse, c.profession, [c.pieceType, c.pieceNumero].filter(Boolean).join(' '),
      c.dateInscription, t.nbCartes, t.journalier, t.totalVerse, t.totalRetire, t.solde, t.retard, t.dernier || '', c.actif === false ? 'Inactif' : 'Actif']);
  });
  return toCSV(rows);
}

function csvVersements() {
  const rows = [['Date', 'Client', 'Quartier', 'Carte', 'Montant', 'Statut', 'Espèces', 'Airtel Money', 'Moov Money', 'Note']];
  db.versements.slice().sort(function (a, b) { return a.date.localeCompare(b.date); }).forEach(function (v) {
    const c = clientById(v.clientId);
    const k = carteById(v.carteId);
    const m = versementModes(v);
    rows.push([v.date, c ? c.nom : '', c ? c.quartier : '', k ? k.label : '', v.montant, STATUT_LABELS[v.statut] || v.statut, m.especes, m.airtel, m.moov, v.note || '']);
  });
  return toCSV(rows);
}

function csvOperations() {
  const rows = [['Date', 'Type', 'Catégorie', 'Libellé', 'Client', 'Montant', 'Mode', 'Reçu', 'Note']];
  db.operations.slice().sort(function (a, b) { return a.date.localeCompare(b.date); }).forEach(function (o) {
    const c = clientById(o.clientId);
    rows.push([o.date, o.type === 'entree' ? 'Entrée' : 'Sortie', CAT_LABELS[o.categorie] || o.categorie, o.libelle, c ? c.nom : '', o.montant, o.mode || '', o.recuNumero || '', o.note || '']);
  });
  return toCSV(rows);
}

function csvActivity(list) {
  const rows = [['Date', 'Heure', 'Type', 'Client', 'Action', 'Montant']];
  list.forEach(function (a) {
    const d = new Date(a.at);
    rows.push([a.date, pad2(d.getHours()) + ':' + pad2(d.getMinutes()), ACTIVITY_KINDS[a.kind] ? ACTIVITY_KINDS[a.kind].label : a.kind, a.clientNom || '', a.text, a.montant || '']);
  });
  return toCSV(rows);
}
