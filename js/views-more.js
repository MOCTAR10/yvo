'use strict';

/* ============================================================
   YVO Épargne — Plus, Activité, Risques, Clôture, Corbeille
   ============================================================ */

/* ------------------------------------------------------------
   Menu « Plus »
   ------------------------------------------------------------ */

function plusGroup(title, ids) {
  return '<h3 class="menu-title">' + esc(title) + '</h3><div class="menu-list">' +
    ids.map(function (id) {
      const n = NAV_MORE.find(function (x) { return x.id === id; });
      if (!n) return '';
      return '<a class="menu-item" href="' + n.href + '">' +
        '<span class="menu-ic">' + icon(n.icon, 21) + '</span>' +
        '<span class="menu-text"><strong>' + esc(n.label) + '</strong><em>' + esc(n.desc) + '</em></span>' +
        (n.id === 'corbeille' && db.trash.length ? '<i class="menu-count">' + db.trash.length + '</i>' : '') +
        (n.id === 'alertes' ? '<i class="menu-count" data-alert-badge hidden></i>' : '') +
        icon('chevron-right', 18, 'menu-chev') +
      '</a>';
    }).join('') + '</div>';
}

function viewPlus() {
  const company = db.settings.company;
  const online = syncState.status === 'idle';
  return '<div class="page plus-page">' +
    '<section class="me-card">' +
      '<span class="brand-mark">' + esc(initials(company.nom || 'Y')) + '</span>' +
      '<div><strong>' + esc(company.nom) + '</strong><span>' + esc(company.responsable || company.activite || '') + '</span></div>' +
    '</section>' +
    '<div class="safe-card ' + (online ? 'ok' : 'warn') + '">' +
      icon(online ? 'cloud' : 'alert', 22) +
      '<span><strong>' + (online ? 'Vos données sont en ligne' : esc(syncStatusLabel())) + '</strong>' +
      '<em>' + (online ? 'Tout est enregistré automatiquement.' : 'L’application continue ; l’envoi se fera dès que possible.') + '</em></span>' +
    '</div>' +
    plusGroup('Chaque jour', ['alertes', 'risques', 'cloture', 'recus']) +
    plusGroup('Mon argent', ['commission', 'multi', 'activite']) +
    plusGroup('Réglages', ['corbeille', 'parametres']) +
    '<div class="menu-list">' +
      ('<button type="button" class="menu-item" data-action="lock-now"><span class="menu-ic">' + icon('lock', 21) + '</span><span class="menu-text"><strong>Verrouiller</strong><em>Protéger l’application</em></span></button>') +
    '</div>' +
    '<p class="version-line">YVO Épargne ' + APP_VERSION + ' · marche aussi sans internet</p>' +
  '</div>';
}

/* ------------------------------------------------------------
   Activité
   ------------------------------------------------------------ */

function activityItemHTML(a, withClient) {
  const k = ACTIVITY_KINDS[a.kind] || ACTIVITY_KINDS.systeme;
  const d = new Date(a.at);
  const time = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  const client = a.clientId ? clientById(a.clientId) : null;
  return '<div class="feed-item">' +
    '<span class="feed-ic ' + k.tone + '">' + icon(k.icon, 16) + '</span>' +
    '<div class="feed-main">' +
      '<div class="feed-text">' + esc(a.text) + '</div>' +
      '<div class="feed-meta"><span>' + time + '</span><span class="dot">·</span><span>' + esc(k.label) + '</span>' +
        (withClient !== false && (client || a.clientNom) ? '<span class="dot">·</span>' + (client ? '<a href="#/client/' + esc(client.id) + '">' + esc(client.nom) + '</a>' : '<span>' + esc(a.clientNom) + '</span>') : '') +
        (withClient === false ? '<span class="dot">·</span><span>' + esc(fmtDate(a.date, 'medium')) + '</span>' : '') +
      '</div>' +
    '</div>' +
    (a.montant ? '<div class="feed-amt ' + (a.kind === 'versement' || (a.kind === 'caisse' && /Entrée/i.test(a.text)) ? 'in' : (a.kind === 'paiement' || a.kind === 'suppression' || a.kind === 'caisse' ? 'out' : '')) + '">' + esc(money(a.montant, true)) + '</div>' : '') +
  '</div>';
}

function activityFiltered() {
  const t = todayISO();
  let from = null;
  if (state.actPeriod === 'jour') from = t;
  else if (state.actPeriod === '7j') from = addDays(t, -6);
  else if (state.actPeriod === 'mois') from = monthStart();
  else if (state.actPeriod === 'annee') from = yearStart();
  const q = state.actSearch.trim().toLowerCase();
  return db.activity.filter(function (a) {
    if (from && a.date < from) return false;
    if (state.actKind !== 'tous' && a.kind !== state.actKind) return false;
    if (state.actClient !== 'tous' && a.clientId !== state.actClient) return false;
    if (state.actQuartier !== 'tous') {
      const c = a.clientId ? clientById(a.clientId) : null;
      if (!c || (c.quartier || 'Non classé') !== state.actQuartier) return false;
    }
    if (q && (a.text + ' ' + (a.clientNom || '')).toLowerCase().indexOf(q) < 0) return false;
    return true;
  }).slice().sort(function (a, b) { return b.at.localeCompare(a.at); });
}

function viewActivite() {
  const list = activityFiltered();
  const periods = [['jour', 'Aujourd’hui'], ['7j', '7 jours'], ['mois', 'Ce mois'], ['annee', 'Cette année'], ['tout', 'Tout']];
  const kinds = [['tous', 'Tout']].concat(Object.keys(ACTIVITY_KINDS).map(function (k) { return [k, ACTIVITY_KINDS[k].label]; }));
  const encaisse = sum(list.filter(function (a) { return a.kind === 'versement'; }), function (a) { return a.montant; });
  const paye = sum(list.filter(function (a) { return a.kind === 'paiement'; }), function (a) { return a.montant; });
  const shown = list.slice(0, 300);

  const groups = [];
  shown.forEach(function (a) {
    let g = groups[groups.length - 1];
    if (!g || g.date !== a.date) { g = { date: a.date, items: [] }; groups.push(g); }
    g.items.push(a);
  });

  const clients = db.clients.slice().sort(function (a, b) { return (a.nom || '').localeCompare(b.nom || '', 'fr'); });

  return '<div class="page act-page">' +
    pageHead('Journal complet', 'Activité', 'Chaque action est enregistrée : versements, paiements, modifications, suppressions.',
      '<button type="button" class="btn ghost" data-action="export-csv" data-what="activity">' + icon('download', 15) + ' Excel</button>') +
    '<div class="mini-kpis">' +
      '<div class="mini-kpi"><span>Actions</span><strong>' + numberFR(list.length) + '</strong><em>sur le filtre</em></div>' +
      '<div class="mini-kpi"><span>Encaissé</span><strong class="green">' + esc(money(encaisse)) + '</strong><em>versements</em></div>' +
      '<div class="mini-kpi"><span>Payé aux clients</span><strong>' + esc(money(paye)) + '</strong><em>retraits</em></div>' +
    '</div>' +
    '<div class="chips scroll-x">' + periods.map(function (p) {
      return '<button type="button" class="chip' + (state.actPeriod === p[0] ? ' active' : '') + '" data-action="act-period" data-period="' + p[0] + '">' + p[1] + '</button>';
    }).join('') + '</div>' +
    '<div class="chips scroll-x">' + kinds.map(function (k) {
      return '<button type="button" class="chip' + (state.actKind === k[0] ? ' active' : '') + '" data-action="act-kind" data-kind="' + k[0] + '">' + k[1] + '</button>';
    }).join('') + '</div>' +
    '<div class="filter-row">' +
      '<label class="select-inline"><span>Client</span><select id="act-client"><option value="tous">Tous les clients</option>' +
        clients.map(function (c) { return '<option value="' + esc(c.id) + '"' + (state.actClient === c.id ? ' selected' : '') + '>' + esc(c.nom) + '</option>'; }).join('') +
      '</select></label>' +
      '<label class="select-inline"><span>Quartier</span><select id="act-quartier"><option value="tous">Tous</option>' +
        quartiersList().map(function (q) { return '<option value="' + esc(q) + '"' + (state.actQuartier === q ? ' selected' : '') + '>' + esc(q) + '</option>'; }).join('') +
      '</select></label>' +
    '</div>' +
    '<div class="search-box">' + icon('search', 17) + '<input id="act-search" type="search" placeholder="Rechercher dans l’activité…" value="' + esc(state.actSearch) + '" autocomplete="off"></div>' +
    (groups.length
      ? groups.map(function (g) {
          return '<section class="feed-day"><h3>' + esc(g.date === todayISO() ? 'Aujourd’hui' : fmtDate(g.date, 'day')) + ' <span>' + esc(fmtDate(g.date, 'medium')) + '</span></h3>' +
            '<div class="feed panel">' + g.items.map(function (a) { return activityItemHTML(a); }).join('') + '</div></section>';
        }).join('') + (list.length > 300 ? '<p class="table-note">300 actions les plus récentes affichées. Affinez les filtres pour voir le reste.</p>' : '')
      : '<div class="panel">' + emptyState('activity', 'Aucune activité', 'Rien ne correspond à ces filtres pour le moment.', '') + '</div>') +
  '</div>';
}

/* ------------------------------------------------------------
   Risques & relances
   ------------------------------------------------------------ */

function viewRisques() {
  const rank = { risque: 0, attention: 1, retard: 2, ok: 3 };
  const rows = db.clients.filter(function (c) { return c.actif !== false; }).map(function (c) {
    return { client: c, risk: clientRisk(c), totals: clientTotals(c) };
  });
  const late = rows.filter(function (x) { return x.risk.niveau !== 'ok'; })
    .sort(function (a, b) { return rank[a.risk.niveau] - rank[b.risk.niveau] || b.risk.retard - a.risk.retard; });
  const totalRetard = sum(late, function (x) { return x.risk.retard; });
  const nbRisque = late.filter(function (x) { return x.risk.niveau === 'risque'; }).length;
  const caisse = cashBalance();
  const owed = fundsOwed();
  const cover = caisse - owed;
  const seuil = Number(db.settings.seuilRisque) || 3;

  const reliable = rows.filter(function (x) { return x.risk.nbCartes > 0; })
    .sort(function (a, b) { return a.risk.taux - b.risk.taux; }).slice(0, 8);

  return '<div class="page">' +
    pageHead('Protéger votre argent', 'Risques & relances', 'Repérez vite les clients qui ne versent plus et vérifiez que la caisse couvre ce que vous devez.') +
    '<section class="cover-card ' + (cover >= 0 ? 'ok' : 'bad') + '">' +
      '<div class="cover-head">' + icon(cover >= 0 ? 'shield' : 'shield-alert', 24) +
        '<div><strong>' + (cover >= 0 ? 'La caisse couvre l’argent des clients' : 'Attention : la caisse est insuffisante') + '</strong>' +
        '<span>' + (cover >= 0 ? 'Vous pouvez rendre à chacun son épargne.' : 'Il manque ' + esc(money(-cover)) + ' pour rembourser tous les clients aujourd’hui.') + '</span></div></div>' +
      '<div class="cover-grid">' +
        '<div><span>Caisse</span><strong>' + esc(money(caisse)) + '</strong></div>' +
        '<div><span>Dû aux clients</span><strong>' + esc(money(owed)) + '</strong></div>' +
        '<div><span>' + (cover >= 0 ? 'À vous (réellement)' : 'Manque') + '</span><strong class="' + (cover >= 0 ? 'green' : 'red') + '">' + esc(money(Math.abs(cover))) + '</strong></div>' +
      '</div>' +
    '</section>' +
    '<div class="mini-kpis">' +
      '<div class="mini-kpi' + (late.length ? ' warn' : '') + '"><span>Clients en retard</span><strong>' + late.length + '</strong><em>sur ' + rows.length + ' actifs</em></div>' +
      '<div class="mini-kpi' + (nbRisque ? ' bad' : '') + '"><span>À risque</span><strong>' + nbRisque + '</strong><em>' + (seuil * 2) + '+ jours sans verser</em></div>' +
      '<div class="mini-kpi"><span>À récupérer</span><strong>' + esc(money(totalRetard)) + '</strong><em>retard cumulé</em></div>' +
    '</div>' +
    '<section class="panel">' +
      '<div class="panel-head"><div><h2>Clients à relancer</h2><p class="panel-sub">Du plus urgent au moins urgent. Appelez ou écrivez en un geste.</p></div></div>' +
      (late.length
        ? '<div class="relance-list">' + late.map(function (x) { return relanceRowHTML(x.client, x.risk); }).join('') + '</div>'
        : '<div class="all-good">' + icon('check', 18) + '<div><strong>Aucun retard</strong><span>Tous vos clients actifs sont à jour.</span></div></div>') +
    '</section>' +
    (reliable.length
      ? '<section class="panel">' +
          '<div class="panel-head"><div><h2>Régularité des clients</h2><p class="panel-sub">Part de ce qui devait être versé et qui l’a été (cartes en cours).</p></div></div>' +
          '<div class="reliab-list">' + reliable.map(function (x) {
            return '<a class="reliab" href="#/client/' + esc(x.client.id) + '"><span class="reliab-name">' + esc(x.client.nom) + '</span>' +
              progressBar(x.risk.taux, x.risk.taux >= 85 ? 'green' : x.risk.taux >= 60 ? 'gold' : 'red') +
              '<strong>' + Math.round(x.risk.taux) + '%</strong></a>';
          }).join('') + '</div>' +
        '</section>'
      : '') +
    '<section class="panel">' +
      '<div class="panel-head"><div><h2>Réglage de l’alerte</h2><p class="panel-sub">Un client en retard devient « à relancer » après ce nombre de jours sans verser.</p></div></div>' +
      '<form class="inline-form" data-form="settings-risk"><label class="field"><span>Jours sans versement</span><input name="seuil" type="number" min="1" max="30" value="' + seuil + '"></label>' +
      '<button type="submit" class="btn primary">' + icon('check', 15) + ' Enregistrer</button></form>' +
    '</section>' +
  '</div>';
}

/* ------------------------------------------------------------
   Clôture de caisse
   ------------------------------------------------------------ */

function viewCloture() {
  const t = todayISO();
  const today = cashTotals(t, t);
  const balance = cashBalance();
  const done = clotureOf(t);
  const history = db.clotures.slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
  const lastClosed = history[0];

  return '<div class="page">' +
    pageHead('Contrôle quotidien', 'Clôture de caisse', 'Comptez l’argent en main et comparez-le à ce que l’application attend. Un écart = une erreur ou une perte à comprendre.') +
    '<section class="panel cloture-panel">' +
      '<div class="panel-head"><div><h2>' + esc(fmtDate(t, 'long')) + '</h2><p class="panel-sub">' + (done ? 'Journée déjà clôturée — vous pouvez la refaire.' : 'Pas encore clôturée.') + '</p></div>' +
        (done ? badge('Clôturée', 'green') : badge('À faire', 'amber')) + '</div>' +
      '<div class="cloture-lines">' +
        '<div><span>Encaissé aujourd’hui</span><strong class="in">+' + esc(money(today.entrees, true)) + '</strong></div>' +
        '<div><span>Sorti aujourd’hui</span><strong class="out">−' + esc(money(today.sorties, true)) + '</strong></div>' +
        (function () {
          const mob = { airtel: 0, moov: 0 };
          db.versements.forEach(function (v) {
            if (v.date !== t) return;
            const m = versementModes(v);
            mob.airtel += m.airtel; mob.moov += m.moov;
          });
          return mob.airtel + mob.moov > 0
            ? '<div class="muted-line"><span>dont reçu aujourd’hui sur Airtel / Moov</span><strong>' + esc(money(mob.airtel, true)) + ' / ' + esc(money(mob.moov, true)) + '</strong></div>'
            : '';
        }()) +
        '<div class="total"><span>Caisse attendue</span><strong id="cloture-attendu" data-value="' + balance + '">' + esc(money(balance)) + '</strong></div>' +
      '</div>' +
      '<form id="form-cloture" data-form="save-cloture" autocomplete="off">' +
        '<label class="field big-field"><span>Argent compté (espèces + soldes Airtel / Moov)</span>' +
          '<div class="input-suffix"><input id="cloture-compte" name="compte" type="number" inputmode="numeric" min="0" step="1" required placeholder="0" value="' + (done ? done.compte : '') + '" data-autofocus><span>' + esc(db.settings.devise) + '</span></div></label>' +
        '<div class="ecart-box" id="cloture-ecart"><span>Écart</span><strong>—</strong><em>Saisissez le montant compté</em></div>' +
        '<label class="field"><span>Explication (facultatif)</span><input name="note" placeholder="Ex. 2 000 prêtés au client X, erreur de rendu…" value="' + esc(done ? done.note || '' : '') + '"></label>' +
        '<button type="submit" class="btn primary lg full">' + icon('lock', 18) + ' ' + (done ? 'Refaire la clôture' : 'Clôturer la journée') + '</button>' +
      '</form>' +
    '</section>' +
    '<section class="panel">' +
      '<div class="panel-head"><div><h2>Historique des clôtures</h2><p class="panel-sub">' + (lastClosed ? 'Dernière : ' + esc(fmtDate(lastClosed.date, 'medium')) : 'Aucune clôture enregistrée.') + '</p></div></div>' +
      (history.length
        ? '<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th class="right">Attendu</th><th class="right">Compté</th><th class="right">Écart</th><th>Note</th></tr></thead><tbody>' +
          history.slice(0, 60).map(function (c) {
            return '<tr><td>' + esc(fmtDate(c.date, 'medium')) + '</td><td class="num">' + esc(money(c.attendu, true)) + '</td><td class="num">' + esc(money(c.compte, true)) + '</td>' +
              '<td class="num ' + (c.ecart === 0 ? 'green' : 'red') + '">' + (c.ecart > 0 ? '+' : '') + esc(money(c.ecart, true)) + '</td><td class="muted">' + esc(c.note || '—') + '</td></tr>';
          }).join('') + '</tbody></table></div>'
        : '<p class="muted pad">Les clôtures apparaîtront ici avec leurs écarts.</p>') +
    '</section>' +
  '</div>';
}

/* ------------------------------------------------------------
   Corbeille
   ------------------------------------------------------------ */

function viewCorbeille() {
  const items = db.trash;
  return '<div class="page">' +
    pageHead('Rien n’est perdu', 'Corbeille', 'Les clients, cartes, pointages et opérations supprimés sont conservés ici et peuvent être restaurés.') +
    (items.length
      ? '<div class="panel"><div class="trash-list">' + items.map(function (t) {
          const n = (t.data.cartes ? t.data.cartes.length : 0) + (t.data.versements ? t.data.versements.length : 0) + (t.data.operations ? t.data.operations.length : 0);
          const kindLabel = { client: 'Client', carte: 'Carte', versement: 'Pointage', operation: 'Opération' }[t.kind] || 'Élément';
          return '<div class="trash-item"><span class="feed-ic red">' + icon('trash', 16) + '</span>' +
            '<div class="feed-main"><div class="feed-text">' + esc(t.label) + '</div><div class="feed-meta"><span>' + kindLabel + '</span><span class="dot">·</span><span>supprimé le ' + esc(fmtDateTime(t.at)) + '</span>' + (n ? '<span class="dot">·</span><span>' + n + ' élément' + (n > 1 ? 's' : '') + ' lié' + (n > 1 ? 's' : '') + '</span>' : '') + '</div></div>' +
            '<button type="button" class="btn sm primary" data-action="trash-restore" data-id="' + esc(t.id) + '">' + icon('undo', 14) + ' Restaurer</button>' +
            '<button type="button" class="icon-btn sm danger" data-action="trash-purge" data-id="' + esc(t.id) + '" aria-label="Supprimer définitivement">' + icon('x', 14) + '</button></div>';
        }).join('') + '</div></div>'
      : '<div class="panel">' + emptyState('trash', 'Corbeille vide', 'Quand vous supprimez quelque chose, il apparaît ici et peut être restauré.', '') + '</div>') +
  '</div>';
}
