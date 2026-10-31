'use strict';

/* ============================================================
   YVO Épargne — encaissement libre : le client verse ce qu'il peut
   ============================================================ */

/* Choix du mode : Espèces / Airtel / Moov (+ référence facultative pour le mobile money) */
const PAY_MODE_LOGOS = { airtel: 'img/airtel-money.png', moov: 'img/moov-money.png' };

/* Logo officiel Airtel / Moov, billet pour les espèces. */
function payModeIcon(k, size) {
  if (PAY_MODE_LOGOS[k]) return '<img class="mode-logo" src="' + PAY_MODE_LOGOS[k] + '" alt="' + esc(PAY_MODE_LABELS[k]) + '" height="' + size + '">';
  return icon('banknote', size);
}

function payModePicker(selected, withRef) {
  return '<div class="field"><span>Payé par</span><div class="mode-pick" role="radiogroup">' +
    PAY_MODES.map(function (k) {
      return '<label class="mode-opt mode-' + k + '"><input type="radio" name="mode" value="' + k + '"' + (k === selected ? ' checked' : '') + '>' +
        '<span>' + payModeIcon(k, 26) + (k === 'especes' ? PAY_MODE_SHORT[k] : '') + '</span></label>';
    }).join('') +
  '</div></div>' +
  (withRef ? '<label class="field mode-ref"' + (selected === 'especes' ? ' hidden' : '') + '><span>Référence de la transaction (facultatif)</span><input name="ref" placeholder="Ex. ID du SMS de confirmation" autocomplete="off"></label>' : '');
}

/* Affiche le champ référence seulement pour Airtel / Moov. */
function bindModeRef(form) {
  if (!form) return;
  const box = form.querySelector('.mode-ref');
  if (!box) return;
  form.addEventListener('change', function (e) {
    if (e.target.name === 'mode') box.hidden = e.target.value === 'especes';
  });
}

function payModeTag(modes) {
  const k = mainMode(modes);
  if (k === 'especes') return '';
  if (k === 'mixte') {
    return '<span class="mode-tag mode-mixte">' + (modes.especes > 0 ? icon('banknote', 14) : '') +
      ['airtel', 'moov'].filter(function (x) { return modes[x] > 0; }).map(function (x) { return payModeIcon(x, 16); }).join('') + '</span>';
  }
  return '<span class="mode-tag">' + payModeIcon(k, 18) + '</span>';
}

function openPaySheet(clientId, date, focusCarteId) {
  const client = clientById(clientId);
  if (!client) return;
  const cards = dueCards(date).filter(function (c) { return c.clientId === clientId; });
  if (!cards.length) {
    toast('Aucune carte active pour ce client à cette date.', 'info');
    return;
  }
  const risk = clientRisk(client);
  const isToday = date === todayISO();
  const cur = db.settings.devise;
  const cardsHTML = cards.map(function (c, i) {
    const v = versementFor(c.id, date);
    const j = Number(c.montantJournalier) || 0;
    const already = v ? Number(v.montant) || 0 : 0;
    const ct = cardTotals(c);
    const chips = [];
    if (already < j) chips.push([j - already, already > 0 ? 'Compléter' : 'Complet']);
    chips.push([j * 2, '×2']);
    if (ct.retard > j) chips.push([ct.retard, 'Tout le retard']);
    return '<div class="pay-card">' +
      '<div class="pay-card-head"><strong>' + esc(c.label) + '</strong><span>' + esc(money(j)) + ' / jour' + (ct.retard > 0 ? ' · <b class="red">retard ' + esc(money(ct.retard, true)) + '</b>' : '') + '</span></div>' +
      (v ? '<div class="pay-already">Déjà versé ' + (isToday ? 'aujourd’hui' : 'ce jour') + ' : <strong>' + esc(money(already)) + '</strong> ' + statutBadge(v.statut) + '</div>' : '') +
      '<div class="pay-input"><input id="pay-' + esc(c.id) + '" name="m_' + esc(c.id) + '" type="number" inputmode="numeric" min="0" step="1" placeholder="0"' + ((focusCarteId ? c.id === focusCarteId : i === 0) ? ' data-autofocus' : '') + ' autocomplete="off"><span>' + esc(cur) + '</span></div>' +
      '<div class="pay-chips">' + chips.map(function (ch) {
        return '<button type="button" class="chip" data-action="pay-fill" data-target="pay-' + esc(c.id) + '" data-value="' + ch[0] + '">' + ch[1] + ' <span>' + esc(money(ch[0], true)) + '</span></button>';
      }).join('') + '</div>' +
    '</div>';
  }).join('');
  const hasRecord = cards.some(function (c) { return versementFor(c.id, date); });

  openModal({
    cls: 'pay-sheet',
    title: client.nom,
    subtitle: esc(client.quartier || 'Non classé') + ' · ' + esc(fmtDate(date, 'long')) + (isToday ? '' : ' (autre jour)'),
    body:
      '<form id="form-pay" data-form="save-pay" autocomplete="off">' +
        '<input type="hidden" name="clientId" value="' + esc(clientId) + '">' +
        '<input type="hidden" name="date" value="' + esc(date) + '">' +
        (risk.retard > 0 ? '<div class="risk-line ' + RISK_TONES[risk.niveau] + '">' + icon('alert', 16) + '<span>Retard de <strong>' + esc(money(risk.retard)) + '</strong>' + (risk.jours > 0 ? ' · ' + risk.jours + ' j sans verser' : '') + '</span></div>' : '') +
        cardsHTML +
        payModePicker('especes', true) +
        '<label class="field"><span>Note (facultatif)</span><input name="note" placeholder="Ex. paiera le reste demain"></label>' +
        '<p class="hint">Le client verse ce qu’il peut : saisissez le montant reçu, il s’ajoute à ce qui a déjà été versé ce jour.</p>' +
      '</form>',
    footer:
      (!hasRecord ? '<button type="button" class="btn danger-ghost" data-action="pay-none" data-client="' + esc(clientId) + '" data-date="' + esc(date) + '">' + icon('x', 15) + ' Rien reçu</button>' : '') +
      '<button type="submit" form="form-pay" class="btn primary lg">' + icon('check', 17) + ' Enregistrer</button>',
    onMount: function () { bindModeRef(document.getElementById('form-pay')); }
  });
}

/* Bouton ✓ : Yvo choisit le mode, puis le journalier complet est enregistré. */
function openQuickModeSheet(clientId, date) {
  const client = clientById(clientId);
  if (!client) return;
  const cards = dueCards(date).filter(function (c) { return c.clientId === clientId; });
  const missing = sum(cards, function (c) {
    const v = versementFor(c.id, date);
    return Math.max(0, (Number(c.montantJournalier) || 0) - (v ? Number(v.montant) || 0 : 0));
  });
  if (missing <= 0) return;
  openModal({
    cls: 'pay-sheet',
    title: client.nom,
    subtitle: 'Versement complet · ' + esc(money(missing)),
    body:
      '<p class="hint">Comment le client a-t-il payé ?</p>' +
      '<div class="mode-quick">' + PAY_MODES.map(function (k, i) {
        return '<button type="button" class="mode-opt-btn mode-' + k + '" data-action="pointage-full-mode" data-mode="' + k + '" data-client="' + esc(clientId) + '" data-date="' + esc(date) + '"' + (i === 0 ? ' data-autofocus' : '') + '>' +
          '<span class="mode-ic">' + payModeIcon(k, 34) + '</span><strong>' + esc(PAY_MODE_LABELS[k]) + '</strong></button>';
      }).join('') + '</div>' +
      '<label class="field"><span>Référence Airtel / Moov (facultatif)</span><input id="quick-ref" placeholder="Ex. ID du SMS de confirmation" autocomplete="off"></label>'
  });
}

function openPaidSheet(clientId, date, amount, rec, mode) {
  const client = clientById(clientId);
  if (!client) return;
  const tot = clientTotals(client);
  const msg = 'Reçu ' + (db.settings.company.nom || '') + ' : nous avons bien reçu ' + money(amount) + ' (' + PAY_MODE_LABELS[mode || 'especes'] + ') le ' + fmtDate(date, 'short') +
    '. Total cotisé : ' + money(tot.totalVerse) + (tot.retard > 0 ? '. Retard restant : ' + money(tot.retard) : '. Vous êtes à jour') + '. Merci ' + client.nom + ' !';
  const wa = waLink(client.telephone, rec ? receiptText(rec) : msg);
  openModal({
    cls: 'paid-sheet',
    title: 'Versement enregistré',
    body:
      '<div class="paid-ok"><span class="paid-ic">' + icon('check', 34) + '</span>' +
        '<strong>' + esc(money(amount)) + '</strong><span>' + esc(client.nom) + ' · ' + esc(PAY_MODE_LABELS[mode || 'especes']) + '</span></div>' +
      '<div class="paid-lines">' +
        '<div><span>Total cotisé</span><strong>' + esc(money(tot.totalVerse)) + '</strong></div>' +
        '<div><span>Retard</span><strong class="' + (tot.retard > 0 ? 'red' : 'green') + '">' + esc(tot.retard > 0 ? money(tot.retard) : 'À jour') + '</strong></div>' +
      '</div>',
    footer:
      (rec ? '<button type="button" class="btn primary lg" data-action="share-recu-image" data-id="' + esc(rec.id) + '">' + icon('share', 17) + ' Envoyer le reçu (image)</button>' : '') +
      (wa ? '<a class="btn wa lg" href="' + esc(wa) + '" target="_blank" rel="noopener">' + icon('message', 17) + ' Envoyer par WhatsApp</a>' : '') +
      (rec ? '<button type="button" class="btn ghost lg" data-action="open-recu" data-id="' + esc(rec.id) + '">Voir le reçu ' + esc(rec.numero) + '</button>' : '') +
      '<button type="button" class="btn ghost lg" data-action="close-modal">Terminer</button>'
  });
}

/* Correction du total d'un jour (depuis le calendrier) */
function openDayModal(carteId, date) {
  const carte = carteById(carteId);
  if (!carte) return;
  const client = clientById(carte.clientId);
  const v = versementFor(carteId, date);
  const daily = Number(carte.montantJournalier) || 0;
  const current = v ? Number(v.montant) || 0 : 0;
  const inPeriod = date >= carte.dateDebut && date <= carte.dateFin;
  const hist = v && v.historique && v.historique.length > 1
    ? '<div class="day-history"><span>Détail des versements du jour</span>' + v.historique.map(function (h) {
        const d = new Date(h.at);
        return '<div><em>' + (isNaN(d.getTime()) ? '' : pad2(d.getHours()) + ':' + pad2(d.getMinutes())) + ' · ' + esc(PAY_MODE_SHORT[payModeOf(h)]) + (h.ref ? ' (' + esc(h.ref) + ')' : '') + '</em><strong>' + esc(money(h.montant)) + '</strong></div>';
      }).join('') + '</div>'
    : '';

  openModal({
    cls: 'pay-sheet',
    title: 'Pointage du ' + fmtDate(date, 'long'),
    subtitle: esc(client ? client.nom : 'Client') + ' · ' + esc(carte.label) + ' · ' + esc(money(daily)) + ' / jour',
    body:
      '<form id="form-day" data-form="save-day" autocomplete="off">' +
        '<input type="hidden" name="carteId" value="' + esc(carteId) + '">' +
        '<input type="hidden" name="date" value="' + esc(date) + '">' +
        (!inPeriod ? '<div class="callout warn small">' + icon('alert', 16) + '<div><strong>Hors période</strong><span>Cette date est en dehors de la période de la carte.</span></div></div>' : '') +
        '<label class="field big-field"><span>Total versé ce jour</span><div class="input-suffix"><input id="day-montant" name="montant" type="number" inputmode="numeric" min="0" step="1" value="' + (v ? current : '') + '" placeholder="0" data-autofocus><span>' + esc(db.settings.devise) + '</span></div></label>' +
        '<div class="status-preview" id="day-preview"></div>' +
        '<div class="pay-chips">' +
          '<button type="button" class="chip" data-action="pay-fill" data-target="day-montant" data-value="' + daily + '">Complet <span>' + esc(money(daily, true)) + '</span></button>' +
          '<button type="button" class="chip" data-action="pay-fill" data-target="day-montant" data-value="' + (daily * 2) + '">×2 <span>' + esc(money(daily * 2, true)) + '</span></button>' +
          '<button type="button" class="chip" data-action="pay-fill" data-target="day-montant" data-value="0">Non versé <span>0</span></button>' +
        '</div>' +
        payModePicker(lastPayMode(v), false) +
        '<label class="field"><span>Note (facultatif)</span><input name="note" value="' + esc(v ? (v.note || '') : '') + '" placeholder="Ex. paiera demain"></label>' +
        hist +
        '<p class="hint">Vous corrigez ici le total du jour. Pour ajouter un versement supplémentaire, utilisez le pointage.</p>' +
      '</form>',
    footer:
      (v ? '<button type="button" class="btn danger-ghost" data-action="delete-day" data-carte="' + esc(carteId) + '" data-date="' + esc(date) + '">' + icon('trash', 15) + ' Effacer</button>' : '') +
      '<button type="submit" form="form-day" class="btn primary lg">' + icon('check', 17) + ' Enregistrer</button>',
    onMount: function () {
      const input = document.getElementById('day-montant');
      const prev = document.getElementById('day-preview');
      if (!input || !prev) return;
      const update = function () {
        if (input.value === '') { prev.innerHTML = '<span class="muted">Saisissez le montant reçu</span>'; return; }
        prev.innerHTML = 'Sera enregistré comme : ' + statutBadge(statutFor(parseMoney(input.value), daily));
      };
      input.addEventListener('input', update);
      input.addEventListener('change', update);
      update();
    }
  });
}
