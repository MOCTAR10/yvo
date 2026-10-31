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

function calendarHTML(carte) {
  const month = calMonthFor(carte);
  const cells = monthCells(month);
  const t = todayISO();
  const vs = versementsOf(carte.id);
  const monthVers = vs.filter(function (v) { return v.date.slice(0, 7) === month; });
  const monthTotal = sum(monthVers, function (v) { return v.montant; });
  const monthAbsent = monthVers.filter(function (v) { return v.statut === 'absent'; }).length;
  const cover = coverageMap(carte);

  return '<div class="calendar">' +
    '<div class="cal-head">' +
      '<button type="button" class="icon-btn" data-action="cal-prev" data-carte="' + esc(carte.id) + '" aria-label="Mois précédent">' + icon('chevron-left', 18) + '</button>' +
      '<div class="cal-title"><strong>' + esc(monthLabel(month)) + '</strong><span>' + esc(money(monthTotal)) + ' ce mois</span></div>' +
      '<div class="cal-nav">' +
        '<button type="button" class="btn sm ghost" data-action="cal-today" data-carte="' + esc(carte.id) + '">Aujourd’hui</button>' +
        '<button type="button" class="icon-btn" data-action="cal-next" data-carte="' + esc(carte.id) + '" aria-label="Mois suivant">' + icon('chevron-right', 18) + '</button>' +
      '</div>' +
    '</div>' +
    '<div class="cal-weekdays">' + DAYS_NARROW.map(function (d) { return '<span>' + d + '</span>'; }).join('') + '</div>' +
    '<div class="cal-grid">' +
      cells.map(function (cell) {
        if (!cell) return '<span class="cal-empty"></span>';
        const inPeriod = cell.iso >= carte.dateDebut && cell.iso <= carte.dateFin;
        const v = versementFor(carte.id, cell.iso);
        const isToday = cell.iso === t;
        let cls = 'cal-day';
        let label = fmtDate(cell.iso, 'long');
        if (!inPeriod) {
          cls += ' out';
        } else if (v && v.montant > 0) {
          cls += ' ' + v.statut;
          label += ' · ' + STATUT_LABELS[v.statut] + ' · ' + money(v.montant);
        } else if (cover[cell.iso]) {
          cls += ' covered';
          label += ' · couvert par une avance';
        } else if (v) {
          cls += ' absent';
          label += ' · non versé';
        } else if (cell.iso < t) {
          cls += ' missed';
          label += ' · non versé';
        } else {
          cls += ' future';
          label += ' · à venir';
        }
        if (isToday) cls += ' today';
        const amount = v && v.montant > 0 ? numberFR(v.montant) : '';
        return '<button type="button" class="' + cls + '"' +
          (inPeriod ? ' data-action="open-day" data-carte="' + esc(carte.id) + '" data-date="' + esc(cell.iso) + '"' : ' disabled') +
          ' title="' + esc(label) + '" aria-label="' + esc(label) + '">' +
          '<span class="dnum">' + cell.day + '</span>' +
          (amount ? '<span class="damt">' + amount + '</span>' : '') +
        '</button>';
      }).join('') +
    '</div>' +
    '<div class="cal-summary">' +
      '<span>Ce mois : <strong>' + esc(money(monthTotal)) + '</strong></span>' +
      '<span>' + monthVers.length + ' jour' + (monthVers.length > 1 ? 's' : '') + ' pointé' + (monthVers.length > 1 ? 's' : '') + '</span>' +
      (monthAbsent ? '<span class="red">' + monthAbsent + ' absence' + (monthAbsent > 1 ? 's' : '') + '</span>' : '') +
    '</div>' +
    '<div class="cal-legend">' +
      '<span><i class="lg complet"></i> Complet</span>' +
      '<span><i class="lg partiel"></i> Partiel</span>' +
      '<span><i class="lg avance"></i> Avance</span>' +
      '<span><i class="lg covered"></i> Couvert</span>' +
      '<span><i class="lg absent"></i> Non versé</span>' +
      '<span><i class="lg future"></i> À venir</span>' +
      '<span><i class="lg today"></i> Aujourd’hui</span>' +
    '</div>' +
  '</div>';
}

function cardPanelHTML(carte) {
  const client = clientById(carte.clientId);
  const tot = cardTotals(carte);
  const t = todayISO();
  const active = carte.statut === 'active';
  const canPay = tot.solde > 0;
  const history = versementsOf(carte.id).slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
  const retraits = db.operations.filter(function (o) {
    return o.type === 'sortie' && o.categorie === 'retrait' && o.carteId === carte.id;
  }).sort(function (a, b) { return b.date.localeCompare(a.date); });

  return '<section class="card-panel" id="carte-' + esc(carte.id) + '">' +
    '<div class="cp-head">' +
      '<div class="cp-title-wrap">' +
        '<div class="cp-title"><h3>' + esc(carte.label) + '</h3>' + statusBadge(carte) +
          (tot.retard > 0 && active ? badge('Retard ' + money(tot.retard, true), 'red') : '') + '</div>' +
        '<div class="cp-period">' + icon('calendar', 14) +
          ' Début <strong>' + esc(fmtDate(carte.dateDebut, 'medium')) + '</strong>' +
          ' <span class="arrow">→</span> Fin <strong>' + esc(fmtDate(carte.dateFin, 'medium')) + '</strong>' +
          ' <span class="dot">·</span> ' + tot.jours + ' jours' +
          (active ? ' <span class="dot">·</span> ' + tot.joursRestants + ' jour' + (tot.joursRestants > 1 ? 's' : '') + ' restant' + (tot.joursRestants > 1 ? 's' : '') : '') +
        '</div>' +
      '</div>' +
      '<div class="cp-actions">' +
        (active && t >= carte.dateDebut && t <= carte.dateFin ? '<button type="button" class="btn sm primary" data-action="open-pay" data-client="' + esc(carte.clientId) + '" data-carte="' + esc(carte.id) + '" data-date="' + esc(t) + '">' + icon('check', 14) + ' Encaisser</button>' : '') +
        (canPay ? '<button type="button" class="btn sm ghost" data-action="new-retrait" data-client="' + esc(carte.clientId) + '" data-carte="' + esc(carte.id) + '">' + icon('receipt', 14) + ' Payer</button>' : '') +
        '<button type="button" class="icon-btn" data-action="edit-carte" data-carte="' + esc(carte.id) + '" title="Modifier la carte">' + icon('edit', 16) + '</button>' +
        '<button type="button" class="icon-btn" data-action="toggle-carte" data-carte="' + esc(carte.id) + '" title="' + (active ? 'Clôturer la carte' : 'Réactiver la carte') + '">' + icon(active ? 'lock' : 'unlock', 16) + '</button>' +
        '<button type="button" class="icon-btn danger" data-action="delete-carte" data-carte="' + esc(carte.id) + '" title="Supprimer la carte">' + icon('trash', 16) + '</button>' +
      '</div>' +
    '</div>' +
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
    '<div class="cp-progress">' +
      '<div class="cp-progress-head"><span>' + tot.joursComplets + ' complet' + (tot.joursComplets > 1 ? 's' : '') + ' · ' + tot.joursPartiels + ' partiel' + (tot.joursPartiels > 1 ? 's' : '') + ' · ' + tot.joursAvances + ' avance' + (tot.joursAvances > 1 ? 's' : '') + ' · ' + tot.joursAbsents + ' absence' + (tot.joursAbsents > 1 ? 's' : '') + '</span><strong>' + Math.round(tot.progression) + '% de l’objectif</strong></div>' +
      progressBar(tot.progression, tot.retard > 0 ? 'gold' : 'green') +
    '</div>' +
    calendarHTML(carte) +
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
          return '<tr><td>' + esc(fmtDate(o.date, 'medium')) + '</td><td class="num">' + esc(money(o.montant)) + '</td><td>' + esc(o.mode || '—') + '</td><td class="mono">' + esc(o.recuNumero || '—') + '</td>' +
            '<td class="right"><button type="button" class="btn sm ghost" data-action="open-receipt" data-op="' + esc(o.id) + '">' + icon('printer', 14) + ' Reçu</button></td></tr>';
        }).join('') + '</tbody></table></div></details>'
      : '') +
  '</section>';
}

/* Numéro de carte stable dérivé de l'identifiant */
function cardNumber(id) {
  let h = 2166136261;
  const s = String(id);
  let out = '';
  for (let i = 0; i < 12; i += 1) {
    h ^= s.charCodeAt(i % s.length) + i;
    h = Math.imul(h, 16777619) >>> 0;
    out += String(h % 10);
  }
  return out.replace(/(\d{4})(?=\d)/g, '$1 ');
}

/* Carte virtuelle d'épargne : toutes les infos clés d'un coup d'œil */
function virtualCardHTML(client, carte, idx) {
  const tot = cardTotals(carte);
  const risk = clientRisk(client);
  const active = carte.statut === 'active';
  const state = !active ? 'Clôturée' : tot.retard > 0 ? 'En retard' : 'À jour';
  return '<a class="vcard v' + (carte.typeCouleur != null ? carte.typeCouleur : idx % 4) + (active ? '' : ' closed') + '" href="#carte-' + esc(carte.id) + '" data-action="goto-carte" data-carte="' + esc(carte.id) + '" aria-label="Carte ' + esc(carte.label) + '">' +
    '<span class="vc-shine" aria-hidden="true"></span>' +
    '<div class="vc-top"><span class="vc-brand">' + esc(db.settings.company.nom || 'YVO Épargne') + (carte.typeNom ? ' · ' + esc(carte.typeNom) : '') + '</span><span class="vc-state ' + (tot.retard > 0 && active ? 'late' : '') + '">' + state + '</span></div>' +
    '<div class="vc-chip" aria-hidden="true"><i></i><i></i><i></i></div>' +
    '<div class="vc-number">' + cardNumber(carte.id) + '</div>' +
    '<div class="vc-amount"><span>Cotisé</span><strong>' + esc(money(tot.totalVerse)) + '</strong></div>' +
    '<div class="vc-bar"><span style="width:' + tot.progression.toFixed(1) + '%"></span></div>' +
    '<div class="vc-foot">' +
      '<div><span>Titulaire</span><strong>' + esc(client.nom) + '</strong></div>' +
      '<div><span>Journalier</span><strong>' + esc(money(carte.montantJournalier, true)) + '</strong></div>' +
      '<div><span>Du</span><strong>' + esc(fmtDate(carte.dateDebut, 'short').slice(0, 5)) + '</strong></div>' +
      '<div><span>Au</span><strong>' + esc(fmtDate(carte.dateFin, 'short').slice(0, 5)) + '</strong></div>' +
    '</div>' +
    '<div class="vc-label">' + esc(carte.label) + ' · ' + Math.round(tot.progression) + '%</div>' +
  '</a>';
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
    return o.type === 'sortie' && o.categorie === 'retrait' && o.clientId === client.id;
  }).sort(function (a, b) { return b.date.localeCompare(a.date); });
  const notes = client.notes ? '<p class="notes-text">' + esc(client.notes).replace(/\n/g, '<br>') + '</p>' : '<p class="muted">Aucune note.</p>';
  const risk = clientRisk(client);
  const hasActive = cards.some(function (c) { return c.statut === 'active' && c.dateDebut <= todayISO() && c.dateFin >= todayISO(); });
  const msg = 'Bonjour ' + client.nom + ', ' + (risk.retard > 0 ? 'votre cotisation est en retard de ' + money(risk.retard) + '.' : 'merci pour votre cotisation.') + ' — ' + (db.settings.company.nom || '');
  const history = db.activity.filter(function (a) { return a.clientId === client.id; }).slice().reverse().slice(0, 40);

  return '<div class="page client-page">' +
    '<a class="back-link" href="#/clients">' + icon('arrow-left', 15) + ' Tous les clients</a>' +
    '<section class="profile">' +
      '<div class="profile-top">' +
        avatar(client.nom, 'lg') +
        '<div class="profile-id">' +
          '<div class="profile-name"><h1>' + esc(client.nom) + '</h1>' +
            (client.actif === false ? badge('Inactif', 'gray') : badge('Actif', 'green')) +
            (tot.nbCartes > 1 ? badge(tot.nbCartes + ' cartes', 'blue') : '') +
            (risk.niveau !== 'ok' ? riskBadge(risk) : '') +
          '</div>' +
          '<div class="profile-meta">' +
            '<span>' + icon('map-pin', 14) + ' ' + esc(client.quartier || 'Non classé') + '</span>' +
            (client.telephone ? '<a href="tel:' + esc(client.telephone.replace(/\s/g, '')) + '">' + icon('phone', 14) + ' ' + esc(client.telephone) + '</a>' : '') +
            '<span>' + icon('calendar', 14) + ' Inscrit le ' + esc(fmtDate(client.dateInscription, 'medium')) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="profile-actions">' +
          '<button type="button" class="btn ghost" data-action="edit-client" data-client="' + esc(client.id) + '">' + icon('edit', 15) + ' Modifier</button>' +
          (tot.solde > 0 ? '<button type="button" class="btn ghost" data-action="new-retrait" data-client="' + esc(client.id) + '">' + icon('receipt', 15) + ' Payer</button>' : '') +
          '<button type="button" class="btn primary" data-action="new-carte" data-client="' + esc(client.id) + '">' + icon('plus', 15) + ' Nouvelle carte</button>' +
          '<button type="button" class="icon-btn danger" data-action="delete-client" data-client="' + esc(client.id) + '" title="Supprimer le client">' + icon('trash', 16) + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="profile-quick">' +
        (hasActive ? '<button type="button" class="btn primary lg grow" data-action="open-pay" data-client="' + esc(client.id) + '" data-date="' + esc(todayISO()) + '">' + icon('coins', 18) + ' Encaisser</button>' : '') +
        contactButtons(client, msg, false) +
      '</div>' +
      (risk.niveau !== 'ok' ? '<div class="risk-line ' + RISK_TONES[risk.niveau] + '">' + icon('alert', 16) + '<span>Retard de <strong>' + esc(money(risk.retard)) + '</strong>' + (risk.jours > 0 ? ' · ' + risk.jours + ' jour' + (risk.jours > 1 ? 's' : '') + ' sans verser' : '') + ' · régularité ' + Math.round(risk.taux) + '%</span></div>' : '') +
      '<div class="profile-stats">' +
        '<div><span>Total cotisé</span><strong>' + esc(money(tot.totalVerse)) + '</strong></div>' +
        '<div><span>Total retiré</span><strong>' + esc(money(tot.totalRetire)) + '</strong></div>' +
        '<div><span>Solde dû</span><strong class="green">' + esc(money(tot.solde)) + '</strong></div>' +
        '<div><span>Journalier cumulé</span><strong>' + esc(money(tot.journalier)) + '</strong></div>' +
        '<div><span>Retard à ce jour</span><strong class="' + (tot.retard > 0 ? 'red' : '') + '">' + esc(money(tot.retard)) + '</strong></div>' +
      '</div>' +
    '</section>' +
    (cards.length ? '<div class="vcards">' + cards.map(function (c, i) { return virtualCardHTML(client, c, i); }).join('') + '</div>' : '') +
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
    '</div>' +
    '<div class="section-head"><div><h2>Cartes d’épargne</h2><p>Chaque carte possède son calendrier et ses calculs.</p></div>' +
      '<button type="button" class="btn sm primary" data-action="new-carte" data-client="' + esc(client.id) + '">' + icon('plus', 15) + ' Ajouter une carte</button></div>' +
    (cards.length
      ? cards.map(function (c) { return cardPanelHTML(c); }).join('')
      : '<div class="panel">' + emptyState('layers', 'Aucune carte pour ce client',
          'Créez une carte avec un montant journalier et une période de cotisation pour commencer le pointage.',
          '<button type="button" class="btn primary" data-action="new-carte" data-client="' + esc(client.id) + '">' + icon('plus', 16) + ' Créer la première carte</button>') + '</div>') +
    (retraits.length
      ? '<section class="panel"><div class="panel-head"><div><h2>Retraits & reçus</h2><p class="panel-sub">Historique des paiements effectués au client.</p></div></div>' +
        '<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Carte</th><th>Montant</th><th>Mode</th><th>Reçu</th><th></th></tr></thead><tbody>' +
        retraits.map(function (o) {
          const carte = carteById(o.carteId);
          const label = (o.snapshot && o.snapshot.carteLabel) || (carte ? carte.label : '—');
          return '<tr><td>' + esc(fmtDate(o.date, 'medium')) + '</td><td>' + esc(label) + '</td><td class="num">' + esc(money(o.montant)) + '</td><td>' + esc(o.mode || '—') + '</td><td class="mono">' + esc(o.recuNumero || '—') + '</td>' +
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
