'use strict';

/* ============================================================
   YVO Épargne — composants d'interface réutilisables
   ============================================================ */

const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/>',
  'check-square': '<path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  wallet: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5"/><path d="M16 12h.01"/>',
  settings: '<path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M1 14h6"/><path d="M9 8h6"/><path d="M17 16h6"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  unlock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  'chevron-left': '<path d="m15 18-6-6 6-6"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  'arrow-left': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  'arrow-up': '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  'arrow-down': '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  'arrow-up-right': '<path d="M7 17 17 7"/><path d="M7 7h10v10"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92Z"/>',
  'map-pin': '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 7h8M8 11h8M8 15h5"/>',
  printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6M14 11v6"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 22V12h6v10"/>',
  banknote: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  'credit-card': '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3Z"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/>',
  'more-horizontal': '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  minus: '<path d="M5 12h14"/>',
  'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  'shield-alert': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  message: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.8-.9L3 21l1.9-5.1A8.4 8.4 0 1 1 21 11.5Z"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 0 1 0 9Z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  'check-circle': '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  coins: '<circle cx="8" cy="8" r="6"/><path d="M18.1 10.4A6 6 0 1 1 10.4 18.1"/><path d="M7 6h1v4"/>',
  sort: '<path d="M3 6h13M3 12h9M3 18h5"/><path d="m17 14 4 4 4-4" transform="translate(-4 0)"/><path d="M17 8v10" transform="translate(-0 0)"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'
};

function icon(name, size, cls) {
  const path = ICONS[name] || ICONS.grid;
  return '<svg class="ic ' + (cls || '') + '" width="' + (size || 18) + '" height="' + (size || 18) +
    '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    path + '</svg>';
}

function badge(text, tone) {
  return '<span class="badge ' + (tone || 'gray') + '">' + esc(text) + '</span>';
}

function avatar(name, size) {
  return '<span class="avatar ' + (size === 'lg' ? 'avatar-lg' : size === 'sm' ? 'avatar-sm' : '') +
    '" style="' + avatarStyle(name) + '" aria-hidden="true">' + esc(initials(name)) + '</span>';
}

function progressBar(percent, tone) {
  const p = clamp(Number(percent) || 0, 0, 100);
  return '<div class="progress ' + (tone || '') + '"><span style="width:' + p.toFixed(1) + '%"></span></div>';
}

function pageHead(eyebrow, title, sub, actions) {
  return '<div class="page-head">' +
    '<div class="page-head-main">' +
      '<div class="eyebrow">' + esc(eyebrow) + '</div>' +
      '<h1>' + esc(title) + '</h1>' +
      (sub ? '<p class="page-sub">' + sub + '</p>' : '') +
    '</div>' +
    (actions ? '<div class="page-actions">' + actions + '</div>' : '') +
    '</div>';
}

function emptyState(iconName, title, text, cta) {
  return '<div class="empty">' +
    '<div class="empty-icon">' + icon(iconName, 26) + '</div>' +
    '<h3>' + esc(title) + '</h3>' +
    '<p>' + text + '</p>' +
    (cta ? '<div class="empty-cta">' + cta + '</div>' : '') +
    '</div>';
}

function riskBadge(r) {
  return badge(RISK_LABELS[r.niveau], RISK_TONES[r.niveau]);
}

function statutBadge(statut) {
  return badge(STATUT_LABELS[statut] || statut, STATUT_TONES[statut] || 'gray');
}

/* Boutons Appeler / WhatsApp pour un client */
function contactButtons(client, message, compact) {
  if (!client || !client.telephone) return '';
  const tel = String(client.telephone).replace(/[^\d+]/g, '');
  const wa = waLink(client.telephone, message || '');
  return '<a class="contact-btn call" href="tel:' + esc(tel) + '" aria-label="Appeler ' + esc(client.nom) + '">' + icon('phone', 16) + (compact ? '' : '<span>Appeler</span>') + '</a>' +
    (wa ? '<a class="contact-btn wa" href="' + esc(wa) + '" target="_blank" rel="noopener" aria-label="WhatsApp ' + esc(client.nom) + '">' + icon('message', 16) + (compact ? '' : '<span>WhatsApp</span>') + '</a>' : '');
}

function statusBadge(carte) {
  if (carte.statut === 'cloturee') return badge('Clôturée', 'gray');
  if (carte.statut === 'archivee') return badge('Archivée', 'gray');
  if (carte.dateFin < todayISO()) return badge('Échéance passée', 'amber');
  return badge('En cours', 'green');
}

/* ------------------------------------------------------------
   Modales
   ------------------------------------------------------------ */

function openModal(opts) {
  const root = document.getElementById('modal-root');
  if (!root) return;
  const size = opts.size ? ' modal-' + opts.size : '';
  root.innerHTML =
    '<div class="modal-backdrop" data-backdrop="1">' +
      '<div class="modal' + size + (opts.cls ? ' ' + opts.cls : '') + '" role="dialog" aria-modal="true" aria-labelledby="modal-title">' +
        '<span class="sheet-handle" aria-hidden="true"></span>' +
        '<div class="modal-head">' +
          '<div>' +
            '<h2 id="modal-title">' + esc(opts.title || '') + '</h2>' +
            (opts.subtitle ? '<p class="modal-sub">' + opts.subtitle + '</p>' : '') +
          '</div>' +
          '<button type="button" class="icon-btn" data-action="close-modal" aria-label="Fermer">' + icon('x', 18) + '</button>' +
        '</div>' +
        '<div class="modal-body">' + (opts.body || '') + '</div>' +
        (opts.footer ? '<div class="modal-foot">' + opts.footer + '</div>' : '') +
      '</div>' +
    '</div>';
  if (!document.body.classList.contains('modal-open')) modalReturnFocus = document.activeElement;
  document.body.classList.add('modal-open');
  if (typeof opts.onMount === 'function') opts.onMount();
  setTimeout(function () {
    const first = root.querySelector('[data-autofocus], .modal-body input:not([type="hidden"]), .modal-body select, .modal-body textarea, .modal-body button') ||
      root.querySelector('.modal-foot .btn.ghost, .modal-foot .btn, .modal-head .icon-btn');
    if (first) {
      try { first.focus({ preventScroll: true }); } catch (err) { first.focus(); }
      if (first.select && first.type !== 'date') { try { first.select(); } catch (err) { /* ignore */ } }
    }
  }, 40);
}

let modalReturnFocus = null;

function closeModal() {
  const root = document.getElementById('modal-root');
  if (root) root.innerHTML = '';
  document.body.classList.remove('modal-open');
  const back = modalReturnFocus;
  modalReturnFocus = null;
  if (back && back.isConnected && typeof back.focus === 'function') { try { back.focus({ preventScroll: true }); } catch (err) { /* ignore */ } }
}

/* Tab reste dans la fenêtre ouverte : on ne se perd pas dans la page derrière. */
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Tab') return;
  const dialog = document.querySelector('#modal-root .modal');
  if (!dialog) return;
  const items = Array.prototype.filter.call(
    dialog.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'),
    function (el) { return el.offsetParent !== null || el === document.activeElement; });
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (!dialog.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

/* ------------------------------------------------------------
   Notifications
   ------------------------------------------------------------ */

function toast(message, tone, act) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  while (root.children.length >= 2) root.firstChild.remove();
  const el = document.createElement('div');
  el.className = 'toast ' + (tone || 'success');
  el.innerHTML = '<span class="toast-ic">' + icon(tone === 'error' ? 'alert' : 'check', 17) + '</span><span></span>';
  el.lastChild.textContent = message;
  if (act) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'toast-act'; b.textContent = act.label;
    b.setAttribute('data-action', act.action); b.setAttribute('data-id', act.id);
    el.appendChild(b);
  }
  root.appendChild(el);
  setTimeout(function () {
    el.classList.add('toast-out');
    setTimeout(function () { el.remove(); }, 250);
  }, act ? 7000 : 3400);
}

/* ------------------------------------------------------------
   Reçu / accusé de réception
   ------------------------------------------------------------ */

function receiptHTML(op) {
  const snap = op.snapshot || {};
  const company = db.settings.company;
  const client = clientById(op.clientId);
  const nom = snap.clientNom || (client ? client.nom : '—');
  const tel = snap.clientTel || (client ? client.telephone : '');
  const quartier = snap.clientQuartier || (client ? client.quartier : '');
  const adresse = snap.clientAdresse || (client ? client.adresse : '');
  const piece = snap.clientPiece || (client ? [client.pieceType, client.pieceNumero].filter(Boolean).join(' ') : '');
  const carteLabel = snap.carteLabel || 'Carte';
  const totalVerse = snap.totalVerse != null ? snap.totalVerse : 0;
  const soldeApres = snap.soldeApres != null ? snap.soldeApres : 0;
  const montant = Number(op.montant) || 0;
  const isPret = op.categorie === 'pret';
  const frais = Number(op.frais) || 0;

  return '<div id="receipt-print" class="receipt">' +
    '<div class="receipt-head">' +
      '<div class="receipt-brand">' +
        '<span class="receipt-logo">' + esc(initials(company.nom || 'YVO')) + '</span>' +
        '<div>' +
          '<strong>' + esc(company.nom || 'Mon entreprise') + '</strong>' +
          '<span>' + esc(company.activite || 'Collecte & épargne') + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="receipt-stamp">' +
        '<span>Accusé de réception</span>' +
        '<strong>' + esc(op.recuNumero || '—') + '</strong>' +
        '<em>' + esc(fmtDate(op.date, 'long')) + '</em>' +
      '</div>' +
    '</div>' +
    '<div class="receipt-company">' +
      (company.responsable ? '<span>' + esc(company.responsable) + '</span>' : '') +
      (company.telephone ? '<span>' + esc(company.telephone) + '</span>' : '') +
      (company.email ? '<span>' + esc(company.email) + '</span>' : '') +
      '<span>' + esc([company.adresse, company.ville].filter(Boolean).join(', ')) + '</span>' +
    '</div>' +
    '<div class="receipt-title">' + (isPret ? 'Reçu d’avance d’argent' : 'Reçu de paiement au client') + '</div>' +
    '<div class="receipt-grid">' +
      '<div><span>Client</span><strong>' + esc(nom) + '</strong></div>' +
      '<div><span>Téléphone</span><strong>' + esc(tel || '—') + '</strong></div>' +
      '<div><span>Quartier</span><strong>' + esc(quartier || '—') + '</strong></div>' +
      '<div><span>Pièce d’identité</span><strong>' + esc(piece || '—') + '</strong></div>' +
      '<div class="span2"><span>Adresse</span><strong>' + esc(adresse || '—') + '</strong></div>' +
    '</div>' +
    (isPret ? pretReceiptBody(op, nom, carteLabel, snap, montant, frais, company) : (
    '<table class="receipt-table">' +
      '<thead><tr><th>Désignation</th><th>Détails</th><th class="right">Montant</th></tr></thead>' +
      '<tbody>' +
        '<tr><td>' + esc(carteLabel) + '</td><td>Du ' + esc(fmtDate(snap.dateDebut, 'short')) + ' au ' + esc(fmtDate(snap.dateFin, 'short')) + '</td><td class="right">' + esc(money(totalVerse)) + '</td></tr>' +
        '<tr><td>Total cotisé</td><td>' + esc(numberFR(snap.montantJournalier || 0)) + ' / jour</td><td class="right">' + esc(money(totalVerse)) + '</td></tr>' +
        '<tr class="receipt-pay"><td>Paiement effectué</td><td>' + esc(op.mode || 'Espèces') + '</td><td class="right">' + esc(money(montant)) + '</td></tr>' +
        '<tr><td>Solde restant dû</td><td>Après ce paiement</td><td class="right">' + esc(money(soldeApres)) + '</td></tr>' +
      '</tbody>' +
    '</table>' +
    '<div class="receipt-amount"><span>Montant payé</span><strong>' + esc(money(montant)) + '</strong></div>' +
    '<p class="receipt-note">Je soussigné(e) <strong>' + esc(nom) + '</strong> reconnais avoir reçu la somme de <strong>' + esc(money(montant)) +
      '</strong> des mains de <strong>' + esc(company.nom || 'mon collecteur') + '</strong>, au titre de la carte d’épargne <strong>' + esc(carteLabel) +
      '</strong>. Ce document vaut accusé de réception et preuve de paiement.</p>'
    )) +
    '<div class="receipt-sign">' +
      '<div><span>Signature du collecteur</span><i></i></div>' +
      '<div><span>Signature du client</span><i></i></div>' +
    '</div>' +
    '<div class="receipt-foot">' +
      '<span>Reçu généré le ' + esc(fmtDateTime(op.createdAt || new Date().toISOString())) + ' · ' + esc(APP_VERSION) + '</span>' +
      '<span>' + esc(company.nom || '') + ' · ' + esc(company.telephone || '') + '</span>' +
    '</div>' +
    '</div>';
}

/* Corps du reçu d'avance : le client reconnaît la dette et son remboursement par cotisations. */
function pretReceiptBody(op, nom, carteLabel, snap, montant, frais, company) {
  return '<table class="receipt-table">' +
      '<thead><tr><th>Désignation</th><th>Détails</th><th class="right">Montant</th></tr></thead>' +
      '<tbody>' +
        '<tr><td>' + esc(carteLabel) + '</td><td>' + esc(numberFR(snap.montantJournalier || 0)) + ' / jour, jusqu’au ' + esc(fmtDate(snap.dateFin, 'short')) + '</td><td class="right">' + esc(money(snap.totalVerse || 0)) + '</td></tr>' +
        '<tr class="receipt-pay"><td>Avance remise</td><td>' + esc(op.mode || 'Espèces') + '</td><td class="right">' + esc(money(montant)) + '</td></tr>' +
        (frais > 0 ? '<tr><td>Frais</td><td>' + esc(op.fraisRegle && op.fraisRegle.type === 'pct' ? op.fraisRegle.valeur + ' %' : 'Montant fixe') + '</td><td class="right">' + esc(money(frais)) + '</td></tr>' : '') +
        '<tr><td>Reste à rembourser</td><td>Par les prochaines cotisations</td><td class="right">' + esc(money(snap.doitApres || 0)) + '</td></tr>' +
      '</tbody>' +
    '</table>' +
    '<div class="receipt-amount"><span>Avance remise</span><strong>' + esc(money(montant)) + '</strong></div>' +
    '<p class="receipt-note">Je soussigné(e) <strong>' + esc(nom) + '</strong> reconnais avoir reçu de <strong>' + esc(company.nom || 'mon collecteur') +
      '</strong> une avance de <strong>' + esc(money(montant)) + '</strong>' + (frais > 0 ? ' (frais : ' + esc(money(frais)) + ')' : '') +
      ', que je rembourse par mes cotisations sur la carte <strong>' + esc(carteLabel) + '</strong>.</p>';
}

function openReceipt(opId) {
  const op = db.operations.find(function (o) { return o.id === opId; });
  if (!op) {
    toast('Reçu introuvable.', 'error');
    return;
  }
  openModal({
    title: op.categorie === 'pret' ? 'Reçu d’avance d’argent' : 'Reçu de paiement',
    subtitle: 'Accusé de réception · ' + esc(op.recuNumero || ''),
    size: 'large',
    body: receiptHTML(op),
    footer: '<button type="button" class="btn ghost" data-action="close-modal">Fermer</button>' +
      '<button type="button" class="btn primary" data-action="print-receipt">' + icon('printer', 16) + ' Imprimer</button>'
  });
}
