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



/* Bouton ✓ : Yvo choisit le mode, puis le journalier complet est enregistré. */


/* Recevoir de l'argent : le montant est déjà écrit, Yvo choisit comment et enregistre.
   Depuis le calendrier (focusCarteId), seule cette carte est proposée. */
function openPaySheet(clientId, date, focusCarteId) {
  if (date && date > todayISO()) { toast('Ce jour n’est pas encore arrivé.', 'info'); return; }
  const client = clientById(clientId);
  if (!client) return;
  let cards = dueCards(date).filter(function (c) { return c.clientId === clientId; });
  if (focusCarteId) cards = cards.filter(function (c) { return c.id === focusCarteId; });
  if (!cards.length) {
    toast('Pas de carte en cours pour ce jour.', 'info');
    return;
  }
  const missing = function (c) {
    const v = versementFor(c.id, date);
    return Math.max(0, (Number(c.montantJournalier) || 0) - (v ? Number(v.montant) || 0 : 0));
  };
  /* Les cartes déjà payées ce jour ne sont montrées que s'il ne reste rien à payer ailleurs. */
  const open = cards.filter(function (c) { return missing(c) > 0; });
  if (open.length) cards = open;
  const isToday = date === todayISO();
  const cur = db.settings.devise;
  const cardsHTML = cards.map(function (c, i) {
    const v = versementFor(c.id, date);
    const already = v ? Number(v.montant) || 0 : 0;
    const m = missing(c);
    return '<div class="pay-simple">' +
      (cards.length > 1 ? '<label for="pay-' + esc(c.id) + '">' + esc(c.label) + '</label>' : '') +
      (already > 0 ? '<p class="pay-simple-note">Déjà reçu : ' + esc(money(already)) + '</p>' : '') +
      '<div class="pay-input big"><input id="pay-' + esc(c.id) + '" name="m_' + esc(c.id) + '" type="number" inputmode="numeric" min="0" step="1" aria-label="Montant reçu" value="' + (m > 0 ? m : '') + '" placeholder="0"' + (i === 0 ? ' data-autofocus' : '') + ' autocomplete="off"><span>' + esc(cur) + '</span></div>' +
    '</div>';
  }).join('');

  openModal({
    cls: 'pay-sheet simple-sheet',
    title: client.nom,
    subtitle: isToday ? 'Aujourd’hui' : esc(capitalize(fmtDate(date, 'long'))),
    body:
      '<form id="form-pay" data-form="save-pay" autocomplete="off">' +
        '<input type="hidden" name="clientId" value="' + esc(clientId) + '">' +
        '<input type="hidden" name="date" value="' + esc(date) + '">' +
        cardsHTML +
        payModePicker('especes', false) +
      '</form>',
    footer: '<button type="submit" form="form-pay" class="btn primary simple-big">Enregistrer</button>'
  });
}

function openPaidSheet(clientId, date, amount, rec, mode) {
  const client = clientById(clientId);
  if (!client) return;
  const wa = rec ? waLink(client.telephone, receiptText(rec)) : '';
  openModal({
    cls: 'paid-sheet simple-sheet',
    title: 'C’est enregistré',
    body:
      '<div class="paid-ok"><span class="paid-ic">' + icon('check', 34) + '</span>' +
        '<strong>' + esc(money(amount)) + '</strong><span>' + esc(client.nom) + ' · ' + esc(PAY_MODE_SHORT[mode || 'especes']) + '</span></div>',
    footer:
      (wa
        ? '<a class="btn primary simple-big" href="' + esc(wa) + '" target="_blank" rel="noopener">' + icon('message', 19) + ' Envoyer le reçu</a>'
        : (rec ? '<button type="button" class="btn primary simple-big" data-action="share-recu-image" data-id="' + esc(rec.id) + '">' + icon('share', 19) + ' Envoyer le reçu</button>' : '')) +
      '<button type="button" class="btn ghost lg" data-action="close-modal">Terminer</button>'
  });
}

/* Toucher un jour du calendrier : pas payé → recevoir l'argent ; payé → voir ce qui a été reçu. */
function openDayTap(carteId, date) {
  const carte = carteById(carteId);
  if (!carte) return;
  if (date > todayISO()) { toast('Ce jour n’est pas encore arrivé.', 'info'); return; }
  const kind = calDayInfo(carte, date, coverageMap(carte), todayISO()).kind;
  if (kind === 'paye' || carte.statut !== 'active') { openDayInfo(carte, date, kind); return; }
  openPaySheet(carte.clientId, date, carte.id);
}

function openDayInfo(carte, date, kind) {
  const client = clientById(carte.clientId);
  const v = versementFor(carte.id, date);
  const lignes = v ? (v.historique || []).filter(function (h) { return Number(h.montant) > 0 && !h.correction; }) : [];
  const recu = db.recus.filter(function (r) {
    return r.clientId === carte.clientId && r.date === date && (r.lignes || []).some(function (l) { return l.carte === carte.label; });
  }).pop();
  const montant = v ? Number(v.montant) || 0 : 0;
  let body;
  if (montant > 0) {
    body = '<div class="paid-ok"><strong>' + esc(money(montant)) + '</strong></div>' +
      lignes.map(function (h) {
        const d = new Date(h.at);
        return '<div class="simple-row"><span>' + esc(PAY_MODE_SHORT[payModeOf(h)]) + (isNaN(d.getTime()) ? '' : ' · ' + pad2(d.getHours()) + 'h' + pad2(d.getMinutes())) + '</span><strong>' + esc(money(h.montant)) + '</strong></div>';
      }).join('');
  } else if (kind === 'paye') {
    body = '<p class="simple-text">Ce jour est déjà payé par l’argent reçu en plus un autre jour.</p>';
  } else {
    body = '<p class="simple-text">Rien n’a été reçu ce jour-là.</p>';
  }
  openModal({
    cls: 'simple-sheet',
    title: capitalize(fmtDate(date, 'long')),
    subtitle: esc(client ? client.nom : '') + (cartesOf(carte.clientId).length > 1 ? ' · ' + esc(carte.label) : ''),
    body: body,
    footer:
      (recu ? '<button type="button" class="btn primary simple-big" data-action="open-recu" data-id="' + esc(recu.id) + '">Voir le reçu</button>' : '') +
      (carte.statut === 'active' ? '<button type="button" class="btn ghost lg" data-action="open-pay" data-client="' + esc(carte.clientId) + '" data-carte="' + esc(carte.id) + '" data-date="' + esc(date) + '">Ajouter un paiement</button>' : '') +
      (montant > 0 ? '<button type="button" class="simple-minor" data-action="open-day" data-carte="' + esc(carte.id) + '" data-date="' + esc(date) + '">Corriger</button>' : '')
  });
}

/* Correction du total d'un jour */
function openDayModal(carteId, date) {
  const carte = carteById(carteId);
  if (!carte) return;
  if (date > todayISO()) { toast('Ce jour n’est pas encore arrivé : on pointe le jour même.', 'info'); return; }
  const client = clientById(carte.clientId);
  const v = versementFor(carteId, date);
  const daily = Number(carte.montantJournalier) || 0;
  const current = v ? Number(v.montant) || 0 : 0;
  const inPeriod = date >= carte.dateDebut && date <= carte.dateFin;
  const hist = v && v.historique && v.historique.length > 1
    ? '<div class="day-history"><span>Ce jour-là</span>' + v.historique.map(function (h) {
        const d = new Date(h.at);
        return '<div><em>' + (isNaN(d.getTime()) ? '' : pad2(d.getHours()) + ':' + pad2(d.getMinutes())) + ' · ' + esc(PAY_MODE_SHORT[payModeOf(h)]) + (h.ref ? ' (' + esc(h.ref) + ')' : '') + '</em><strong>' + esc(money(h.montant)) + '</strong></div>';
      }).join('') + '</div>'
    : '';

  openModal({
    cls: 'pay-sheet',
    title: 'Corriger · ' + fmtDate(date, 'medium'),
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
        '<p class="hint">Écrivez le bon total pour ce jour.</p>' +
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
