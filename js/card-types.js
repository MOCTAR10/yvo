'use strict';

/* ============================================================
   YVO Épargne — types de carte (Standard, Pro…)
   Yvo les crée dans les Réglages : nom, couleur de la carte
   virtuelle, montant par jour, durée, commission par défaut.
   Choisir un type à la création d'une carte pré-remplit tout.
   ============================================================ */

const CARD_COLORS = [
  { id: 0, nom: 'Vert' }, { id: 1, nom: 'Bleu' }, { id: 2, nom: 'Bronze' },
  { id: 3, nom: 'Violet' }, { id: 4, nom: 'Noir & or' }, { id: 5, nom: 'Bordeaux' }
];

const DEFAULT_CARD_TYPES = [
  { id: 'ct-standard', nom: 'Standard', couleur: 0, montantJournalier: 0, dureeJours: 31, baremeId: '', description: 'Carte de base' },
  { id: 'ct-pro', nom: 'Pro', couleur: 4, montantJournalier: 0, dureeJours: 31, baremeId: '', description: 'Carte pour les gros cotisants' }
];

function cardTypes() {
  return db.settings.cardTypes || JSON.parse(JSON.stringify(DEFAULT_CARD_TYPES));
}

function cardTypeById(id) {
  return cardTypes().find(function (t) { return t.id === id; }) || null;
}

function cardTypesWritable() {
  if (!db.settings.cardTypes) db.settings.cardTypes = cardTypes();
  return db.settings.cardTypes;
}

function cardTypeUsage(id) {
  return db.cartes.filter(function (c) { return c.typeId === id; }).length;
}

function cardTypeSnapshot(t) {
  return t ? { typeId: t.id, typeNom: t.nom, typeCouleur: t.couleur } : { typeId: '', typeNom: '', typeCouleur: undefined };
}

/* Choix du type dans la fenêtre « Nouvelle carte » */
function cardTypeSelectHTML(c) {
  const list = cardTypes();
  if (!list.length) return '';
  const cur = c.typeId || (c.id ? '' : list[0].id);
  return '<label class="field span2"><span>Type de carte</span><select name="typeId" id="carte-type">' +
    (c.id ? '<option value=""' + (!cur ? ' selected' : '') + '>Aucun type</option>' : '') +
    list.map(function (t) {
      return '<option value="' + esc(t.id) + '"' + (cur === t.id ? ' selected' : '') + '>' + esc(t.nom) + '</option>';
    }).join('') + '</select><small>Le type remplit le montant, la durée et la commission pour vous. Vous pouvez les changer.</small></label>';
}

/* Quand on change de type : remplir le formulaire */
function applyCardType(id) {
  const t = cardTypeById(id);
  const form = document.getElementById('form-carte');
  if (!t || !form) return;
  if (Number(t.montantJournalier) > 0 && form.elements.montantJournalier) form.elements.montantJournalier.value = t.montantJournalier;
  if (Number(t.dureeJours) > 0 && form.elements.dateDebut && form.elements.dateFin && form.elements.dateDebut.value) {
    form.elements.dateFin.value = addDays(form.elements.dateDebut.value, Number(t.dureeJours) - 1);
  }
  if (t.baremeId && form.elements.bareme) form.elements.bareme.value = t.baremeId;
}

/* Bloc dans les Réglages */
function cardTypesSection() {
  const list = cardTypes();
  return '<section class="setting-card">' +
    '<div class="setting-head"><span class="setting-ic">' + icon('credit-card', 19) + '</span><div><h2>Types de carte</h2><p>Standard, Pro… Créez les cartes que vous proposez à vos clients.</p></div></div>' +
    (list.length
      ? '<div class="ctype-list">' + list.map(function (t) {
          const used = cardTypeUsage(t.id);
          return '<div class="ctype">' +
            '<span class="ctype-dot v' + (t.couleur || 0) + '"></span>' +
            '<div class="ctype-main"><strong>' + esc(t.nom) + '</strong><span>' +
              (Number(t.montantJournalier) > 0 ? esc(money(t.montantJournalier)) + ' par jour' : 'Montant libre') + ' · ' +
              (Number(t.dureeJours) > 0 ? t.dureeJours + ' jours' : 'durée libre') + ' · ' + used + ' carte' + (used > 1 ? 's' : '') + '</span></div>' +
            '<button type="button" class="icon-btn" data-action="type-edit" data-id="' + esc(t.id) + '" aria-label="Modifier">' + icon('edit', 16) + '</button>' +
            '<button type="button" class="icon-btn danger" data-action="type-del" data-id="' + esc(t.id) + '" aria-label="Supprimer">' + icon('trash', 16) + '</button>' +
          '</div>';
        }).join('') + '</div>'
      : '<p class="muted">Aucun type pour l’instant.</p>') +
    '<div class="form-actions"><button type="button" class="btn primary" data-action="type-new">' + icon('plus', 15) + ' Nouveau type</button></div>' +
  '</section>';
}

function openTypeModal(t) {
  const cur = t || { id: '', nom: '', couleur: 0, montantJournalier: 0, dureeJours: 31, baremeId: '', description: '' };
  const baremes = commissionActive() ? db.settings.commission.baremes : [];
  openModal({
    title: t ? 'Modifier le type de carte' : 'Nouveau type de carte',
    subtitle: 'Ces réglages seront proposés à chaque nouvelle carte de ce type.',
    body:
      '<form id="form-type" data-form="save-type" autocomplete="off">' +
        '<input type="hidden" name="id" value="' + esc(cur.id) + '">' +
        '<label class="field"><span>Nom du type *</span><input name="nom" required value="' + esc(cur.nom) + '" placeholder="Ex. Pro" data-autofocus></label>' +
        '<div class="field"><span>Couleur de la carte</span><div class="swatches">' +
          CARD_COLORS.map(function (c) {
            return '<label class="swatch"><input type="radio" name="couleur" value="' + c.id + '"' + (Number(cur.couleur) === c.id ? ' checked' : '') + '><span class="ctype-dot v' + c.id + '"></span><em>' + esc(c.nom) + '</em></label>';
          }).join('') + '</div></div>' +
        '<div class="form-grid">' +
          '<label class="field"><span>Montant par jour</span><div class="input-suffix"><input name="montantJournalier" type="number" min="0" step="1" value="' + (Number(cur.montantJournalier) || '') + '" placeholder="Libre"><span>' + esc(db.settings.devise) + '</span></div><small>Laissez vide pour le choisir à chaque carte.</small></label>' +
          '<label class="field"><span>Durée (jours)</span><input name="dureeJours" type="number" min="0" step="1" value="' + (Number(cur.dureeJours) || '') + '" placeholder="31"></label>' +
        '</div>' +
        (baremes.length
          ? '<label class="field"><span>Commission</span><select name="baremeId"><option value="">Selon le barème par défaut</option>' +
              baremes.map(function (b) { return '<option value="' + esc(b.id) + '"' + (cur.baremeId === b.id ? ' selected' : '') + '>' + esc(b.nom) + '</option>'; }).join('') + '</select></label>'
          : '') +
        '<label class="field"><span>Description (facultatif)</span><input name="description" value="' + esc(cur.description || '') + '" placeholder="Ex. Pour les gros cotisants"></label>' +
      '</form>',
    footer:
      '<button type="button" class="btn ghost" data-action="close-modal">Annuler</button>' +
      '<button type="submit" form="form-type" class="btn primary lg">' + icon('check', 17) + ' Enregistrer</button>'
  });
}

function saveCardType(form) {
  const f = new FormData(form);
  const nom = String(f.get('nom') || '').trim();
  if (!nom) { toast('Donnez un nom au type de carte.', 'error'); return; }
  const list = cardTypesWritable();
  const id = String(f.get('id') || '');
  if (list.some(function (t) { return t.id !== id && t.nom.toLowerCase() === nom.toLowerCase(); })) { toast('Un type porte déjà ce nom.', 'error'); return; }
  const data = {
    nom: nom,
    couleur: Number(f.get('couleur')) || 0,
    montantJournalier: Math.max(0, parseMoney(f.get('montantJournalier'))),
    dureeJours: Math.max(0, Math.round(Number(f.get('dureeJours')) || 0)),
    baremeId: String(f.get('baremeId') || ''),
    description: String(f.get('description') || '').trim()
  };
  let t = id ? list.find(function (x) { return x.id === id; }) : null;
  if (t) {
    Object.assign(t, data);
    // les cartes de ce type gardent leur nom et leur couleur à jour
    db.cartes.forEach(function (c) { if (c.typeId === t.id) { c.typeNom = t.nom; c.typeCouleur = t.couleur; } });
    logActivity('systeme', 'Type de carte modifié : ' + nom);
  } else {
    t = Object.assign({ id: uid('ct') }, data);
    list.push(t);
    logActivity('systeme', 'Type de carte créé : ' + nom);
  }
  saveDB();
  closeModal();
  rerender();
  toast('Type de carte enregistré.', 'success');
}
