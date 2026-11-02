'use strict';

/* ============================================================
   YVO Épargne — centre d'alertes
   Détecte les incohérences et les problèmes de logique, sans
   rien stocker : les alertes sont recalculées à partir des
   données. « Vu » est mémorisé (par signature) : une alerte vue
   réapparaît si la situation change.
   ============================================================ */

const ALERT_SEV = { critique: 3, important: 2, info: 1 };
const ALERT_LABELS = { critique: 'Urgent', important: 'À vérifier', info: 'Pour info' };

function computeAlerts() {
  const out = [];
  const add = function (sev, key, title, text, href, sig) {
    out.push({ sev: sev, key: key + '|' + (sig == null ? '' : sig), title: title, text: text, href: href || '' });
  };
  if (!db) return out;
  const t = todayISO();

  /* 1. Caisse inférieure à ce qui est dû aux clients */
  const cov = cashCoverage();
  if (cov < 0) {
    add('critique', 'caisse-dette', 'Il manque de l’argent en caisse',
      'Il manque ' + money(-cov) + ' : la caisse a ' + money(cashBalance()) + ' et les clients ont ' + money(fundsOwed()) + '.', '#/tresorerie', Math.round(-cov));
  }
  if (cashBalance() < 0) {
    add('critique', 'caisse-neg', 'La caisse est à moins de zéro', 'La caisse affiche ' + money(cashBalance()) + '. Vérifiez ce qui est sorti.', '#/tresorerie', Math.round(cashBalance()));
  }

  /* 2. Doublons de versement (même carte, même jour) */
  const seen = {};
  db.versements.forEach(function (v) {
    const k = v.carteId + '|' + v.date;
    seen[k] = (seen[k] || 0) + 1;
  });
  const dups = Object.keys(seen).filter(function (k) { return seen[k] > 1; });
  if (dups.length) {
    add('important', 'doublon', dups.length + ' jour(s) comptés deux fois',
      'Une carte a deux paiements écrits pour le même jour. Vérifiez les montants.', '#/clients', dups.length);
  }

  /* 3. Orphelins : versements ou opérations vers une carte/un client inexistant */
  const orphV = db.versements.filter(function (v) { return !carteById(v.carteId) || !clientById(v.clientId); });
  if (orphV.length) {
    add('critique', 'orphelin', orphV.length + ' paiement(s) sans client',
      'Le client ou la carte a été supprimé. Remettez-le depuis la Corbeille.', '#/corbeille', orphV.length);
  }

  db.cartes.forEach(function (c) {
    const client = clientById(c.clientId);
    if (!client) return;
    const tot = cardTotals(c);
    const nom = client.nom + ' · ' + c.label;
    const href = '#/client/' + client.id;

    /* 4. Versements hors période */
    const hors = versementsOf(c.id).filter(function (v) { return v.montant > 0 && (v.date < c.dateDebut || v.date > c.dateFin); });
    if (hors.length) {
      add('important', 'hors-periode-' + c.id, nom + ' : paiement en dehors de la carte',
        hors.length + ' paiement(s) datent d’avant le début ou d’après la fin de la carte.', href, hors.length);
    }
    /* 5. Versements futurs */
    const futur = versementsOf(c.id).filter(function (v) { return v.montant > 0 && v.date > t; });
    if (futur.length) {
      add('important', 'futur-' + c.id, nom + ' : paiement à une date pas encore arrivée',
        'Vérifiez la date de ce paiement.', href, futur.length);
    }
    /* 6. Solde négatif / retraits supérieurs aux versements */
    const net = tot.totalVerse - tot.totalRetire;
    if (net < -0.5) {
      add('critique', 'solde-neg-' + c.id, nom + ' : trop d’argent rendu',
        'Le client a reçu ' + money(-net) + ' de plus que ce qu’il a payé.', href, Math.round(net));
    }
    /* 7. Carte terminée avec un solde encore dû */
    if (c.statut === 'active' && c.dateFin < t && tot.solde > 0) {
      add('important', 'fin-solde-' + c.id, nom + ' : carte finie, argent à rendre',
        'Il faut rendre ' + money(tot.solde) + ' au client.', href, Math.round(tot.solde));
    }
    /* 8. Carte clôturée avec un solde */
    if (c.statut !== 'active' && tot.solde > 0) {
      add('important', 'clos-solde-' + c.id, nom + ' : carte terminée, argent à rendre',
        'Il faut encore rendre ' + money(tot.solde) + ' au client.', href, Math.round(tot.solde));
    }
    /* 9. Dates incohérentes */
    if (c.dateFin < c.dateDebut) {
      add('critique', 'dates-' + c.id, nom + ' : dates à corriger', 'Le dernier jour est avant le premier jour.', href, c.dateDebut + c.dateFin);
    }
  });

  /* 11. Retraits dépassant le total encaissé */
  const retraitsBad = db.operations.filter(function (o) {
    return o.type === 'sortie' && o.categorie === 'retrait' && (!clientById(o.clientId) || !carteById(o.carteId));
  });
  if (retraitsBad.length) {
    add('important', 'retrait-orphelin', retraitsBad.length + ' argent rendu sans client',
      'Le client ou la carte a été supprimé.', '#/tresorerie', retraitsBad.length);
  }

  /* 12. Clôture de caisse avec écart */
  db.clotures.slice().sort(function (a, b) { return b.date.localeCompare(a.date); }).slice(0, 10).forEach(function (cl) {
    const ecart = Number(cl.ecart) || 0;
    if (ecart !== 0) {
      add(Math.abs(ecart) >= 5000 ? 'critique' : 'important', 'ecart-' + cl.date,
        'Argent pas juste le ' + fmtDate(cl.date, 'short'),
        (ecart < 0 ? 'Il manquait ' : 'Il y avait ') + money(Math.abs(ecart)) + (ecart < 0 ? ' de moins' : ' de plus') + ' que prévu.', '#/cloture', cl.date + ecart);
    }
  });
  /* 13. Jour précédent non clôturé */
  const hier = addDays(t, -1);
  if (!clotureOf(hier) && db.versements.some(function (v) { return v.date === hier && v.montant > 0; })) {
    add('info', 'non-cloture', 'Argent d’hier pas compté', 'Il y a eu des paiements hier, mais vous n’avez pas compté votre argent.', '#/cloture', hier);
  }

  /* 14. Clients à risque */
  const risque = db.clients.filter(function (c) { return c.actif !== false && clientRisk(c).niveau === 'risque'; });
  if (risque.length) {
    add('important', 'risque', risque.length + ' client(s) à appeler',
      'Rien payé depuis plusieurs jours : ' + risque.slice(0, 3).map(function (c) { return c.nom; }).join(', ') + (risque.length > 3 ? '…' : '') + '.', '#/risques', risque.length);
  }

  /* 14 bis. Carte clôturée qui doit encore une avance d'argent */
  const avancesBloquees = db.cartes.filter(function (c) { return (c.statut !== 'active' || todayISO() > c.dateFin) && cardTotals(c).resteARembourser > 0; });
  if (avancesBloquees.length) {
    const c0 = avancesBloquees[0];
    add('important', 'avance-cloturee', avancesBloquees.length + ' prêt(s) sur une carte terminée',
      'Le client doit encore rembourser. Page du client, bouton +, « Rembourser le prêt ».', '#/client/' + c0.clientId, avancesBloquees.length);
  }

  /* 15. Reçus altérés */
  const badRec = db.recus.filter(function (r) { return !receiptValid(r); });
  if (badRec.length) {
    add('critique', 'recu-code', badRec.length + ' reçu(s) modifié(s)',
      'Ces reçus ont changé après leur création : ils ne servent plus de preuve.', '#/clients', badRec.length);
  }

  /* 16. Sauvegarde et stockage */
  if (storageInfo.persisted === false) {
    add('info', 'stockage', 'Données pas assez protégées', 'Mettez l’application sur l’écran d’accueil et allumez Internet de temps en temps.', '#/parametres', 1);
  }
  if (storageInfo.error) {
    add('critique', 'stockage-err', 'Erreur d’enregistrement', 'Le téléphone n’arrive pas à enregistrer. Gardez le réseau allumé pour que tout parte en ligne.', '#/parametres', storageInfo.error);
  }

  /* 17. Synchronisation */
  if (!syncCfg && db.clients.length) {
    add('important', 'sync-off', 'Données pas encore en ligne', 'Verrouillez, puis rouvrez avec Internet : tout partira en ligne.', '#/parametres', 1);
  }
  if (syncCfg) {
    if (syncState.status === 'error') {
      add('critique', 'sync-err', 'La sauvegarde en ligne a un problème', syncState.error || 'Erreur inconnue.', '#/parametres', syncState.error);
    }
    const last = syncCfg.lastOkAt;
    if (last && Date.now() - last > 3 * 86400000) {
      add('important', 'sync-vieux', 'Pas de sauvegarde en ligne depuis ' + Math.floor((Date.now() - last) / 86400000) + ' jours',
        'Les dernières modifications ne sont pas encore sauvegardées en ligne.', '#/parametres', Math.floor((Date.now() - last) / 86400000));
    }
    const pend = typeof countPending === 'function' ? countPending() : 0;
    if (pend > 0 && Date.now() - (last || 0) > 86400000) {
      add('info', 'sync-attente', pend + ' changement(s) pas encore envoyé(s)', 'Ils partiront quand le réseau revient.', '#/parametres', pend);
    }
    syncState.conflicts.slice(0, 5).forEach(function (cf) {
      add('important', 'conflit-' + cf.kind + cf.id, 'Deux téléphones ont changé le même client', 'Le plus récent a été gardé.', '#/parametres', cf.at);
    });
  }

  return out.sort(function (a, b) { return ALERT_SEV[b.sev] - ALERT_SEV[a.sev]; });
}

function alertAck() {
  db.settings.alertAck = db.settings.alertAck || {};
  return db.settings.alertAck;
}

function activeAlerts() {
  const ack = alertAck();
  return computeAlerts().filter(function (a) { return !ack[a.key]; });
}

function updateAlertBadge() {
  let n = 0;
  try { n = activeAlerts().length; } catch (err) { n = 0; }
  document.querySelectorAll('[data-alert-badge]').forEach(function (b) {
    b.textContent = n > 99 ? '99+' : String(n);
    b.hidden = n === 0;
  });
}

function viewAlertes() {
  const all = computeAlerts();
  const ack = alertAck();
  const actives = all.filter(function (a) { return !ack[a.key]; });
  const vues = all.filter(function (a) { return ack[a.key]; });
  const card = function (a, seen) {
    return '<div class="alert-item ' + a.sev + (seen ? ' seen' : '') + '">' +
      '<span class="alert-ic">' + icon(a.sev === 'critique' ? 'shield-alert' : a.sev === 'important' ? 'alert' : 'bell', 18) + '</span>' +
      '<div class="alert-main"><span class="alert-sev">' + ALERT_LABELS[a.sev] + '</span><strong>' + esc(a.title) + '</strong><p>' + esc(a.text) + '</p>' +
        '<div class="alert-actions">' +
          (a.href ? '<a class="btn sm primary" href="' + esc(a.href) + '">Voir</a>' : '') +
          (!seen ? '<button type="button" class="btn sm ghost" data-action="alert-ack" data-key="' + esc(a.key) + '">J’ai vu</button>' : '<button type="button" class="btn sm ghost" data-action="alert-unack" data-key="' + esc(a.key) + '">Remettre</button>') +
        '</div></div></div>';
  };
  return '<div class="page simple-page">' +
    '<h1 class="simple-title">Problèmes à vérifier</h1>' +
    (actives.length
      ? '<div class="alert-list">' + actives.map(function (a) { return card(a, false); }).join('') + '</div>'
      : '<div class="simple-done">✓ Tout va bien</div>') +
    (actives.length > 1 ? '<div class="inline-actions"><button type="button" class="btn ghost" data-action="alert-ack-all">J’ai tout vu</button></div>' : '') +
    (vues.length ? '<details class="simple-sec"><summary>Déjà vus (' + vues.length + ')</summary><div class="alert-list">' + vues.map(function (a) { return card(a, true); }).join('') + '</div></details>' : '') +
  '</div>';
}
