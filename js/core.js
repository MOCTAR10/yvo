'use strict';

/* ============================================================
   YVO Épargne — noyau : données, dates, calculs, démo
   ============================================================ */

const DB_KEY = 'yvo.epargne.db.v1';
const APP_VERSION = '2.1.0';
const DB_SCHEMA = 2;
const CURRENCIES = ['FCFA', '€', '$', 'MAD', 'GNF', 'CDF', 'CHF'];

/* Barre du bas (téléphone) : 5 entrées maximum */
const NAV = [
  { id: 'tableau', label: 'Tableau de bord', short: 'Accueil', icon: 'home', href: '#/tableau' },
  { id: 'pointage', label: 'Pointage du jour', short: 'Pointage', icon: 'check-square', href: '#/pointage' },
  { id: 'clients', label: 'Clients', short: 'Clients', icon: 'users', href: '#/clients' },
  { id: 'tresorerie', label: 'Caisse', short: 'Caisse', icon: 'wallet', href: '#/tresorerie' },
  { id: 'plus', label: 'Plus', short: 'Plus', icon: 'menu', href: '#/plus' }
];

/* Pages secondaires : menu « Plus » et barre latérale (ordinateur) */
const NAV_MORE = [
  { id: 'alertes', label: 'Alertes', desc: 'Incohérences et problèmes détectés', icon: 'bell', href: '#/alertes' },
  { id: 'activite', label: 'Historique', desc: 'Tout ce qui a été fait, avec filtres', icon: 'activity', href: '#/activite' },
  { id: 'risques', label: 'Clients à relancer', desc: 'Qui est en retard et combien', icon: 'shield-alert', href: '#/risques' },
  { id: 'cloture', label: 'Fin de journée', desc: 'Compter l’argent et vérifier', icon: 'lock', href: '#/cloture' },
  { id: 'recus', label: 'Reçus', desc: 'Les reçus envoyés aux clients', icon: 'receipt', href: '#/recus' },
  { id: 'commission', label: 'Commissions', desc: 'Ce que vous prélevez sur l’épargne', icon: 'coins', href: '#/commission' },
  { id: 'multi', label: 'Plusieurs cartes', desc: 'Clients qui ont plus d’une carte', icon: 'layers', href: '#/multi' },
  { id: 'corbeille', label: 'Corbeille', desc: 'Récupérer ce qui a été supprimé', icon: 'trash', href: '#/corbeille' },
  { id: 'parametres', label: 'Réglages', desc: 'Mon profil, ma caisse, types de carte', icon: 'settings', href: '#/parametres' }
];

const NAV_SIDEBAR = NAV.filter(function (n) { return n.id !== 'plus'; }).concat(NAV_MORE);

const ROUTE_TITLES = {
  tableau: 'Accueil',
  pointage: 'Pointage',
  clients: 'Clients',
  client: 'Fiche client',
  tresorerie: 'Caisse',
  plus: 'Plus',
  activite: 'Historique',
  risques: 'Clients à relancer',
  cloture: 'Fin de journée',
  multi: 'Plusieurs cartes',
  alertes: 'Alertes',
  recus: 'Reçus',
  commission: 'Commissions',
  sync: 'Sauvegarde en ligne',
  corbeille: 'Corbeille',
  parametres: 'Réglages'
};

const ACTIVITY_KINDS = {
  versement: { label: 'Versement', tone: 'green', icon: 'arrow-down' },
  paiement: { label: 'Paiement client', tone: 'amber', icon: 'receipt' },
  client: { label: 'Client', tone: 'blue', icon: 'user' },
  carte: { label: 'Carte', tone: 'blue', icon: 'credit-card' },
  caisse: { label: 'Caisse', tone: 'gray', icon: 'wallet' },
  cloture: { label: 'Clôture', tone: 'gray', icon: 'lock' },
  suppression: { label: 'Suppression', tone: 'red', icon: 'trash' },
  systeme: { label: 'Système', tone: 'gray', icon: 'database' }
};

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const DAYS_SHORT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const DAYS_NARROW = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const STATUT_LABELS = {
  complet: 'Complet',
  partiel: 'Partiel',
  avance: 'En avance',
  absent: 'Non versé'
};

const STATUT_TONES = { complet: 'green', partiel: 'amber', avance: 'blue', absent: 'red' };

/* Le statut se déduit du montant reçu : le client verse quand il peut. */
function statutFor(montant, journalier) {
  const m = Number(montant) || 0;
  const j = Number(journalier) || 0;
  if (m <= 0) return 'absent';
  if (m < j) return 'partiel';
  if (m === j) return 'complet';
  return 'avance';
}

/* Mode de paiement d'un versement : noté sur chaque paiement (historique),
   car un même jour peut mélanger espèces et mobile money. */
const PAY_MODES = ['especes', 'airtel', 'moov'];
const PAY_MODE_LABELS = { especes: 'Espèces', airtel: 'Airtel Money', moov: 'Moov Money', mixte: 'Mixte', autre: 'Autre' };
const PAY_MODE_SHORT = { especes: 'Espèces', airtel: 'Airtel', moov: 'Moov', mixte: 'Mixte', autre: 'Autre' };

function payModeOf(h) {
  return PAY_MODES.indexOf(h && h.mode) >= 0 ? h.mode : 'especes';
}

/* Les opérations (retraits…) gardent un libellé libre : on le ramène à une clé. */
function opModeKey(label) {
  const s = String(label || '').toLowerCase();
  if (!s || s.indexOf('esp') === 0) return 'especes';
  if (s.indexOf('airtel') >= 0) return 'airtel';
  if (s.indexOf('moov') >= 0) return 'moov';
  if (s.indexOf('mobile') >= 0) return 'mobile';
  return 'autre';
}

/* Répartition d'un versement par mode. Ce qui n'est pas dans l'historique compte en espèces. */
function versementModes(v) {
  const out = { especes: 0, airtel: 0, moov: 0 };
  let seen = 0;
  (v.historique || []).forEach(function (h) {
    const m = Number(h.montant) || 0;
    out[payModeOf(h)] += m;
    seen += m;
  });
  out.especes += (Number(v.montant) || 0) - seen;
  return out;
}

/* Correction d'un jour déjà pointé : nouveau total « montant » dans le mode choisi.
   Une baisse se retire d'abord du mode choisi puis des autres (jamais de mode négatif) ;
   à montant égal, un jour payé dans un seul mode passe entièrement dans le nouveau mode.
   À appeler AVANT de changer v.montant. Renvoie vrai si l'historique a changé. */
function correctVersementModes(v, montant, mode, at) {
  const before = Number(v.montant) || 0;
  const cur = versementModes(v);
  const diff = montant - before;
  const entries = [];
  if (diff > 0) {
    entries.push({ montant: diff, mode: mode });
  } else if (diff < 0) {
    let left = -diff;
    [mode].concat(PAY_MODES.filter(function (k) { return k !== mode; })).forEach(function (k) {
      const take = Math.min(left, Math.max(0, cur[k]));
      if (take > 0) { entries.push({ montant: -take, mode: k }); left -= take; }
    });
  } else if (before > 0 && mainMode(cur) !== 'mixte' && mainMode(cur) !== mode) {
    entries.push({ montant: -before, mode: mainMode(cur) }, { montant: before, mode: mode });
  }
  entries.forEach(function (e) {
    (v.historique = v.historique || []).push({ montant: e.montant, at: at, mode: e.mode, correction: true });
  });
  return entries.length > 0;
}

function mainMode(modes) {
  const used = PAY_MODES.filter(function (k) { return modes[k] > 0; });
  return used.length === 1 ? used[0] : used.length ? 'mixte' : 'especes';
}

function lastPayMode(v) {
  const h = v && v.historique ? v.historique.filter(function (x) { return Number(x.montant) > 0; }) : [];
  return h.length ? payModeOf(h[h.length - 1]) : 'especes';
}

/* Montant d'un mouvement qui correspond au filtre de mode ('mobile' = Airtel + Moov). */
function movementAmountForMode(m, filter) {
  if (filter === 'tous') return m.montant;
  if (m.kind === 'versement') {
    if (filter === 'mobile') return m.modes.airtel + m.modes.moov;
    return m.modes[filter] || 0;
  }
  if (filter === 'mobile') return m.modeKey === 'airtel' || m.modeKey === 'moov' || m.modeKey === 'mobile' ? m.montant : 0;
  return m.modeKey === filter ? m.montant : 0;
}

const CAT_LABELS = {
  versement: 'Versement',
  retrait: 'Retrait client',
  pret: 'Avance d’argent',
  apport: 'Apport',
  depense: 'Dépense',
  prelevement: 'Prélèvement',
  autre: 'Autre'
};

const state = {
  route: { name: 'tableau', id: null },
  locked: false,
  clientSearch: '',
  clientQuartier: 'tous',
  clientStatut: 'tous',
  clientEtat: 'tous',
  clientSort: 'nom',
  pointageDate: todayISO(),
  pointageQuartier: 'tous',
  pointageSearch: '',
  pointageTab: 'a-pointer',
  multiFilter: 'sans-retrait',
  multiSearch: '',
  treasuryPeriod: 'mois',
  treasuryType: 'tout',
  treasuryMode: 'tous',
  actPeriod: '7j',
  actKind: 'tous',
  commPeriod: 'mois',
  recuSearch: '',
  actClient: 'tous',
  actQuartier: 'tous',
  actSearch: '',
  cal: {},
  lastActivity: Date.now()
};

let db = null;
let idCounter = 0;

/* ------------------------------------------------------------
   Base de données
   ------------------------------------------------------------ */

/* L'application est celle de Yvo : son profil est déjà rempli, rien à configurer. */
const YVO_PROFILE = { nom: 'YVO Épargne', responsable: 'Yvo', telephone: '077814766', indicatif: '241' };

function emptyDB() {
  return {
    version: DB_SCHEMA,
    createdAt: new Date().toISOString(),
    savedAt: 0,
    revision: 0,
    settings: {
      company: {
        nom: YVO_PROFILE.nom,
        responsable: YVO_PROFILE.responsable,
        telephone: YVO_PROFILE.telephone,
        email: '',
        adresse: '',
        ville: '',
        activite: 'Collecte quotidienne & épargne'
      },
      devise: 'FCFA',
      indicatif: YVO_PROFILE.indicatif,
      soldeInitial: 0,
      seuilRisque: 3,
      commission: { actif: false, baremes: [] },
      pinHash: null,
      autoLock: 0,
      lastBackup: null,
      demo: false
    },
    clients: [],
    cartes: [],
    versements: [],
    operations: [],
    activity: [],
    trash: [],
    clotures: [],
    recus: [],
    seq: { recu: 0, recuYear: '' }
  };
}

function normalizeDB(raw) {
  const base = emptyDB();
  if (!raw || typeof raw !== 'object') return base;
  const out = Object.assign({}, base, raw);
  out.settings = Object.assign({}, base.settings, raw.settings || {});
  out.settings.company = Object.assign({}, base.settings.company, (raw.settings || {}).company || {});
  ['clients', 'cartes', 'versements', 'operations', 'activity', 'trash', 'clotures', 'recus'].forEach(function (k) {
    out[k] = Array.isArray(raw[k]) ? raw[k] : [];
  });
  out.seq = Object.assign({}, base.seq, raw.seq || {});
  out.settings.commission = Object.assign({ actif: false, baremes: [] }, out.settings.commission || {});
  if (!Array.isArray(out.settings.commission.baremes)) out.settings.commission.baremes = [];
  const co = out.settings.company;
  if (!co.nom || co.nom === 'Mon entreprise') co.nom = YVO_PROFILE.nom;
  if (!co.responsable) co.responsable = YVO_PROFILE.responsable;
  if (!co.telephone) co.telephone = YVO_PROFILE.telephone;
  if (!out.settings.indicatif) out.settings.indicatif = YVO_PROFILE.indicatif;
  return migrateDB(out);
}

/* v1 → v2 : « avance » (paiement partiel) devient « partiel »,
   « avance » désigne maintenant un versement supérieur au journalier. */
function migrateDB(d) {
  if ((Number(d.version) || 1) >= DB_SCHEMA) return d;
  const daily = {};
  d.cartes.forEach(function (c) { daily[c.id] = Number(c.montantJournalier) || 0; });
  d.versements.forEach(function (v) {
    const j = daily[v.carteId] || 0;
    v.statut = statutFor(v.montant, j);
    if (!v.historique) v.historique = [{ montant: Number(v.montant) || 0, at: v.createdAt || v.date }];
  });
  d.version = DB_SCHEMA;
  if (!d.settings.demo && d.clients.length) d.activity.unshift({
    id: uid('ac'), at: new Date().toISOString(), date: isoOf(new Date()), kind: 'systeme',
    text: 'Mise à niveau de la base vers la version 2 (journal d’activité, corbeille, clôtures).',
    clientId: null, carteId: null, clientNom: '', montant: 0
  });
  return d;
}

/* Sauvegarde : écrit à chaque modification (voir storage.js) */
function saveDB() {
  const ok = persistDB();
  if (!ok && typeof toast === 'function') {
    toast('Sauvegarde impossible : le stockage de l’appareil est plein ou bloqué. Gardez le réseau allumé : vos données partent sur le serveur.', 'error');
  }
  return ok;
}

function resetAllData() {
  try { localStorage.removeItem(DB_KEY); } catch (err) { /* ignore */ }
  const done = function () { location.reload(); };
  if (typeof takeSnapshot === 'function' && db) {
    takeSnapshot('avant-effacement').then(function () {
      if (!('indexedDB' in window)) return done();
      return idbRun('kv', 'readwrite', function (os) { return os.delete('db'); }).then(done);
    });
  } else done();
}

/* ------------------------------------------------------------
   Journal d'activité & corbeille
   ------------------------------------------------------------ */

function logActivity(kind, text, o) {
  if (!db) return;
  o = o || {};
  const client = o.clientId ? clientById(o.clientId) : null;
  db.activity.push({
    id: uid('ac'),
    at: new Date().toISOString(),
    date: todayISO(),
    kind: kind,
    text: text,
    clientId: o.clientId || null,
    carteId: o.carteId || null,
    clientNom: o.clientNom || (client ? client.nom : ''),
    montant: Number(o.montant) || 0,
    device: (typeof syncCfg !== 'undefined' && syncCfg) ? syncCfg.deviceName : ''
  });
}

function trashAdd(kind, label, data) {
  db.trash.unshift({ id: uid('tr'), kind: kind, label: label, at: new Date().toISOString(), data: data });
}

function trashRestore(id) {
  const idx = db.trash.findIndex(function (t) { return t.id === id; });
  if (idx < 0) return false;
  const t = db.trash[idx];
  const d = t.data || {};
  const have = function (arr, item) { return arr.some(function (x) { return x.id === item.id; }); };
  const clientOk = function (cid) { return !cid || (d.client && d.client.id === cid) || db.clients.some(function (c) { return c.id === cid; }); };
  const carteOk = function (cid) { return !cid || (d.cartes || []).some(function (c) { return c.id === cid; }) || db.cartes.some(function (c) { return c.id === cid; }); };
  /* Un élément dont le client ou la carte a été supprimé ne peut pas revenir seul. */
  if ((d.cartes || []).some(function (x) { return !clientOk(x.clientId); }) ||
      (d.versements || []).some(function (x) { return !carteOk(x.carteId); }) ||
      (d.operations || []).some(function (x) { return !clientOk(x.clientId) || !carteOk(x.carteId); })) {
    return { ok: false, reason: 'parent' };
  }
  let skipped = 0;
  if (d.client && !have(db.clients, d.client)) db.clients.push(d.client);
  (d.cartes || []).forEach(function (x) { if (!have(db.cartes, x)) db.cartes.push(x); });
  (d.versements || []).forEach(function (x) {
    if (have(db.versements, x)) return;
    /* Le jour a été pointé à nouveau entre-temps : on garde le pointage actuel (pas de double comptage). */
    if (db.versements.some(function (v) { return v.carteId === x.carteId && v.date === x.date; })) { skipped += 1; return; }
    db.versements.push(x);
  });
  (d.operations || []).forEach(function (x) { if (!have(db.operations, x)) db.operations.push(x); });
  db.trash.splice(idx, 1);
  return { ok: true, skipped: skipped };
}

/* ------------------------------------------------------------
   Utilitaires généraux
   ------------------------------------------------------------ */

function uid(prefix) {
  idCounter += 1;
  return prefix + '_' + Date.now().toString(36) + '_' + idCounter.toString(36) + Math.random().toString(36).slice(2, 5);
}

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
  });
}

function parseMoney(value) {
  if (typeof value === 'number') return isFinite(value) ? Math.round(value) : 0;
  const cleaned = String(value == null ? '' : value).replace(/[^\d,.-]/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isFinite(n) ? Math.round(n) : 0;
}

function money(value, bare) {
  const v = Number(value) || 0;
  const sign = v < 0 ? '−' : '';
  const abs = Math.abs(Math.round(v));
  const txt = abs.toLocaleString('fr-FR');
  if (bare) return sign + txt;
  const devise = db && db.settings ? db.settings.devise : 'FCFA';
  return sign + txt + ' ' + devise;
}

function numberFR(value) {
  return (Number(value) || 0).toLocaleString('fr-FR');
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function sum(list, fn) {
  return (list || []).reduce(function (total, item) {
    const v = fn ? fn(item) : item;
    return total + (Number(v) || 0);
  }, 0);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function isoOf(date) {
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

function todayISO() {
  return isoOf(new Date());
}

function parseISO(iso) {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

function dayNumber(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000;
}

function diffDays(from, to) {
  const a = dayNumber(from);
  const b = dayNumber(to);
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.round(b - a);
}

function addDays(iso, n) {
  const d = parseISO(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + n);
  return isoOf(d);
}

function periodDays(debut, fin) {
  if (!debut || !fin) return 0;
  return Math.max(0, diffDays(debut, fin) + 1);
}

function fmtDate(iso, style) {
  const d = parseISO(iso);
  if (!d) return '—';
  const day = d.getDate();
  const m = d.getMonth();
  const y = d.getFullYear();
  if (style === 'long') return day + ' ' + MONTHS[m] + ' ' + y;
  if (style === 'short') return pad2(day) + '/' + pad2(m + 1) + '/' + y;
  if (style === 'day') return DAYS_SHORT[d.getDay()] + ' ' + day + ' ' + MONTHS_SHORT[m];
  if (style === 'month') return capitalize(MONTHS[m]) + ' ' + y;
  return day + ' ' + MONTHS_SHORT[m] + ' ' + y;
}

function fmtDateTime(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '—';
  return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear() + ' à ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function monthKeyOf(iso) {
  return String(iso || '').slice(0, 7);
}

function shiftMonth(key, delta) {
  const parts = String(key || '').split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = new Date(y, m - 1 + delta, 1);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1);
}

function monthLabel(key) {
  const parts = String(key || '').split('-');
  const m = Number(parts[1]) - 1;
  return capitalize(MONTHS[m] || '') + ' ' + parts[0];
}

function capitalize(str) {
  const s = String(str || '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function monthCells(key) {
  const parts = String(key || '').split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]) - 1;
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [];
  let i;
  for (i = 0; i < offset; i += 1) cells.push(null);
  for (i = 1; i <= days; i += 1) {
    cells.push({ day: i, iso: year + '-' + pad2(month + 1) + '-' + pad2(i) });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bon après-midi';
  return 'Bonsoir';
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0][0] || '') + (parts.length > 1 ? parts[1][0] : '')).toUpperCase();
}

function avatarStyle(name) {
  const str = String(name || '');
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) % 360;
  return 'background:hsl(' + h + ', 42%, 90%);color:hsl(' + h + ', 45%, 28%)';
}

function hashPin(pin) {
  const str = 'yvo-lock:' + String(pin);
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

/* SHA-256 en JavaScript pur : sert à vérifier le mot de passe hors réseau
   (empreinte salée gardée sur le téléphone après une connexion réussie). */
function sha256(text) {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  const bytes = Array.from(new TextEncoder().encode(String(text)));
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i -= 1) bytes.push(i >= 4 ? 0 : (bitLen >>> (i * 8)) & 0xff);
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Array(64);
  const rotr = function (x, n) { return (x >>> n) | (x << (32 - n)); };
  for (let off = 0; off < bytes.length; off += 64) {
    for (let t = 0; t < 16; t += 1) {
      w[t] = (bytes[off + t * 4] << 24) | (bytes[off + t * 4 + 1] << 16) | (bytes[off + t * 4 + 2] << 8) | bytes[off + t * 4 + 3];
    }
    for (let t = 16; t < 64; t += 1) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let t = 0; t < 64; t += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[t] + w[t]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return H.map(function (x) { return (x >>> 0).toString(16).padStart(8, '0'); }).join('');
}


function nextReceiptNumber() {
  const tag = (typeof syncCfg !== 'undefined' && syncCfg && syncCfg.deviceId) ? '-' + String(syncCfg.deviceId).replace(/[^A-Za-z0-9]/g, '').slice(-2).toUpperCase() : '';
  const year = String(new Date().getFullYear());
  if (!db.seq) db.seq = { recu: 0, recuYear: '' };
  if (db.seq.recuYear !== year) {
    db.seq.recuYear = year;
    db.seq.recu = 1;
  } else {
    db.seq.recu = (Number(db.seq.recu) || 0) + 1;
  }
  return 'REC-' + year + tag + '-' + String(db.seq.recu).padStart(4, '0');
}

function fileSizeKb() {
  try {
    return Math.max(1, Math.round(new Blob([JSON.stringify(db)]).size / 1024));
  } catch (err) {
    return 0;
  }
}

/* ------------------------------------------------------------
   Accès aux données
   ------------------------------------------------------------ */

function clientById(id) {
  return db ? db.clients.find(function (c) { return c.id === id; }) : null;
}

function carteById(id) {
  return db ? db.cartes.find(function (c) { return c.id === id; }) : null;
}

function cartesOf(clientId) {
  return db ? db.cartes.filter(function (c) { return c.clientId === clientId; }) : [];
}

function versementsOf(carteId) {
  return db.versements
    .filter(function (v) { return v.carteId === carteId; })
    .sort(function (a, b) { return a.date.localeCompare(b.date); });
}

function versementFor(carteId, date) {
  return db.versements.find(function (v) { return v.carteId === carteId && v.date === date; }) || null;
}

function dueOn(carte, date) {
  return carte.statut === 'active' && date >= carte.dateDebut && date <= carte.dateFin;
}

function dueCards(date) {
  return db.cartes.filter(function (c) {
    if (!dueOn(c, date)) return false;
    const client = clientById(c.clientId);
    return client && client.actif !== false;
  });
}

/* ------------------------------------------------------------
   Commission — entièrement paramétrable (aucun taux en dur)

   Un « barème » est une liste de règles. Chaque carte garde une copie
   du barème choisi à sa création : modifier un barème ne change donc
   jamais le passé, sauf si Yvo l'applique explicitement.

   Règle = { mode, calc, valeur, cycleJours, moment, actif }
     mode  : 'versement' (sur chaque versement)
             'cycle'     (sur une période de N jours, ex. 31)
             'fin'       (à la clôture de la carte)
     calc  : 'pct' (pourcentage) | 'fixe' (montant) | 'jours' (N jours de cotisation)
     moment: 'debut' | 'fin' — pour les règles de cycle à montant fixe / jours
   ------------------------------------------------------------ */

const COMM_MODES = { versement: 'Sur chaque versement', cycle: 'Sur une période (cycle)', fin: 'À la clôture de la carte' };
const COMM_CALCS = { pct: 'Pourcentage (%)', fixe: 'Montant fixe', jours: 'Jours de cotisation' };

function commissionActive() {
  return !!(db && db.settings.commission && db.settings.commission.actif);
}

function commissionRuleLabel(r, devise) {
  const dev = devise || (db && db.settings.devise) || '';
  const v = Number(r.valeur) || 0;
  const what = r.calc === 'pct' ? v + ' %' : r.calc === 'jours' ? v + ' jour' + (v > 1 ? 's' : '') + ' de cotisation' : numberFR(v) + ' ' + dev;
  if (r.mode === 'versement') return what + (r.calc === 'pct' ? ' de chaque versement' : ' par versement');
  if (r.mode === 'cycle') return what + ' tous les ' + (Number(r.cycleJours) || 31) + ' jours' + (r.calc !== 'pct' ? (r.moment === 'debut' ? ' (prélevé au début)' : ' (prélevé en fin de période)') : '');
  return what + ' à la clôture';
}

/* Calcul pur : fonctionne pour une vraie carte comme pour une simulation. */
function computeCommission(carte, vs, today, force) {
  const out = { total: 0, lignes: [] };
  const com = carte && carte.commission;
  if (!com || !Array.isArray(com.regles) || (!force && !commissionActive())) return out;
  const daily = Number(carte.montantJournalier) || 0;
  const totalVerse = sum(vs, function (v) { return v.montant; });
  com.regles.forEach(function (r, idx) {
    if (r.actif === false) return;
    const val = Number(r.valeur) || 0;
    if (val <= 0) return;
    const lib = r.libelle || commissionRuleLabel(r);
    if (r.mode === 'versement') {
      let m = 0;
      let last = null;
      vs.forEach(function (v) {
        const amount = Number(v.montant) || 0;
        if (amount <= 0) return;
        m += r.calc === 'pct' ? amount * val / 100 : r.calc === 'fixe' ? val : 0;
        last = v.date;
      });
      m = Math.round(m);
      if (m > 0) out.lignes.push({ regle: idx, libelle: lib, montant: m, statut: 'acquise', date: last || carte.dateDebut });
    } else if (r.mode === 'cycle') {
      const P = Math.max(1, Math.round(Number(r.cycleJours) || 31));
      const nb = Math.ceil(periodDays(carte.dateDebut, carte.dateFin) / P);
      for (let k = 0; k < nb; k += 1) {
        const start = addDays(carte.dateDebut, k * P);
        if (start > today) break;
        let end = addDays(start, P - 1);
        if (end > carte.dateFin) end = carte.dateFin;
        const done = end <= today || carte.statut === 'cloturee';
        let m = 0;
        if (r.calc === 'pct') {
          m = sum(vs.filter(function (v) { return v.date >= start && v.date <= end; }), function (v) { return v.montant; }) * val / 100;
        } else {
          if (r.moment === 'debut' || done) m = r.calc === 'jours' ? val * daily : val;
        }
        m = Math.round(m);
        if (m > 0) out.lignes.push({ regle: idx, libelle: lib + ' · période ' + (k + 1), montant: m, statut: done ? 'acquise' : 'estimee', date: r.calc !== 'pct' && r.moment === 'debut' ? start : end });
      }
    } else if (r.mode === 'fin') {
      const m = Math.round(r.calc === 'pct' ? totalVerse * val / 100 : r.calc === 'jours' ? val * daily : val);
      if (m > 0 && totalVerse > 0) out.lignes.push({ regle: idx, libelle: lib, montant: m, statut: carte.statut === 'cloturee' ? 'acquise' : 'estimee', date: carte.clotureeAt || carte.dateFin });
    }
  });
  let total = sum(out.lignes, function (l) { return l.montant; });
  if (total > totalVerse) {
    // la commission ne peut jamais dépasser ce que le client a réellement versé
    let over = total - totalVerse;
    for (let i = out.lignes.length - 1; i >= 0 && over > 0; i -= 1) {
      const cut = Math.min(out.lignes[i].montant, over);
      out.lignes[i].montant -= cut;
      over -= cut;
    }
    out.lignes = out.lignes.filter(function (l) { return l.montant > 0; });
    total = totalVerse;
  }
  out.total = total;
  return out;
}

function cardCommission(carte) {
  return computeCommission(carte, versementsOf(carte.id), todayISO());
}

function commissionTotals() {
  let acquise = 0;
  let estimee = 0;
  const events = [];
  db.cartes.forEach(function (c) {
    const client = clientById(c.clientId);
    cardCommission(c).lignes.forEach(function (l) {
      if (l.statut === 'acquise') acquise += l.montant; else estimee += l.montant;
      events.push({ date: l.date, montant: l.montant, statut: l.statut, libelle: l.libelle, carteId: c.id, carteLabel: c.label, clientId: c.clientId, clientNom: client ? client.nom : '—' });
    });
  });
  /* Frais d'avance d'argent : gagnés par Yvo dès que l'avance est donnée. */
  let frais = 0;
  db.operations.forEach(function (o) {
    if (o.categorie !== 'pret' || !(Number(o.frais) > 0)) return;
    const client = clientById(o.clientId);
    const carte = db.cartes.find(function (c) { return c.id === o.carteId; });
    frais += Number(o.frais);
    events.push({ date: o.date, montant: Number(o.frais), statut: 'acquise', type: 'frais', libelle: 'Frais d’avance d’argent', carteId: o.carteId, carteLabel: carte ? carte.label : ((o.snapshot && o.snapshot.carteLabel) || '—'), clientId: o.clientId, clientNom: client ? client.nom : ((o.snapshot && o.snapshot.clientNom) || '—') });
  });
  acquise += frais;
  return { acquise: acquise, estimee: estimee, frais: frais, total: acquise + estimee, events:events.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }) };
}

function defaultBareme() {
  const c = db.settings.commission;
  if (!c || !c.actif) return null;
  return c.baremes.find(function (b) { return b.parDefaut; }) || null;
}

function baremeSnapshot(b) {
  return b ? { baremeId: b.id, nom: b.nom, regles: JSON.parse(JSON.stringify(b.regles)) } : null;
}

function cardTotals(carte) {
  if (!carte) return null;
  const vs = versementsOf(carte.id);
  const totalVerse = sum(vs, function (v) { return v.montant; });
  const jDaily = Number(carte.montantJournalier) || 0;
  /* avances = ce qui a été versé au-dessus du journalier */
  const totalAvances = sum(vs, function (v) { return Math.max(0, (Number(v.montant) || 0) - jDaily); });
  const retraits = db.operations.filter(function (o) {
    return o.type === 'sortie' && o.categorie === 'retrait' && o.carteId === carte.id;
  });
  const totalRetire = sum(retraits, function (o) { return o.montant; });
  /* avances d'argent : remboursées par les cotisations, la carte peut « devoir » */
  const prets = db.operations.filter(function (o) { return o.categorie === 'pret' && o.carteId === carte.id; });
  const totalPret = sum(prets, function (o) { return o.montant; });
  const fraisPret = sum(prets, function (o) { return o.frais; });
  const jours = periodDays(carte.dateDebut, carte.dateFin);
  const objectif = jours * (Number(carte.montantJournalier) || 0);
  const manquant = Math.max(0, objectif - totalVerse);
  const comm = computeCommission(carte, vs, todayISO());
  const soldeBrut = totalVerse - comm.total - totalRetire - totalPret - fraisPret;
  const solde = Math.max(0, soldeBrut);
  const today = todayISO();
  const ecoules = clamp(diffDays(carte.dateDebut, today) + 1, 0, jours);
  const attendu = ecoules * (Number(carte.montantJournalier) || 0);
  const retard = Math.max(0, Math.min(attendu, objectif) - totalVerse);
  const dernier = vs.length ? vs[vs.length - 1].date : null;
  const joursComplets = vs.filter(function (v) { return v.statut === 'complet'; }).length;
  const joursAvances = vs.filter(function (v) { return v.statut === 'avance'; }).length;
  const joursPartiels = vs.filter(function (v) { return v.statut === 'partiel'; }).length;
  const joursAbsents = vs.filter(function (v) { return v.statut === 'absent'; }).length;
  const joursRestants = Math.max(0, diffDays(today, carte.dateFin));
  const joursCouverts = jDaily > 0 ? Math.floor(totalVerse / jDaily) : 0;
  return {
    joursPartiels: joursPartiels,
    joursCouverts: joursCouverts,
    jours: jours,
    totalVerse: totalVerse,
    totalAvances: totalAvances,
    totalRetire: totalRetire,
    objectif: objectif,
    manquant: manquant,
    solde: solde,
    totalPret: totalPret,
    fraisPret: fraisPret,
    soldeBrut: soldeBrut,
    resteARembourser: Math.max(0, -soldeBrut),
    commission: comm.total,
    commissionLignes: comm.lignes,
    progression: objectif > 0 ? Math.min(100, (totalVerse / objectif) * 100) : 0,
    joursComplets: joursComplets,
    joursAvances: joursAvances,
    joursAbsents: joursAbsents,
    pointes: vs.length,
    dernier: dernier,
    retard: retard,
    ecoules: ecoules,
    attendu: attendu,
    joursRestants: joursRestants
  };
}

function clientTotals(client) {
  if (!client) return null;
  const cards = cartesOf(client.id);
  const totals = cards.map(cardTotals);
  const totalVerse = sum(totals, function (t) { return t.totalVerse; });
  const totalAvances = sum(totals, function (t) { return t.totalAvances; });
  const objectif = sum(totals, function (t) { return t.objectif; });
  const manquant = sum(totals, function (t) { return t.manquant; });
  const retraits = db.operations.filter(function (o) {
    return o.type === 'sortie' && o.categorie === 'retrait' && o.clientId === client.id;
  });
  const totalRetire = sum(retraits, function (o) { return o.montant; });
  const commission = sum(totals, function (t) { return t.commission; });
  const totalPret = sum(totals, function (t) { return t.totalPret; });
  const fraisPret = sum(totals, function (t) { return t.fraisPret; });
  /* Position nette : une avance sur une carte se compense avec l'épargne des autres cartes. */
  const net = sum(totals, function (t) { return t.soldeBrut; });
  const resteARembourser = Math.max(0, -net);
  const solde = Math.max(0, net);
  const actives = cards.filter(function (c) { return c.statut === 'active'; });
  const journalier = sum(actives, function (c) { return Number(c.montantJournalier) || 0; });
  const retard = sum(actives.map(cardTotals), function (t) { return t.retard; });
  const versements = db.versements.filter(function (v) { return v.clientId === client.id; });
  const dernier = versements.length ? versements.map(function (v) { return v.date; }).sort().pop() : null;
  return {
    cartes: cards,
    nbCartes: cards.length,
    nbActives: actives.length,
    totalVerse: totalVerse,
    totalAvances: totalAvances,
    objectif: objectif,
    manquant: manquant,
    totalRetire: totalRetire,
    solde: solde,
    totalPret: totalPret,
    fraisPret: fraisPret,
    resteARembourser: resteARembourser,
    commission: commission,
    journalier: journalier,
    progression: objectif > 0 ? Math.min(100, (totalVerse / objectif) * 100) : 0,
    retard: retard,
    dernier: dernier,
    sansRetrait: totalRetire === 0,
    nbRetraits: retraits.length
  };
}

/* Jours sans versement mais couverts par une avance (le client a payé d'avance). */
function coverageMap(carte) {
  const map = {};
  const j = Number(carte.montantJournalier) || 0;
  const today = todayISO();
  const last = carte.dateFin < today ? carte.dateFin : today;
  const byDate = {};
  versementsOf(carte.id).forEach(function (v) { byDate[v.date] = v; });
  let credit = 0;
  let d = carte.dateDebut;
  for (let n = 0; d <= last && n < 1500; n += 1) {
    const v = byDate[d];
    const paid = v ? (Number(v.montant) || 0) : 0;
    credit += paid - j;
    if (paid <= 0 && credit >= 0) map[d] = 'covered';
    d = addDays(d, 1);
  }
  return map;
}

/* Niveau de risque d'un client : retard + nombre de jours sans verser. */
function clientRisk(client) {
  const t = todayISO();
  const seuil = Math.max(1, Number(db.settings.seuilRisque) || 3);
  const cards = cartesOf(client.id).filter(function (c) { return c.statut === 'active' && c.dateDebut <= t; });
  let retard = 0, attendu = 0, verse = 0, journalier = 0, lastPay = null, started = null;
  cards.forEach(function (c) {
    const ct = cardTotals(c);
    retard += ct.retard;
    attendu += Math.min(ct.attendu, ct.objectif);
    verse += ct.totalVerse;
    journalier += Number(c.montantJournalier) || 0;
    versementsOf(c.id).forEach(function (v) {
      if ((Number(v.montant) || 0) > 0 && (!lastPay || v.date > lastPay)) lastPay = v.date;
    });
    if (!started || c.dateDebut < started) started = c.dateDebut;
  });
  const ref = lastPay || started;
  const jours = ref ? Math.max(0, diffDays(ref, t)) : 0;
  const taux = attendu > 0 ? clamp((verse / attendu) * 100, 0, 100) : 100;
  let niveau = 'ok';
  if (retard > 0) {
    if (jours >= seuil * 2) niveau = 'risque';
    else if (jours >= seuil) niveau = 'attention';
    else niveau = 'retard';
  }
  return { niveau: niveau, jours: jours, retard: retard, taux: taux, lastPay: lastPay, journalier: journalier, nbCartes: cards.length };
}

const RISK_LABELS = { ok: 'À jour', retard: 'En retard', attention: 'À relancer', risque: 'À risque' };
const RISK_TONES = { ok: 'green', retard: 'amber', attention: 'amber', risque: 'red' };

/* Argent qui appartient aux clients vs argent réellement en caisse. */
function fundsOwed() {
  return sum(db.clients, function (c) { return clientTotals(c).solde; });
}

function cashCoverage() {
  return cashBalance() - fundsOwed();
}

function phoneDigits(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.charAt(0) === '+') return digits.slice(1);
  if (digits.slice(0, 2) === '00') return digits.slice(2);
  const ind = String(db.settings.indicatif || '').replace(/\D/g, '');
  /* Au Gabon (241), le 0 fait partie du numéro : +241 077 81 47 66. */
  if (ind !== '241') digits = digits.replace(/^0+/, '');
  return ind ? ind + digits : digits;
}

function waLink(phone, text) {
  const d = phoneDigits(phone);
  if (!d) return '';
  return 'https://wa.me/' + d + (text ? '?text=' + encodeURIComponent(text) : '');
}

function clotureOf(date) {
  return db.clotures.find(function (c) { return c.date === date; }) || null;
}

function quartiersList() {
  const set = {};
  db.clients.forEach(function (c) {
    const q = String(c.quartier || 'Non classé').trim() || 'Non classé';
    set[q] = true;
  });
  return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, 'fr'); });
}

function clientFullName(client) {
  return client ? (client.nom || 'Client sans nom') : 'Client supprimé';
}

function movementList() {
  const list = [];
  db.versements.forEach(function (v) {
    if (!v.montant) return;
    const c = clientById(v.clientId);
    const carte = carteById(v.carteId);
    const modes = versementModes(v);
    const mk = mainMode(modes);
    list.push({
      id: v.id,
      kind: 'versement',
      type: 'entree',
      categorie: 'versement',
      date: v.date,
      montant: v.montant || 0,
      libelle: v.statut === 'avance' ? 'Versement (avance)' : v.statut === 'partiel' ? 'Versement partiel' : v.statut === 'absent' ? 'Jour non versé' : 'Versement du jour',
      clientId: v.clientId,
      carteId: v.carteId,
      clientNom: c ? clientFullName(c) : 'Client supprimé',
      carteLabel: carte ? carte.label : '',
      statut: v.statut,
      note: v.note || '',
      modes: modes,
      modeKey: mk,
      mode: mk === 'mixte'
        ? PAY_MODES.filter(function (k) { return modes[k] > 0; }).map(function (k) { return PAY_MODE_SHORT[k] + ' ' + money(modes[k], true); }).join(' + ')
        : PAY_MODE_LABELS[mk],
      createdAt: v.updatedAt || v.createdAt || v.date
    });
  });
  db.operations.forEach(function (o) {
    const c = clientById(o.clientId);
    list.push({
      id: o.id,
      kind: 'operation',
      type: o.type,
      categorie: o.categorie,
      date: o.date,
      montant: o.montant || 0,
      libelle: o.libelle || CAT_LABELS[o.categorie] || 'Opération',
      clientId: o.clientId || null,
      carteId: o.carteId || null,
      clientNom: c ? clientFullName(c) : (o.snapshot && o.snapshot.clientNom) || '',
      carteLabel: (carteById(o.carteId) || {}).label || (o.snapshot && o.snapshot.carteLabel) || '',
      note: o.note || '',
      recuNumero: o.recuNumero || null,
      mode: o.mode || '',
      modeKey: opModeKey(o.mode),
      snapshot: o.snapshot || null,
      createdAt: o.createdAt || o.date
    });
  });
  return list.sort(function (a, b) {
    if (a.date === b.date) return String(b.createdAt).localeCompare(String(a.createdAt));
    return b.date.localeCompare(a.date);
  });
}

function inRange(date, from, to) {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function cashTotals(from, to) {
  let entrees = 0;
  let sorties = 0;
  db.versements.forEach(function (v) {
    if (inRange(v.date, from, to)) entrees += Number(v.montant) || 0;
  });
  db.operations.forEach(function (o) {
    if (!inRange(o.date, from, to)) return;
    if (o.type === 'entree') entrees += Number(o.montant) || 0;
    else if (o.type === 'sortie') sorties += Number(o.montant) || 0;
  });
  return { entrees: entrees, sorties: sorties, net: entrees - sorties };
}

function cashBalance() {
  const all = cashTotals(null, null);
  return (Number(db.settings.soldeInitial) || 0) + all.entrees - all.sorties;
}

function monthStart() {
  const d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-01';
}

function yearStart() {
  return new Date().getFullYear() + '-01-01';
}

function last7Days() {
  const out = [];
  for (let i = 6; i >= 0; i -= 1) {
    const iso = addDays(todayISO(), -i);
    const t = cashTotals(iso, iso);
    out.push({ date: iso, entrees: t.entrees, sorties: t.sorties });
  }
  return out;
}

function eligibleRetraitClients() {
  return db.clients.map(function (c) {
    return { client: c, totals: clientTotals(c) };
  }).filter(function (x) {
    return x.totals.solde > 0;
  }).sort(function (a, b) {
    return clientFullName(a.client).localeCompare(clientFullName(b.client), 'fr');
  });
}

/* Ce qu'on peut payer sur une carte : son solde, sans dépasser le solde net du client
   (une avance non remboursée sur une autre carte est d'abord retenue). */
function retraitDispo(carte) {
  const client = clientById(carte.clientId);
  return Math.min(cardTotals(carte).solde, client ? clientTotals(client).solde : 0);
}

function cardsWithSolde(clientId) {
  return cartesOf(clientId).map(function (c) {
    const totals = cardTotals(c);
    return { carte: c, totals: totals, dispo: retraitDispo(c) };
  }).filter(function (x) {
    return x.dispo > 0;
  });
}

/* ------------------------------------------------------------
   Données de démonstration
   ------------------------------------------------------------ */

function buildDemoDB() {
  const d = emptyDB();
  d.settings.company = {
    nom: 'YVO Épargne',
    responsable: 'Mamadou Diallo',
    telephone: '+221 77 123 45 67',
    email: 'contact@yvo-epargne.sn',
    adresse: '12, rue de la Paix',
    ville: 'Dakar',
    activite: 'Collecte quotidienne & épargne'
  };
  d.settings.devise = 'FCFA';
  d.settings.soldeInitial = 500000;
  d.settings.demo = true;

  let seed = 20261030;
  function rng() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  const today = todayISO();
  const year = String(new Date().getFullYear());

  const people = [
    {
      nom: 'Awa Ndiaye', tel: '77 412 03 88', quartier: 'Médina', adresse: 'Rue 22 × 15, Médina',
      profession: 'Commerçante', pieceType: 'CNI', pieceNumero: '1 840 1992 04512', profile: 'regular',
      cartes: [
        { j: 5000, start: -28, len: 31 },
        { j: 3000, start: -12, len: 31 }
      ]
    },
    {
      nom: 'Moussa Diop', tel: '76 208 77 14', quartier: 'Grand Yoff', adresse: 'Cité Comico, villa 18',
      profession: 'Menuisier', pieceType: 'CNI', pieceNumero: '1 855 1987 02381', profile: 'regular',
      cartes: [{ j: 2000, start: -24, len: 30 }]
    },
    {
      nom: 'Fatou Sarr', tel: '78 330 19 62', quartier: 'Parcelles Assainies', adresse: 'Unité 12, n° 45',
      profession: 'Restauratrice', pieceType: 'Passeport', pieceNumero: 'SN 045 812 3', profile: 'regular',
      cartes: [
        { j: 1000, start: -31, len: 31 },
        { j: 2000, start: -20, len: 31 },
        { j: 5000, start: -8, len: 31 }
      ]
    },
    {
      nom: 'Ibrahima Fall', tel: '70 501 44 29', quartier: 'Ouakam', adresse: 'Rue 10, Ouakam',
      profession: 'Chauffeur', pieceType: 'Permis', pieceNumero: 'DK-2019-77841', profile: 'regular',
      cartes: [{ j: 10000, start: -5, len: 31 }]
    },
    {
      nom: 'Aïssatou Ba', tel: '77 902 31 07', quartier: 'Médina', adresse: 'Rue 31 × 44, Médina',
      profession: 'Couturière', pieceType: 'CNI', pieceNumero: '1 862 1995 07730', profile: 'regular',
      cartes: [{ j: 2500, start: -19, len: 30 }]
    },
    {
      nom: 'Cheikh Diagne', tel: '76 644 82 51', quartier: 'Yoff', adresse: 'Cité Fadia, n° 7',
      profession: 'Mécanicien', pieceType: 'CNI', pieceNumero: '1 871 1990 09914', profile: 'regular',
      cartes: [
        { j: 3000, start: -26, len: 31 },
        { j: 4000, start: -14, len: 31 }
      ]
    },
    {
      nom: 'Mariama Cissé', tel: '78 118 65 40', quartier: 'Grand Yoff', adresse: 'Hlm Grand Yoff, n° 112',
      profession: 'Vendeuse', pieceType: 'CNI', pieceNumero: '1 833 1988 01190', profile: 'perfect',
      cartes: [{ j: 5000, start: -42, len: 31, closed: true }]
    },
    {
      nom: 'Ousmane Sow', tel: '70 733 09 25', quartier: 'Parcelles Assainies', adresse: 'Unité 15, n° 234',
      profession: 'Électricien', pieceType: 'CNI', pieceNumero: '1 810 1985 06552', profile: 'irregular',
      cartes: [{ j: 2000, start: -22, len: 31 }]
    },
    {
      nom: 'Khady Guèye', tel: '77 225 71 39', quartier: 'Ouakam', adresse: 'Cité Asecna, n° 22',
      profession: 'Infirmière', pieceType: 'CNI', pieceNumero: '1 849 1993 03318', profile: 'regular',
      cartes: [
        { j: 5000, start: -33, len: 31 },
        { j: 2000, start: -18, len: 31 }
      ]
    },
    {
      nom: 'Abdoulaye Ndour', tel: '76 887 20 63', quartier: 'Yoff', adresse: 'Rue 8, Yoff Layène',
      profession: 'Pêcheur', pieceType: 'CNI', pieceNumero: '1 822 1983 04476', profile: 'irregular',
      cartes: [{ j: 1500, start: -40, len: 31 }]
    },
    {
      nom: 'Ndeye Faye', tel: '78 601 55 12', quartier: 'Médina', adresse: 'Rue 18, Médina',
      profession: 'Teinturière', pieceType: 'CNI', pieceNumero: '1 858 1991 06604', profile: 'regular',
      cartes: [{ j: 3000, start: 0, len: 31 }]
    }
  ];

  people.forEach(function (person, index) {
    const client = {
      id: 'cl_demo_' + (index + 1),
      nom: person.nom,
      telephone: person.tel,
      telephone2: '',
      quartier: person.quartier,
      adresse: person.adresse,
      profession: person.profession,
      pieceType: person.pieceType,
      pieceNumero: person.pieceNumero,
      dateInscription: addDays(today, -45 + index),
      notes: '',
      actif: true,
      createdAt: new Date().toISOString()
    };
    d.clients.push(client);

    person.cartes.forEach(function (spec, cardIndex) {
      const debut = addDays(today, spec.start);
      const fin = addDays(debut, spec.len - 1);
      const carte = {
        id: 'ca_demo_' + (index + 1) + '_' + (cardIndex + 1),
        clientId: client.id,
        label: 'Carte ' + (cardIndex + 1),
        montantJournalier: spec.j,
        dateDebut: debut,
        dateFin: fin,
        statut: spec.closed ? 'cloturee' : 'active',
        notes: '',
        createdAt: new Date().toISOString()
      };
      d.cartes.push(carte);

      const end = spec.closed ? fin : (fin < today ? fin : today);
      let cursor = debut;
      while (cursor <= end) {
        const isLastDays = cursor >= addDays(today, -2);
        let statut = 'complet';
        let montant = spec.j;

        if (spec.profile === 'perfect' || spec.closed) {
          statut = 'complet';
          montant = spec.j;
        } else {
          const r = rng();
          const irregular = spec.profile === 'irregular';
          const absentChance = irregular ? 0.16 : 0.06;
          const missedChance = irregular ? 0.20 : 0.04;
          const avanceChance = irregular ? 0.14 : 0.08;

          if (r < missedChance || (irregular && isLastDays)) {
            cursor = addDays(cursor, 1);
            continue;
          }
          if (r < missedChance + absentChance) {
            statut = 'absent';
            montant = 0;
          } else if (r < missedChance + absentChance + avanceChance) {
            statut = 'avance';
            montant = Math.max(100, Math.round((spec.j * (0.35 + rng() * 0.35)) / 100) * 100);
          }
        }

        d.versements.push({
          id: uid('v'),
          carteId: carte.id,
          clientId: client.id,
          date: cursor,
          statut: statut,
          montant: montant,
          note: '',
          createdAt: cursor + 'T09:00:00.000Z',
          updatedAt: cursor + 'T09:00:00.000Z'
        });
        cursor = addDays(cursor, 1);
      }

      if (spec.closed) {
        const totalVerse = d.versements
          .filter(function (v) { return v.carteId === carte.id; })
          .reduce(function (s, v) { return s + v.montant; }, 0);
        const dateRetrait = addDays(today, -2);
        d.operations.push({
          id: 'op_demo_retrait',
          type: 'sortie',
          categorie: 'retrait',
          libelle: 'Paiement de fin de carte',
          montant: totalVerse,
          date: dateRetrait,
          mode: 'Espèces',
          note: 'Solde intégral remis à la cliente.',
          clientId: client.id,
          carteId: carte.id,
          recuNumero: 'REC-' + year + '-0001',
          snapshot: {
            clientNom: client.nom,
            clientTel: client.telephone,
            clientQuartier: client.quartier,
            clientAdresse: client.adresse,
            clientPiece: client.pieceType + ' ' + client.pieceNumero,
            carteLabel: carte.label,
            totalVerse: totalVerse,
            soldeApres: 0,
            montantJournalier: carte.montantJournalier,
            dateDebut: carte.dateDebut,
            dateFin: carte.dateFin
          },
          createdAt: dateRetrait + 'T16:30:00.000Z'
        });
        carte.clotureeAt = dateRetrait;
      }
    });
  });

  d.operations.push(
    {
      id: uid('op'),
      type: 'entree',
      categorie: 'apport',
      libelle: 'Apport personnel',
      montant: 75000,
      date: addDays(today, -12),
      note: '',
      createdAt: addDays(today, -12) + 'T08:15:00.000Z'
    },
    {
      id: uid('op'),
      type: 'sortie',
      categorie: 'depense',
      libelle: 'Transport & carburant',
      montant: 12500,
      date: addDays(today, -3),
      note: '',
      createdAt: addDays(today, -3) + 'T18:05:00.000Z'
    },
    {
      id: uid('op'),
      type: 'sortie',
      categorie: 'prelevement',
      libelle: 'Prélèvement responsable',
      montant: 25000,
      date: addDays(today, -6),
      note: '',
      createdAt: addDays(today, -6) + 'T19:20:00.000Z'
    }
  );

  d.seq = { recu: 1, recuYear: year };
  d.version = 1; // la migration recalcule les statuts
  return normalizeDB(d);
}
