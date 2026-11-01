'use strict';

/* ============================================================
   YVO Épargne — tableau de bord & pointage
   ============================================================ */

function movementRowHTML(m, linkClient) {
  const isIn = m.type === 'entree';
  const cat = CAT_LABELS[m.categorie] || 'Mouvement';
  const client = linkClient && m.clientId ? clientById(m.clientId) : null;
  const who = client
    ? '<a href="#/client/' + esc(client.id) + '" class="mv-link">' + esc(client.nom) + '</a>'
    : esc(m.clientNom || '');
  return '<div class="mv">' +
    '<div class="mv-ico ' + (isIn ? 'in' : 'out') + '">' + icon(isIn ? 'arrow-down' : 'arrow-up', 16) + '</div>' +
    '<div class="mv-main">' +
      '<div class="mv-title">' + esc(m.libelle) + (m.carteLabel ? ' <span class="mv-card">' + esc(m.carteLabel) + '</span>' : '') + '</div>' +
      '<div class="mv-sub">' + (who ? who + ' · ' : '') + esc(fmtDate(m.date, 'medium')) + ' · ' + esc(cat) + (m.mode ? ' · ' + esc(m.mode) : '') + '</div>' +
    '</div>' +
    '<div class="mv-amt ' + (isIn ? 'in' : 'out') + '">' + (isIn ? '+' : '−') + esc(money(m.montant, true)) + '</div>' +
    '</div>';
}

function dashboardAlerts(dueToday) {
  const t = todayISO();
  const alerts = [];
  const unpointed = dueToday.filter(function (c) { return !versementFor(c.id, t); });
  if (unpointed.length) {
    alerts.push({
      tone: 'amber',
      icon: 'check-square',
      text: unpointed.length + ' carte' + (unpointed.length > 1 ? 's' : '') + ' à pointer aujourd’hui',
      sub: 'Ouvrez le pointage pour enregistrer les versements du jour.',
      href: '#/pointage'
    });
  }
  db.cartes.forEach(function (c) {
    if (c.statut !== 'active') return;
    const cl = clientById(c.clientId);
    if (!cl) return;
    const d = diffDays(t, c.dateFin);
    if (d >= 0 && d <= 7) {
      const tot = cardTotals(c);
      alerts.push({
        tone: 'blue',
        icon: 'clock',
        text: c.label + ' de ' + cl.nom + ' se termine ' + (d === 0 ? 'aujourd’hui' : 'dans ' + d + ' jour' + (d > 1 ? 's' : '')),
        sub: 'Solde dû : ' + money(tot.solde) + ' · échéance ' + fmtDate(c.dateFin),
        href: '#/client/' + cl.id
      });
    } else if (d < 0 && cardTotals(c).solde > 0) {
      const tot = cardTotals(c);
      alerts.push({
        tone: 'red',
        icon: 'alert',
        text: 'Carte échue à solder : ' + cl.nom,
        sub: c.label + ' · ' + money(tot.solde) + ' restent à payer',
        href: '#/client/' + cl.id
      });
    }
  });
  db.clients.forEach(function (cl) {
    if (cl.actif === false) return;
    const tot = clientTotals(cl);
    if (tot.retard > 0) {
      alerts.push({
        tone: 'red',
        icon: 'alert',
        text: cl.nom + ' a un retard de ' + money(tot.retard),
        sub: 'Sur les cartes en cours · ' + tot.nbActives + ' carte' + (tot.nbActives > 1 ? 's' : ''),
        href: '#/client/' + cl.id
      });
    }
  });
  return alerts.slice(0, 5);
}

/* Bandeaux de protection : sauvegarde, couverture de caisse, clôture */
function dashboardGuards() {
  const out = [];
  const hasData = db.clients.length > 0;
  const t = todayISO();
  const owed = fundsOwed();
  const cover = cashBalance() - owed;
  if (hasData && cover < 0) {
    out.push('<a class="guard red" href="#/risques">' + icon('shield-alert', 22) +
      '<span><strong>La caisse ne couvre pas l’argent des clients</strong><em>Il manque ' + esc(money(-cover)) + ' : la caisse (' + esc(money(cashBalance(), true)) + ') est inférieure à ce que vous devez aux clients (' + esc(money(owed, true)) + ').</em></span>' + icon('chevron-right', 18) + '</a>');
  }
  if (hasData && syncCfg && (syncState.status === 'error' || syncState.status === 'offline')) {
    out.push('<a class="guard amber" href="#/parametres">' + icon('cloud', 22) + '<span><strong>' + (syncState.status === 'offline' ? 'Hors ligne' : 'Synchronisation en erreur') + '</strong><em>' + esc(syncStatusLabel()) + '</em></span>' + icon('chevron-right', 18) + '</a>');
  }
  const todayHasMoney = db.versements.some(function (v) { return v.date === t && v.montant > 0; });
  if (todayHasMoney && !clotureOf(t) && new Date().getHours() >= 16) {
    out.push('<a class="guard blue" href="#/cloture">' + icon('lock', 22) +
      '<span><strong>La journée n’est pas clôturée</strong><em>Comptez l’argent en main et vérifiez qu’il n’y a aucun écart.</em></span>' + icon('chevron-right', 18) + '</a>');
  }
  if (storageInfo && storageInfo.idb === false && hasData) {
    out.push('<div class="guard amber">' + icon('alert', 22) + '<span><strong>Stockage de secours indisponible</strong><em>Ce navigateur bloque la base sécurisée. Faites des exports réguliers.</em></span></div>');
  }
  return out.length ? '<div class="guards">' + out.slice(0, 2).join('') + '</div>' : '';
}

function quickActionsHTML() {
  const items = [
    ['check-square', 'Pointer', 'href', '#/pointage', 'brand'],
    ['plus', 'Client', 'action', 'new-client', ''],
    ['receipt', 'Payer', 'action', 'new-retrait', ''],
    ['arrow-up', 'Dépense', 'action', 'new-operation', 'out']
  ];
  return '<div class="quick-actions">' + items.map(function (x) {
    const inner = '<span class="qa-ic ' + x[4] + '">' + icon(x[0], 22) + '</span><span class="qa-label">' + x[1] + '</span>';
    return x[2] === 'href'
      ? '<a class="qa" href="' + x[3] + '">' + inner + '</a>'
      : '<button type="button" class="qa" data-action="' + x[3] + '"' + (x[3] === 'new-operation' ? ' data-type="sortie"' : '') + '>' + inner + '</button>';
  }).join('') + '</div>';
}

function relancePanelHTML() {
  const rank = { risque: 0, attention: 1, retard: 2 };
  const rows = db.clients.filter(function (c) { return c.actif !== false; }).map(function (c) {
    return { client: c, risk: clientRisk(c) };
  }).filter(function (x) { return x.risk.niveau !== 'ok'; }).sort(function (a, b) {
    return rank[a.risk.niveau] - rank[b.risk.niveau] || b.risk.retard - a.risk.retard;
  });
  if (!rows.length) return '';
  return '<section class="panel">' +
    '<div class="panel-head"><div><h2>À relancer</h2><p class="panel-sub">' + rows.length + ' client' + (rows.length > 1 ? 's' : '') + ' en retard · ' + esc(money(sum(rows, function (x) { return x.risk.retard; }))) + ' à récupérer</p></div><a class="link-arrow" href="#/risques">Tout voir ' + icon('chevron-right', 14) + '</a></div>' +
    '<div class="relance-list">' + rows.slice(0, 5).map(function (x) { return relanceRowHTML(x.client, x.risk); }).join('') + '</div>' +
  '</section>';
}

function relanceRowHTML(client, risk) {
  const msg = 'Bonjour ' + client.nom + ', votre cotisation est en retard de ' + money(risk.retard) + '. Merci de passer à la caisse. — ' + (db.settings.company.nom || '');
  return '<div class="relance">' +
    '<a class="relance-main" href="#/client/' + esc(client.id) + '">' + avatar(client.nom) +
      '<span><strong>' + esc(client.nom) + '</strong>' +
      '<em>' + (risk.jours > 0 ? risk.jours + ' jour' + (risk.jours > 1 ? 's' : '') + ' sans verser · ' : '') + esc(client.quartier || 'Non classé') + '</em></span></a>' +
    '<div class="relance-side"><strong class="' + RISK_TONES[risk.niveau] + '">' + esc(money(risk.retard, true)) + '</strong>' + riskBadge(risk) + '</div>' +
    '<div class="relance-contact">' + contactButtons(client, msg, true) + '</div>' +
  '</div>';
}

function viewDashboard() {
  const t = todayISO();
  const caisse = cashBalance();
  const todayT = cashTotals(t, t);
  const monthT = cashTotals(monthStart(), t);
  const totalCotise = sum(db.versements, function (v) { return v.montant; });
  const nbVersements = db.versements.filter(function (v) { return Number(v.montant) > 0; }).length;
  const soldeDus = sum(db.clients.map(clientTotals), function (x) { return x ? x.solde : 0; });
  const activeClients = db.clients.filter(function (c) { return c.actif !== false; }).length;
  const dueToday = dueCards(t);
  const pointed = dueToday.filter(function (c) { return versementFor(c.id, t); });
  const encaisseJour = sum(pointed, function (c) {
    const v = versementFor(c.id, t);
    return v ? v.montant : 0;
  });
  const attenduJour = sum(dueToday, function (c) { return c.montantJournalier; });
  const pctPointage = dueToday.length ? (pointed.length / dueToday.length) * 100 : 0;
  const company = db.settings.company;
  const days = last7Days();
  const maxDay = Math.max(1000, Math.max.apply(null, days.map(function (d) { return d.entrees; })));
  const alerts = dashboardAlerts(dueToday);
  const recent = movementList().slice(0, 6);
  const quartiers = quartiersList().map(function (q) {
    const clients = db.clients.filter(function (c) { return (c.quartier || 'Non classé') === q; });
    const totals = clients.map(clientTotals);
    return {
      quartier: q,
      clients: clients.length,
      cotise: sum(totals, function (x) { return x.totalVerse; }),
      solde: sum(totals, function (x) { return x.solde; }),
      journalier: sum(totals, function (x) { return x.journalier; })
    };
  }).sort(function (a, b) { return b.cotise - a.cotise; }).slice(0, 6);
  const maxQuartier = Math.max(1, Math.max.apply(null, quartiers.map(function (q) { return q.cotise; })));
  const demoBanner = db.settings.demo
    ? '<div class="demo-banner">' +
        '<span class="demo-dot"></span>' +
        '<div><strong>Mode démonstration</strong><span>Ces clients et montants sont fictifs. Effacez-les avant de commencer.</span></div>' +
        '<button type="button" class="btn sm ghost" data-action="reset-demo">Repartir de zéro</button>' +
      '</div>'
    : '';

  const left = Math.max(0, dueToday.length - pointed.length);
  const todayCard =
    '<section class="today-hero">' +
      '<div class="th-top"><div><span class="th-label">Aujourd’hui</span>' +
        '<strong class="th-title">' + (dueToday.length
          ? (left > 0 ? left + ' client' + (left > 1 ? 's' : '') + ' à voir' : 'Tout le monde est pointé')
          : 'Aucun client à voir') + '</strong></div>' +
        '<div class="th-ring" style="background:conic-gradient(var(--gold-2) ' + (pctPointage * 3.6).toFixed(1) + 'deg, rgba(255,255,255,.18) 0)"><span>' + Math.round(pctPointage) + '%</span></div></div>' +
      '<div class="th-lines">' +
        '<div><span>Encaissé</span><strong>' + esc(money(encaisseJour, true)) + '</strong></div>' +
        '<div><span>Encore attendu</span><strong>' + esc(money(Math.max(0, attenduJour - encaisseJour), true)) + '</strong></div>' +
      '</div>' +
      '<a class="btn th-btn" href="#/pointage">' + icon('check-square', 17) + ' ' + (left > 0 ? 'Continuer le pointage' : 'Voir le pointage') + '</a>' +
    '</section>';
  const caisseCard =
    '<section class="caisse-card">' +
      '<div class="cc-top"><span>Caisse</span>' + icon('wallet', 18) + '</div>' +
      '<strong class="cc-value">' + esc(money(caisse)) + '</strong>' +
      '<div class="cc-split"><div><span>Entré aujourd’hui</span><b>' + (todayT.entrees ? '+' : '') + esc(money(todayT.entrees, true)) + '</b></div><div><span>Sorti aujourd’hui</span><b>' + (todayT.sorties ? '−' : '') + esc(money(todayT.sorties, true)) + '</b></div></div>' +
      '<a class="cc-link" href="#/tresorerie">Voir le détail ' + icon('chevron-right', 13) + '</a>' +
    '</section>';

  return '<div class="page dash">' +
    demoBanner +
    '<header class="dash-head"><span>' + esc(fmtDate(t, 'long')) + '</span><h1>' + esc(greeting() + ', ' + (company.responsable || company.nom || 'bienvenue')) + '</h1></header>' +
    setupChecklist() +
    '<div class="dash-main">' + todayCard + caisseCard + '</div>' +
    quickActionsHTML() +
    dashboardGuards() +
    relancePanelHTML() +
    '<details class="more dash-more"><summary>Plus de chiffres</summary>' +
      '<div class="kpi-grid">' +
        '<article class="kpi"><div class="kpi-top"><span class="kpi-label">Total versé par les clients</span><span class="kpi-ic soft">' + icon('banknote', 19) + '</span></div>' +
          '<div class="kpi-value">' + esc(money(totalCotise)) + '</div>' +
          '<div class="kpi-foot"><span class="trend up">' + icon('arrow-up', 13) + ' ' + esc(money(monthT.entrees, true)) + '</span> ce mois</div></article>' +
        '<article class="kpi"><div class="kpi-top"><span class="kpi-label">À rendre aux clients</span><span class="kpi-ic soft">' + icon('layers', 19) + '</span></div>' +
          '<div class="kpi-value">' + esc(money(soldeDus)) + '</div>' +
          '<div class="kpi-foot"><span class="muted">' + numberFR(activeClients) + ' client' + (activeClients > 1 ? 's' : '') + ' actif' + (activeClients > 1 ? 's' : '') + '</span></div></article>' +
      '</div>' +
      '<section class="panel">' +
        '<div class="panel-head"><div><h2>Les 7 derniers jours</h2><p class="panel-sub">Argent encaissé.</p></div><span class="panel-total">' + esc(money(sum(days, function (d) { return d.entrees; }))) + '</span></div>' +
        '<div class="chart">' +
          days.map(function (d) {
            const h = d.entrees > 0 ? Math.max(5, (d.entrees / maxDay) * 100) : 2;
            return '<div class="chart-col" title="' + esc(fmtDate(d.date, 'long') + ' · ' + money(d.entrees)) + '">' +
              '<span class="chart-val">' + (d.entrees > 0 ? esc(money(d.entrees, true)) : '') + '</span>' +
              '<span class="chart-track"><span class="chart-fill" style="height:' + h.toFixed(1) + '%"></span></span>' +
              '<span class="chart-day' + (d.date === t ? ' today' : '') + '">' + (d.date === t ? 'auj.' : DAYS_SHORT[parseISO(d.date).getDay()]) + '</span>' +
            '</div>';
          }).join('') +
        '</div>' +
      '</section>' +
      '<section class="panel">' +
        '<div class="panel-head"><div><h2>Par quartier</h2><p class="panel-sub">Où sont vos clients.</p></div><a class="link-arrow" href="#/clients">Tous ' + icon('chevron-right', 14) + '</a></div>' +
        (quartiers.length
          ? '<div class="quartier-list">' + quartiers.map(function (q) {
              return '<div class="quartier-row">' +
                '<div class="qr-head"><span class="qr-name">' + icon('map-pin', 14) + ' ' + esc(q.quartier) + '</span><span class="qr-count">' + q.clients + ' client' + (q.clients > 1 ? 's' : '') + '</span></div>' +
                '<div class="qr-bar"><span style="width:' + ((q.cotise / maxQuartier) * 100).toFixed(1) + '%"></span></div>' +
                '<div class="qr-foot"><span>' + esc(money(q.cotise)) + ' versés</span><span>' + esc(money(q.solde)) + ' à rendre</span></div>' +
              '</div>';
            }).join('') + '</div>'
          : '<p class="muted pad">Ajoutez des clients pour voir les quartiers.</p>') +
      '</section>' +
      '<section class="panel">' +
        '<div class="panel-head"><div><h2>Derniers mouvements</h2><p class="panel-sub">Versements et opérations de caisse.</p></div><a class="link-arrow" href="#/tresorerie">Caisse ' + icon('chevron-right', 14) + '</a></div>' +
        (recent.length
          ? '<div class="movement-list">' + recent.map(function (m) { return movementRowHTML(m, true); }).join('') + '</div>'
          : '<p class="muted pad">Aucun mouvement pour le moment.</p>') +
      '</section>' +
    '</details>' +
  '</div>';
}

