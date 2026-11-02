'use strict';

/* ============================================================
   YVO Épargne — avance d'argent à un client
   Yvo peut donner à un client plus que ce qu'il a cotisé.
   L'avance (et ses frais éventuels) se rembourse toute seule
   par les cotisations suivantes de la carte : tant qu'elle
   n'est pas remboursée, la carte « doit » de l'argent.
   Opération : { type: 'sortie', categorie: 'pret', montant, frais, ... }
   ============================================================ */

function pretsOf(carteId) {
  return db.operations.filter(function (o) { return o.categorie === 'pret' && o.carteId === carteId; });
}

/* Frais : montant fixe ou pourcentage de l'avance (arrondi au franc). */
function pretFrais(montant, fraisType, fraisValeur) {
  const v = Number(fraisValeur) || 0;
  if (v <= 0) return 0;
  return fraisType === 'pct' ? Math.round((Number(montant) || 0) * v / 100) : Math.round(v);
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

function pretPreview(carte, montant, frais) {
  const tot = cardTotals(carte);
  const doitApres = Math.max(0, montant + frais - tot.solde) + tot.resteARembourser;
  const capacite = capaciteRemboursement(carte);
  return { tot: tot, doitApres: doitApres, capacite: capacite, depasse: doitApres > capacite };
}

function openPretModal(clientId, carteId) {
  const client = clientById(clientId);
  if (!client) return;
  const cards = cartesOf(clientId).filter(function (c) { return c.statut === 'active'; });
  if (!cards.length) {
    toast('Ce client n’a pas de carte active : créez d’abord une carte.', 'info');
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
        '<details class="form-more"><summary>Ajouter des frais</summary>' +
          '<div class="form-grid">' +
            '<label class="field"><span>Frais</span><input id="pret-frais" name="fraisValeur" type="number" inputmode="numeric" min="0" step="1" placeholder="0"></label>' +
            '<label class="field"><span>En</span><select id="pret-frais-type" name="fraisType"><option value="fixe">' + esc(db.settings.devise) + '</option><option value="pct">%</option></select></label>' +
          '</div>' +
          '<label class="field"><span>Note</span><input name="note" placeholder="Ex. santé"></label>' +
        '</details>' +
        '<div class="pret-preview" id="pret-preview"></div>' +
      '</form>',
    footer:
      '<button type="submit" form="form-pret" class="btn primary simple-big">Prêter l’argent</button>',
    onMount: function () {
      const form = document.getElementById('form-pret');
      const update = function () {
        const c = carteById(document.getElementById('pret-carte').value);
        const montant = parseMoney(document.getElementById('pret-montant').value);
        const frais = pretFrais(montant, document.getElementById('pret-frais-type').value, document.getElementById('pret-frais').value);
        const box = document.getElementById('pret-preview');
        if (!c || !box) return;
        const p = pretPreview(c, montant, frais);
        box.className = 'pret-preview' + (p.depasse ? ' warn' : '');
        box.innerHTML =
          '<div><span>Son argent sur cette carte</span><strong>' + esc(money(p.tot.solde)) + '</strong></div>' +
          (frais > 0 ? '<div><span>Frais</span><strong>' + esc(money(frais)) + '</strong></div>' : '') +
          '<div class="total"><span>Il devra rembourser</span><strong>' + esc(money(p.doitApres)) + '</strong></div>' +
          '<div><span>Ce qu’il paiera d’ici la fin de la carte</span><strong>' + esc(money(p.capacite)) + '</strong></div>' +
          (p.depasse && montant > 0
            ? '<p class="pret-alert">' + icon('alert', 16) + ' Attention : d’ici le ' + esc(fmtDate(c.dateFin, 'short')) + ', il n’aura pas tout remboursé.</p>'
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
  if (montant <= 0) return toast('Saisissez le montant donné au client.', 'error');
  if (montant > cashBalance()) return toast('Caisse insuffisante : il y a ' + money(cashBalance()) + ' en caisse.', 'error');
  const fraisType = String(f.get('fraisType') || 'fixe');
  const fraisValeur = Number(f.get('fraisValeur')) || 0;
  const frais = pretFrais(montant, fraisType, fraisValeur);
  if (fraisValeur < 0 || (fraisType === 'pct' && fraisValeur > 100) || frais > montant) return toast('Frais trop élevés : ils ne peuvent pas dépasser le montant de l’avance.', 'error');
  const mode = PAY_MODES.indexOf(String(f.get('mode'))) >= 0 ? String(f.get('mode')) : 'especes';
  const p = pretPreview(carte, montant, frais);
  const now = new Date().toISOString();
  const op = {
    id: uid('op'),
    type: 'sortie',
    categorie: 'pret',
    libelle: 'Avance d’argent · ' + carte.label,
    montant: montant,
    frais: frais,
    fraisRegle: fraisValeur > 0 ? { type: fraisType, valeur: fraisValeur } : null,
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
  logActivity('paiement', 'Avance d’argent de ' + money(montant) + ' à ' + client.nom + ' en ' + PAY_MODE_LABELS[mode] +
    (frais > 0 ? ' (frais ' + money(frais) + ')' : '') + ' · à rembourser : ' + money(p.doitApres),
    { clientId: client.id, carteId: carte.id, montant: montant });
  saveDB();
  closeModal();
  rerender();
  toast('Avance enregistrée. ' + client.nom + ' devra rembourser ' + money(p.doitApres) + '.', 'success', { label: 'Reçu', action: 'open-receipt', id: op.id });
}
