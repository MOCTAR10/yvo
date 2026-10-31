'use strict';

/* ============================================================
   YVO Épargne — actions : commissions, synchronisation, alertes,
   reçus. Appelé en premier par handleAction / handleForm.
   ============================================================ */

function commCfg() {
  const c = db.settings.commission;
  if (!c.baremes) c.baremes = [];
  return c;
}

function baremeById(id) {
  return commCfg().baremes.find(function (b) { return b.id === id; }) || null;
}

function handleExtraAction(action, el) {
  const id = el.getAttribute('data-id');

  switch (action) {
    case 'guide-next':
      guideNext();
      return true;
    case 'guide-skip':
      openConfirm({ title: 'Passer le guide ?', tone: 'green', icon: 'sparkle', message: 'Vous pourrez toujours ajouter clients et cartes depuis l’accueil.', action: 'confirm-guide-skip', label: 'Passer le guide' });
      return true;
    case 'confirm-guide-skip':
      db.settings.guideDismissed = true;
      saveDB(); closeModal(); rerender();
      return true;
    case 'guide-finish':
      db.settings.guideDone = true;
      saveDB(); rerender();
      toast('Bonne collecte !', 'success');
      return true;
    case 'type-new':
      openTypeModal(null);
      return true;
    case 'type-edit':
      openTypeModal(cardTypeById(id));
      return true;
    case 'type-del': {
      const t = cardTypeById(id);
      if (!t) return true;
      const n = cardTypeUsage(id);
      openConfirm({ title: 'Supprimer le type', tone: 'red', icon: 'trash', message: 'Supprimer le type <strong>' + esc(t.nom) + '</strong> ?', extra: '<p class="muted">' + (n ? n + ' carte(s) gardent leur apparence et leur nom de type.' : 'Aucune carte ne l’utilise.') + '</p>', action: 'confirm-type-del', data: 'data-id="' + esc(id) + '"', label: 'Supprimer' });
      return true;
    }
    case 'confirm-type-del': {
      const list = cardTypesWritable();
      const t = cardTypeById(id);
      db.settings.cardTypes = list.filter(function (x) { return x.id !== id; });
      logActivity('systeme', 'Type de carte supprimé : ' + (t ? t.nom : ''));
      saveDB(); closeModal(); rerender(); toast('Type supprimé.', 'info');
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
    case 'copy-recu-link': {
      const rec = receiptById(id);
      const link = rec ? receiptLink(rec) : '';
      if (link && navigator.clipboard) navigator.clipboard.writeText(link).then(function () { toast('Lien copié.', 'success'); });
      return true;
    }

    /* ---------- alertes ---------- */
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
    case 'welcome-connect':
      openWelcomeConnect();
      return true;
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

    /* ---------- commissions ---------- */
    case 'comm-toggle': {
      const cfg = commCfg();
      cfg.actif = !cfg.actif;
      logActivity('systeme', 'Commissions ' + (cfg.actif ? 'activées' : 'désactivées'));
      saveDB();
      rerender();
      toast(cfg.actif ? 'Commissions activées.' : 'Commissions désactivées : plus rien n’est prélevé.', cfg.actif ? 'success' : 'info');
      return true;
    }
    case 'comm-new':
      openBaremeModal(null);
      return true;
    case 'comm-edit':
      openBaremeModal(baremeById(id));
      return true;
    case 'comm-dup': {
      const b = baremeById(id);
      if (b) {
        commCfg().baremes.push({ id: uid('bm'), nom: b.nom + ' (copie)', parDefaut: false, regles: JSON.parse(JSON.stringify(b.regles)) });
        saveDB(); rerender(); toast('Barème dupliqué.', 'success');
      }
      return true;
    }
    case 'comm-default': {
      const cfg = commCfg();
      cfg.baremes.forEach(function (b) { b.parDefaut = b.id === id; });
      const b = baremeById(id);
      logActivity('systeme', 'Barème par défaut : ' + (b ? b.nom : ''));
      saveDB(); rerender(); toast('Barème par défaut mis à jour (appliqué aux nouvelles cartes).', 'success');
      return true;
    }
    case 'comm-del': {
      const b = baremeById(id);
      if (!b) return true;
      const n = baremeUsage(id).length;
      openConfirm({
        title: 'Supprimer le barème', tone: 'red', icon: 'trash',
        message: 'Supprimer <strong>' + esc(b.nom) + '</strong> ?',
        extra: '<p class="muted">' + (n ? n + ' carte(s) l’utilisent déjà : elles conservent leurs règles actuelles (rien ne change pour elles).' : 'Aucune carte ne l’utilise.') + '</p>',
        action: 'confirm-comm-del', data: 'data-id="' + esc(id) + '"', label: 'Supprimer'
      });
      return true;
    }
    case 'confirm-comm-del': {
      const cfg = commCfg();
      const b = baremeById(id);
      cfg.baremes = cfg.baremes.filter(function (x) { return x.id !== id; });
      if (b && b.parDefaut && cfg.baremes[0]) cfg.baremes[0].parDefaut = true;
      logActivity('systeme', 'Barème supprimé : ' + (b ? b.nom : ''));
      saveDB(); closeModal(); rerender(); toast('Barème supprimé.', 'info');
      return true;
    }
    case 'comm-template': {
      const tpl = COMM_TEMPLATES[Number(el.getAttribute('data-i'))];
      if (tpl) openBaremeModal({ id: null, nom: tpl.nom, parDefaut: false, regles: tpl.regles.map(function (r) { return newRule(r); }) });
      return true;
    }
    case 'comm-rule-add':
      commReadForm();
      commEdit.regles.push(newRule());
      commRenderRules();
      return true;
    case 'comm-rule-del':
      commReadForm();
      commEdit.regles.splice(Number(el.getAttribute('data-i')), 1);
      commRenderRules();
      return true;
    case 'comm-apply': {
      const b = baremeById(id);
      if (!b) return true;
      const mode = el.getAttribute('data-mode');
      const n = mode === 'assign' ? db.cartes.filter(function (c) { return c.statut === 'active'; }).length : baremeUsage(id).length;
      openConfirm({
        title: mode === 'assign' ? 'Appliquer aux cartes actives' : 'Mettre à jour les cartes existantes', tone: 'green', icon: 'coins',
        message: mode === 'assign'
          ? 'Appliquer <strong>' + esc(b.nom) + '</strong> à ' + n + ' carte(s) active(s) ?'
          : 'Appliquer les règles actuelles de <strong>' + esc(b.nom) + '</strong> à ' + n + ' carte(s) qui l’utilisent ?',
        extra: '<p class="muted">Les commissions déjà prélevées seront recalculées avec ces règles. L’opération est inscrite dans l’activité.</p>',
        action: 'confirm-comm-apply', data: 'data-id="' + esc(id) + '" data-mode="' + esc(mode) + '"', label: 'Appliquer'
      });
      return true;
    }
    case 'confirm-comm-apply': {
      const b = baremeById(id);
      if (!b) return true;
      const mode = el.getAttribute('data-mode');
      const cards = mode === 'assign' ? db.cartes.filter(function (c) { return c.statut === 'active'; }) : baremeUsage(id);
      cards.forEach(function (c) { c.commission = baremeSnapshot(b); });
      logActivity('systeme', 'Barème « ' + b.nom + ' » appliqué à ' + cards.length + ' carte(s)');
      saveDB(); closeModal(); rerender(); toast(cards.length + ' carte(s) mise(s) à jour.', 'success');
      return true;
    }
    case 'comm-period':
      state.commPeriod = el.getAttribute('data-period') || 'mois';
      rerender();
      return true;
    default:
      return false;
  }
}

function handleExtraForm(type, form, submitter) {
  if (type === 'save-type') {
    saveCardType(form);
    return true;
  }
  if (type === 'guide-company') {
    guideSaveCompany(form);
    return true;
  }
  if (type === 'sync-connect') {
    connectFromForm(form, submitter);
    return true;
  }
  if (type === 'save-bareme') {
    commReadForm();
    const nom = String(new FormData(form).get('nom') || '').trim();
    if (!nom) { toast('Donnez un nom au barème.', 'error'); return true; }
    const regles = commEdit.regles.filter(function (r) { return Number(r.valeur) > 0; });
    if (!regles.length) { toast('Ajoutez au moins une règle avec une valeur supérieure à 0.', 'error'); return true; }
    if (regles.some(function (r) { return r.calc === 'pct' && r.valeur > 100; })) { toast('Un pourcentage ne peut pas dépasser 100.', 'error'); return true; }
    const cfg = commCfg();
    let b = commEdit.id ? baremeById(commEdit.id) : null;
    if (b) {
      b.nom = nom; b.regles = regles;
      logActivity('systeme', 'Barème modifié : ' + nom + ' (' + regles.map(function (r) { return commissionRuleLabel(r); }).join(' + ') + ')');
    } else {
      b = { id: uid('bm'), nom: nom, parDefaut: !cfg.baremes.length, regles: regles };
      cfg.baremes.push(b);
      logActivity('systeme', 'Barème créé : ' + nom + ' (' + regles.map(function (r) { return commissionRuleLabel(r); }).join(' + ') + ')');
    }
    saveDB(); closeModal(); rerender();
    toast(baremeUsage(b.id).length ? 'Barème enregistré. Utilisez « Mettre à jour les cartes » pour l’appliquer aux cartes existantes.' : 'Barème enregistré.', 'success');
    return true;
  }
  return false;
}

function bindExtraEvents() {
  document.addEventListener('change', function (e) {
    const t = e.target;
    if (t.id === 'carte-type') {
      applyCardType(t.value);
    } else if (t.classList && t.classList.contains('rule-sel')) {
      commReadForm();
      commRenderRules();
    }
  });
  document.addEventListener('input', function (e) {
    const t = e.target;
    if (t.id === 'recu-search') {
      state.recuSearch = t.value;
      scheduleRender();
    } else if (t.hasAttribute && t.hasAttribute('data-sim')) {
      commSim();
    }
  });
}
