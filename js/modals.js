'use strict';

/* ============================================================
   YVO Épargne — formulaires et boîtes de dialogue
   ============================================================ */

function openClientModal(client) {
  const isEdit = !!client;
  const c = client || {
    nom: '', telephone: '', telephone2: '', quartier: '', adresse: '', profession: '',
    pieceType: 'CNI', pieceNumero: '', dateInscription: todayISO(), notes: '', actif: true
  };
  const quartiers = quartiersList();
  openModal({
    title: isEdit ? 'Modifier le client' : 'Nouveau client',
    subtitle: 'Les coordonnées servent d’en-tête aux reçus et au suivi.',
    size: 'wide',
    body:
      '<form id="form-client" data-form="save-client" autocomplete="off">' +
        '<input type="hidden" name="id" value="' + esc(c.id || '') + '">' +
        '<div class="form-grid">' +
          '<label class="field span2"><span>Nom complet *</span><input name="nom" required value="' + esc(c.nom) + '" placeholder="Ex. Awa Ndiaye"></label>' +
          '<label class="field"><span>Téléphone *</span><input name="telephone" type="tel" required value="' + esc(c.telephone) + '" placeholder="77 000 00 00"></label>' +
          '<label class="field"><span>Téléphone 2</span><input name="telephone2" type="tel" value="' + esc(c.telephone2 || '') + '"></label>' +
          '<label class="field"><span>Quartier *</span><input name="quartier" required list="quartiers-list" value="' + esc(c.quartier) + '" placeholder="Ex. Médina"><datalist id="quartiers-list">' +
            quartiers.map(function (q) { return '<option value="' + esc(q) + '"></option>'; }).join('') +
          '</datalist></label>' +
          '<label class="field"><span>Profession</span><input name="profession" value="' + esc(c.profession || '') + '" placeholder="Ex. Commerçante"></label>' +
          '<label class="field span2"><span>Adresse</span><input name="adresse" value="' + esc(c.adresse || '') + '" placeholder="Rue, numéro, repère…"></label>' +
          '<label class="field"><span>Type de pièce</span><select name="pieceType">' +
            ['CNI', 'Passeport', 'Permis', 'Carte d’électeur', 'Autre'].map(function (p) {
              return '<option value="' + esc(p) + '"' + (c.pieceType === p ? ' selected' : '') + '>' + esc(p) + '</option>';
            }).join('') +
          '</select></label>' +
          '<label class="field"><span>Numéro de pièce</span><input name="pieceNumero" value="' + esc(c.pieceNumero || '') + '"></label>' +
          '<label class="field"><span>Date d’inscription</span><input name="dateInscription" type="date" value="' + esc(c.dateInscription || todayISO()) + '"></label>' +
          '<label class="field"><span>Statut</span><select name="actif">' +
            '<option value="1"' + (c.actif !== false ? ' selected' : '') + '>Actif</option>' +
            '<option value="0"' + (c.actif === false ? ' selected' : '') + '>Inactif</option>' +
          '</select></label>' +
          '<label class="field span2"><span>Notes</span><textarea name="notes" rows="3" placeholder="Informations utiles, garant, remarques…">' + esc(c.notes || '') + '</textarea></label>' +
        '</div>' +
      '</form>',
    footer:
      '<button type="button" class="btn ghost" data-action="close-modal">Annuler</button>' +
      '<button type="submit" form="form-client" class="btn primary">' + icon('check', 15) + ' ' + (isEdit ? 'Enregistrer' : 'Créer le client') + '</button>'
  });
}

function openCarteModal(clientId, carte) {
  const client = clientById(clientId);
  if (!client) return;
  const isEdit = !!carte;
  const existing = cartesOf(clientId).length;
  const c = carte || {
    label: 'Carte ' + (existing + 1),
    montantJournalier: '',
    dateDebut: todayISO(),
    dateFin: addDays(todayISO(), 30),
    notes: ''
  };
  openModal({
    title: isEdit ? 'Modifier la carte' : 'Nouvelle carte',
    subtitle: esc(client.nom) + ' · le calendrier et les totaux se calculent automatiquement.',
    size: 'wide',
    body:
      '<form id="form-carte" data-form="save-carte" autocomplete="off">' +
        '<input type="hidden" name="clientId" value="' + esc(clientId) + '">' +
        '<input type="hidden" name="id" value="' + esc(c.id || '') + '">' +
        '<div class="form-grid">' +
          '<label class="field"><span>Nom de la carte *</span><input name="label" required value="' + esc(c.label) + '" placeholder="Carte 1"></label>' +
          '<label class="field"><span>Montant journalier *</span><div class="input-suffix"><input name="montantJournalier" type="number" min="1" step="1" required value="' + (c.montantJournalier || '') + '" placeholder="5000"><span>' + esc(db.settings.devise) + '</span></div></label>' +
          '<label class="field"><span>Début de cotisation *</span><input name="dateDebut" type="date" required value="' + esc(c.dateDebut) + '"></label>' +
          '<label class="field"><span>Fin de cotisation *</span><input name="dateFin" type="date" required value="' + esc(c.dateFin) + '"><small>La date de fin est incluse dans le calendrier.</small></label>' +
          cardTypeSelectHTML(c) +
          commissionSelectHTML(c) +
          '<label class="field span2"><span>Notes</span><input name="notes" value="' + esc(c.notes || '') + '" placeholder="Ex. carte du lundi au samedi, objectif…"></label>' +
        '</div>' +
        '<div class="callout info small">' + icon('calendar', 17) + '<div><strong>Calcul automatique</strong><span>Objectif = montant journalier × nombre de jours. Les avances et jours non versés sont déduits du total attendu.</span></div></div>' +
      '</form>',
    footer:
      '<button type="button" class="btn ghost" data-action="close-modal">Annuler</button>' +
      '<button type="submit" form="form-carte" class="btn primary">' + icon('check', 15) + ' ' + (isEdit ? 'Enregistrer' : 'Créer la carte') + '</button>',
    onMount: function () { if (!isEdit) { const sel = document.getElementById('carte-type'); if (sel) applyCardType(sel.value); } }
  });
}

function commissionSelectHTML(c) {
  if (!commissionActive()) return '';
  const list = db.settings.commission.baremes;
  const cur = c.commission ? c.commission.baremeId : (c.id ? '' : (defaultBareme() || {}).id || '');
  return '<label class="field span2"><span>Barème de commission</span><select name="bareme">' +
    '<option value=""' + (!cur ? ' selected' : '') + '>Aucune commission</option>' +
    list.map(function (b) { return '<option value="' + esc(b.id) + '"' + (cur === b.id ? ' selected' : '') + '>' + esc(b.nom) + '</option>'; }).join('') +
    '</select><small>Les règles sont figées sur la carte : modifier le barème plus tard ne change pas cette carte, sauf si vous le demandez.</small></label>';
}

function retraitCardOptions(clientId, selectedId) {
  const cards = cardsWithSolde(clientId);
  if (!cards.length) return '<option value="">Aucune carte avec un solde dû</option>';
  return cards.map(function (x) {
    const isSel = selectedId ? x.carte.id === selectedId : false;
    return '<option value="' + esc(x.carte.id) + '"' + (isSel ? ' selected' : '') + '>' +
      esc(x.carte.label) + ' · solde ' + esc(money(x.totals.solde)) + '</option>';
  }).join('');
}

function openRetraitModal(preselect) {
  const pre = preselect || {};
  const eligible = eligibleRetraitClients();
  if (!eligible.length) {
    toast('Aucun solde client à payer pour le moment.', 'info');
    return;
  }
  let selected = eligible.find(function (x) { return x.client.id === pre.clientId; });
  if (pre.clientId && !selected) {
    toast('Ce client n’a aucun solde à payer pour le moment.', 'info');
    return;
  }
  if (!selected) selected = eligible[0];
  let cards = cardsWithSolde(selected.client.id);
  if (!cards.length) {
    toast('Aucune carte avec un solde à payer pour ce client.', 'info');
    return;
  }
  let cardChoice = cards.find(function (x) { return x.carte.id === pre.carteId; }) || cards[0];
  const solde = cardChoice ? cardChoice.totals.solde : 0;

  openModal({
    title: 'Payer un client',
    subtitle: 'Un accusé de réception numéroté sera généré automatiquement.',
    size: 'wide',
    body:
      '<form id="form-retrait" data-form="save-retrait" autocomplete="off">' +
        '<div class="form-grid">' +
          '<label class="field span2"><span>Client *</span><select id="retrait-client" name="clientId" required>' +
            eligible.map(function (x) {
              return '<option value="' + esc(x.client.id) + '"' + (x.client.id === selected.client.id ? ' selected' : '') + '>' +
                esc(x.client.nom) + ' — ' + esc(money(x.totals.solde)) + ' disponibles</option>';
            }).join('') +
          '</select></label>' +
          '<label class="field span2"><span>Carte à débiter *</span><select id="retrait-carte" name="carteId" required>' +
            retraitCardOptions(selected.client.id, cardChoice ? cardChoice.carte.id : null) +
          '</select></label>' +
        '</div>' +
        '<div class="callout solde-callout" id="retrait-solde">' + icon('wallet', 17) + '<div><strong>Solde dû : ' + esc(money(solde)) + '</strong><span id="retrait-solde-sub">' + (cardChoice ? esc(cardChoice.carte.label) + ' · ' + numberFR(cardChoice.totals.totalVerse) + ' cotisés' : '') + '</span></div></div>' +
        '<div class="form-grid">' +
          '<label class="field"><span>Montant payé *</span><div class="input-suffix"><input id="retrait-montant" name="montant" type="number" min="1" step="1" required value="' + solde + '"><span>' + esc(db.settings.devise) + '</span></div></label>' +
          '<label class="field"><span>Date du paiement</span><input name="date" type="date" required value="' + todayISO() + '"></label>' +
          '<label class="field"><span>Mode de paiement</span><select name="mode">' +
            ['Espèces', 'Airtel Money', 'Moov Money', 'Virement', 'Chèque', 'Autre'].map(function (m) {
              return '<option value="' + esc(m) + '">' + esc(m) + '</option>';
            }).join('') +
          '</select></label>' +
          '<label class="field"><span>Note</span><input name="note" placeholder="Ex. solde final"></label>' +
          '<label class="checkline span2"><input type="checkbox" id="retrait-cloturer" name="cloturer" checked><span>Clôturer la carte après ce paiement</span></label>' +
        '</div>' +
        '<p class="hint">Le reçu reprend les informations du client, la carte, le montant payé et le solde restant.</p>' +
      '</form>',
    footer:
      '<button type="button" class="btn ghost" data-action="close-modal">Annuler</button>' +
      '<button type="submit" form="form-retrait" class="btn primary">' + icon('receipt', 15) + ' Payer & générer le reçu</button>',
    onMount: function () {
      syncRetraitCard(false);
    }
  });
}

function openOperationModal(type) {
  const isIn = type === 'entree';
  const cats = isIn ? [['apport', 'Apport de trésorerie'], ['autre', 'Autre entrée']] : [['depense', 'Dépense'], ['prelevement', 'Prélèvement du responsable'], ['autre', 'Autre sortie']];
  const balance = cashBalance();
  openModal({
    title: isIn ? 'Nouvelle entrée de caisse' : 'Nouvelle sortie de caisse',
    subtitle: isIn ? 'Ajoutez de l’argent à la caisse (apport, remboursement…).' : 'Enregistrez une dépense ou un prélèvement.',
    body:
      '<form id="form-operation" data-form="save-operation" autocomplete="off">' +
        '<input type="hidden" name="type" value="' + (isIn ? 'entree' : 'sortie') + '">' +
        '<div class="form-grid">' +
          '<label class="field"><span>Catégorie *</span><select name="categorie">' +
            cats.map(function (c) { return '<option value="' + c[0] + '">' + c[1] + '</option>'; }).join('') +
          '</select></label>' +
          '<label class="field"><span>Date</span><input name="date" type="date" required value="' + todayISO() + '"></label>' +
          '<label class="field span2"><span>Libellé *</span><input name="libelle" required placeholder="' + (isIn ? 'Ex. apport personnel' : 'Ex. transport, loyer, carburant') + '"></label>' +
          '<label class="field"><span>Montant *</span><div class="input-suffix"><input name="montant" type="number" min="1" step="1" required placeholder="0"><span>' + esc(db.settings.devise) + '</span></div></label>' +
          '<label class="field"><span>Note</span><input name="note" placeholder="Facultatif"></label>' +
        '</div>' +
        '<div class="callout ' + (isIn ? 'info' : 'warn') + ' small">' + icon(isIn ? 'arrow-down' : 'arrow-up', 17) +
          '<div><strong>Caisse actuelle : ' + esc(money(balance)) + '</strong><span>' + (isIn ? 'Cette entrée augmentera immédiatement la caisse.' : 'Cette sortie diminuera immédiatement la caisse.') + '</span></div></div>' +
      '</form>',
    footer:
      '<button type="button" class="btn ghost" data-action="close-modal">Annuler</button>' +
      '<button type="submit" form="form-operation" class="btn primary">' + icon('check', 15) + ' Enregistrer</button>'
  });
}

function openPinModal(mode) {
  const hasPin = !!db.settings.pinHash;
  const isSet = mode === 'set' || !hasPin;
  const isRemove = mode === 'remove';
  const title = isRemove ? 'Désactiver le code' : hasPin ? 'Modifier le code' : 'Définir un code';
  openModal({
    title: title,
    subtitle: isRemove ? 'Saisissez votre code actuel pour le désactiver.' : 'Choisissez un code de 4 à 8 chiffres.',
    body:
      '<form id="form-pin" data-form="save-pin" autocomplete="off">' +
        '<input type="hidden" name="mode" value="' + esc(mode) + '">' +
        '<div class="form-grid">' +
          (hasPin ? '<label class="field span2"><span>Code actuel *</span><input name="current" type="password" inputmode="numeric" pattern="[0-9]{4,8}" required autocomplete="current-password" placeholder="••••"></label>' : '') +
          (!isRemove ? '<label class="field"><span>Nouveau code *</span><input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" required autocomplete="new-password" placeholder="4 à 8 chiffres"></label>' +
            '<label class="field"><span>Confirmer le code *</span><input name="confirm" type="password" inputmode="numeric" pattern="[0-9]{4,8}" required autocomplete="new-password" placeholder="Répétez le code"></label>' : '') +
        '</div>' +
        '<div class="callout warn small">' + icon('shield', 17) + '<div><strong>Protection locale</strong><span>Le code verrouille l’écran. Il ne chiffre pas les données stockées sur cet appareil.</span></div></div>' +
      '</form>',
    footer:
      '<button type="button" class="btn ghost" data-action="close-modal">Annuler</button>' +
      '<button type="submit" form="form-pin" class="btn primary">' + icon(checkSafe(isRemove ? 'unlock' : 'lock'), 15) + ' ' + (isRemove ? 'Désactiver' : 'Enregistrer') + '</button>'
  });
}

function checkSafe(name) {
  return ICONS[name] ? name : 'check';
}

function openConfirm(opts) {
  openModal({
    title: opts.title || 'Confirmer',
    body: '<div class="confirm-box">' +
      '<span class="confirm-ic ' + (opts.tone || 'red') + '">' + icon(opts.icon || 'alert', 22) + '</span>' +
      '<div><p>' + opts.message + '</p>' + (opts.extra || '') + '</div>' +
    '</div>',
    footer:
      '<button type="button" class="btn ghost" data-action="close-modal">Annuler</button>' +
      '<button type="button" class="btn ' + (opts.tone === 'green' ? 'primary' : 'danger') + '" data-action="' + opts.action + '" ' + (opts.data || '') + '>' + esc(opts.label || 'Confirmer') + '</button>'
  });
}

function openEraseModal() {
  openModal({
    title: 'Tout effacer',
    subtitle: 'Cette action est définitive.',
    body:
      '<form id="form-erase" data-form="erase-data" autocomplete="off">' +
        '<div class="confirm-box"><span class="confirm-ic red">' + icon('alert', 22) + '</span>' +
          '<div><p>Supprimer <strong>tous les clients, cartes, versements et opérations</strong> de cet appareil ? Cette action ne peut pas être annulée.</p>' +
          '<p class="muted">Pensez à exporter une sauvegarde avant de continuer.</p></div></div>' +
        '<label class="field"><span>Tapez <strong>EFFACER</strong> pour confirmer</span><input name="confirm" required autocomplete="off" placeholder="EFFACER"></label>' +
      '</form>',
    footer:
      '<button type="button" class="btn ghost" data-action="close-modal">Annuler</button>' +
      '<button type="submit" form="form-erase" class="btn danger">' + icon('trash', 15) + ' Tout effacer</button>'
  });
}

function openDemoResetModal() {
  openConfirm({
    title: 'Quitter le mode démonstration',
    tone: 'red',
    icon: 'trash',
    message: 'Effacer toutes les données fictives et repartir avec une application vide ?',
    extra: '<p class="muted">Exportez d’abord vos données si vous souhaitez les conserver.</p>',
    action: 'confirm-reset-demo',
    label: 'Effacer la démo'
  });
}
