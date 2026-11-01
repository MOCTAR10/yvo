'use strict';

/* ============================================================
   YVO Épargne — écran Synchronisation (copie serveur, appareils,
   traçabilité)
   ============================================================ */

let syncInfo = null;      // { counts, devices, head }
let syncAudit = null;     // liste d'événements

const AUDIT_LABELS = { create: 'Création', update: 'Modification', delete: 'Suppression', conflict: 'Conflit' };

function syncForm(prefix) {
  const sameOrigin = /^https?:$/.test(location.protocol);
  return '<form id="' + prefix + '-form" data-form="sync-connect" autocomplete="off">' +
    (sameOrigin ? '' : '<label class="field"><span>Adresse du serveur *</span><input name="server" type="url" required placeholder="https://yvo.mon-serveur.com" value="' + esc((syncCfg && syncCfg.server) || '') + '"></label>') +
    '<label class="field"><span>Nom de votre espace *</span><input name="name" required minlength="3" placeholder="Ex. yvo-collecte" autocapitalize="off"></label>' +
    '<label class="field"><span>Mot de passe *</span><input name="password" type="password" required minlength="8" autocomplete="current-password" placeholder="8 caractères minimum"></label>' +
    '<input type="hidden" name="deviceName" value="' + esc(deviceDefaultName()) + '">' +
    '<details class="more"><summary>Première fois sur ce serveur ?</summary><label class="field"><span>Code d’installation</span><input name="setupCode" placeholder="Donné par la personne qui a installé le serveur"></label></details>' +
    '<div class="form-actions">' +
      '<button type="submit" name="mode" value="login" class="btn primary lg">' + icon('cloud', 17) + ' J’ai déjà un espace : me connecter</button>' +
      '<button type="submit" name="mode" value="register" class="btn ghost lg">C’est ma première fois : créer mon espace</button>' +
    '</div>' +
    '<p class="hint">Se connecter retrouve toutes vos données sur ce téléphone. Créer l’espace envoie les données de ce téléphone en ligne.</p>' +
  '</form>';
}

function viewSync() {
  const connected = !!syncCfg;
  const pending = connected ? countPending() : 0;
  let body = '';
  if (!connected) {
    body =
      '<div class="callout warn">' + icon('alert', 18) + '<div><strong>Vos données ne sont que sur ce téléphone</strong><span>Si le téléphone est perdu ou cassé, tout serait perdu. Activez la sauvegarde en ligne pour être tranquille.</span></div></div>' +
      '<div class="panel pad"><h3>Activer la sauvegarde en ligne</h3>' + syncForm('sync') + '</div>';
  } else {
    const st = syncState.status;
    body =
      '<div class="sync-hero ' + st + '">' +
        '<span class="sync-hero-ic">' + icon(st === 'error' ? 'alert' : 'cloud', 26) + '</span>' +
        '<div><strong>' + esc(syncStatusLabel()) + '</strong><span>Espace « ' + esc(syncCfg.account) + ' »</span>' +
        '<span>' + (pending ? pending + ' modification(s) pas encore envoyée(s)' : 'Tout est sauvegardé') + '</span></div>' +
      '</div>' +
      '<div class="inline-actions">' +
        '<button type="button" class="btn primary lg" data-action="sync-now">' + icon('refresh', 17) + ' Synchroniser</button>' +
        '<button type="button" class="btn ghost" data-action="sync-info">Actualiser</button>' +
      '</div>' +
      '<div class="panel pad"><h3>Tout est gardé en sécurité</h3><p class="muted">Chaque versement, reçu et modification est conservé en ligne. En cas de désaccord avec un client, vous pouvez le prouver.</p>' +
        '<details class="more"><summary>Voir les détails</summary>' + syncInfoHTML() +
        '<div class="inline-actions"><button type="button" class="btn ghost" data-action="sync-audit">Voir l’historique complet</button>' +
        '<button type="button" class="btn ghost" data-action="sync-export">Télécharger une copie</button></div>' +
        '<div id="audit-box">' + syncAuditHTML() + '</div></details></div>' +
      (syncState.conflicts.length
        ? '<div class="panel pad"><h3>Modifications croisées</h3>' + syncState.conflicts.map(function (c) {
            return '<div class="snap"><div><strong>' + esc(c.kind) + '</strong><span>' + esc(fmtDateTime(c.at)) + ' · version ' + (c.winner === 'server' ? 'du serveur' : 'de cet appareil') + ' retenue</span></div></div>';
          }).join('') + '</div>'
        : '') +
      '<details class="more"><summary>Déconnecter ce téléphone</summary><p class="muted">Ce téléphone ne sera plus sauvegardé. Vos données restent ici et en ligne.</p>' +
        '<button type="button" class="btn danger-ghost" data-action="sync-disconnect">' + icon('x', 15) + ' Arrêter sur ce téléphone</button></details>';
  }
  return '<div class="page">' +
    pageHead('Sécurité', 'Sauvegarde en ligne', 'Une copie de vos données est gardée en ligne. Si le téléphone est perdu, vous retrouvez tout sur un nouveau.') +
    body + '</div>';
}

function syncInfoHTML() {
  if (!syncInfo) return '<p class="muted">Touchez « Actualiser les infos » pour voir le contenu du serveur.</p>';
  const labels = { clients: 'Clients', cartes: 'Cartes', versements: 'Versements', operations: 'Opérations de caisse', recus: 'Reçus', activity: 'Journal d’activité', clotures: 'Clôtures', trash: 'Corbeille' };
  return '<div class="mini-kpis">' + Object.keys(labels).map(function (k) {
    return '<div class="mini-kpi"><span>' + labels[k] + '</span><strong>' + numberFR((syncInfo.counts || {})[k] || 0) + '</strong></div>';
  }).join('') + '</div>' +
  '<h4>Téléphones et ordinateurs connectés</h4>' + (syncInfo.devices || []).map(function (d) {
    return '<div class="snap"><div><strong>' + esc(d.name || d.id) + (syncCfg && d.id === syncCfg.deviceId ? ' (cet appareil)' : '') + '</strong><span>Dernière activité : ' + esc(d.last_seen ? fmtDateTime(d.last_seen) : '—') + '</span></div></div>';
  }).join('');
}

function syncAuditHTML() {
  if (!syncAudit) return '';
  if (!syncAudit.length) return '<p class="muted">Aucun événement.</p>';
  return '<div class="audit-list">' + syncAudit.map(function (e) {
    return '<div class="audit-row"><em>' + esc(fmtDateTime(e.at)) + '</em><strong>' + esc(AUDIT_LABELS[e.action] || e.action) + '</strong>' +
      '<span>' + esc(e.kind) + ' · ' + esc(e.device || '') + '</span></div>';
  }).join('') + '</div>';
}

function loadSyncInfo() {
  return syncApi('/api/me').then(function (r) { syncInfo = r; if (state.route && state.route.name === 'sync') rerender(); })
    .catch(function (e) { toast(e.message || 'Serveur injoignable.', 'error'); });
}

function loadSyncAudit() {
  return syncApi('/api/audit?limit=60').then(function (r) { syncAudit = r.events || []; if (state.route && state.route.name === 'sync') rerender(); })
    .catch(function (e) { toast(e.message || 'Serveur injoignable.', 'error'); });
}

/* Écran d'accueil : restaurer sur un nouveau téléphone */
function openWelcomeConnect() {
  openModal({
    title: 'Retrouver mes données',
    subtitle: 'Connectez-vous à votre espace pour restaurer tout sur ce téléphone.',
    body: syncForm('welcome')
  });
}

function connectFromForm(form, submitter) {
  const f = new FormData(form);
  const mode = (submitter && submitter.value) || 'login';
  const payload = {
    server: String(f.get('server') || '').trim(),
    name: String(f.get('name') || '').trim(),
    password: String(f.get('password') || ''),
    setupCode: String(f.get('setupCode') || '').trim(),
    deviceName: String(f.get('deviceName') || '').trim()
  };
  toast('Connexion…', 'info');
  syncConnect(mode, payload).then(function () {
    const wasEmpty = !db;
    if (!db) db = emptyDB();
    closeModal();
    toast(mode === 'register' ? 'Espace créé. Envoi de vos données…' : 'Connecté. Récupération de vos données…', 'success');
    return syncNow(true).then(function () {
      if (wasEmpty || state.locked || document.getElementById('app').hidden) { saveDB(); startApp(); }
      navigate('#/sync');
      loadSyncInfo();
    });
  }).catch(function (err) {
    toast(err && err.message ? err.message : 'Connexion impossible.', 'error');
  });
}
