'use strict';

/* ============================================================
   YVO Épargne — la caisse et les réglages
   ============================================================ */

function caisseRowHTML(m) {
  const isIn = m.type === 'entree';
  const client = m.clientId ? clientById(m.clientId) : null;
  const what = m.kind === 'versement' ? 'A payé'
    : m.categorie === 'retrait' ? 'Argent rendu'
    : m.categorie === 'pret' ? 'Prêt'
    : m.categorie === 'depense' ? 'Dépense'
    : isIn ? 'Argent reçu' : 'Argent sorti';
  const title = m.clientNom || m.libelle;
  const sub = m.clientNom ? what : (m.libelle && m.libelle !== what ? what : '');
  const main = '<span class="crow2-main"><strong>' + esc(title) + '</strong>' + (sub ? '<em>' + esc(sub) + '</em>' : '') + '</span>' +
    '<b class="' + (isIn ? 'green' : 'red') + '">' + (isIn ? '+' : '−') + esc(money(m.montant, true)) + '</b>';
  if (client) return '<a class="crow2" href="#/client/' + esc(client.id) + '">' + main + '</a>';
  return '<div class="crow2">' + main +
    (m.kind === 'operation' ? '<button type="button" class="icon-btn sm danger" data-action="delete-op" data-op="' + esc(m.id) + '" aria-label="Supprimer">' + icon('trash', 15) + '</button>' : '') +
  '</div>';
}

function viewTresorerie() {
  const t = todayISO();
  const day = state.caisseDate && state.caisseDate <= t ? state.caisseDate : t;
  const totals = cashTotals(day, day);
  const modes = cashByMode();
  const rows = movementList().filter(function (m) { return m.date === day; });
  return '<div class="page simple-page">' +
    '<h1 class="simple-title">Caisse</h1>' +
    '<section class="simple-cash"><span>Mon argent</span><strong id="caisse-total">' + esc(money(cashBalance())) + '</strong></section>' +
    '<div class="simple-split">' + PAY_MODES.map(function (k) {
      return '<div class="mode-' + k + '"><span>' + esc(PAY_MODE_SHORT[k]) + '</span><strong>' + esc(money(modes[k], true)) + '</strong></div>';
    }).join('') + '</div>' +
    '<div class="simple-day">' +
      '<button type="button" class="icon-btn" data-action="caisse-day" data-delta="-1" aria-label="Jour d’avant">' + icon('chevron-left', 24) + '</button>' +
      '<strong>' + (day === t ? 'Aujourd’hui' : esc(capitalize(fmtDate(day, 'day')))) + '</strong>' +
      '<button type="button" class="icon-btn" data-action="caisse-day" data-delta="1" aria-label="Jour d’après"' + (day === t ? ' disabled' : '') + '>' + icon('chevron-right', 24) + '</button>' +
    '</div>' +
    '<div class="simple-split two">' +
      '<div><span>Reçu</span><strong class="green" id="caisse-in">' + (totals.entrees ? '+' : '') + esc(money(totals.entrees, true)) + '</strong></div>' +
      '<div><span>Donné</span><strong class="red" id="caisse-out">' + (totals.sorties ? '−' : '') + esc(money(totals.sorties, true)) + '</strong></div>' +
    '</div>' +
    (rows.length
      ? '<div class="crow2-list" id="caisse-list">' + rows.map(caisseRowHTML).join('') + '</div>'
      : '<p class="muted simple-none">Rien ce jour-là.</p>') +
  '</div>';
}

/* ============================================================
   Réglages
   ============================================================ */

function viewParametres() {
  const company = db.settings.company;
  const balance = cashBalance();
  const autoLock = Number(db.settings.autoLock) || 0;

  return '<div class="page simple-page">' +
    '<h1 class="simple-title">Réglages</h1>' +
    '<div class="settings-grid">' +
      '<section class="setting-card">' +
        '<div class="setting-head"><span class="setting-ic">' + icon('user', 19) + '</span><div><h2>Mon profil</h2><p>Ces informations figurent sur les reçus.</p></div></div>' +
        '<form id="form-settings-company" data-form="settings-company" autocomplete="off">' +
          '<div class="form-grid">' +
            '<label class="field"><span>Votre nom</span><input name="responsable" value="' + esc(company.responsable) + '"></label>' +
            '<label class="field"><span>Téléphone</span><input name="telephone" type="tel" value="' + esc(company.telephone) + '"></label>' +
            '<label class="field span2"><span>Nom sur les reçus *</span><input name="nom" required value="' + esc(company.nom) + '"></label>' +
          '</div>' +
          '<div class="form-actions"><button type="submit" class="btn primary">' + icon('check', 15) + ' Enregistrer</button></div>' +
        '</form>' +
      '</section>' +
      '<section class="setting-card">' +
        '<div class="setting-head"><span class="setting-ic">' + icon('wallet', 19) + '</span><div><h2>Ma caisse</h2><p>Mon argent : <strong>' + esc(money(balance)) + '</strong></p></div></div>' +
        '<form id="form-settings-account" data-form="settings-account" autocomplete="off">' +
          '<div class="form-grid">' +
            '<label class="field"><span>Argent de départ en caisse</span><div class="input-suffix"><input name="soldeInitial" type="number" min="0" step="1" value="' + Number(db.settings.soldeInitial || 0) + '"><span>' + esc(db.settings.devise) + '</span></div><small>Changer ce chiffre change aussi « Mon argent ».</small></label>' +
            '<input type="hidden" name="devise" value="' + esc(db.settings.devise) + '">' +
          '</div>' +
          '<div class="form-actions"><button type="submit" class="btn primary">' + icon('check', 15) + ' Enregistrer</button></div>' +
        '</form>' +
      '</section>' +
      '<section class="setting-card">' +
        '<div class="setting-head"><span class="setting-ic">' + icon('lock', 19) + '</span><div><h2>Fermer l’application</h2><p>Il faut ensuite le mot de passe pour l’ouvrir.</p></div></div>' +
        '<div class="security-actions">' +
          '<button type="button" class="btn ghost" data-action="lock-now">' + icon('log-out', 15) + ' Verrouiller</button>' +
        '</div>' +
        '<label class="field auto-lock"><span>Verrouiller tout seul après</span><select id="auto-lock">' +
          [[0, 'Jamais'], [1, '1 minute'], [5, '5 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 heure']].map(function (o) {
            return '<option value="' + o[0] + '"' + (autoLock === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
          }).join('') +
        '</select></label>' +
      '</section>' +
      '<section class="setting-card">' +
        '<div class="setting-head"><span class="setting-ic">' + icon('cloud', 19) + '</span><div><h2>Mes données</h2><p>Tout est gardé en ligne tout seul. Sans réseau, ça continue et ça part quand le réseau revient.</p></div></div>' +
        '<div class="backup-row">' +
          '<div><strong>' + esc(syncStatusLabel()) + '</strong><span>' + (syncState.lastOkAt ? 'Dernier envoi : ' + esc(fmtDateTime(new Date(syncState.lastOkAt).toISOString())) : 'Pas encore envoyé') + '</span></div>' +
        '</div>' +
        '<h3 class="sub-h">Copier vers Excel</h3>' +
        '<div class="backup-actions">' +
          '<button type="button" class="btn ghost" data-action="export-csv" data-what="clients">' + icon('download', 15) + ' Clients</button>' +
          '<button type="button" class="btn ghost" data-action="export-csv" data-what="versements">' + icon('download', 15) + ' Paiements</button>' +
          '<button type="button" class="btn ghost" data-action="export-csv" data-what="operations">' + icon('download', 15) + ' Caisse</button>' +
        '</div>' +
      '</section>' +
    '</div>' +
  '</div>';
}
