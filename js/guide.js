'use strict';

/* ============================================================
   YVO Épargne — guide de premier lancement
   Quatre étapes, une à la fois : entreprise, premier client,
   sa carte, premier versement. Chaque étape s'enchaîne avec la
   suivante ; on peut passer le guide à tout moment.
   ============================================================ */

function guideState() {
  const companyDone = !!(db.settings.company.nom && db.settings.company.nom !== 'Mon entreprise') || !!db.settings.guideCompany;
  const clientDone = db.clients.length > 0;
  const carteDone = db.cartes.length > 0;
  const payDone = db.versements.some(function (v) { return Number(v.montant) > 0; });
  const flags = [companyDone, clientDone, carteDone, payDone];
  const current = flags.indexOf(false);
  return { flags: flags, current: current, all: current === -1 };
}

/* Yvo n'a rien à configurer (profil déjà rempli) : le guide de premier lancement ne s'affiche plus. */
function guideActive() {
  return false;
}

function guidePayDate(carte) {
  const t = todayISO();
  if (t < carte.dateDebut) return carte.dateDebut;
  if (t > carte.dateFin) return carte.dateFin;
  return t;
}

const GUIDE_STEPS = [
  { title: 'Votre entreprise', text: 'Le nom qui apparaîtra sur les reçus de vos clients.', cta: 'Commencer', icon: 'building' },
  { title: 'Votre premier client', text: 'Ajoutez une personne qui cotise chez vous. Seul le nom est obligatoire.', cta: 'Ajouter un client', icon: 'users' },
  { title: 'Sa carte d’épargne', text: 'Choisissez le montant par jour, la date de début et la date de fin.', cta: 'Créer la carte', icon: 'credit-card' },
  { title: 'Le premier versement', text: 'Notez ce que le client vous donne aujourd’hui. Un reçu sera prêt à lui envoyer.', cta: 'Noter un versement', icon: 'banknote' }
];

function setupChecklist() {
  if (!guideActive()) return '';
  const g = guideState();
  if (g.all) {
    return '<section class="panel guide-card done">' +
      '<span class="guide-ic">' + icon('check-circle', 28) + '</span>' +
      '<div class="guide-main"><strong>Bravo, vous êtes prêt !</strong><span>Vous savez ajouter un client, créer une carte et noter un versement. Continuez chaque jour depuis « Pointage ».</span></div>' +
      '<button type="button" class="btn primary" data-action="guide-finish">Terminer</button>' +
    '</section>';
  }
  const s = GUIDE_STEPS[g.current];
  return '<section class="panel guide-card">' +
    '<div class="guide-top"><span class="guide-count">Étape ' + (g.current + 1) + ' sur 4</span>' +
      '<div class="guide-dots">' + g.flags.map(function (f, i) { return '<i class="' + (f ? 'on' : i === g.current ? 'now' : '') + '"></i>'; }).join('') + '</div></div>' +
    '<div class="guide-body"><span class="guide-ic">' + icon(s.icon, 28) + '</span>' +
      '<div class="guide-main"><strong>' + esc(s.title) + '</strong><span>' + esc(s.text) + '</span></div></div>' +
    '<div class="guide-actions"><button type="button" class="btn primary lg" data-action="guide-next">' + esc(s.cta) + '</button>' +
      '<button type="button" class="link-btn" data-action="guide-skip">Passer le guide</button></div>' +
  '</section>';
}

function openGuideCompany() {
  const c = db.settings.company;
  openModal({
    title: 'Votre entreprise',
    subtitle: 'Étape 1 sur 4 · Vous pourrez tout modifier plus tard dans les Réglages.',
    body:
      '<form id="form-guide-company" data-form="guide-company" autocomplete="off">' +
        '<label class="field"><span>Nom de votre entreprise *</span><input name="nom" required value="' + esc(c.nom === 'Mon entreprise' ? '' : c.nom) + '" placeholder="Ex. YVO Épargne" data-autofocus></label>' +
        '<label class="field"><span>Votre nom</span><input name="responsable" value="' + esc(c.responsable || '') + '" placeholder="Ex. Yvo"></label>' +
        '<div class="form-grid">' +
          '<label class="field"><span>Téléphone</span><input name="telephone" type="tel" value="' + esc(c.telephone || '') + '"></label>' +
          '<label class="field"><span>Indicatif du pays</span><input name="indicatif" inputmode="numeric" value="' + esc(db.settings.indicatif || '') + '" placeholder="Ex. 241"><small>Pour écrire aux clients sur WhatsApp.</small></label>' +
        '</div>' +
        '<label class="field"><span>Argent en caisse au départ</span><div class="input-suffix"><input name="soldeInitial" type="number" min="0" step="1" value="' + Number(db.settings.soldeInitial || 0) + '"><span>' + esc(db.settings.devise) + '</span></div><small>Mettez 0 si vous ne savez pas encore.</small></label>' +
      '</form>',
    footer:
      '<button type="button" class="btn ghost" data-action="close-modal">Plus tard</button>' +
      '<button type="submit" form="form-guide-company" class="btn primary lg">' + icon('check', 17) + ' Continuer</button>'
  });
}

function guideSaveCompany(form) {
  const f = new FormData(form);
  const nom = String(f.get('nom') || '').trim();
  if (!nom) { toast('Écrivez le nom de votre entreprise.', 'error'); return; }
  db.settings.company.nom = nom;
  db.settings.company.responsable = String(f.get('responsable') || '').trim();
  db.settings.company.telephone = String(f.get('telephone') || '').trim();
  db.settings.indicatif = String(f.get('indicatif') || '').replace(/\D/g, '');
  db.settings.soldeInitial = Math.max(0, parseMoney(f.get('soldeInitial')));
  db.settings.guideCompany = true;
  logActivity('systeme', 'Entreprise configurée : ' + nom);
  saveDB();
  closeModal();
  rerender();
  if (!db.clients.length) {
    setTimeout(function () { openClientModal(null); }, 300);
  }
}

/* Ouvre l'étape en cours */
function guideNext() {
  const g = guideState();
  if (g.all) return;
  if (g.current === 0) openGuideCompany();
  else if (g.current === 1) openClientModal(null);
  else if (g.current === 2) {
    const client = db.clients[db.clients.length - 1];
    if (client) openCarteModal(client.id, null);
  } else {
    const carte = db.cartes[0];
    if (carte) openPaySheet(carte.clientId, guidePayDate(carte), carte.id);
  }
}

/* Appelé après la création d'un client ou d'une carte : on enchaîne. */
function guideAfterClient(client) {
  if (!guideActive() || db.cartes.length) return false;
  rerender();
  setTimeout(function () { openCarteModal(client.id, null); }, 300);
  return true;
}

function guideAfterCarte(carte) {
  if (!guideActive() || db.versements.some(function (v) { return Number(v.montant) > 0; })) return false;
  setTimeout(function () { openPaySheet(carte.clientId, guidePayDate(carte), carte.id); }, 350);
  return true;
}
