'use strict';

/* ============================================================
   YVO Épargne — la liste des clients et la page d'un client
   ============================================================ */

/* Où en est un client aujourd'hui :
   doit  = ce qui manque sur les jours passés
   reste = ce qu'il peut encore payer aujourd'hui */
function cardToday(carte, client) {
  const t = todayISO();
  const v = versementFor(carte.id, t);
  const recu = v ? Number(v.montant) || 0 : 0;
  const retard = cardTotals(carte).retard;
  const due = dueOn(carte, t) && client.actif !== false;
  const reste = due ? Math.min(Math.max(0, (Number(carte.montantJournalier) || 0) - recu), retard) : 0;
  return { due: due, recu: recu, reste: reste, retard: retard };
}

function clientStatus(client) {
  let doit = 0;
  let reste = 0;
  let aPayeAujourdhui = false;
  let actives = 0;
  cartesOf(client.id).forEach(function (c) {
    if (c.statut !== 'active') return;
    actives += 1;
    const d = cardToday(c, client);
    if (d.recu > 0) aPayeAujourdhui = true;
    reste += d.reste;
    doit += d.retard - d.reste;
  });
  return { doit: doit, reste: reste, aPayeAujourdhui: aPayeAujourdhui, actives: actives };
}

function clientTagHTML(client, st) {
  if (client.actif === false) return '<span class="tag off">Ne cotise plus</span>';
  if (st.doit > 0) return '<span class="tag late">Doit ' + esc(money(st.doit, true)) + '</span>';
  if (st.reste > 0) return '<span class="tag due">Pas encore payé</span>';
  if (st.aPayeAujourdhui) return '<span class="tag ok">✓ Payé</span>';
  if (st.actives > 0) return '<span class="tag ok">✓ À jour</span>';
  return '<span class="tag off">Pas de carte</span>';
}

function clientRowHTML(client, st) {
  return '<a class="crow2' + (client.actif === false ? ' inactive' : '') + '" href="#/client/' + esc(client.id) + '">' +
    '<span class="crow2-main"><strong>' + esc(client.nom) + '</strong><em>' + esc(client.quartier || 'Sans quartier') + '</em></span>' +
    clientTagHTML(client, st) +
  '</a>';
}

function viewClients() {
  const search = state.clientSearch.trim().toLowerCase();
  const quartiers = quartiersList();
  if (quartiers.indexOf(state.clientQuartier) < 0) state.clientQuartier = 'tous';
  const status = {};
  db.clients.forEach(function (c) { status[c.id] = clientStatus(c); });

  const list = db.clients.filter(function (c) {
    if (search && [c.nom, c.telephone, c.telephone2, c.quartier].filter(Boolean).join(' ').toLowerCase().indexOf(search) < 0) return false;
    if (state.clientQuartier !== 'tous' && (String(c.quartier || '').trim() || 'Non classé') !== state.clientQuartier) return false;
    if (state.clientEtat === 'apayer') return status[c.id].reste > 0;
    if (state.clientEtat === 'doit') return status[c.id].doit > 0 && c.actif !== false;
    return true;
  }).sort(function (a, b) { return (a.nom || '').localeCompare(b.nom || '', 'fr'); });

  const chips = [['tous', 'Tous'], ['apayer', 'Pas encore payé'], ['doit', 'Doit de l’argent']].map(function (e) {
    return '<button type="button" class="chip' + (state.clientEtat === e[0] ? ' active' : '') + '" data-action="client-etat" data-etat="' + e[0] + '">' + e[1] + '</button>';
  }).join('');

  return '<div class="page simple-page">' +
    '<h1 class="simple-title">Clients</h1>' +
    '<div class="search-box simple-search">' + icon('search', 19) +
      '<input id="client-search" type="search" placeholder="Chercher un client" aria-label="Chercher un client" value="' + esc(state.clientSearch) + '" autocomplete="off">' +
    '</div>' +
    '<div class="simple-chips">' + chips + '</div>' +
    '<select id="client-quartier" class="chip chip-select quartier-filter' + (state.clientQuartier !== 'tous' ? ' active' : '') + '" aria-label="Quartier">' +
      '<option value="tous">Tous les quartiers</option>' +
      quartiers.map(function (q) { return '<option value="' + esc(q) + '"' + (state.clientQuartier === q ? ' selected' : '') + '>' + esc(q === 'Non classé' ? 'Sans quartier' : q) + '</option>'; }).join('') +
    '</select>' +
    (list.length
      ? '<div class="crow2-list">' + list.map(function (c) { return clientRowHTML(c, status[c.id]); }).join('') + '</div>'
      : '<div class="panel">' + emptyState(
          'users',
          db.clients.length ? 'Personne ici' : 'Ajoutez votre premier client',
          db.clients.length ? 'Touchez « Tous » pour revoir tous les clients.' : 'Touchez le bouton ci-dessous.',
          db.clients.length ? '' : '<button type="button" class="btn primary lg" data-action="new-client">' + icon('plus', 18) + ' Ajouter un client</button>'
        ) + '</div>') +
  '</div>';
}

/* ============================================================
   Le calendrier
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

const CAL_WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/* Trois couleurs seulement : payé (vert), pas tout (orange), pas payé (rouge). */
const CAL_KIND_LABELS = { paye: 'Payé', partiel: 'Pas tout payé', impaye: 'Pas payé', avenir: 'À venir', hors: 'Hors carte' };

function calDayInfo(carte, iso, cover, t) {
  const inPeriod = iso >= carte.dateDebut && iso <= carte.dateFin;
  const v = versementFor(carte.id, iso);
  const montant = v ? Number(v.montant) || 0 : 0;
  const j = Number(carte.montantJournalier) || 0;
  let kind;
  if (!inPeriod) kind = 'hors';
  else if (cover[iso] || (montant > 0 && montant >= j)) kind = 'paye';
  else if (montant > 0) kind = 'partiel';
  else if (iso < t) kind = 'impaye';
  else kind = 'avenir';
  return { inPeriod: inPeriod, v: v, montant: montant, kind: kind };
}

function calendarHTML(carte) {
  const month = calMonthFor(carte);
  const t = todayISO();
  const cover = coverageMap(carte);
  const grid = monthCells(month).map(function (cell) {
    if (!cell) return '<span class="cal-empty"></span>';
    const d = calDayInfo(carte, cell.iso, cover, t);
    const label = fmtDate(cell.iso, 'long') + ' · ' + CAL_KIND_LABELS[d.kind] + (d.montant > 0 ? ' · ' + money(d.montant) : '') + (cell.iso === t ? ' · aujourd’hui' : '');
    const mark = d.kind === 'paye' ? '✓' : d.kind === 'impaye' ? '✕' : '';
    return '<button type="button" class="cal-day d-' + d.kind + (cell.iso === t ? ' today' : '') + '" data-date="' + esc(cell.iso) + '"' +
      (d.inPeriod ? ' data-action="tap-day" data-carte="' + esc(carte.id) + '"' : ' disabled') +
      ' aria-label="' + esc(label) + '"><span class="dnum">' + cell.day + '</span>' +
      (mark ? '<i class="dmark" aria-hidden="true">' + mark + '</i>' : '') +
    '</button>';
  }).join('');

  return '<div class="calendar simple-cal" data-month="' + esc(month) + '">' +
    '<div class="cal-head">' +
      '<button type="button" class="icon-btn" data-action="cal-prev" data-carte="' + esc(carte.id) + '" aria-label="Mois d’avant">' + icon('chevron-left', 24) + '</button>' +
      '<strong class="cal-month">' + esc(monthLabel(month)) + '</strong>' +
      '<button type="button" class="icon-btn" data-action="cal-next" data-carte="' + esc(carte.id) + '" aria-label="Mois d’après">' + icon('chevron-right', 24) + '</button>' +
    '</div>' +
    '<div class="cal-weekdays">' + CAL_WEEKDAYS.map(function (d) { return '<span>' + d + '</span>'; }).join('') + '</div>' +
    '<div class="cal-grid">' + grid + '</div>' +
    '<div class="simple-legend"><span class="l-paye">Payé</span><span class="l-partiel">Pas tout</span><span class="l-impaye">Pas payé</span></div>' +
  '</div>';
}

/* ============================================================
   La page d'un client
   ============================================================ */

/* La carte affichée : celle choisie, sinon celle en cours, sinon la plus récente. */
function selectedCard(client) {
  const cards = cartesOf(client.id).sort(function (a, b) { return a.dateDebut.localeCompare(b.dateDebut); });
  const chosen = cards.find(function (c) { return c.id === state.clientCard[client.id]; });
  if (chosen) return chosen;
  const t = todayISO();
  return cards.find(function (c) { return dueOn(c, t); }) ||
    cards.filter(function (c) { return c.statut === 'active'; }).pop() ||
    cards[cards.length - 1] || null;
}

function clientSection(id, title, content) {
  return '<details class="simple-sec" data-sec="' + id + '"' + (state.clientOpen[id] ? ' open' : '') + '>' +
    '<summary>' + esc(title) + '</summary><div class="simple-sec-body">' + content + '</div></details>';
}

/* Ce que le client a payé, le plus récent d'abord */
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

function viewClient(id) {
  const client = clientById(id);
  if (!client) {
    return '<div class="page simple-page"><div class="panel">' + emptyState('users', 'Ce client n’existe plus', 'Il a peut-être été supprimé.',
      '<a class="btn primary lg" href="#/clients">Revenir aux clients</a>') + '</div></div>';
  }
  const tot = clientTotals(client);
  const st = clientStatus(client);
  const cards = cartesOf(client.id).sort(function (a, b) { return a.dateDebut.localeCompare(b.dateDebut); });
  const carte = selectedCard(client);

  const paiements = recentPaymentsOf(client, 50);
  const donne = db.operations.filter(function (o) {
    return o.type === 'sortie' && (o.categorie === 'retrait' || o.categorie === 'pret') && o.clientId === client.id;
  }).sort(function (a, b) { return b.date.localeCompare(a.date); });
  const recus = db.recus.filter(function (r) { return r.clientId === client.id; })
    .sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });

  const nothing = '<p class="muted">Rien pour le moment.</p>';
  const line = function (attrs, left, sub, right) {
    return '<button type="button" class="simple-line" ' + attrs + '><span><strong>' + left + '</strong><em>' + sub + '</em></span><b>' + right + '</b></button>';
  };

  return '<div class="page simple-page client-page">' +
    '<a class="back-link desktop-only" href="#/clients">' + icon('arrow-left', 16) + ' Clients</a>' +
    '<h1 class="simple-title desktop-only">' + esc(client.nom) + '</h1>' +
    '<div class="simple-status ' + (st.doit > 0 ? 'late' : 'ok') + '">' +
      '<strong>' + (st.doit > 0 ? 'Doit ' + esc(money(st.doit)) : '✓ Ne doit rien') + '</strong>' +
      (tot.resteARembourser > 0
        ? '<span>Doit rembourser ' + esc(money(tot.resteARembourser)) + '</span>'
        : '<span>Son argent : ' + esc(money(tot.solde)) + '</span>') +
    '</div>' +
    (cards.length > 1
      ? '<div class="simple-chips card-switch">' + cards.map(function (c) {
          const d = c.statut === 'active' ? cardToday(c, client) : null;
          return '<button type="button" class="chip' + (carte && c.id === carte.id ? ' active' : '') + '" data-action="client-card" data-client="' + esc(client.id) + '" data-carte="' + esc(c.id) + '">' + (d && d.due && d.recu > 0 && d.reste <= 0 ? '✓ ' : '') + esc(c.label) + ' · ' + esc(money(c.montantJournalier, true)) + '</button>';
        }).join('') + '</div>'
      : '') +
    (carte
      ? '<section class="simple-card" id="carte-' + esc(carte.id) + '">' +
          calendarHTML(carte) +
          '<p class="simple-card-info">' + esc(money(carte.montantJournalier)) + ' par jour · du ' + esc(fmtDate(carte.dateDebut, 'short')) + ' au ' + esc(fmtDate(carte.dateFin, 'short')) + (carte.statut === 'active' ? '' : ' · terminée') + '</p>' +
        '</section>'
      : '<div class="panel">' + emptyState('calendar', 'Pas encore de carte', 'Ajoutez une carte pour voir le calendrier.',
          '<button type="button" class="btn primary lg" data-action="new-carte" data-client="' + esc(client.id) + '">' + icon('plus', 18) + ' Ajouter une carte</button>') + '</div>') +
    clientSection('paye', 'Ce qu’il a payé', paiements.length
      ? paiements.map(function (p) {
          return line('data-action="tap-day" data-carte="' + esc(p.carte.id) + '" data-date="' + esc(p.date) + '"',
            esc(money(p.montant)), esc(capitalize(fmtDate(p.date, 'day'))) + (cards.length > 1 ? ' · ' + esc(p.carte.label) : ''), esc(PAY_MODE_SHORT[p.mode]));
        }).join('')
      : nothing) +
    clientSection('donne', 'Argent donné', donne.length
      ? donne.map(function (o) {
          return line('data-action="open-receipt" data-op="' + esc(o.id) + '"', esc(money(o.montant)),
            esc(fmtDate(o.date, 'medium')) + ' · ' + (o.categorie === 'pret' ? 'Prêt' : 'Argent rendu'), 'Reçu');
        }).join('')
      : nothing) +
    clientSection('recus', 'Reçus', recus.length
      ? recus.map(function (r) {
          return line('data-action="open-recu" data-id="' + esc(r.id) + '"', esc(money(r.total)), esc(fmtDate(r.date, 'medium')), 'Voir');
        }).join('')
      : nothing) +
    clientSection('infos', 'Son numéro et son quartier',
      '<dl class="simple-infos">' +
        '<div><dt>Téléphone</dt><dd>' + esc(client.telephone || '—') + '</dd></div>' +
        (client.telephone2 ? '<div><dt>Autre téléphone</dt><dd>' + esc(client.telephone2) + '</dd></div>' : '') +
        '<div><dt>Quartier</dt><dd>' + esc(client.quartier || '—') + '</dd></div>' +
        (client.adresse ? '<div><dt>Adresse</dt><dd>' + esc(client.adresse) + '</dd></div>' : '') +
        (client.profession ? '<div><dt>Métier</dt><dd>' + esc(client.profession) + '</dd></div>' : '') +
        (client.pieceNumero ? '<div><dt>Pièce</dt><dd>' + esc([client.pieceType, client.pieceNumero].filter(Boolean).join(' ')) + '</dd></div>' : '') +
        (client.notes ? '<div><dt>Notes</dt><dd>' + esc(client.notes).replace(/\n/g, '<br>') + '</dd></div>' : '') +
      '</dl>') +
  '</div>';
}
