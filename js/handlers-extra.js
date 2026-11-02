'use strict';

/* ============================================================
   YVO Épargne — actions : bouton +, synchronisation, alertes,
   reçus. Appelé en premier par handleAction / handleForm.
   ============================================================ */



function handleExtraAction(action, el) {
  const id = el.getAttribute('data-id');

  switch (action) {
    case 'open-fab':
      openFabSheet();
      return true;
    case 'go':
      closeModal();
      navigate(el.getAttribute('data-href'));
      return true;
    case 'fab-lock':
      closeModal();
      lockApp();
      return true;
    case 'tap-day':
      openDayTap(el.getAttribute('data-carte'), el.getAttribute('data-date'));
      return true;
    case 'client-card':
      state.clientCard[el.getAttribute('data-client')] = el.getAttribute('data-carte');
      rerender();
      return true;
    case 'caisse-day': {
      const t = todayISO();
      const next = addDays(state.caisseDate || t, Number(el.getAttribute('data-delta')) || 0);
      state.caisseDate = next > t ? t : next;
      rerender();
      return true;
    }
    case 'carte-pick':
      addCarteFromPicker(el);
      return true;
    case 'carte-autre':
      openCarteModal(el.getAttribute('data-client'), null, true);
      return true;
    case 'picker-duree':
      document.querySelectorAll('[data-action="picker-duree"]').forEach(function (b) { b.classList.toggle('active', b === el); });
      return true;
    case 'carte-duree': {
      const form = document.getElementById('form-carte');
      if (form) form.elements.dateFin.value = endAfterMonths(form.elements.dateDebut.value || todayISO(), el.getAttribute('data-mois'));
      form.querySelectorAll('[data-action="carte-duree"]').forEach(function (b) { b.classList.toggle('active', b === el); });
      return true;
    }
    case 'reload':
      location.reload();
      return true;

    /* ---------- reçus ---------- */
    case 'open-recu':
      if (id) openRecuModal(id);
      return true;
    case 'share-recu-image': {
      const rec = receiptById(id);
      if (rec) shareReceiptImage(rec).then(function (r) {
        if (r === 'downloaded') toast('Image du reçu téléchargée : envoyez-la depuis votre galerie.', 'info');
        else if (r === 'error') toast('Impossible de créer l’image.', 'error');
      });
      return true;
    }
    case 'alert-ack':
      alertAck()[el.getAttribute('data-key')] = todayISO();
      logActivity('systeme', 'Alerte marquée comme vue : ' + String(el.getAttribute('data-key')).split('|')[0]);
      saveDB();
      rerender();
      return true;
    case 'alert-unack':
      delete alertAck()[el.getAttribute('data-key')];
      saveDB();
      rerender();
      return true;
    case 'alert-ack-all': {
      const ack = alertAck();
      const list = activeAlerts();
      list.forEach(function (a) { ack[a.key] = todayISO(); });
      logActivity('systeme', list.length + ' alerte(s) marquée(s) comme vues');
      saveDB();
      rerender();
      return true;
    }

    /* ---------- synchronisation ---------- */
    case 'sync-now':
      syncNow(true).then(function () { loadSyncInfo(); });
      return true;
    case 'sync-info':
      loadSyncInfo();
      return true;
    case 'sync-audit':
      loadSyncAudit();
      return true;
    case 'sync-export':
      syncApi('/api/export').then(function (r) {
        downloadFile('yvo-serveur-' + todayISO() + '.json', JSON.stringify(r, null, 2), 'application/json');
      }).catch(function (e) { toast(e.message || 'Serveur injoignable.', 'error'); });
      return true;
    case 'sync-disconnect':
      openConfirm({
        title: 'Déconnecter cet appareil', tone: 'red', icon: 'cloud',
        message: 'Cet appareil ne sera plus synchronisé. Vos données restent ici et sur le serveur.',
        action: 'confirm-sync-disconnect', label: 'Déconnecter'
      });
      return true;
    case 'confirm-sync-disconnect':
      syncDisconnect().then(function () {
        closeModal();
        logActivity('systeme', 'Appareil déconnecté du serveur');
        saveDB();
        syncInfo = null; syncAudit = null;
        rerender();
        toast('Appareil déconnecté.', 'info');
      });
      return true;

    default:
      return false;
  }
}

function handleExtraForm(type, form, submitter) {
  if (type === 'sync-connect') {
    connectFromForm(form, submitter);
    return true;
  }
  return false;
}

function bindExtraEvents() {
  /* Les sections ouvertes restent ouvertes quand la page se redessine. */
  document.addEventListener('toggle', function (e) {
    const sec = e.target && e.target.getAttribute && e.target.getAttribute('data-sec');
    if (sec) state.clientOpen[sec] = e.target.open;
  }, true);
}

/* Une touche sur une tuile : la carte existe, le calendrier est prêt. */
function addCarteFromPicker(el) {
  const clientId = el.getAttribute('data-client');
  const montant = Number(el.getAttribute('data-montant')) || 0;
  const client = clientById(clientId);
  if (!client || montant <= 0) return;
  const choix = document.querySelector('[data-action="picker-duree"].active');
  const debut = todayISO();
  const fin = endAfterMonths(debut, choix ? choix.getAttribute('data-mois') : 1);
  const carte = {
    id: uid('ca'), statut: 'active', createdAt: new Date().toISOString(), clientId: clientId,
    label: 'Carte ' + (cartesOf(clientId).length + 1), montantJournalier: montant, dateDebut: debut, dateFin: fin, notes: ''
  };
  db.cartes.push(carte);
  state.cal[carte.id] = monthKeyOf(debut);
  state.clientCard[clientId] = carte.id;
  logActivity('carte', 'Nouvelle carte : ' + carte.label + ' · ' + money(montant) + '/jour du ' + fmtDate(debut, 'short') + ' au ' + fmtDate(fin, 'short'), { clientId: clientId, carteId: carte.id });
  saveDB();
  closeModal();
  rerender();
  toast('C’est fait : ' + money(montant, true) + ' par jour', 'success');
}
