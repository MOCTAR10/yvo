'use strict';

/* ============================================================
   YVO Épargne — avance d'argent à un client
   Yvo peut donner à un client plus que ce qu'il a cotisé.
   Une carte peut descendre sous zéro : c'est ce qu'il doit.
   L'avance se rembourse toute seule
   par les cotisations suivantes de la carte : tant qu'elle
   n'est pas remboursée, la carte « doit » de l'argent.
   Il peut aussi rembourser à part, même quand la carte est finie :
   { type: 'entree', categorie: 'remboursement', montant, carteId, ... }
   Opération : { type: 'sortie', categorie: 'pret', montant, ... }
   Yvo gère lui-même ce qu'il prend : on ne crée plus de frais. Une
   ancienne avance garde les siens (voir clientTotals et son reçu).
   ============================================================ */

function pretsOf(carteId) {
  return db.operations.filter(function (o) { return o.categorie === 'pret' && o.carteId === carteId; });
}

/* Ce que la carte pourra encore rembourser d'ici sa fin (cotisations attendues). */
function capaciteRemboursement(carte) {
  const t = todayISO();
  if (carte.statut !== 'active' || t > carte.dateFin) return 0;
  const from = t < carte.dateDebut ? carte.dateDebut : t;
  const deja = versementFor(carte.id, t) ? 1 : 0;
  const jours = Math.max(0, diffDays(from, carte.dateFin) + 1 - deja);
  return jours * (Number(carte.montantJournalier) || 0);
}

function pretPreview(carte, montant) {
  const tot = cardTotals(carte);
  const doitApres = Math.max(0, montant - tot.solde) + tot.resteARembourser;
  const capacite = capaciteRemboursement(carte);
  return { tot: tot, doitApres: doitApres, capacite: capacite, depasse: doitApres > capacite, resteFin: Math.max(0, doitApres - capacite) };
}

function openPretModal(clientId, carteId) {
  const client = clientById(clientId);
  if (!client) return;
  const cards = cartesOf(clientId).filter(function (c) { return c.statut === 'active'; });
  if (!cards.length) {
    toast('Ce client n’a pas de carte en cours. Ajoutez d’abord une carte.', 'info');
    return;
  }
  const carte = cards.find(function (c) { return c.id === carteId; }) || cards[0];
  openModal({
    cls: 'simple-sheet',
    title: 'Prêter de l’argent',
    subtitle: esc(client.nom),
    body:
      '<form id="form-pret" data-form="save-pret" autocomplete="off">' +
        '<input type="hidden" name="clientId" value="' + esc(clientId) + '">' +
        (cards.length > 1
          ? '<label class="field"><span>Carte</span><select name="carteId" id="pret-carte">' + cards.map(function (c) {
              return '<option value="' + esc(c.id) + '"' + (c.id === carte.id ? ' selected' : '') + '>' + esc(c.label) + ' · ' + esc(money(c.montantJournalier, true)) + ' / jour</option>';
            }).join('') + '</select></label>'
          : '<input type="hidden" name="carteId" id="pret-carte" value="' + esc(carte.id) + '">') +
        '<label class="field big-field"><span>Combien je prête ?</span><div class="input-suffix"><input id="pret-montant" name="montant" type="number" inputmode="numeric" min="1" step="1" required placeholder="0" data-autofocus><span>' + esc(db.settings.devise) + '</span></div></label>' +
        payModePicker('especes', false) +
        '<label class="field"><span>Note (pas obligatoire)</span><input name="note" placeholder="Ex. santé"></label>' +
        '<div class="pret-preview" id="pret-preview"></div>' +
      '</form>',
    footer:
      '<button type="submit" form="form-pret" class="btn primary simple-big">Prêter l’argent</button>',
    onMount: function () {
      const form = document.getElementById('form-pret');
      const update = function () {
        const c = carteById(document.getElementById('pret-carte').value);
        const montant = parseMoney(document.getElementById('pret-montant').value);
        const box = document.getElementById('pret-preview');
        if (!c || !box) return;
        const p = pretPreview(c, montant);
        const autres = sum(cartesOf(c.clientId).filter(function (k) { return k.id !== c.id; }).map(cardTotals), function (x) { return x.solde; });
        box.className = 'pret-preview' + (p.depasse ? ' warn' : '');
        box.innerHTML =
          '<div><span>Son argent sur cette carte</span><strong>' + esc(money(p.tot.solde)) + '</strong></div>' +
          (autres > 0 ? '<div><span>Son argent sur ses autres cartes</span><strong>' + esc(money(autres)) + '</strong></div>' : '') +
          '<div class="total"><span>Il devra rembourser</span><strong>' + esc(money(p.doitApres)) + '</strong></div>' +
          '<div><span>Ce qu’il paiera d’ici la fin de la carte</span><strong>' + esc(money(p.capacite)) + '</strong></div>' +
          (p.depasse && montant > 0
            ? '<p class="pret-alert">' + icon('alert', 16) + ' Prêt élevé : à la fin de la carte, le ' + esc(fmtDate(c.dateFin, 'short')) + ', il devra encore ' + esc(money(p.resteFin)) + '. Vous pouvez quand même prêter.</p>'
            : '');
      };
      form.addEventListener('input', update);
      form.addEventListener('change', update);
      update();
    }
  });
}

function savePret(form) {
  const f = new FormData(form);
  const client = clientById(String(f.get('clientId') || ''));
  const carte = carteById(String(f.get('carteId') || ''));
  if (!client || !carte || carte.clientId !== client.id) return toast('Sélection invalide.', 'error');
  const montant = parseMoney(f.get('montant'));
  if (montant <= 0) return toast('Écrivez le montant prêté.', 'error');
  if (montant > cashBalance()) return toast('Pas assez d’argent : il y a ' + money(cashBalance()) + ' en caisse.', 'error');
  const mode = PAY_MODES.indexOf(String(f.get('mode'))) >= 0 ? String(f.get('mode')) : 'especes';
  const p = pretPreview(carte, montant);
  const now = new Date().toISOString();
  const op = {
    id: uid('op'),
    type: 'sortie',
    categorie: 'pret',
    libelle: 'Prêt · ' + carte.label,
    montant: montant,
    frais: 0,
    date: todayISO(),
    mode: PAY_MODE_LABELS[mode],
    note: String(f.get('note') || '').trim(),
    clientId: client.id,
    carteId: carte.id,
    recuNumero: nextReceiptNumber(),
    createdAt: now,
    snapshot: {
      clientNom: client.nom, clientTel: client.telephone, clientQuartier: client.quartier, clientAdresse: client.adresse,
      clientPiece: [client.pieceType, client.pieceNumero].filter(Boolean).join(' '),
      carteLabel: carte.label, dateDebut: carte.dateDebut, dateFin: carte.dateFin, montantJournalier: carte.montantJournalier,
      totalVerse: p.tot.totalVerse, soldeAvant: p.tot.solde, doitApres: p.doitApres
    }
  };
  db.operations.push(op);
  logActivity('paiement', 'Prêt de ' + money(montant) + ' à ' + client.nom + ' en ' + PAY_MODE_LABELS[mode] +
    ' · à rembourser : ' + money(p.doitApres),
    { clientId: client.id, carteId: carte.id, montant: montant });
  saveDB();
  closeModal();
  rerender();
  toast('Prêt enregistré. ' + client.nom + ' devra rembourser ' + money(p.doitApres) + '.', 'success', { label: 'Reçu', action: 'open-receipt', id: op.id });
}

/* Rembourser à part : surtout quand la carte est finie et que les paiements du jour ne sont plus possibles. */
function openRemboursementModal(clientId, carteId) {
  const client = clientById(clientId);
  const carte = carteById(carteId);
  if (!client || !carte || carte.clientId !== client.id) return toast('Sélection invalide.', 'error');
  const reste = cardTotals(carte).resteARembourser;
  if (reste <= 0) return toast('Ce prêt est déjà remboursé.', 'info');
  openModal({
    cls: 'simple-sheet',
    title: 'Rembourser le prêt',
    subtitle: esc(client.nom) + (cartesOf(client.id).length > 1 ? ' · ' + esc(carte.label) : ''),
    body:
      '<form id="form-remboursement" data-form="save-remboursement" autocomplete="off">' +
        '<input type="hidden" name="clientId" value="' + esc(client.id) + '">' +
        '<input type="hidden" name="carteId" value="' + esc(carte.id) + '">' +
        '<div class="pret-preview"><div class="total"><span>Il doit encore</span><strong>' + esc(money(reste)) + '</strong></div></div>' +
        '<label class="field big-field"><span>Combien il rembourse ?</span><div class="input-suffix"><input id="remb-montant" name="montant" type="number" inputmode="numeric" min="1" step="1" required value="' + reste + '" data-autofocus><span>' + esc(db.settings.devise) + '</span></div></label>' +
        payModePicker('especes', false) +
        '<p class="muted">Le calendrier ne change pas : cet argent va seulement sur le prêt.</p>' +
      '</form>',
    footer: '<button type="submit" form="form-remboursement" class="btn primary simple-big">Enregistrer</button>'
  });
}

function saveRemboursement(form) {
  const f = new FormData(form);
  const client = clientById(String(f.get('clientId')));
  const carte = carteById(String(f.get('carteId')));
  if (!client || !carte || carte.clientId !== client.id) return toast('Sélection invalide.', 'error');
  const montant = parseMoney(f.get('montant'));
  const reste = cardTotals(carte).resteARembourser;
  if (montant <= 0) return toast('Écrivez combien il rembourse.', 'error');
  if (montant > reste) return toast('C’est trop : il doit seulement ' + money(reste) + '.', 'error');
  const mode = PAY_MODES.indexOf(String(f.get('mode'))) >= 0 ? String(f.get('mode')) : 'especes';
  const op = {
    id: uid('op'),
    type: 'entree',
    categorie: 'remboursement',
    libelle: 'Prêt remboursé · ' + carte.label,
    montant: montant,
    date: todayISO(),
    mode: PAY_MODE_LABELS[mode],
    note: '',
    clientId: client.id,
    carteId: carte.id,
    recuNumero: nextReceiptNumber(),
    createdAt: new Date().toISOString(),
    snapshot: {
      clientNom: client.nom, clientTel: client.telephone, clientQuartier: client.quartier, clientAdresse: client.adresse,
      clientPiece: [client.pieceType, client.pieceNumero].filter(Boolean).join(' '),
      carteLabel: carte.label, dateDebut: carte.dateDebut, dateFin: carte.dateFin, montantJournalier: carte.montantJournalier,
      doitApres: reste - montant
    }
  };
  db.operations.push(op);
  logActivity('paiement', client.nom + ' rembourse ' + money(montant) + ' sur son prêt (' + carte.label + ') · reste ' + money(reste - montant),
    { clientId: client.id, carteId: carte.id, montant: montant });
  saveDB();
  closeModal();
  rerender();
  toast(reste - montant > 0 ? 'C’est noté. Il doit encore ' + money(reste - montant) + '.' : 'C’est noté. Le prêt est remboursé.', 'success', { label: 'Reçu', action: 'open-receipt', id: op.id });
}
