'use strict';

/* ============================================================
   YVO Épargne — pointage centré sur le client
   Le client verse ce qu'il peut, quand il peut : le statut
   (complet / partiel / avance / non versé) se déduit du montant.
   ============================================================ */

function pointageEntries(date) {
  const map = {};
  dueCards(date).forEach(function (c) {
    (map[c.clientId] = map[c.clientId] || []).push(c);
  });
  return Object.keys(map).map(function (id) {
    const client = clientById(id);
    const cards = map[id];
    const expected = sum(cards, function (c) { return c.montantJournalier; });
    const paid = sum(cards, function (c) {
      const v = versementFor(c.id, date);
      return v ? v.montant : 0;
    });
    const touched = cards.some(function (c) { return versementFor(c.id, date); });
    const modes = { especes: 0, airtel: 0, moov: 0 };
    cards.forEach(function (c) {
      const v = versementFor(c.id, date);
      if (!v) return;
      const m = versementModes(v);
      PAY_MODES.forEach(function (k) { modes[k] += m[k]; });
    });
    let st = 'none';
    if (touched) st = paid <= 0 ? 'absent' : paid < expected ? 'partiel' : paid === expected ? 'complet' : 'avance';
    /* Une carte du client pas encore pointée : la ligne reste à compléter. */
    if ((st === 'complet' || st === 'avance') && cards.some(function (c) { return !versementFor(c.id, date); })) st = 'partiel';
    return { client: client, cards: cards, expected: expected, paid: paid, touched: touched, modes: modes, state: st, risk: clientRisk(client) };
  });
}

function pointageRowHTML(e, date) {
  const c = e.client;
  const sub = [];
  if (e.cards.length > 1) sub.push(e.cards.length + ' cartes');
  if (e.risk.niveau !== 'ok' && e.risk.retard > 0) sub.push('<span class="sub-' + RISK_TONES[e.risk.niveau] + '">Retard ' + esc(money(e.risk.retard, true)) + '</span>');
  else sub.push(esc(c.telephone || 'Sans téléphone'));
  let right;
  if (e.touched) {
    right = '<div class="prow-amt ' + STATUT_TONES[e.state] + '"><strong>' + (e.paid > 0 ? esc(money(e.paid, true)) : '0') + '</strong>' +
      '<span>' + esc(STATUT_LABELS[e.state]) + '</span>' + (e.paid > 0 ? payModeTag(e.modes) : '') + '</div>';
  } else {
    right = '<div class="prow-amt"><strong>' + esc(money(e.expected, true)) + '</strong><span>attendu</span></div>';
  }
  const quick = e.state === 'complet' || e.state === 'avance'
    ? '<span class="prow-done">' + icon('check', 18) + '</span>'
    : '<button type="button" class="prow-quick" data-action="pointage-full" data-client="' + esc(c.id) + '" data-date="' + esc(date) + '" aria-label="Versement complet pour ' + esc(c.nom) + '">' + icon('check', 20) + '</button>';
  return '<div class="prow st-' + e.state + (e.risk.niveau === 'risque' ? ' is-risk' : '') + '" role="button" tabindex="0" data-action="open-pay" data-client="' + esc(c.id) + '" data-date="' + esc(date) + '">' +
    avatar(c.nom) +
    '<div class="prow-id"><strong>' + esc(c.nom) + '</strong><span>' + sub.join(' · ') + '</span></div>' +
    right + quick +
  '</div>';
}

function viewPointage() {
  const date = state.pointageDate || todayISO();
  const t = todayISO();
  const isToday = date === t;
  const all = pointageEntries(date);
  const doneCount = all.filter(function (e) { return e.touched; }).length;
  const expectedAll = sum(all, function (e) { return e.expected; });
  const collected = sum(all, function (e) { return e.paid; });
  const pct = expectedAll > 0 ? clamp((collected / expectedAll) * 100, 0, 100) : (all.length ? 100 : 0);
  const todo = all.length - doneCount;

  let list = all.slice();
  const search = state.pointageSearch.trim().toLowerCase();
  if (search) list = list.filter(function (e) { return (e.client.nom || '').toLowerCase().indexOf(search) >= 0; });
  if (state.pointageQuartier !== 'tous') list = list.filter(function (e) { return (e.client.quartier || 'Non classé') === state.pointageQuartier; });
  if (state.pointageTab === 'a-pointer') list = list.filter(function (e) { return !e.touched; });
  else if (state.pointageTab === 'faits') list = list.filter(function (e) { return e.touched; });

  const groups = {};
  list.forEach(function (e) {
    const q = e.client.quartier || 'Non classé';
    (groups[q] = groups[q] || []).push(e);
  });
  const groupNames = Object.keys(groups).sort(function (a, b) { return a.localeCompare(b, 'fr'); });
  const rank = { risque: 0, attention: 1, retard: 2, ok: 3 };

  const quartiers = quartiersList();
  const chips = ['tous'].concat(quartiers).map(function (q) {
    const count = q === 'tous' ? all.length : all.filter(function (e) { return (e.client.quartier || 'Non classé') === q; }).length;
    if (q !== 'tous' && !count) return '';
    return '<button type="button" class="chip' + (state.pointageQuartier === q ? ' active' : '') + '" data-action="pointage-quartier" data-quartier="' + esc(q) + '">' +
      (q === 'tous' ? 'Tous' : esc(q)) + ' <span>' + count + '</span></button>';
  }).join('');

  const tabs = [['a-pointer', 'À pointer', todo], ['faits', 'Pointés', doneCount], ['tous', 'Tous', all.length]].map(function (x) {
    return '<button type="button" class="' + (state.pointageTab === x[0] ? 'on' : '') + '" data-action="pointage-tab" data-tab="' + x[0] + '">' + x[1] + ' <em>' + x[2] + '</em></button>';
  }).join('');

  const closed = clotureOf(date);

  return '<div class="page pointage-page">' +
    '<div class="date-nav">' +
      '<button type="button" class="icon-btn" data-action="pointage-shift" data-delta="-1" aria-label="Jour précédent">' + icon('chevron-left', 20) + '</button>' +
      '<label class="date-nav-main"><strong>' + esc(isToday ? 'Aujourd’hui' : fmtDate(date, 'day')) + '</strong><span>' + esc(fmtDate(date, 'long')) + '</span>' +
        '<input type="date" id="pointage-date" value="' + esc(date) + '" aria-label="Choisir une date"></label>' +
      '<button type="button" class="icon-btn" data-action="pointage-shift" data-delta="1" aria-label="Jour suivant">' + icon('chevron-right', 20) + '</button>' +
      (!isToday ? '<button type="button" class="btn sm ghost" data-action="pointage-today">Aujourd’hui</button>' : '') +
    '</div>' +
    '<section class="day-summary">' +
      '<div class="ds-top">' +
        '<div><span>Encaissé</span><strong>' + esc(money(collected)) + '</strong></div>' +
        '<div class="ds-right"><span>Attendu</span><strong>' + esc(money(expectedAll)) + '</strong></div>' +
      '</div>' +
      progressBar(pct, pct >= 100 ? 'green' : 'gold') +
      '<div class="ds-foot"><span>' + doneCount + ' / ' + all.length + ' client' + (all.length > 1 ? 's' : '') + ' pointé' + (doneCount > 1 ? 's' : '') + '</span>' +
        (todo > 0 ? '<span class="amber">' + todo + ' restant' + (todo > 1 ? 's' : '') + '</span>' : (all.length ? '<span class="green">Journée complète ✓</span>' : '')) + '</div>' +
    '</section>' +
    '<div class="search-box">' + icon('search', 17) + '<input id="pointage-search" type="search" placeholder="Rechercher un client…" value="' + esc(state.pointageSearch) + '" autocomplete="off"></div>' +
    '<div class="chips scroll-x">' + chips + '</div>' +
    '<div class="seg-tabs">' + tabs + '</div>' +
    (list.length
      ? groupNames.map(function (q) {
          const rows = groups[q].sort(function (a, b) {
            if (a.touched !== b.touched) return a.touched ? 1 : -1;
            if (rank[a.risk.niveau] !== rank[b.risk.niveau]) return rank[a.risk.niveau] - rank[b.risk.niveau];
            return (a.client.nom || '').localeCompare(b.client.nom || '', 'fr');
          });
          const qPaid = sum(rows, function (e) { return e.paid; });
          const qExp = sum(rows, function (e) { return e.expected; });
          return '<section class="prow-group">' +
            '<div class="prow-group-head"><h2>' + icon('map-pin', 14) + ' ' + esc(q) + '</h2><span>' + esc(money(qPaid, true)) + ' / ' + esc(money(qExp, true)) + '</span></div>' +
            '<div class="prow-list">' + rows.map(function (e) { return pointageRowHTML(e, date); }).join('') + '</div>' +
          '</section>';
        }).join('')
      : '<div class="panel">' + emptyState(
          all.length ? 'check-circle' : 'calendar',
          all.length ? (state.pointageTab === 'a-pointer' && !search ? 'Tout est pointé' : 'Aucun client ici') : 'Aucun client à pointer',
          all.length
            ? (state.pointageTab === 'a-pointer' && !search ? 'Bravo, tous les clients attendus ce jour sont enregistrés.' : 'Modifiez la recherche, le quartier ou l’onglet.')
            : 'Aucune carte active ne couvre le ' + fmtDate(date, 'long') + '. Créez une carte depuis la fiche d’un client.',
          all.length ? '' : '<a class="btn ghost" href="#/clients">Voir les clients</a>'
        ) + '</div>') +
    (all.length && isToday
      ? '<a class="close-day-cta' + (closed ? ' done' : '') + '" href="#/cloture">' + icon(closed ? 'check-circle' : 'lock', 20) +
          '<span><strong>' + (closed ? 'Journée clôturée' : 'Clôturer la journée') + '</strong><em>' + (closed ? 'Écart constaté : ' + esc(money(closed.ecart)) : 'Comptez l’argent et vérifiez l’écart') + '</em></span>' + icon('chevron-right', 18) + '</a>'
      : '') +
  '</div>';
}
