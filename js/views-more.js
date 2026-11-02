'use strict';

function relanceRowHTML(client, risk) {
  return '<a class="relance" href="#/client/' + esc(client.id) + '">' +
    '<span class="relance-main"><span><strong>' + esc(client.nom) + '</strong>' +
      '<em>' + esc([client.telephone, client.quartier].filter(Boolean).join(' · ')) + '</em></span></span>' +
    '<span class="relance-side"><strong class="red">' + (risk.retard > 0 ? 'Doit ' + esc(money(risk.retard, true)) : 'Prêt ' + esc(money(risk.pret, true))) + '</strong></span>' +
  '</a>';
}

function viewRisques() {
  const late = db.clients.filter(function (c) { return c.actif !== false; })
    .map(function (c) {
      /* un prêt sans carte en cours ne se rembourse pas tout seul : il faut l'appeler */
      const enCours = cartesOf(c.id).some(function (k) { return dueOn(k, todayISO()); });
      return { client: c, risk: clientRisk(c), doit: clientStatus(c).doit, pret: enCours ? 0 : clientTotals(c).resteARembourser };
    })
    .filter(function (x) { return x.doit > 0 || x.pret > 0; })
    .sort(function (a, b) { return (b.doit + b.pret) - (a.doit + a.pret); });
  return '<div class="page simple-page">' +
    '<h1 class="simple-title">Clients à appeler</h1>' +
    (late.length
      ? '<div class="relance-list">' + late.map(function (x) { return relanceRowHTML(x.client, Object.assign({}, x.risk, { retard: x.doit, pret: x.pret })); }).join('') + '</div>'
      : '<div class="simple-done">✓ Personne ne doit d’argent</div>') +
  '</div>';
}

/* Compter mon argent : ce qu'il doit y avoir, ce que Yvo a vraiment. */
function ecartWords(ecart) {
  if (ecart === 0) return 'C’est juste ✓';
  return ecart < 0 ? 'Il manque ' + money(-ecart, true) : 'Il y a ' + money(ecart, true) + ' en plus';
}

function viewCloture() {
  const t = todayISO();
  const today = cashTotals(t, t);
  const balance = cashBalance();
  const done = clotureOf(t);
  const history = db.clotures.filter(function (c) { return c.date !== t; }).sort(function (a, b) { return b.date.localeCompare(a.date); });
  const mob = { airtel: 0, moov: 0 };
  db.versements.forEach(function (x) {
    versementReceipts(x).forEach(function (r) {
      if (r.date !== t) return;
      mob.airtel += r.modes.airtel; mob.moov += r.modes.moov;
    });
  });

  return '<div class="page simple-page">' +
    '<h1 class="simple-title">Compter mon argent</h1>' +
    (done ? '<div class="simple-done">✓ Déjà compté aujourd’hui</div>' : '') +
    '<section class="panel cloture-panel">' +
      '<div class="cloture-lines">' +
        '<div><span>Reçu aujourd’hui</span><strong class="in">' + (today.entrees ? '+' : '') + esc(money(today.entrees, true)) + '</strong></div>' +
        '<div><span>Donné aujourd’hui</span><strong class="out">' + (today.sorties ? '−' : '') + esc(money(today.sorties, true)) + '</strong></div>' +
        (mob.airtel + mob.moov > 0
          ? '<div class="muted-line"><span>Reçu sur Airtel / Moov</span><strong>' + esc(money(mob.airtel, true)) + ' / ' + esc(money(mob.moov, true)) + '</strong></div>'
          : '') +
        '<div class="total"><span>Il doit y avoir</span><strong id="cloture-attendu" data-value="' + balance + '">' + esc(money(balance)) + '</strong></div>' +
      '</div>' +
      '<form id="form-cloture" data-form="save-cloture" autocomplete="off">' +
        '<label class="field big-field"><span>Combien j’ai vraiment ?</span>' +
          '<div class="input-suffix"><input id="cloture-compte" name="compte" type="number" inputmode="numeric" min="0" step="1" required placeholder="0" value="' + (done ? done.compte : '') + '" data-autofocus><span>' + esc(db.settings.devise) + '</span></div>' +
          '<small>Les billets, plus Airtel, plus Moov.</small></label>' +
        '<div class="ecart-box" id="cloture-ecart"><span>Résultat</span><strong>—</strong><em>Écrivez combien vous avez</em></div>' +
        '<label class="field"><span>Pourquoi ? (si ce n’est pas juste)</span><input name="note" placeholder="Ex. erreur de monnaie" value="' + esc(done ? done.note || '' : '') + '"></label>' +
        '<button type="submit" class="btn primary simple-big">' + (done ? 'Enregistrer à nouveau' : 'Enregistrer') + '</button>' +
      '</form>' +
    '</section>' +
    (history.length
      ? '<details class="simple-sec"><summary>Les jours d’avant</summary><div class="crow2-list">' + history.slice(0, 60).map(function (c) {
          return '<div class="crow2"><span class="crow2-main"><strong>' + esc(capitalize(fmtDate(c.date, 'day'))) + '</strong>' + (c.note ? '<em>' + esc(c.note) + '</em>' : '') + '</span>' +
            '<b class="' + (c.ecart === 0 ? 'green' : 'red') + '">' + esc(ecartWords(c.ecart)) + '</b></div>';
        }).join('') + '</div></details>'
      : '') +
  '</div>';
}

function viewCorbeille() {
  const items = db.trash;
  return '<div class="page simple-page">' +
    '<h1 class="simple-title">Corbeille</h1>' +
    (items.length
      ? '<div class="panel"><div class="trash-list">' + items.map(function (t) {
          const n = (t.data.cartes ? t.data.cartes.length : 0) + (t.data.versements ? t.data.versements.length : 0) + (t.data.operations ? t.data.operations.length : 0);
          const kindLabel = { client: 'Client', carte: 'Carte', versement: 'Paiement', operation: 'Argent' }[t.kind] || 'Autre';
          return '<div class="trash-item"><span class="feed-ic red">' + icon('trash', 16) + '</span>' +
            '<div class="feed-main"><div class="feed-text">' + esc(t.label) + '</div><div class="feed-meta"><span>' + kindLabel + '</span><span class="dot">·</span><span>supprimé le ' + esc(fmtDateTime(t.at)) + '</span>' + (n ? '<span class="dot">·</span><span>' + n + ' élément' + (n > 1 ? 's' : '') + ' lié' + (n > 1 ? 's' : '') + '</span>' : '') + '</div></div>' +
            '<button type="button" class="btn sm primary" data-action="trash-restore" data-id="' + esc(t.id) + '">' + icon('undo', 14) + ' Remettre</button>' +
            '<button type="button" class="icon-btn sm danger" data-action="trash-purge" data-id="' + esc(t.id) + '" aria-label="Effacer pour toujours">' + icon('x', 14) + '</button></div>';
        }).join('') + '</div></div>'
      : '<div class="panel">' + emptyState('trash', 'Rien ici', 'Ce que vous supprimez arrive ici. Vous pouvez le remettre.', '') + '</div>') +
  '</div>';
}
