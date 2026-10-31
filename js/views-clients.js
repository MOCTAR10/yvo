'use strict';

/* ============================================================
   YVO Épargne — clients & fiche client
   ============================================================ */

function clientRowHTML(client, totals, risk) {
  const late = risk.niveau !== 'ok';
  const multi = totals.nbCartes > 1;
  const last = totals.dernier ? fmtDate(totals.dernier, 'medium') : 'Aucun versement';
  return '<a class="crow' + (client.actif === false ? ' inactive' : '') + (late ? ' late-' + risk.niveau : '') + '" href="#/client/' + esc(client.id) + '">' +
    avatar(client.nom) +
    '<span class="crow-main">' +
      '<strong>' + esc(client.nom) + (multi ? ' <i class="pill-mini">' + totals.nbCartes + ' cartes</i>' : '') + (client.actif === false ? ' <i class="pill-mini gray">Inactif</i>' : '') + '</strong>' +
      '<em>' + esc(client.telephone || 'Sans téléphone') + ' · ' + esc(last) + '</em>' +
      (late ? '<em class="crow-late ' + RISK_TONES[risk.niveau] + '">' + esc(RISK_LABELS[risk.niveau]) + ' · ' + esc(money(risk.retard)) + (risk.jours > 0 ? ' · ' + risk.jours + ' j sans verser' : '') + '</em>' : '') +
    '</span>' +
    '<span class="crow-side"><strong>' + esc(money(totals.solde, true)) + '</strong><em>solde dû</em></span>' +
    icon('chevron-right', 16, 'crow-chev') +
  '</a>';
}

function clientEtatMatch(etat, risk, totals, client) {
  if (etat === 'retard') return risk.niveau !== 'ok';
  if (etat === 'risque') return risk.niveau === 'risque' || risk.niveau === 'attention';
  if (etat === 'ajour') return risk.niveau === 'ok' && client.actif !== false;
  if (etat === 'multi') return totals.nbCartes >= 2;
  if (etat === 'inactifs') return client.actif === false;
  if (etat === 'sans-carte') return totals.nbActives === 0;
  return true;
}

function viewClients() {
  const search = state.clientSearch.trim().toLowerCase();
  const info = {};
  db.clients.forEach(function (c) { info[c.id] = { totals: clientTotals(c), risk: clientRisk(c) }; });

  let list = db.clients.slice();
  if (search) {
    list = list.filter(function (c) {
      return [c.nom, c.telephone, c.telephone2, c.quartier, c.profession, c.adresse]
        .filter(Boolean).join(' ').toLowerCase().indexOf(search) >= 0;
    });
  }
  if (state.clientQuartier !== 'tous') {
    list = list.filter(function (c) { return (c.quartier || 'Non classé') === state.clientQuartier; });
  }
  const baseForEtat = list;
  list = list.filter(function (c) { return clientEtatMatch(state.clientEtat, info[c.id].risk, info[c.id].totals, c); });

  const allQuartiers = quartiersList();
  const chips = ['tous'].concat(allQuartiers).map(function (q) {
    const count = q === 'tous'
      ? db.clients.length
      : db.clients.filter(function (c) { return (c.quartier || 'Non classé') === q; }).length;
    return '<button type="button" class="chip' + (state.clientQuartier === q ? ' active' : '') + '" data-action="client-quartier" data-quartier="' + esc(q) + '">' +
      (q === 'tous' ? 'Tous les quartiers' : esc(q)) + ' <span>' + count + '</span></button>';
  }).join('');

  const etats = [
    ['tous', 'Tous'], ['retard', 'En retard'], ['risque', 'À relancer'], ['ajour', 'À jour'], ['multi', 'Multi-cartes'], ['inactifs', 'Inactifs']
  ].map(function (e) {
    const n = baseForEtat.filter(function (c) { return clientEtatMatch(e[0], info[c.id].risk, info[c.id].totals, c); }).length;
    return '<button type="button" class="chip' + (state.clientEtat === e[0] ? ' active' : '') + '" data-action="client-etat" data-etat="' + e[0] + '">' + e[1] + ' <span>' + n + '</span></button>';
  }).join('');

  const sorters = {
    nom: function (a, b) { return (a.nom || '').localeCompare(b.nom || '', 'fr'); },
    retard: function (a, b) { return info[b.id].risk.retard - info[a.id].risk.retard || sorters.nom(a, b); },
    solde: function (a, b) { return info[b.id].totals.solde - info[a.id].totals.solde || sorters.nom(a, b); },
    recent: function (a, b) { return String(info[b.id].totals.dernier || '').localeCompare(String(info[a.id].totals.dernier || '')) || sorters.nom(a, b); },
    ancien: function (a, b) { return String(info[a.id].totals.dernier || '0').localeCompare(String(info[b.id].totals.dernier || '0')) || sorters.nom(a, b); }
  };
  const sorter = sorters[state.clientSort] || sorters.nom;
  const byQuartier = state.clientSort === 'nom';

  const groups = {};
  list.sort(sorter).forEach(function (c) {
    const q = byQuartier ? (c.quartier || 'Non classé') : 'Résultats';
    (groups[q] = groups[q] || []).push(c);
  });
  const groupNames = Object.keys(groups).sort(function (a, b) { return a.localeCompare(b, 'fr'); });

  const activeCount = db.clients.filter(function (c) { return c.actif !== false; }).length;
  const lateCount = db.clients.filter(function (c) { return info[c.id].risk.niveau !== 'ok'; }).length;
  const totalCotise = sum(list, function (c) { return info[c.id].totals.totalVerse; });
  const totalSolde = sum(list, function (c) { return info[c.id].totals.solde; });
  const totalRetard = sum(list, function (c) { return info[c.id].risk.retard; });

  return '<div class="page clients-page">' +
    pageHead(
      'Portefeuille clients',
      'Tous les clients',
      'Classés par quartier, avec leur épargne, leur retard et leur solde dû.',
      '<button type="button" class="btn ghost" data-action="export-csv" data-what="clients">' + icon('download', 15) + ' Excel</button>' +
      '<button type="button" class="btn primary" data-action="new-client">' + icon('plus', 16) + ' Nouveau client</button>'
    ) +
    '<div class="mini-kpis">' +
      '<div class="mini-kpi"><span>Clients</span><strong>' + db.clients.length + '</strong><em>' + activeCount + ' actifs</em></div>' +
      '<div class="mini-kpi' + (lateCount ? ' warn' : '') + '"><span>En retard</span><strong>' + lateCount + '</strong><em>' + esc(money(totalRetard)) + '</em></div>' +
      '<div class="mini-kpi"><span>Cotisé (filtre)</span><strong>' + esc(money(totalCotise)) + '</strong><em>clients affichés</em></div>' +
      '<div class="mini-kpi"><span>Solde dû (filtre)</span><strong>' + esc(money(totalSolde)) + '</strong><em>à rendre aux clients</em></div>' +
    '</div>' +
    '<div class="toolbar">' +
      '<div class="search-box grow">' + icon('search', 17) +
        '<input id="client-search" type="search" placeholder="Nom, téléphone, quartier…" value="' + esc(state.clientSearch) + '" autocomplete="off">' +
      '</div>' +
      '<label class="select-inline"><span>Trier</span><select id="client-sort">' +
        [['nom', 'Par quartier, A–Z'], ['retard', 'Plus gros retard'], ['solde', 'Plus gros solde'], ['recent', 'Versé récemment'], ['ancien', 'Pas versé depuis longtemps']].map(function (o) {
          return '<option value="' + o[0] + '"' + (state.clientSort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
        }).join('') +
      '</select></label>' +
    '</div>' +
    '<div class="chips scroll-x">' + etats + '</div>' +
    '<div class="chips scroll-x">' + chips + '</div>' +
    (list.length
      ? groupNames.map(function (q) {
          const clients = groups[q];
          const qTotals = clients.map(function (c) { return info[c.id].totals; });
          return '<section class="client-group">' +
            '<div class="group-head">' +
              '<div class="gh-title"><h2>' + (byQuartier ? icon('map-pin', 15) + ' ' : '') + esc(q) + '</h2><span>' + clients.length + ' client' + (clients.length > 1 ? 's' : '') + '</span></div>' +
              '<div class="gh-stats">' +
                '<span>Cotisé <strong>' + esc(money(sum(qTotals, function (t) { return t.totalVerse; }), true)) + '</strong></span>' +
                '<span>Solde dû <strong>' + esc(money(sum(qTotals, function (t) { return t.solde; }), true)) + '</strong></span>' +
              '</div>' +
            '</div>' +
            '<div class="crow-list">' + clients.map(function (c) { return clientRowHTML(c, info[c.id].totals, info[c.id].risk); }).join('') + '</div>' +
          '</section>';
        }).join('')
      : '<div class="panel">' + emptyState(
          'users',
          db.clients.length ? 'Aucun client ne correspond' : 'Ajoutez votre premier client',
          db.clients.length
            ? 'Essayez un autre nom, quartier ou filtre.'
            : 'Créez une fiche client avec son quartier et ses coordonnées. Vous pourrez ensuite lui ouvrir une ou plusieurs cartes.',
          '<button type="button" class="btn primary" data-action="new-client">' + icon('plus', 16) + ' Nouveau client</button>'
        ) + '</div>') +
    '<button type="button" class="fab" data-action="new-client" aria-label="Nouveau client">' + icon('plus', 26) + '</button>' +
  '</div>';
}

/* ============================================================
   Fiche client
   ============================================================ */

function calMonthFor(carte) {
  if (!state.cal[carte.id]) {
    const t = todayISO();
    if (t >= carte.dateDebut && t <= carte.dateFin) state.cal[carte.id] = monthKeyOf(t);
    else if (t < carte.dateDebut) state.cal[carte.id] = monthKeyOf(carte.dateDebut);
    else state.cal[carte.id] = monthKeyOf(carte.dateFin);
  }
  return state.cal[carte.id];
}

/* En-têtes du calendrier : la semaine commence le lundi */
const CAL_WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/* Mots simples pour chaque couleur du calendrier */
const CAL_KIND_LABELS = {
  complet: 'Payé',
  partiel: 'Payé en partie',
  avance: 'En avance (payé en plus)',
  covered: 'Couvert par une avance',
  absent: 'Pas payé',
  missed: 'Pas payé',
  future: 'À venir',
  out: 'Hors carte'
};

/* État d'un jour pour une carte (couleur, montant, Airtel / Moov) */
function calDayInfo(carte, iso, cover, t) {
  const inPeriod = iso >= carte.dateDebut && iso <= carte.dateFin;
  const v = versementFor(carte.id, iso);
  const montant = v ? Number(v.montant) || 0 : 0;
  let kind;
  if (!inPeriod) kind = 'out';
  else if (montant > 0) kind = STATUT_LABELS[v.statut] ? v.statut : statutFor(montant, carte.montantJournalier);
  else if (cover[iso]) kind = 'covered';
  else if (v) kind = 'absent';
  else if (iso < t) kind = 'missed';
  else kind = 'future';
  return { inPeriod: inPeriod, v: v, montant: montant, kind: kind, modes: montant > 0 ? versementModes(v) : null };
}

function calendarHTML(carte) {
  const month = calMonthFor(carte);
  const cells = monthCells(month);
  const t = todayISO();
  const cover = coverageMap(carte);
  let dus = 0, payes = 0, couverts = 0, impayes = 0, total = 0, mobile = false;

  const grid = cells.map(function (cell) {
    if (!cell) return '<span class="cal-empty"></span>';
    const d = calDayInfo(carte, cell.iso, cover, t);
    if (d.inPeriod && cell.iso <= t) dus += 1;
    if (d.inPeriod && d.montant > 0) { payes += 1; total += d.montant; }
    if (d.kind === 'covered') couverts += 1;
    if (d.kind === 'absent' || d.kind === 'missed') impayes += 1;
    let cls = 'cal-day ' + d.kind;
    let label = fmtDate(cell.iso, 'long') + ' · ' + CAL_KIND_LABELS[d.kind] + (d.montant > 0 ? ' · ' + money(d.montant) : '');
    let marks = '';
    if (d.modes) {
      ['airtel', 'moov'].forEach(function (k) {
        if (d.modes[k] > 0) {
          marks += '<i class="cal-mm mm-' + k + '"><img src="' + PAY_MODE_LOGOS[k] + '" alt=""></i>';
          label += ' · ' + PAY_MODE_LABELS[k];
          cls += ' paid-' + k;
        }
      });
      if (marks) mobile = true;
    }
    if (cell.iso === t) { cls += ' today'; label += ' · aujourd’hui'; }
    /* ✓ = jour déjà pointé (la couleur dit comment il a été payé) ; ✕ = pointé « pas payé » */
    if (d.v && d.inPeriod) { cls += ' pointed'; label += ' · pointé'; }
    return '<button type="button" class="' + cls + '" data-date="' + esc(cell.iso) + '"' +
      (d.inPeriod ? ' data-action="open-day" data-carte="' + esc(carte.id) + '"' : ' disabled') +
      ' title="' + esc(label) + '" aria-label="' + esc(label) + '">' +
      '<span class="cal-top"><span class="dnum">' + cell.day + '</span>' +
        (d.v && d.inPeriod ? '<i class="cal-check" aria-hidden="true">' + (d.v.statut === 'absent' ? '✕' : '✓') + '</i>' : '') + '</span>' +
      '<span class="cal-bot">' +
        (d.montant > 0 ? '<span class="damt">' + numberFR(d.montant) + '</span>' : '') +
        (marks ? '<span class="cal-marks">' + marks + '</span>' : '') +
      '</span>' +
    '</button>';
  }).join('');

  /* Résumé du mois en une phrase */
  let resume;
  if (dus > 0) resume = 'Ce mois : <strong>' + payes + ' jour' + (payes > 1 ? 's' : '') + ' payé' + (payes > 1 ? 's' : '') + ' sur ' + dus + '</strong> · <strong>' + esc(money(total)) + '</strong>';
  else if (payes > 0) resume = 'Ce mois : <strong>' + payes + ' jour' + (payes > 1 ? 's' : '') + ' payé' + (payes > 1 ? 's' : '') + '</strong> · <strong>' + esc(money(total)) + '</strong>';
  else resume = month > monthKeyOf(t) ? 'Mois à venir : rien à payer pour le moment.' : 'Rien à payer ce mois-ci pour cette carte.';
  const extra = (couverts ? '<span class="blue">' + couverts + ' couvert' + (couverts > 1 ? 's' : '') + ' par l’avance</span>' : '') +
    (impayes ? '<span class="red">' + impayes + ' jour' + (impayes > 1 ? 's' : '') + ' pas payé' + (impayes > 1 ? 's' : '') + '</span>' : '');
  const isCurrent = month === monthKeyOf(t);

  return '<div class="calendar fc-cal" data-month="' + esc(month) + '">' +
    '<div class="cal-head">' +
      '<button type="button" class="icon-btn fc-cal-nav" data-action="cal-prev" data-carte="' + esc(carte.id) + '" aria-label="Mois précédent">' + icon('chevron-left', 20) + '</button>' +
      '<div class="cal-title"><strong>' + esc(monthLabel(month)) + '</strong>' +
        (isCurrent ? '<span>Ce mois-ci</span>' : '<button type="button" class="fc-cal-today" data-action="cal-today" data-carte="' + esc(carte.id) + '">Revenir à aujourd’hui</button>') +
      '</div>' +
      '<button type="button" class="icon-btn fc-cal-nav" data-action="cal-next" data-carte="' + esc(carte.id) + '" aria-label="Mois suivant">' + icon('chevron-right', 20) + '</button>' +
    '</div>' +
    '<div class="cal-weekdays">' + CAL_WEEKDAYS.map(function (d) { return '<span>' + d + '</span>'; }).join('') + '</div>' +
    '<div class="cal-grid">' + grid + '</div>' +
    '<div class="fc-cal-sum"><p>' + resume + '</p>' + (extra ? '<div>' + extra + '</div>' : '') + '</div>' +
    '<div class="fc-legend">' +
      '<span><i class="lg complet"></i> Payé</span>' +
      '<span><i class="lg partiel"></i> En partie</span>' +
      '<span><i class="lg avance"></i> En avance</span>' +
      (couverts ? '<span><i class="lg covered"></i> Couvert</span>' : '') +
      '<span><i class="lg absent"></i> Pas payé</span>' +
      '<span><i class="lg future"></i> À venir</span>' +
      '<span><i class="lg today"></i> Aujourd’hui</span>' +
      '<span><i class="cal-check">✓</i> Déjà pointé</span>' +
      '<span><i class="cal-check is-no">✕</i> Pointé « pas payé »</span>' +
      (mobile ? '<span class="fc-legend-mm"><img src="' + PAY_MODE_LOGOS.airtel + '" alt=""><img src="' + PAY_MODE_LOGOS.moov + '" alt=""> Payé par mobile money</span>' : '') +
    '</div>' +
    '<p class="fc-cal-hint">' + icon('eye', 13) + ' Touchez un jour pour voir ou corriger le paiement.</p>' +
  '</div>';
}

/* Avancement de la carte : la période (jours) et l'argent (objectif) */
function cardProgressHTML(carte, tot, active) {
  const t = todayISO();
  const pctJours = tot.jours > 0 ? (tot.ecoules / tot.jours) * 100 : 0;
  let periode;
  if (t < carte.dateDebut) periode = 'Commence le ' + fmtDate(carte.dateDebut, 'medium');
  else if (t > carte.dateFin || !active) periode = 'Carte terminée';
  else periode = tot.joursRestants + ' jour' + (tot.joursRestants > 1 ? 's' : '') + ' restant' + (tot.joursRestants > 1 ? 's' : '');
  return '<div class="fc-progress">' +
    '<div class="fc-prog fc-prog-days">' +
      '<div class="fc-prog-head"><span>Période</span><strong>Jour ' + tot.ecoules + ' sur ' + tot.jours + '</strong></div>' +
      progressBar(pctJours, 'blue') +
      '<div class="fc-prog-foot"><span>' + esc(fmtDate(carte.dateDebut, 'medium')) + '</span><b>' + esc(periode) + '</b><span>' + esc(fmtDate(carte.dateFin, 'medium')) + '</span></div>' +
    '</div>' +
    /* l'argent cotisé est déjà sur la carte : ici seulement ce qu'il reste */
    '<div class="fc-card-figs">' +
      '<div><span>Reste à cotiser</span><strong>' + esc(money(tot.manquant)) + '</strong></div>' +
      '<div><span>Retard</span><strong class="' + (tot.retard > 0 ? 'red' : 'green') + '">' + esc(tot.retard > 0 ? money(tot.retard) : 'À jour') + '</strong></div>' +
      (commissionActive() || tot.commission > 0
        ? '<div><span>Commission</span><strong class="amber">' + esc(money(tot.commission)) + '</strong></div>'
        : '<div><span>À rendre</span><strong>' + esc(money(tot.solde)) + '</strong></div>') +
    '</div>' +
    (tot.resteARembourser > 0
      ? '<div class="fc-pret">' + icon('banknote', 17) + '<span>Avance d’argent : reste à rembourser <strong>' + esc(money(tot.resteARembourser)) + '</strong>' +
          '<em>Ses prochaines cotisations remboursent d’abord l’avance.</em></span></div>'
      : '') +
  '</div>';
}

/* Derniers paiements reçus d'un client, toutes cartes confondues */
function recentPaymentsOf(client, limit) {
  const cards = {};
  cartesOf(client.id).forEach(function (c) { cards[c.id] = c; });
  const list = [];
  db.versements.forEach(function (v) {
    if (!cards[v.carteId] || !(Number(v.montant) > 0)) return;
    /* Jour corrigé : on montre ce qui reste réellement, par mode. */
    if ((v.historique || []).some(function (h) { return h.correction || Number(h.montant) < 0; })) {
      const net = versementModes(v);
      PAY_MODES.forEach(function (k) {
        if (net[k] > 0) list.push({ carte: cards[v.carteId], date: v.date, at: v.updatedAt || v.createdAt || '', montant: net[k], mode: k, ref: '' });
      });
      return;
    }
    let seen = 0;
    (v.historique || []).forEach(function (h) {
      const m = Number(h.montant) || 0;
      seen += m;
      if (m > 0) list.push({ carte: cards[v.carteId], date: v.date, at: h.at || '', montant: m, mode: payModeOf(h), ref: h.ref || '' });
    });
    const rest = (Number(v.montant) || 0) - seen;
    if (rest > 0) list.push({ carte: cards[v.carteId], date: v.date, at: v.updatedAt || v.createdAt || '', montant: rest, mode: 'especes', ref: '' });
  });
  list.sort(function (a, b) { return b.date.localeCompare(a.date) || String(b.at).localeCompare(String(a.at)); });
  return list.slice(0, limit || 10);
}

function recentPaymentsHTML(client, multi) {
  const list = recentPaymentsOf(client, 10);
  return '<section class="panel fc-recent">' +
    '<div class="panel-head"><div><h2>Derniers versements</h2><p class="panel-sub">Les 10 derniers paiements reçus' + (multi ? ', toutes cartes' : '') + '.</p></div></div>' +
    (list.length
      ? '<div class="fc-pay-list">' + list.map(function (p) {
          const d = new Date(p.at);
          const heure = p.at && !isNaN(d.getTime()) ? ' · ' + pad2(d.getHours()) + 'h' + pad2(d.getMinutes()) : '';
          return '<button type="button" class="fc-pay mode-' + p.mode + '" data-action="open-day" data-carte="' + esc(p.carte.id) + '" data-date="' + esc(p.date) + '">' +
            '<span class="fc-pay-ic">' + payModeIcon(p.mode, 22) + '</span>' +
            '<span class="fc-pay-main"><strong>' + esc(money(p.montant)) + '</strong>' +
              '<em>' + esc(capitalize(fmtDate(p.date, 'day')) + heure) + (multi ? ' · ' + esc(p.carte.label) : '') + '</em>' +
              (p.ref ? '<em class="fc-pay-ref">Réf. ' + esc(p.ref) + '</em>' : '') +
            '</span>' +
            '<span class="fc-pay-mode">' + esc(PAY_MODE_SHORT[p.mode]) + '</span>' +
          '</button>';
        }).join('') + '</div>'
      : '<p class="muted pad">Aucun paiement reçu pour l’instant.</p>') +
  '</section>';
}

function cardPanelHTML(carte, idx) {
  const tot = cardTotals(carte);
  const t = todayISO();
  const active = carte.statut === 'active';
  const canPay = tot.solde > 0;
  const history = versementsOf(carte.id).slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
  const retraits = db.operations.filter(function (o) {
    return o.type === 'sortie' && (o.categorie === 'retrait' || o.categorie === 'pret') && o.carteId === carte.id;
  }).sort(function (a, b) { return b.date.localeCompare(a.date); });

  const couleur = carte.typeCouleur != null ? carte.typeCouleur : (idx || 0) % 4;
  const dueToday = active && t >= carte.dateDebut && t <= carte.dateFin;
  const etat = !active ? 'Clôturée' : tot.retard > 0 ? 'Retard ' + money(tot.retard, true) : t > carte.dateFin ? 'Terminée' : 'À jour';

  /* La carte « physique » (couleur de son type) avec le calendrier dedans */
  return '<section class="fc-card-panel" id="carte-' + esc(carte.id) + '">' +
    '<div class="vcard fc-card v' + esc(couleur) + (active ? '' : ' closed') + '">' +
      '<span class="vc-shine" aria-hidden="true"></span>' +
      '<div class="fc-card-top">' +
        '<span class="vc-brand">' + esc(db.settings.company.nom || 'YVO Épargne') + (carte.typeNom ? ' · ' + esc(carte.typeNom) : '') + '</span>' +
        '<span class="vc-state' + (tot.retard > 0 && active ? ' late' : '') + '">' + esc(etat) + '</span>' +
      '</div>' +
      '<div class="fc-card-id">' +
        '<div class="vc-chip" aria-hidden="true"><i></i><i></i><i></i></div>' +
        '<div class="fc-card-name"><h3>' + esc(carte.label) + '</h3><span>du ' + esc(fmtDate(carte.dateDebut, 'medium')) + ' au ' + esc(fmtDate(carte.dateFin, 'medium')) + '</span></div>' +
        '<div class="fc-card-daily"><strong>' + esc(money(carte.montantJournalier)) + '</strong> <span>/ jour</span></div>' +
      '</div>' +
      calendarHTML(carte) +
      '<div class="fc-card-foot"><span>Cotisé <strong>' + esc(money(tot.totalVerse)) + '</strong> sur ' + esc(money(tot.objectif, true)) + '</span><b>' + Math.round(tot.progression) + ' %</b></div>' +
      '<div class="vc-bar"><span style="width:' + tot.progression.toFixed(1) + '%"></span></div>' +
    '</div>' +
    '<div class="fc-card-body">' +
    '<div class="fc-card-actions">' +
      (dueToday ? '<button type="button" class="btn primary" data-action="open-pay" data-client="' + esc(carte.clientId) + '" data-carte="' + esc(carte.id) + '" data-date="' + esc(t) + '">' + icon('check', 15) + ' Encaisser</button>' : '') +
      (canPay ? '<button type="button" class="btn ghost" data-action="new-retrait" data-client="' + esc(carte.clientId) + '" data-carte="' + esc(carte.id) + '">' + icon('receipt', 15) + ' Payer</button>' : '') +
      (active ? '<button type="button" class="btn ghost" data-action="new-pret" data-client="' + esc(carte.clientId) + '" data-carte="' + esc(carte.id) + '">' + icon('coins', 15) + ' Avance d’argent</button>' : '') +
      '<span class="fc-card-tools">' +
        '<button type="button" class="icon-btn" data-action="edit-carte" data-carte="' + esc(carte.id) + '" title="Modifier la carte" aria-label="Modifier la carte">' + icon('edit', 16) + '</button>' +
        '<button type="button" class="icon-btn" data-action="toggle-carte" data-carte="' + esc(carte.id) + '" title="' + (active ? 'Clôturer la carte' : 'Réactiver la carte') + '" aria-label="' + (active ? 'Clôturer la carte' : 'Réactiver la carte') + '">' + icon(active ? 'lock' : 'unlock', 16) + '</button>' +
        '<button type="button" class="icon-btn danger" data-action="delete-carte" data-carte="' + esc(carte.id) + '" title="Supprimer la carte" aria-label="Supprimer la carte">' + icon('trash', 16) + '</button>' +
      '</span>' +
    '</div>' +
    cardProgressHTML(carte, tot, active) +
    '<details class="card-history fc-more">' +
      '<summary><span>' + icon('layers', 15) + ' Tous les chiffres de la carte</span><span>' + icon('chevron-right', 14) + '</span></summary>' +
      '<div class="mini-stats">' +
        '<div><span>Montant journalier</span><strong>' + esc(money(carte.montantJournalier)) + '</strong></div>' +
        '<div><span>Objectif total</span><strong>' + esc(money(tot.objectif)) + '</strong></div>' +
        '<div><span>Total cotisé</span><strong class="green">' + esc(money(tot.totalVerse)) + '</strong></div>' +
        '<div><span>Avances</span><strong class="amber">' + esc(money(tot.totalAvances)) + '</strong></div>' +
        '<div><span>Retiré / payé</span><strong>' + esc(money(tot.totalRetire)) + '</strong></div>' +
        (commissionActive() || tot.commission > 0 ? '<div><span>Commission' + (carte.commission ? ' · ' + esc(carte.commission.nom) : '') + '</span><strong class="amber">' + esc(money(tot.commission)) + '</strong></div>' : '') +
        '<div><span>Reste à cotiser</span><strong>' + esc(money(tot.manquant)) + '</strong></div>' +
        '<div><span>Retard à ce jour</span><strong class="' + (tot.retard > 0 ? 'red' : '') + '">' + esc(money(tot.retard)) + '</strong></div>' +
        '<div class="solde-stat"><span>Solde dû au client</span><strong>' + esc(money(tot.solde)) + '</strong></div>' +
      '</div>' +
      '<p class="muted small fc-more-line">' + tot.joursComplets + ' jour' + (tot.joursComplets > 1 ? 's' : '') + ' payé' + (tot.joursComplets > 1 ? 's' : '') + ' en entier · ' + tot.joursPartiels + ' en partie · ' + tot.joursAvances + ' en avance · ' + tot.joursAbsents + ' pas payé' + (tot.joursAbsents > 1 ? 's' : '') + '</p>' +
    '</details>' +
    '<details class="card-history">' +
      '<summary><span>' + icon('clock', 15) + ' Historique des versements</span><span>' + history.length + ' pointage' + (history.length > 1 ? 's' : '') + ' ' + icon('chevron-right', 14) + '</span></summary>' +
      (history.length
        ? '<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Statut</th><th>Montant</th><th>Note</th><th></th></tr></thead><tbody>' +
          history.map(function (v) {
            return '<tr>' +
              '<td>' + esc(fmtDate(v.date, 'medium')) + '</td>' +
              '<td>' + statutBadge(v.statut) + '</td>' +
              '<td class="num">' + esc(money(v.montant)) + '</td>' +
              '<td class="muted">' + esc(v.note || '—') + '</td>' +
              '<td class="right"><button type="button" class="icon-btn sm" data-action="open-day" data-carte="' + esc(carte.id) + '" data-date="' + esc(v.date) + '" title="Modifier">' + icon('edit', 14) + '</button></td>' +
            '</tr>';
          }).join('') + '</tbody></table></div>'
        : '<p class="muted pad">Aucun versement enregistré. Cliquez sur un jour du calendrier pour pointer.</p>') +
    '</details>' +
    (retraits.length
      ? '<details class="card-history"><summary><span>' + icon('receipt', 15) + ' Paiements & reçus</span><span>' + retraits.length + ' reçu' + (retraits.length > 1 ? 's' : '') + ' ' + icon('chevron-right', 14) + '</span></summary>' +
        '<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Montant</th><th>Mode</th><th>N° reçu</th><th></th></tr></thead><tbody>' +
        retraits.map(function (o) {
          return '<tr><td>' + esc(fmtDate(o.date, 'medium')) + '</td><td class="num">' + (o.categorie === 'pret' ? 'Avance · ' : '') + esc(money(o.montant)) + '</td><td>' + esc(o.mode || '—') + '</td><td class="mono">' + esc(o.recuNumero || '—') + '</td>' +
            '<td class="right"><button type="button" class="btn sm ghost" data-action="open-receipt" data-op="' + esc(o.id) + '">' + icon('printer', 14) + ' Reçu</button></td></tr>';
        }).join('') + '</tbody></table></div></details>'
      : '') +
    '</div>' +
  '</section>';
}

function viewClient(id) {
  const client = clientById(id);
  if (!client) {
    return '<div class="page">' + pageHead('Client', 'Fiche introuvable', 'Ce client n’existe pas ou a été supprimé.',
      '<a class="btn ghost" href="#/clients">' + icon('arrow-left', 16) + ' Retour aux clients</a>') + '</div>';
  }
  const tot = clientTotals(client);
  const cards = cartesOf(client.id).sort(function (a, b) { return a.dateDebut.localeCompare(b.dateDebut); });
  const retraits = db.operations.filter(function (o) {
    return o.type === 'sortie' && (o.categorie === 'retrait' || o.categorie === 'pret') && o.clientId === client.id;
  }).sort(function (a, b) { return b.date.localeCompare(a.date); });
  const notes = client.notes ? '<p class="notes-text">' + esc(client.notes).replace(/\n/g, '<br>') + '</p>' : '<p class="muted">Aucune note.</p>';
  const risk = clientRisk(client);
  const hasActive = cards.some(function (c) { return c.statut === 'active' && c.dateDebut <= todayISO() && c.dateFin >= todayISO(); });
  const msg = 'Bonjour ' + client.nom + ', ' + (risk.retard > 0 ? 'votre cotisation est en retard de ' + money(risk.retard) + '.' : 'merci pour votre cotisation.') + ' — ' + (db.settings.company.nom || '');
  const history = db.activity.filter(function (a) { return a.clientId === client.id; }).slice().reverse().slice(0, 40);

  /* Ce qu'il faut encaisser aujourd'hui (ou le prochain versement) */
  const t = todayISO();
  const dueToday = cards.filter(function (c) { return dueOn(c, t); });
  const duJour = sum(dueToday, function (c) { return Number(c.montantJournalier) || 0; });
  const recuJour = sum(dueToday, function (c) { const v = versementFor(c.id, t); return v ? Number(v.montant) || 0 : 0; });
  let todayFig;
  if (dueToday.length) {
    const resteJour = Math.max(0, duJour - recuJour);
    todayFig = '<div class="fc-fig fc-fig-today' + (resteJour === 0 ? ' ok' : '') + '"><span>Aujourd’hui</span><strong>' + esc(money(duJour)) + '</strong>' +
      '<em>' + (resteJour === 0 ? icon('check', 13) + ' Déjà payé' : recuJour > 0 ? 'Reçu ' + esc(money(recuJour, true)) + ', reste ' + esc(money(resteJour, true)) : 'À encaisser') + '</em></div>';
  } else {
    const next = cards.filter(function (c) { return c.statut === 'active' && c.dateDebut > t; })
      .sort(function (a, b) { return a.dateDebut.localeCompare(b.dateDebut); })[0];
    todayFig = '<div class="fc-fig fc-fig-today"><span>Prochain versement</span><strong>' + (next ? esc(money(next.montantJournalier)) : '—') + '</strong>' +
      '<em>' + (next ? 'le ' + esc(fmtDate(next.dateDebut, 'medium')) : 'Aucune carte en cours') + '</em></div>';
  }
  const infoHTML =
    '<div class="split client-info-split">' +
      '<section class="panel">' +
        '<div class="panel-head"><div><h2>Informations client</h2><p class="panel-sub">Ces données apparaissent sur les reçus.</p></div><button type="button" class="icon-btn" data-action="edit-client" data-client="' + esc(client.id) + '" title="Modifier">' + icon('edit', 16) + '</button></div>' +
        '<dl class="info-grid">' +
          '<div><dt>Téléphone</dt><dd>' + esc(client.telephone || '—') + '</dd></div>' +
          '<div><dt>Téléphone 2</dt><dd>' + esc(client.telephone2 || '—') + '</dd></div>' +
          '<div><dt>Quartier</dt><dd>' + esc(client.quartier || '—') + '</dd></div>' +
          '<div><dt>Profession</dt><dd>' + esc(client.profession || '—') + '</dd></div>' +
          '<div class="span2"><dt>Adresse</dt><dd>' + esc(client.adresse || '—') + '</dd></div>' +
          '<div><dt>Pièce d’identité</dt><dd>' + esc([client.pieceType, client.pieceNumero].filter(Boolean).join(' ') || '—') + '</dd></div>' +
          '<div><dt>Date d’inscription</dt><dd>' + esc(fmtDate(client.dateInscription, 'long')) + '</dd></div>' +
        '</dl>' +
      '</section>' +
      '<section class="panel">' +
        '<div class="panel-head"><div><h2>Notes</h2><p class="panel-sub">Informations utiles pour le suivi.</p></div></div>' +
        notes +
        '<div class="info-foot"><span>' + icon('layers', 15) + ' ' + tot.nbCartes + ' carte' + (tot.nbCartes > 1 ? 's' : '') + ' · ' + tot.nbActives + ' active' + (tot.nbActives > 1 ? 's' : '') + '</span>' +
        (tot.sansRetrait && tot.nbCartes > 1 ? '<span class="pill blue">Multi-cartes sans retrait</span>' : '') + '</div>' +
      '</section>' +
    '</div>';

  return '<div class="page client-page">' +
    '<a class="back-link" href="#/clients">' + icon('arrow-left', 15) + ' Tous les clients</a>' +
    '<section class="profile fc-hero">' +
      '<div class="fc-id">' +
        avatar(client.nom, 'lg') +
        '<div class="fc-id-main">' +
          '<h1>' + esc(client.nom) + '</h1>' +
          '<div class="fc-id-meta">' +
            '<span>' + icon('map-pin', 14) + ' ' + esc(client.quartier || 'Non classé') + '</span>' +
            (client.telephone ? '<span>' + icon('phone', 14) + ' ' + esc(client.telephone) + '</span>' : '<span class="muted">Pas de numéro</span>') +
          '</div>' +
          '<div class="fc-id-badges">' +
            (client.actif === false ? badge('Inactif', 'gray') : '') +
            (tot.nbCartes > 1 ? badge(tot.nbCartes + ' cartes', 'blue') : '') +
            (risk.niveau !== 'ok' ? riskBadge(risk) : '') +
          '</div>' +
        '</div>' +
      '</div>' +
      (client.telephone ? '<div class="fc-contact">' + contactButtons(client, msg, false) + '</div>' : '') +
      '<div class="fc-figs">' +
        '<div class="fc-fig"><span>Total cotisé</span><strong>' + esc(money(tot.totalVerse)) + '</strong><em>' + (tot.resteARembourser > 0 ? 'Doit encore : ' + esc(money(tot.resteARembourser, true)) : 'À rendre : ' + esc(money(tot.solde, true))) + '</em></div>' +
        (tot.retard > 0
          ? '<div class="fc-fig fc-fig-late"><span>Retard</span><strong>' + esc(money(tot.retard)) + '</strong><em>' + (risk.jours > 0 ? risk.jours + ' jour' + (risk.jours > 1 ? 's' : '') + ' sans payer' : 'À rattraper') + '</em></div>'
          : '<div class="fc-fig fc-fig-ok"><span>Retard</span><strong>À jour</strong><em>' + icon('check', 13) + ' Rien en retard</em></div>') +
        todayFig +
      '</div>' +
      (hasActive ? '<button type="button" class="btn primary lg fc-pay-btn" data-action="open-pay" data-client="' + esc(client.id) + '" data-date="' + esc(t) + '">' + icon('coins', 20) + ' Encaisser aujourd’hui</button>' : '') +
      '<div class="fc-actions">' +
        '<button type="button" class="btn ghost" data-action="edit-client" data-client="' + esc(client.id) + '">' + icon('edit', 15) + ' Modifier</button>' +
        (tot.solde > 0 ? '<button type="button" class="btn ghost" data-action="new-retrait" data-client="' + esc(client.id) + '">' + icon('receipt', 15) + ' Payer</button>' : '') +
        '<button type="button" class="btn ghost" data-action="new-carte" data-client="' + esc(client.id) + '">' + icon('plus', 15) + ' Carte</button>' +
        '<button type="button" class="icon-btn danger" data-action="delete-client" data-client="' + esc(client.id) + '" title="Supprimer le client" aria-label="Supprimer le client">' + icon('trash', 16) + '</button>' +
      '</div>' +
    '</section>' +
    '<div class="section-head"><div><h2>Cartes d’épargne</h2><p>Chaque carte possède son calendrier et ses calculs.</p></div>' +
      '<button type="button" class="btn sm primary" data-action="new-carte" data-client="' + esc(client.id) + '">' + icon('plus', 15) + ' Ajouter une carte</button></div>' +
    (cards.length
      ? cards.map(function (c, i) { return cardPanelHTML(c, i); }).join('')
      : '<div class="panel">' + emptyState('layers', 'Aucune carte pour ce client',
          'Créez une carte avec un montant journalier et une période de cotisation pour commencer le pointage.',
          '<button type="button" class="btn primary" data-action="new-carte" data-client="' + esc(client.id) + '">' + icon('plus', 16) + ' Créer la première carte</button>') + '</div>') +
    recentPaymentsHTML(client, tot.nbCartes > 1) +
    infoHTML +
    (retraits.length
      ? '<section class="panel"><div class="panel-head"><div><h2>Paiements, avances & reçus</h2><p class="panel-sub">L’argent donné au client, avec son reçu.</p></div></div>' +
        '<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Carte</th><th>Montant</th><th>Mode</th><th>Reçu</th><th></th></tr></thead><tbody>' +
        retraits.map(function (o) {
          const carte = carteById(o.carteId);
          const label = (o.snapshot && o.snapshot.carteLabel) || (carte ? carte.label : '—');
          return '<tr><td>' + esc(fmtDate(o.date, 'medium')) + '</td><td>' + (o.categorie === 'pret' ? 'Avance · ' : '') + esc(label) + '</td><td class="num">' + esc(money(o.montant)) + '</td><td>' + esc(o.mode || '—') + '</td><td class="mono">' + esc(o.recuNumero || '—') + '</td>' +
            '<td class="right"><button type="button" class="btn sm ghost" data-action="open-receipt" data-op="' + esc(o.id) + '">' + icon('printer', 14) + ' Reçu</button></td></tr>';
        }).join('') + '</tbody></table></div></section>'
      : '') +
    '<section class="panel">' +
      '<div class="panel-head"><div><h2>Historique du client</h2><p class="panel-sub">Tout ce qui a été enregistré pour ' + esc(client.nom) + '.</p></div>' +
        '<a class="link-arrow" href="#/activite" data-action="act-client" data-client="' + esc(client.id) + '">Tout l’historique ' + icon('chevron-right', 14) + '</a></div>' +
      (history.length
        ? '<div class="feed">' + history.map(function (a) { return activityItemHTML(a, false); }).join('') + '</div>'
        : '<p class="muted pad">Aucune activité enregistrée pour ce client.</p>') +
    '</section>' +
  '</div>';
}
