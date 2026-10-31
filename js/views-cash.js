'use strict';

/* ============================================================
   YVO Épargne — multi-cartes, trésorerie, paramètres
   ============================================================ */

function viewMulti() {
  let rows = db.clients.map(function (c) {
    return { client: c, totals: clientTotals(c) };
  }).filter(function (x) { return x.totals.nbCartes >= 2; });

  if (state.multiFilter === 'sans-retrait') {
    rows = rows.filter(function (x) { return x.totals.sansRetrait; });
  }
  const search = state.multiSearch.trim().toLowerCase();
  if (search) {
    rows = rows.filter(function (x) { return (x.client.nom || '').toLowerCase().indexOf(search) >= 0; });
  }
  rows.sort(function (a, b) { return b.totals.solde - a.totals.solde; });

  const allMulti = db.clients.map(function (c) {
    return { client: c, totals: clientTotals(c) };
  }).filter(function (x) { return x.totals.nbCartes >= 2; });
  const sansRetrait = allMulti.filter(function (x) { return x.totals.sansRetrait; });

  const stats = {
    clients: rows.length,
    cartes: sum(rows, function (x) { return x.totals.nbCartes; }),
    journalier: sum(rows, function (x) { return x.totals.journalier; }),
    cotise: sum(rows, function (x) { return x.totals.totalVerse; }),
    solde: sum(rows, function (x) { return x.totals.solde; }),
    objectif: sum(rows, function (x) { return x.totals.objectif; })
  };

  return '<div class="page">' +
    pageHead(
      'Épargne cumulée',
      'Clients multi-cartes',
      'Les clients qui cumulent plusieurs cartes, avec ou sans retrait. Tous les totaux sont additionnés.',
      '<button type="button" class="btn ghost" data-action="new-client">' + icon('plus', 16) + ' Nouveau client</button>'
    ) +
    '<div class="mini-kpis">' +
      '<div class="mini-kpi"><span>Clients affichés</span><strong>' + stats.clients + '</strong><em>' + sansRetrait.length + ' sans aucun retrait</em></div>' +
      '<div class="mini-kpi"><span>Cartes cumulées</span><strong>' + stats.cartes + '</strong><em>' + esc(money(stats.journalier)) + ' / jour</em></div>' +
      '<div class="mini-kpi"><span>Total cotisé</span><strong>' + esc(money(stats.cotise)) + '</strong><em>objectif ' + esc(money(stats.objectif)) + '</em></div>' +
      '<div class="mini-kpi"><span>Solde dû</span><strong>' + esc(money(stats.solde)) + '</strong><em>à rendre à ces clients</em></div>' +
    '</div>' +
    '<div class="toolbar">' +
      '<div class="seg-tabs inline-seg">' +
        '<button type="button" class="' + (state.multiFilter === 'sans-retrait' ? 'on' : '') + '" data-action="multi-filter" data-filter="sans-retrait">Sans retrait</button>' +
        '<button type="button" class="' + (state.multiFilter === 'tous' ? 'on' : '') + '" data-action="multi-filter" data-filter="tous">Tous les multi-cartes</button>' +
      '</div>' +
      '<div class="search-box grow">' + icon('search', 16) +
        '<input id="multi-search" type="search" placeholder="Rechercher un client…" value="' + esc(state.multiSearch) + '">' +
      '</div>' +
    '</div>' +
    '<div class="callout info">' + icon('layers', 18) +
      '<div><strong>Comment est calculé le solde dû ?</strong><span>Solde dû = total cotisé sur toutes les cartes − total déjà retiré. Le montant journalier cumulé est la somme des cartes actives. Un client sans retrait conserve donc toute son épargne.</span></div>' +
    '</div>' +
    (rows.length
      ? '<div class="multi-list">' + rows.map(function (x) {
          const c = x.client;
          const t = x.totals;
          return '<article class="multi-card">' +
            '<div class="mc-head">' +
              '<a class="mc-client" href="#/client/' + esc(c.id) + '">' + avatar(c.nom) +
                '<div><strong>' + esc(c.nom) + '</strong><span>' + icon('map-pin', 13) + ' ' + esc(c.quartier || 'Non classé') + ' · ' + esc(c.telephone || 'Sans téléphone') + '</span></div>' +
              '</a>' +
              '<div class="mc-badges">' + badge(t.nbCartes + ' cartes', 'blue') + (t.sansRetrait ? badge('Sans retrait', 'green') : badge(t.nbRetraits + ' retrait' + (t.nbRetraits > 1 ? 's' : ''), 'amber')) + (t.retard > 0 ? badge('Retard', 'red') : '') + '</div>' +
              '<div class="mc-solde"><span>Solde dû</span><strong>' + esc(money(t.solde)) + '</strong></div>' +
            '</div>' +
            '<div class="mc-cards">' +
              t.cartes.map(function (carte) {
                const ct = cardTotals(carte);
                return '<a class="mc-carte" href="#/client/' + esc(c.id) + '">' +
                  '<div class="mc-carte-top"><strong>' + esc(carte.label) + '</strong>' + statusBadge(carte) + '</div>' +
                  '<div class="mc-carte-nums"><span>' + esc(money(carte.montantJournalier)) + ' / jour</span><span>Cotisé ' + esc(money(ct.totalVerse)) + '</span><span>Solde ' + esc(money(ct.solde)) + '</span></div>' +
                  progressBar(ct.progression, ct.retard > 0 ? 'gold' : 'green') +
                '</a>';
              }).join('') +
            '</div>' +
            '<div class="mc-foot">' +
              '<div><span>Journalier cumulé</span><strong>' + esc(money(t.journalier)) + '</strong></div>' +
              '<div><span>Objectif total</span><strong>' + esc(money(t.objectif)) + '</strong></div>' +
              '<div><span>Cotisé</span><strong>' + esc(money(t.totalVerse)) + '</strong></div>' +
              '<div><span>Retiré</span><strong>' + esc(money(t.totalRetire)) + '</strong></div>' +
              '<div class="s"><span>Reste à cotiser</span><strong>' + esc(money(t.manquant)) + '</strong></div>' +
              '<a class="btn sm ghost" href="#/client/' + esc(c.id) + '">Fiche client ' + icon('chevron-right', 14) + '</a>' +
            '</div>' +
          '</article>';
        }).join('') + '</div>'
      : '<div class="panel">' + emptyState(
          'layers',
          state.multiFilter === 'sans-retrait' ? 'Aucun client multi-cartes sans retrait' : 'Aucun client multi-cartes',
          allMulti.length
            ? 'Passez sur « Tous les multi-cartes » pour voir les clients qui ont déjà effectué un retrait.'
            : 'Attribuez une deuxième carte à un client depuis sa fiche pour le retrouver ici.',
          '<a class="btn ghost" href="#/clients">Voir les clients</a>'
        ) + '</div>') +
  '</div>';
}

/* ============================================================
   Trésorerie
   ============================================================ */

function treasuryRange(period) {
  const t = todayISO();
  if (period === 'jour') return { from: t, to: t };
  if (period === '7j') return { from: addDays(t, -6), to: t };
  if (period === 'mois') return { from: monthStart(), to: t };
  if (period === 'annee') return { from: yearStart(), to: t };
  return { from: null, to: null };
}

function categoryTone(cat) {
  if (cat === 'versement') return 'green';
  if (cat === 'retrait') return 'amber';
  if (cat === 'depense' || cat === 'prelevement') return 'red';
  if (cat === 'apport') return 'blue';
  return 'gray';
}

function treasuryRowHTML(m) {
  const isIn = m.type === 'entree';
  const client = m.clientId ? clientById(m.clientId) : null;
  const clientCell = client
    ? '<a class="table-link" href="#/client/' + esc(client.id) + '">' + esc(client.nom) + '</a>'
    : (m.clientNom ? esc(m.clientNom) : '<span class="muted">—</span>');
  let actions = '';
  if (m.kind === 'versement' && client) {
    actions = '<a class="icon-btn sm" href="#/client/' + esc(client.id) + '" title="Ouvrir la fiche">' + icon('arrow-up-right', 14) + '</a>';
  } else {
    if (m.categorie === 'retrait') {
      actions += '<button type="button" class="icon-btn sm" data-action="open-receipt" data-op="' + esc(m.id) + '" title="Voir le reçu">' + icon('printer', 14) + '</button>';
    }
    actions += '<button type="button" class="icon-btn sm danger" data-action="delete-op" data-op="' + esc(m.id) + '" title="Supprimer l’opération">' + icon('trash', 14) + '</button>';
  }
  const subline = [m.carteLabel, m.recuNumero, m.mode].filter(Boolean).join(' · ');
  return '<tr>' +
    '<td class="nowrap">' + esc(fmtDate(m.date, 'short')) + '</td>' +
    '<td><div class="t-op"><span class="t-ic ' + (isIn ? 'in' : 'out') + '">' + icon(isIn ? 'arrow-down' : 'arrow-up', 14) + '</span>' +
      '<div><strong>' + esc(m.libelle) + '</strong>' + (subline ? '<span>' + esc(subline) + '</span>' : '') + '</div></div></td>' +
    '<td>' + clientCell + '</td>' +
    '<td>' + badge(CAT_LABELS[m.categorie] || '—', categoryTone(m.categorie)) + '</td>' +
    '<td class="num in">' + (isIn ? '+' + esc(money(m.montant)) : '') + '</td>' +
    '<td class="num out">' + (!isIn ? '−' + esc(money(m.montant)) : '') + '</td>' +
    '<td class="right nowrap">' + actions + '</td>' +
  '</tr>';
}

function viewTresorerie() {
  const t = todayISO();
  const range = treasuryRange(state.treasuryPeriod);
  const all = cashTotals(null, null);
  const day = cashTotals(t, t);
  const month = cashTotals(monthStart(), t);
  const year = cashTotals(yearStart(), t);
  const balance = cashBalance();
  const soldeDus = sum(db.clients.map(clientTotals), function (x) { return x ? x.solde : 0; });

  let movements = movementList();
  if (range.from) movements = movements.filter(function (m) { return m.date >= range.from; });
  if (range.to) movements = movements.filter(function (m) { return m.date <= range.to; });
  if (state.treasuryType === 'entrees') movements = movements.filter(function (m) { return m.type === 'entree'; });
  if (state.treasuryType === 'sorties') movements = movements.filter(function (m) { return m.type === 'sortie'; });
  if (state.treasuryType === 'retraits') movements = movements.filter(function (m) { return m.categorie === 'retrait'; });
  const modeFilter = state.treasuryMode;
  const byMode = { especes: 0, airtel: 0, moov: 0 };
  movements.forEach(function (m) {
    if (m.type !== 'entree') return;
    PAY_MODES.forEach(function (k) { byMode[k] += movementAmountForMode(m, k); });
  });
  if (modeFilter !== 'tous') {
    movements = movements
      .map(function (m) {
        const part = movementAmountForMode(m, modeFilter);
        return part === m.montant ? m : Object.assign({}, m, { montant: part });
      })
      .filter(function (m) { return m.montant > 0; });
  }

  const filteredIn = sum(movements.filter(function (m) { return m.type === 'entree'; }), function (m) { return m.montant; });
  const filteredOut = sum(movements.filter(function (m) { return m.type === 'sortie'; }), function (m) { return m.montant; });
  const shown = movements.slice(0, 200);
  const periods = [
    { key: 'jour', label: 'Aujourd’hui', data: day },
    { key: 'mois', label: 'Ce mois', data: month },
    { key: 'annee', label: 'Cette année', data: year }
  ];

  return '<div class="page">' +
    pageHead(
      'Caisse & mouvements',
      'Trésorerie',
      'Chaque versement, retrait ou dépense met la caisse à jour instantanément.',
      '<button type="button" class="btn ghost" data-action="new-operation" data-type="entree">' + icon('plus', 15) + ' Entrée</button>' +
      '<button type="button" class="btn ghost" data-action="new-operation" data-type="sortie">' + icon('minus', 15) + ' Sortie</button>' +
      '<button type="button" class="btn primary" data-action="new-retrait">' + icon('receipt', 15) + ' Payer un client</button>'
    ) +
    '<section class="cash-hero">' +
      '<div class="cash-main">' +
        '<span class="cash-label">Caisse disponible</span>' +
        '<strong class="cash-value">' + esc(money(balance)) + '</strong>' +
        '<span class="cash-formula">Fonds de départ ' + esc(money(db.settings.soldeInitial)) + ' + entrées − sorties</span>' +
      '</div>' +
      '<div class="cash-side">' +
        '<div><span>Total entrées</span><strong class="in">+' + esc(money(all.entrees, true)) + '</strong></div>' +
        '<div><span>Total sorties</span><strong class="out">−' + esc(money(all.sorties, true)) + '</strong></div>' +
        '<div><span>Solde dû aux clients</span><strong>' + esc(money(soldeDus, true)) + '</strong></div>' +
      '</div>' +
    '</section>' +
    '<div class="period-cards">' +
      periods.map(function (p) {
        return '<article class="period-card">' +
          '<div class="pc-head"><span>' + p.label + '</span>' + icon(p.key === 'jour' ? 'clock' : p.key === 'mois' ? 'calendar' : 'database', 16) + '</div>' +
          '<div class="pc-row"><span>Entrées</span><strong class="in">+' + esc(money(p.data.entrees, true)) + '</strong></div>' +
          '<div class="pc-row"><span>Sorties</span><strong class="out">−' + esc(money(p.data.sorties, true)) + '</strong></div>' +
          '<div class="pc-net"><span>Net</span><strong class="' + (p.data.net >= 0 ? 'green' : 'red') + '">' + (p.data.net >= 0 ? '+' : '−') + esc(money(Math.abs(p.data.net), true)) + '</strong></div>' +
        '</article>';
      }).join('') +
    '</div>' +
    '<section class="panel">' +
      '<div class="panel-head"><div><h2>Journal de caisse</h2><p class="panel-sub">' + numberFR(movements.length) + ' mouvement' + (movements.length > 1 ? 's' : '') + ' sur la période.</p></div>' +
        '<div class="journal-tools">' +
          '<select id="treasury-type" class="select-sm">' +
            '<option value="tout"' + (state.treasuryType === 'tout' ? ' selected' : '') + '>Tous les types</option>' +
            '<option value="entrees"' + (state.treasuryType === 'entrees' ? ' selected' : '') + '>Entrées</option>' +
            '<option value="sorties"' + (state.treasuryType === 'sorties' ? ' selected' : '') + '>Sorties</option>' +
            '<option value="retraits"' + (state.treasuryType === 'retraits' ? ' selected' : '') + '>Retraits clients</option>' +
          '</select>' +
          '<select id="treasury-mode" class="select-sm">' +
            [['tous', 'Tous les modes'], ['especes', 'Espèces'], ['mobile', 'Mobile Money'], ['airtel', 'Airtel Money'], ['moov', 'Moov Money']].map(function (o) {
              return '<option value="' + o[0] + '"' + (modeFilter === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
            }).join('') +
          '</select>' +
        '</div>' +
      '</div>' +
      '<div class="chips">' +
        [['jour', 'Aujourd’hui'], ['7j', '7 jours'], ['mois', 'Ce mois'], ['annee', 'Cette année'], ['tout', 'Tout']].map(function (p) {
          return '<button type="button" class="chip' + (state.treasuryPeriod === p[0] ? ' active' : '') + '" data-action="treasury-period" data-period="' + p[0] + '">' + p[1] + '</button>';
        }).join('') +
      '</div>' +
      (shown.length
        ? '<div class="movement-list only-mobile">' + shown.map(function (m) { return movementRowHTML(m, true); }).join('') + '</div>' +
        '<div class="table-wrap only-desktop"><table class="table treasury-table"><thead><tr><th>Date</th><th>Opération</th><th>Client</th><th>Type</th><th class="right">Entrée</th><th class="right">Sortie</th><th></th></tr></thead><tbody>' +
          shown.map(treasuryRowHTML).join('') +
        '</tbody></table></div>' +
        (movements.length > 200 ? '<p class="table-note">Affichage des 200 mouvements les plus récents. Affinez la période pour voir le reste.</p>' : '') +
        '<div class="mode-split">' + PAY_MODES.map(function (k) {
          return '<div class="mode-' + k + '"><span>' + payModeIcon(k, 18) + esc(PAY_MODE_SHORT[k]) + '</span><strong>+' + esc(money(byMode[k], true)) + '</strong></div>';
        }).join('') + '</div>' +
        '<div class="journal-foot">' +
          '<div><span>Entrées de la période</span><strong class="in">+' + esc(money(filteredIn)) + '</strong></div>' +
          '<div><span>Sorties de la période</span><strong class="out">−' + esc(money(filteredOut)) + '</strong></div>' +
          '<div><span>Net</span><strong class="' + (filteredIn - filteredOut >= 0 ? 'green' : 'red') + '">' + (filteredIn - filteredOut >= 0 ? '+' : '−') + esc(money(Math.abs(filteredIn - filteredOut))) + '</strong></div>' +
        '</div>'
        : '<p class="muted pad">Aucun mouvement sur cette période.</p>') +
    '</section>' +
  '</div>';
}

/* ============================================================
   Paramètres
   ============================================================ */

function viewParametres() {
  const company = db.settings.company;
  const all = cashTotals(null, null);
  const balance = cashBalance();
  const soldeDus = sum(db.clients.map(clientTotals), function (x) { return x ? x.solde : 0; });
  const totalManipule = (Number(db.settings.soldeInitial) || 0) + all.entrees;
  const autoLock = Number(db.settings.autoLock) || 0;

  return '<div class="page">' +
    pageHead('Réglages', 'Réglages', 'Votre entreprise, votre caisse et la protection de vos données.') +
    '<div class="settings-grid">' +
      '<section class="setting-card">' +
        '<div class="setting-head"><span class="setting-ic">' + icon('building', 19) + '</span><div><h2>Mon entreprise</h2><p>Ces informations figurent sur les reçus.</p></div></div>' +
        '<form id="form-settings-company" data-form="settings-company" autocomplete="off">' +
          '<div class="form-grid">' +
            '<label class="field"><span>Nom de l’entreprise *</span><input name="nom" required value="' + esc(company.nom) + '"></label>' +
            '<label class="field"><span>Votre nom</span><input name="responsable" value="' + esc(company.responsable) + '"></label>' +
            '<label class="field"><span>Téléphone</span><input name="telephone" type="tel" value="' + esc(company.telephone) + '"></label>' +
            '<label class="field"><span>Indicatif du pays (WhatsApp)</span><input name="indicatif" inputmode="numeric" value="' + esc(db.settings.indicatif || '') + '" placeholder="Ex. 221"><small>Pour envoyer les reçus aux clients par WhatsApp.</small></label>' +
          '</div>' +
          '<details class="more"><summary>Plus d’informations</summary><div class="form-grid">' +
            '<label class="field"><span>Email</span><input name="email" type="email" value="' + esc(company.email) + '"></label>' +
            '<label class="field"><span>Ville</span><input name="ville" value="' + esc(company.ville) + '"></label>' +
            '<label class="field span2"><span>Adresse</span><input name="adresse" value="' + esc(company.adresse) + '"></label>' +
            '<label class="field span2"><span>Activité</span><input name="activite" value="' + esc(company.activite) + '"></label>' +
          '</div></details>' +
          '<div class="form-actions"><button type="submit" class="btn primary">' + icon('check', 15) + ' Enregistrer</button></div>' +
        '</form>' +
      '</section>' +
      cardTypesSection() +
      '<section class="setting-card">' +
        '<div class="setting-head"><span class="setting-ic">' + icon('wallet', 19) + '</span><div><h2>Ma caisse</h2><p>Caisse actuelle : <strong>' + esc(money(balance)) + '</strong></p></div></div>' +
        '<form id="form-settings-account" data-form="settings-account" autocomplete="off">' +
          '<div class="form-grid">' +
            '<label class="field"><span>Argent de départ en caisse</span><div class="input-suffix"><input name="soldeInitial" type="number" min="0" step="1" value="' + Number(db.settings.soldeInitial || 0) + '"><span>' + esc(db.settings.devise) + '</span></div><small>Le modifier recalcule la caisse.</small></label>' +
            '<label class="field"><span>Monnaie</span><select name="devise">' + CURRENCIES.map(function (c) {
              return '<option value="' + esc(c) + '"' + (db.settings.devise === c ? ' selected' : '') + '>' + esc(c) + '</option>';
            }).join('') + '</select><small>Ne convertit pas les montants déjà saisis.</small></label>' +
          '</div>' +
          '<div class="form-actions"><button type="submit" class="btn primary">' + icon('check', 15) + ' Enregistrer</button></div>' +
        '</form>' +
      '</section>' +
      '<section class="setting-card">' +
        '<div class="setting-head"><span class="setting-ic">' + icon('lock', 19) + '</span><div><h2>Accès réservé à Yvo</h2><p>L’application s’ouvre uniquement avec le mot de passe de Yvo.</p></div></div>' +
        '<div class="security-actions">' +
          '<button type="button" class="btn ghost" data-action="lock-now">' + icon('log-out', 15) + ' Verrouiller maintenant</button>' +
        '</div>' +
        '<label class="field auto-lock"><span>Verrouiller tout seul après</span><select id="auto-lock">' +
          [[0, 'Jamais'], [1, '1 minute'], [5, '5 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 heure']].map(function (o) {
            return '<option value="' + o[0] + '"' + (autoLock === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
          }).join('') +
        '</select></label>' +
      '</section>' +
      '<section class="setting-card">' +
        '<div class="setting-head"><span class="setting-ic">' + icon('database', 19) + '</span><div><h2>Sauvegardes</h2><p>Vos données sont enregistrées automatiquement sur ce téléphone.</p></div></div>' +
        '<div class="backup-row">' +
          '<div><strong>Dernière sauvegarde envoyée</strong><span>' + (db.settings.lastBackup ? fmtDateTime(db.settings.lastBackup) : 'Aucune pour l’instant') + '</span></div>' +
          '<button type="button" class="btn primary" data-action="share-backup">' + icon('share', 15) + ' Envoyer</button>' +
        '</div>' +
        '<div class="backup-actions">' +
          '<button type="button" class="btn ghost" data-action="export-csv" data-what="clients">' + icon('download', 15) + ' Clients (Excel)</button>' +
          '<button type="button" class="btn ghost" data-action="export-csv" data-what="versements">' + icon('download', 15) + ' Versements (Excel)</button>' +
          '<button type="button" class="btn ghost" data-action="export-csv" data-what="operations">' + icon('download', 15) + ' Caisse (Excel)</button>' +
        '</div>' +
        '<details class="more"><summary>Options avancées</summary>' +
          '<div class="health-list">' +
            '<div class="health ' + (storageInfo.persisted ? 'ok' : 'warn') + '">' + icon(storageInfo.persisted ? 'check-circle' : 'alert', 18) + '<span><strong>Stockage protégé</strong><em>' + (storageInfo.persisted ? 'Le téléphone ne nettoiera pas vos données' : 'Ajoutez l’application à l’écran d’accueil pour l’obtenir') + '</em></span></div>' +
          '</div>' +
          '<div class="backup-actions">' +
            '<button type="button" class="btn ghost" data-action="export-data">' + icon('download', 15) + ' Copie complète (fichier)</button>' +
            '<label class="btn ghost file-btn">' + icon('upload', 15) + ' Importer une copie<input type="file" id="import-file" accept="application/json,.json" hidden></label>' +
          '</div>' +
          '<h3 class="sub-h">Retours en arrière</h3>' +
          '<div id="snap-list" class="snap-list"><p class="muted">Chargement…</p></div>' +
          '<div class="backup-actions">' +
            '<button type="button" class="btn ghost" data-action="snapshot-now">' + icon('history', 15) + ' Créer un retour en arrière maintenant</button>' +
            (db.settings.demo ? '<button type="button" class="btn ghost" data-action="reset-demo">Quitter la démonstration</button>' : '') +
            '<button type="button" class="btn danger-ghost" data-action="erase-data">' + icon('trash', 15) + ' Tout effacer</button>' +
          '</div>' +
        '</details>' +
      '</section>' +
    '</div>' +
  '</div>';
}
