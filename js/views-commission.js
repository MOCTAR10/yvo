'use strict';

/* ============================================================
   YVO Épargne — écran Commissions (100 % paramétrable)
   ============================================================ */

let commEdit = null;

const COMM_TEMPLATES = [
  { nom: '1 jour de cotisation tous les 31 jours', desc: 'Le collecteur garde 1 jour de cotisation par période de 31 jours (début de période).', regles: [{ mode: 'cycle', calc: 'jours', valeur: 1, cycleJours: 31, moment: 'debut' }] },
  { nom: '10 % tous les 31 jours', desc: '10 % de ce qui a été versé pendant chaque période de 31 jours.', regles: [{ mode: 'cycle', calc: 'pct', valeur: 10, cycleJours: 31 }] },
  { nom: '1 % sur chaque versement', desc: 'Un petit pourcentage retenu à chaque fois que le client verse.', regles: [{ mode: 'versement', calc: 'pct', valeur: 1 }] },
  { nom: 'Montant fixe par versement', desc: 'Un montant fixe retenu à chaque versement.', regles: [{ mode: 'versement', calc: 'fixe', valeur: 100 }] },
  { nom: '5 % à la clôture de la carte', desc: 'Retenu une seule fois sur le total, quand la carte est soldée.', regles: [{ mode: 'fin', calc: 'pct', valeur: 5 }] }
];

function newRule(partial) {
  return Object.assign({ id: uid('rg'), libelle: '', mode: 'cycle', calc: 'jours', valeur: 1, cycleJours: 31, moment: 'debut', actif: true }, partial || {});
}

function baremeUsage(id) {
  return db.cartes.filter(function (c) { return c.commission && c.commission.baremeId === id; });
}

/* ------------------------------------------------------------
   Page Commissions
   ------------------------------------------------------------ */

function viewCommission() {
  const cfg = db.settings.commission;
  const on = cfg.actif;
  const tot = commissionTotals();
  const ms = monthStart();
  const month = sum(tot.events.filter(function (e) { return e.statut === 'acquise' && e.date >= ms; }), function (e) { return e.montant; });
  const from = state.commPeriod === 'mois' ? ms : state.commPeriod === 'annee' ? yearStart() : null;
  const events = tot.events.filter(function (e) { return !from || e.date >= from; });
  const periodTotal = sum(events, function (e) { return e.montant; });
  const withCom = db.cartes.filter(function (c) { return c.commission; }).length;

  return '<div class="page comm-page">' +
    pageHead('Votre rémunération', 'Commissions', 'Choisissez vous-même ce que vous prélevez : pourcentage, montant fixe ou jours de cotisation, à chaque versement, par période ou à la clôture.') +
    '<section class="comm-switch ' + (on ? 'on' : '') + '">' +
      '<div><strong>' + (on ? 'Commissions activées' : 'Commissions désactivées') + '</strong>' +
      '<span>' + (on ? 'Elles sont retenues sur l’épargne des clients et calculées automatiquement.' : 'Activez-les pour que l’application calcule ce que vous prélevez.') + '</span></div>' +
      '<button type="button" class="switch ' + (on ? 'on' : '') + '" role="switch" aria-checked="' + on + '" data-action="comm-toggle" aria-label="Activer les commissions"><i></i></button>' +
    '</section>' +
    (on
      ? '<div class="mini-kpis">' +
          '<div class="mini-kpi"><span>Acquises</span><strong class="green">' + esc(money(tot.acquise)) + '</strong><em>déjà à vous</em></div>' +
          '<div class="mini-kpi"><span>Estimées</span><strong>' + esc(money(tot.estimee)) + '</strong><em>périodes en cours</em></div>' +
          '<div class="mini-kpi"><span>Ce mois</span><strong>' + esc(money(month)) + '</strong><em>acquises</em></div>' +
          '<div class="mini-kpi"><span>Cartes concernées</span><strong>' + withCom + '</strong><em>sur ' + db.cartes.length + '</em></div>' +
        '</div>'
      : '') +
    '<div class="callout info small">' + icon('coins', 17) + '<div><strong>Comment ça marche ?</strong><span>La commission est retenue sur l’épargne du client : <b>solde dû = total cotisé − commission − déjà payé</b>. L’argent reste en caisse mais devient le vôtre. Chaque carte garde le barème choisi à sa création : changer un taux ne modifie pas le passé.</span></div></div>' +
    '<section class="panel">' +
      '<div class="panel-head"><div><h2>Mes barèmes</h2><p class="panel-sub">Un barème = une ou plusieurs règles. Vous pouvez en créer autant que vous voulez (ex. clients fidèles, clients occasionnels).</p></div>' +
        '<button type="button" class="btn primary sm" data-action="comm-new">' + icon('plus', 15) + ' Nouveau</button></div>' +
      (cfg.baremes.length
        ? '<div class="bareme-list">' + cfg.baremes.map(function (b) {
            const used = baremeUsage(b.id).length;
            return '<article class="bareme' + (b.parDefaut ? ' is-default' : '') + '">' +
              '<div class="bareme-head"><strong>' + esc(b.nom) + '</strong>' + (b.parDefaut ? badge('Par défaut', 'green') : '') + '<span class="muted">' + used + ' carte' + (used > 1 ? 's' : '') + '</span></div>' +
              '<ul class="bareme-rules">' + b.regles.map(function (r) { return '<li class="' + (r.actif === false ? 'off' : '') + '">' + icon('coins', 14) + ' ' + esc(r.libelle || commissionRuleLabel(r)) + (r.libelle ? ' <em>(' + esc(commissionRuleLabel(r)) + ')</em>' : '') + '</li>'; }).join('') + '</ul>' +
              '<div class="bareme-actions">' +
                '<button type="button" class="btn sm ghost" data-action="comm-edit" data-id="' + esc(b.id) + '">' + icon('edit', 14) + ' Modifier</button>' +
                '<button type="button" class="btn sm ghost" data-action="comm-dup" data-id="' + esc(b.id) + '">Dupliquer</button>' +
                (!b.parDefaut ? '<button type="button" class="btn sm ghost" data-action="comm-default" data-id="' + esc(b.id) + '">Par défaut</button>' : '') +
                (used ? '<button type="button" class="btn sm ghost" data-action="comm-apply" data-id="' + esc(b.id) + '" data-mode="update">Mettre à jour les cartes</button>' : '') +
                '<button type="button" class="btn sm ghost" data-action="comm-apply" data-id="' + esc(b.id) + '" data-mode="assign">Appliquer aux cartes en cours</button>' +
                '<button type="button" class="icon-btn sm danger" data-action="comm-del" data-id="' + esc(b.id) + '" aria-label="Supprimer">' + icon('trash', 14) + '</button>' +
              '</div></article>';
          }).join('') + '</div>'
        : '<div class="comm-empty">' + icon('coins', 26) + '<p>Aucun barème pour l’instant. Partez d’un modèle ou créez le vôtre.</p></div>') +
      '<h3 class="sub-h">Modèles rapides</h3>' +
      '<div class="template-list">' + COMM_TEMPLATES.map(function (t, i) {
        return '<button type="button" class="template" data-action="comm-template" data-i="' + i + '"><strong>' + esc(t.nom) + '</strong><span>' + esc(t.desc) + '</span></button>';
      }).join('') + '</div>' +
    '</section>' +
    (on
      ? '<section class="panel">' +
          '<div class="panel-head"><div><h2>Journal des commissions</h2><p class="panel-sub">' + events.length + ' ligne' + (events.length > 1 ? 's' : '') + ' · total ' + esc(money(periodTotal)) + '</p></div></div>' +
          '<div class="chips">' + [['mois', 'Ce mois'], ['annee', 'Cette année'], ['tout', 'Tout']].map(function (p) {
            return '<button type="button" class="chip' + (state.commPeriod === p[0] ? ' active' : '') + '" data-action="comm-period" data-period="' + p[0] + '">' + p[1] + '</button>';
          }).join('') + '</div>' +
          (events.length
            ? '<div class="feed">' + events.slice(0, 120).map(function (e) {
                return '<div class="feed-item"><span class="feed-ic ' + (e.statut === 'acquise' ? 'green' : 'amber') + '">' + icon('coins', 16) + '</span>' +
                  '<div class="feed-main"><div class="feed-text">' + esc(e.libelle) + '</div><div class="feed-meta"><a href="#/client/' + esc(e.clientId) + '">' + esc(e.clientNom) + '</a><span class="dot">·</span><span>' + esc(e.carteLabel) + '</span><span class="dot">·</span><span>' + esc(fmtDate(e.date, 'medium')) + '</span></div></div>' +
                  '<div class="feed-amt ' + (e.statut === 'acquise' ? 'in' : '') + '">' + esc(money(e.montant, true)) + '<small class="muted block">' + (e.statut === 'acquise' ? 'acquise' : 'estimée') + '</small></div></div>';
              }).join('') + '</div>'
            : '<p class="muted pad">Aucune commission sur cette période.</p>') +
        '</section>'
      : '') +
  '</div>';
}

/* ------------------------------------------------------------
   Éditeur de barème
   ------------------------------------------------------------ */

function ruleRowHTML(r, i) {
  const isCycle = r.mode === 'cycle';
  return '<div class="rule" data-i="' + i + '">' +
    '<div class="rule-top"><strong>Règle ' + (i + 1) + '</strong>' +
      '<label class="checkline"><input type="checkbox" name="r' + i + '_actif"' + (r.actif !== false ? ' checked' : '') + ' data-sim="1"><span>Active</span></label>' +
      '<button type="button" class="icon-btn sm danger" data-action="comm-rule-del" data-i="' + i + '" aria-label="Supprimer la règle">' + icon('trash', 14) + '</button></div>' +
    '<div class="form-grid">' +
      '<label class="field span2"><span>Quand ?</span><select name="r' + i + '_mode" class="rule-sel">' +
        Object.keys(COMM_MODES).map(function (k) { return '<option value="' + k + '"' + (r.mode === k ? ' selected' : '') + '>' + COMM_MODES[k] + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span>Calcul</span><select name="r' + i + '_calc" class="rule-sel">' +
        Object.keys(COMM_CALCS).filter(function (k) { return !(r.mode === 'versement' && k === 'jours'); }).map(function (k) { return '<option value="' + k + '"' + (r.calc === k ? ' selected' : '') + '>' + COMM_CALCS[k] + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span>' + (r.calc === 'pct' ? 'Pourcentage' : r.calc === 'jours' ? 'Nombre de jours' : 'Montant (' + esc(db.settings.devise) + ')') + '</span><input name="r' + i + '_valeur" type="number" inputmode="decimal" min="0" step="any" value="' + esc(r.valeur) + '" data-sim="1" required></label>' +
      (isCycle ? '<label class="field"><span>Durée d’une période (jours)</span><input name="r' + i + '_cycle" type="number" inputmode="numeric" min="1" step="1" value="' + esc(r.cycleJours || 31) + '" data-sim="1"></label>' : '') +
      (isCycle && r.calc !== 'pct' ? '<label class="field"><span>Prélevé</span><select name="r' + i + '_moment" class="rule-sel"><option value="debut"' + (r.moment === 'debut' ? ' selected' : '') + '>Au début de la période</option><option value="fin"' + (r.moment !== 'debut' ? ' selected' : '') + '>À la fin de la période</option></select></label>' : '') +
      '<label class="field span2"><span>Nom de la règle (facultatif)</span><input name="r' + i + '_libelle" value="' + esc(r.libelle || '') + '" placeholder="' + esc(commissionRuleLabel(r)) + '"></label>' +
    '</div>' +
  '</div>';
}

function commReadForm() {
  const form = document.getElementById('form-bareme');
  if (!form || !commEdit) return;
  const f = new FormData(form);
  commEdit.nom = String(f.get('nom') || '');
  commEdit.regles = commEdit.regles.map(function (r, i) {
    if (!f.has('r' + i + '_valeur')) return r;
    return Object.assign({}, r, {
      mode: String(f.get('r' + i + '_mode') || r.mode),
      calc: String(f.get('r' + i + '_calc') || r.calc),
      valeur: Number(String(f.get('r' + i + '_valeur')).replace(',', '.')) || 0,
      cycleJours: Math.max(1, Math.round(Number(f.get('r' + i + '_cycle')) || r.cycleJours || 31)),
      moment: String(f.get('r' + i + '_moment') || r.moment || 'debut'),
      libelle: String(f.get('r' + i + '_libelle') || '').trim(),
      actif: f.get('r' + i + '_actif') === 'on'
    });
  });
  commEdit.regles.forEach(function (r) { if (r.mode === 'versement' && r.calc === 'jours') r.calc = 'pct'; });
}

function commRenderRules() {
  const box = document.getElementById('rules-box');
  if (box) box.innerHTML = commEdit.regles.map(ruleRowHTML).join('') || '<p class="muted">Aucune règle : ajoutez-en une.</p>';
  commSim();
}

function commSim() {
  const out = document.getElementById('comm-sim-out');
  if (!out || !commEdit) return;
  const daily = Math.max(1, parseMoney((document.getElementById('sim-daily') || {}).value) || 5000);
  const days = clamp(Math.round(Number((document.getElementById('sim-days') || {}).value) || 31), 1, 400);
  const start = '2000-01-01';
  const end = addDays(start, days - 1);
  const carte = { montantJournalier: daily, dateDebut: start, dateFin: end, statut: 'cloturee', clotureeAt: end, commission: { regles: commEdit.regles } };
  const vs = [];
  for (let k = 0; k < days; k += 1) vs.push({ date: addDays(start, k), montant: daily });
  const r = computeCommission(carte, vs, end, true);
  const total = daily * days;
  out.innerHTML = '<div><span>Total versé par le client</span><strong>' + esc(money(total)) + '</strong></div>' +
    '<div><span>Votre commission</span><strong class="green">' + esc(money(r.total)) + '</strong></div>' +
    '<div><span>Le client récupère</span><strong>' + esc(money(total - r.total)) + '</strong></div>' +
    '<div><span>Taux effectif</span><strong>' + (total ? (r.total / total * 100).toFixed(1).replace('.', ',') : '0') + ' %</strong></div>';
}

function openBaremeModal(b) {
  commEdit = b
    ? { id: b.id, nom: b.nom, parDefaut: !!b.parDefaut, regles: JSON.parse(JSON.stringify(b.regles)) }
    : { id: null, nom: '', parDefaut: false, regles: [newRule()] };
  openModal({
    title: b && b.id ? 'Modifier le barème' : 'Nouveau barème',
    subtitle: 'Définissez vos règles de commission. Le simulateur montre le résultat en direct.',
    size: 'wide',
    body:
      '<form id="form-bareme" data-form="save-bareme" autocomplete="off">' +
        '<label class="field"><span>Nom du barème *</span><input name="nom" required value="' + esc(commEdit.nom) + '" placeholder="Ex. Clients fidèles" data-autofocus></label>' +
        '<div id="rules-box" class="rules">' + commEdit.regles.map(ruleRowHTML).join('') + '</div>' +
        '<button type="button" class="btn ghost full" data-action="comm-rule-add">' + icon('plus', 15) + ' Ajouter une règle</button>' +
        '<div class="comm-sim">' +
          '<h3>Simulateur</h3>' +
          '<div class="form-grid">' +
            '<label class="field"><span>Journalier</span><input id="sim-daily" type="number" inputmode="numeric" min="1" value="5000" data-sim="1"></label>' +
            '<label class="field"><span>Nombre de jours payés</span><input id="sim-days" type="number" inputmode="numeric" min="1" max="400" value="31" data-sim="1"></label>' +
          '</div>' +
          '<div class="comm-sim-out" id="comm-sim-out"></div>' +
          '<p class="hint">Simulation d’une carte payée en entier chaque jour.</p>' +
        '</div>' +
      '</form>',
    footer:
      '<button type="button" class="btn ghost" data-action="close-modal">Annuler</button>' +
      '<button type="submit" form="form-bareme" class="btn primary lg">' + icon('check', 17) + ' Enregistrer</button>',
    onMount: commSim
  });
}
