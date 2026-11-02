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
  const quartiers = quartierSuggestions();
  openModal({
    title: isEdit ? 'Changer ses informations' : 'Ajouter un client',
    body:
      '<form id="form-client" data-form="save-client" autocomplete="off">' +
        '<input type="hidden" name="id" value="' + esc(c.id || '') + '">' +
        '<label class="field"><span>Son nom</span><input name="nom" required value="' + esc(c.nom) + '" placeholder="Ex. Marie-Claire Mboumba"></label>' +
        '<label class="field"><span>Son téléphone</span><input name="telephone" type="tel" required value="' + esc(c.telephone) + '" placeholder="077 00 00 00"></label>' +
        '<label class="field"><span>Son quartier</span><input name="quartier" required list="quartiers-list" value="' + esc(c.quartier) + '" placeholder="Ex. Grand Village"><datalist id="quartiers-list">' +
          quartiers.map(function (q) { return '<option value="' + esc(q) + '"></option>'; }).join('') +
        '</datalist></label>' +
        '<details class="simple-sec form-more"><summary>Plus d’informations (pas obligatoire)</summary><div class="form-grid">' +
          '<label class="field"><span>Autre téléphone</span><input name="telephone2" type="tel" value="' + esc(c.telephone2 || '') + '"></label>' +
          '<label class="field"><span>Métier</span><input name="profession" value="' + esc(c.profession || '') + '" placeholder="Ex. Commerçante"></label>' +
          '<label class="field span2"><span>Adresse</span><input name="adresse" value="' + esc(c.adresse || '') + '" placeholder="Ex. près du marché, Port-Gentil"></label>' +
          '<label class="field"><span>Type de pièce</span><select name="pieceType">' +
            ['CNI', 'Passeport', 'Permis', 'Carte d’électeur', 'Autre'].map(function (p) {
              return '<option value="' + esc(p) + '"' + (c.pieceType === p ? ' selected' : '') + '>' + esc(p) + '</option>';
            }).join('') +
          '</select></label>' +
          '<label class="field"><span>Numéro de pièce</span><input name="pieceNumero" value="' + esc(c.pieceNumero || '') + '"></label>' +
          '<label class="field"><span>Inscrit le</span><input name="dateInscription" type="date" value="' + esc(c.dateInscription || todayISO()) + '"></label>' +
          '<label class="field"><span>Cotise encore ?</span><select name="actif">' +
            '<option value="1"' + (c.actif !== false ? ' selected' : '') + '>Oui</option>' +
            '<option value="0"' + (c.actif === false ? ' selected' : '') + '>Non</option>' +
          '</select></label>' +
          '<label class="field span2"><span>Notes</span><textarea name="notes" rows="3">' + esc(c.notes || '') + '</textarea></label>' +
        '</div></details>' +
      '</form>',
    footer: '<button type="submit" form="form-client" class="btn primary simple-big">Enregistrer</button>'
  });
}

/* Date de fin : N mois après le début (le dernier jour est compris). */
function endAfterMonths(debut, mois) {
  const p = String(debut).split('-').map(Number);
  const dernier = new Date(p[0], p[1] - 1 + Number(mois) + 1, 0).getDate();
  /* Le mois d'arrivée est plus court : on s'arrête à son dernier jour. */
  const jour = p[2] > dernier ? dernier : p[2] - 1;
  return isoOf(new Date(p[0], p[1] - 1 + Number(mois), jour));
}

/* Les montants proposés : ceux de base, plus ceux que Yvo utilise déjà. Rien à régler. */
function carteAmounts() {
  const count = {};
  [500, 1000, 2000, 5000].forEach(function (a) { count[a] = 1; });
  db.cartes.forEach(function (c) {
    const a = Number(c.montantJournalier) || 0;
    if (a > 0) count[a] = (count[a] || 0) + 2;
  });
  return Object.keys(count).map(Number)
    .sort(function (a, b) { return count[b] - count[a] || a - b; })
    .slice(0, 6)
    .sort(function (a, b) { return a - b; });
}

/* Ajouter une carte : on touche une tuile, c'est fait. */
function openCartePicker(clientId) {
  const client = clientById(clientId);
  if (!client) return;
  const id = esc(clientId);
  openModal({
    cls: 'simple-sheet carte-picker',
    title: 'Combien par jour ?',
    subtitle: esc(client.nom),
    body:
      '<div class="carte-tiles">' + carteAmounts().map(function (a, i) {
        return '<button type="button" class="carte-tile t' + (i % 6) + '" data-action="carte-pick" data-client="' + id + '" data-montant="' + a + '"><strong>' + esc(numberFR(a)) + '</strong><span>' + esc(db.settings.devise) + ' par jour</span></button>';
      }).join('') +
      '<button type="button" class="carte-tile autre" data-action="carte-autre" data-client="' + id + '"><strong>Autre</strong><span>montant</span></button></div>' +
      '<div class="picker-duree"><span>Pendant</span>' +
        [[1, '1 mois'], [3, '3 mois'], [6, '6 mois'], [12, '1 an']].map(function (o, i) {
          return '<button type="button" class="chip' + (i === 0 ? ' active' : '') + '" data-action="picker-duree" data-mois="' + o[0] + '">' + o[1] + '</button>';
        }).join('') +
      '</div>'
  });
}

function openCarteModal(clientId, carte, autreMontant) {
  const client = clientById(clientId);
  if (!client) return;
  if (!carte && !autreMontant) { openCartePicker(clientId); return; }
  const isEdit = !!carte;
  const existing = cartesOf(clientId).length;
  const c = carte || {
    label: 'Carte ' + (existing + 1),
    montantJournalier: '',
    dateDebut: todayISO(),
    dateFin: endAfterMonths(todayISO(), 1),
    notes: ''
  };
  const active = !isEdit || c.statut === 'active';
  openModal({
    title: isEdit ? 'Changer cette carte' : 'Ajouter une carte',
    subtitle: esc(client.nom),
    body:
      '<form id="form-carte" data-form="save-carte" autocomplete="off">' +
        '<input type="hidden" name="clientId" value="' + esc(clientId) + '">' +
        '<input type="hidden" name="id" value="' + esc(c.id || '') + '">' +
        '<input type="hidden" name="label" value="' + esc(c.label) + '">' +
        '<input type="hidden" name="notes" value="' + esc(c.notes || '') + '">' +
        '<label class="field big-field"><span>Combien par jour ?</span><div class="input-suffix"><input name="montantJournalier" type="number" inputmode="numeric" min="1" step="1" required value="' + (c.montantJournalier || '') + '" placeholder="1000"' + (isEdit ? '' : ' data-autofocus') + '><span>' + esc(db.settings.devise) + '</span></div></label>' +
        '<label class="field"><span>Premier jour</span><input name="dateDebut" id="carte-debut" type="date" required value="' + esc(c.dateDebut) + '"></label>' +
        '<div class="field"><span>Pendant combien de temps ?</span><div class="simple-chips">' +
          [[1, '1 mois'], [3, '3 mois'], [6, '6 mois'], [12, '1 an']].map(function (o) {
            return '<button type="button" class="chip" data-action="carte-duree" data-mois="' + o[0] + '">' + o[1] + '</button>';
          }).join('') +
        '</div></div>' +
        '<label class="field"><span>Dernier jour</span><input name="dateFin" id="carte-fin" type="date" required value="' + esc(c.dateFin) + '"></label>' +
      '</form>',
    footer:
      '<button type="submit" form="form-carte" class="btn primary simple-big">Enregistrer</button>' +
      (isEdit
        ? '<button type="button" class="btn ghost lg" data-action="toggle-carte" data-carte="' + esc(c.id) + '">' + (active ? 'Terminer cette carte' : 'Reprendre cette carte') + '</button>' +
          '<button type="button" class="simple-minor danger" data-action="delete-carte" data-carte="' + esc(c.id) + '">Supprimer cette carte</button>'
        : '')
  });
}




function retraitCardOptions(clientId, selectedId) {
  const cards = cardsWithSolde(clientId);
  if (!cards.length) return '<option value="">Aucune carte avec un solde dû</option>';
  return cards.map(function (x) {
    const isSel = selectedId ? x.carte.id === selectedId : false;
    return '<option value="' + esc(x.carte.id) + '"' + (isSel ? ' selected' : '') + '>' +
      esc(x.carte.label) + ' · ' + esc(money(x.dispo)) + '</option>';
  }).join('');
}

function openRetraitModal(preselect) {
  const pre = preselect || {};
  const eligible = eligibleRetraitClients();
  if (!eligible.length) {
    toast('Aucun client n’a d’argent à reprendre.', 'info');
    return;
  }
  let selected = eligible.find(function (x) { return x.client.id === pre.clientId; });
  if (pre.clientId && !selected) {
    toast('Ce client n’a pas d’argent à reprendre.', 'info');
    return;
  }
  if (!selected) selected = eligible[0];
  let cards = cardsWithSolde(selected.client.id);
  if (!cards.length) {
    toast('Ce client n’a pas d’argent à reprendre.', 'info');
    return;
  }
  let cardChoice = cards.find(function (x) { return x.carte.id === pre.carteId; }) || cards[0];
  const solde = cardChoice ? cardChoice.dispo : 0;

  openModal({
    cls: 'simple-sheet',
    title: 'Rendre son argent',
    body:
      '<form id="form-retrait" data-form="save-retrait" autocomplete="off">' +
        '<input type="hidden" name="date" value="' + todayISO() + '">' +
        '<label class="field"' + (pre.clientId ? ' hidden' : '') + '><span>Quel client ?</span><select id="retrait-client" name="clientId" required>' +
          eligible.map(function (x) {
            return '<option value="' + esc(x.client.id) + '"' + (x.client.id === selected.client.id ? ' selected' : '') + '>' +
              esc(x.client.nom) + ' · ' + esc(money(x.totals.solde, true)) + '</option>';
          }).join('') +
        '</select></label>' +
        '<label class="field"' + (pre.clientId && cards.length < 2 ? ' hidden' : '') + '><span>Quelle carte ?</span><select id="retrait-carte" name="carteId" required>' +
          retraitCardOptions(selected.client.id, cardChoice ? cardChoice.carte.id : null) +
        '</select></label>' +
        '<div class="callout solde-callout" id="retrait-solde"></div>' +
        '<label class="field big-field"><span>Combien je rends ?</span><div class="input-suffix"><input id="retrait-montant" name="montant" type="number" inputmode="numeric" min="1" step="1" required value="' + solde + '"><span>' + esc(db.settings.devise) + '</span></div></label>' +
        '<label class="field"><span>Comment ?</span><select name="mode">' +
          ['Espèces', 'Airtel Money', 'Moov Money'].map(function (x) {
            return '<option value="' + esc(x) + '">' + esc(x) + '</option>';
          }).join('') +
        '</select></label>' +
        '<label class="checkline"><input type="checkbox" id="retrait-cloturer" name="cloturer" checked><span>Terminer cette carte</span></label>' +
      '</form>',
    footer: '<button type="submit" form="form-retrait" class="btn primary simple-big">Rendre l’argent</button>',
    onMount: function () {
      syncRetraitCard(false);
    }
  });
}

function openOperationModal(type) {
  const isIn = type === 'entree';
  openModal({
    cls: 'simple-sheet',
    title: isIn ? 'J’ai reçu de l’argent' : 'J’ai dépensé de l’argent',
    body:
      '<form id="form-operation" data-form="save-operation" autocomplete="off">' +
        '<input type="hidden" name="type" value="' + (isIn ? 'entree' : 'sortie') + '">' +
        '<input type="hidden" name="date" value="' + todayISO() + '">' +
        '<label class="field big-field"><span>Combien ?</span><div class="input-suffix"><input name="montant" type="number" inputmode="numeric" min="1" step="1" required placeholder="0" data-autofocus><span>' + esc(db.settings.devise) + '</span></div></label>' +
        '<label class="field"><span>' + (isIn ? 'D’où vient cet argent ?' : 'C’est pour quoi ?') + '</span><input name="libelle" required placeholder="' + (isIn ? 'Ex. mon argent à moi' : 'Ex. transport') + '"></label>' +
        (isIn
          ? '<input type="hidden" name="categorie" value="apport">'
          : '<div class="field"><span>C’est…</span><div class="simple-radio">' +
              '<label><input type="radio" name="categorie" value="depense" checked><span>Une dépense</span></label>' +
              '<label><input type="radio" name="categorie" value="prelevement"><span>Pour moi</span></label>' +
            '</div></div>') +
      '</form>',
    footer: '<button type="submit" form="form-operation" class="btn primary simple-big">Enregistrer</button>'
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
          '<div><p>Supprimer <strong>tous les clients, les cartes et l’argent</strong> de cet appareil ? Cette action ne peut pas être annulée.</p>' +
          '</div></div>' +
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
    extra: '<p class="muted">Pensez à télécharger le fichier Excel de vos données si vous voulez les garder.</p>',
    action: 'confirm-reset-demo',
    label: 'Effacer la démo'
  });
}
