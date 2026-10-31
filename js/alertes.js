'use strict';

/* ============================================================
   YVO Épargne — centre d'alertes
   Détecte les incohérences et les problèmes de logique, sans
   rien stocker : les alertes sont recalculées à partir des
   données. « Vu » est mémorisé (par signature) : une alerte vue
   réapparaît si la situation change.
   ============================================================ */

const ALERT_SEV = { critique: 3, important: 2, info: 1 };
const ALERT_LABELS = { critique: 'Critique', important: 'À vérifier', info: 'Information' };

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
    add('critique', 'caisse-dette', 'La caisse ne couvre pas l’argent des clients',
      'Il manque ' + money(-cov) + ' : la caisse (' + money(cashBalance()) + ') est inférieure au total dû aux clients (' + money(fundsOwed()) + ').', '#/tresorerie', Math.round(-cov));
  }
  if (cashBalance() < 0) {
    add('critique', 'caisse-neg', 'Caisse négative', 'La caisse affiche ' + money(cashBalance()) + '. Une sortie a dépassé les entrées.', '#/tresorerie', Math.round(cashBalance()));
  }

  /* 2. Doublons de versement (même carte, même jour) */
  const seen = {};
  db.versements.forEach(function (v) {
    const k = v.carteId + '|' + v.date;
    seen[k] = (seen[k] || 0) + 1;
  });
  const dups = Object.keys(seen).filter(function (k) { return seen[k] > 1; });
  if (dups.length) {
    add('important', 'doublon', dups.length + ' jour(s) pointé(s) en double',
      'Une même carte a plusieurs lignes le même jour. La synchronisation les additionne ; vérifiez les montants.', '#/activite', dups.length);
  }

  /* 3. Orphelins : versements ou opérations vers une carte/un client inexistant */
  const orphV = db.versements.filter(function (v) { return !carteById(v.carteId) || !clientById(v.clientId); });
  if (orphV.length) {
    add('critique', 'orphelin', orphV.length + ' versement(s) sans carte ou client',
      'Ces versements comptent dans la caisse mais ne sont rattachés à aucune fiche. Restaurez la fiche depuis la Corbeille.', '#/corbeille', orphV.length);
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
      add('important', 'hors-periode-' + c.id, nom + ' : versement hors période',
        hors.length + ' versement(s) datent d’avant le début ou d’après la fin de la carte.', href, hors.length);
    }
    /* 5. Versements futurs */
    const futur = versementsOf(c.id).filter(function (v) { return v.montant > 0 && v.date > t; });
    if (futur.length) {
      add('important', 'futur-' + c.id, nom + ' : versement daté dans le futur',
        'Un versement porte une date postérieure à aujourd’hui. Vérifiez la date saisie.', href, futur.length);
    }
    /* 6. Solde négatif / retraits supérieurs aux versements */
    const net = tot.totalVerse - (tot.commission || 0) - tot.totalRetire;
    if (net < -0.5) {
      add('critique', 'solde-neg-' + c.id, nom + ' : retraits supérieurs aux versements',
        'Il a été retiré ' + money(-net) + ' de plus que ce que le client a versé (commission comprise).', href, Math.round(net));
    }
    /* 7. Carte terminée avec un solde encore dû */
    if (c.statut === 'active' && c.dateFin < t && tot.solde > 0) {
      add('important', 'fin-solde-' + c.id, nom + ' : terminée, solde non payé',
        'La période est finie et ' + money(tot.solde) + ' reste dû au client. Faites le paiement et clôturez la carte.', href, Math.round(tot.solde));
    }
    /* 8. Carte clôturée avec un solde */
    if (c.statut !== 'active' && tot.solde > 0) {
      add('important', 'clos-solde-' + c.id, nom + ' : clôturée mais un solde reste',
        'Cette carte est clôturée alors que ' + money(tot.solde) + ' sont encore dus.', href, Math.round(tot.solde));
    }
    /* 9. Dates incohérentes */
    if (c.dateFin < c.dateDebut) {
      add('critique', 'dates-' + c.id, nom + ' : dates incohérentes', 'La date de fin précède la date de début.', href, c.dateDebut + c.dateFin);
    }
    /* 10. Commission supérieure aux versements */
    if (commissionActive() && tot.commission > tot.totalVerse + 0.5) {
      add('critique', 'comm-' + c.id, nom + ' : commission supérieure aux versements',
        'La commission (' + money(tot.commission) + ') dépasse ce que le client a versé. Revoyez le barème.', '#/commission', Math.round(tot.commission));
    }
  });

  /* 11. Retraits dépassant le total encaissé */
  const retraitsBad = db.operations.filter(function (o) {
    return o.type === 'sortie' && o.categorie === 'retrait' && (!clientById(o.clientId) || !carteById(o.carteId));
  });
  if (retraitsBad.length) {
    add('important', 'retrait-orphelin', retraitsBad.length + ' retrait(s) sans fiche',
      'Des paiements aux clients sont rattachés à une fiche supprimée.', '#/tresorerie', retraitsBad.length);
  }

  /* 12. Clôture de caisse avec écart */
  db.clotures.slice().sort(function (a, b) { return b.date.localeCompare(a.date); }).slice(0, 10).forEach(function (cl) {
    const ecart = Number(cl.ecart) || 0;
    if (ecart !== 0) {
      add(Math.abs(ecart) >= 5000 ? 'critique' : 'important', 'ecart-' + cl.date,
        'Écart de caisse le ' + fmtDate(cl.date, 'short'),
        (ecart < 0 ? 'Il manquait ' : 'Il y avait ') + money(Math.abs(ecart)) + (ecart < 0 ? ' de moins' : ' de plus') + ' que prévu à la clôture.', '#/cloture', cl.date + ecart);
    }
  });
  /* 13. Jour précédent non clôturé */
  const hier = addDays(t, -1);
  if (!clotureOf(hier) && db.versements.some(function (v) { return v.date === hier && v.montant > 0; })) {
    add('info', 'non-cloture', 'Journée d’hier non clôturée', 'Des versements ont été saisis hier mais la caisse n’a pas été comptée.', '#/cloture', hier);
  }

  /* 14. Clients à risque */
  const risque = db.clients.filter(function (c) { return c.actif !== false && clientRisk(c).level === 'risque'; });
  if (risque.length) {
    add('important', 'risque', risque.length + ' client(s) à risque',
      'Aucun versement depuis plusieurs jours : ' + risque.slice(0, 3).map(function (c) { return c.nom; }).join(', ') + (risque.length > 3 ? '…' : '') + '.', '#/risques', risque.length);
  }

  /* 15. Reçus altérés */
  const badRec = db.recus.filter(function (r) { return !receiptValid(r); });
  if (badRec.length) {
    add('critique', 'recu-code', badRec.length + ' reçu(s) dont le code ne correspond pas',
      'Le contenu de ces reçus a été modifié après leur émission : ils ne peuvent plus servir de preuve.', '#/recus', badRec.length);
  }

  /* 16. Sauvegarde et stockage */
  if (storageInfo.persisted === false) {
    add('info', 'stockage', 'Données pas assez protégées', 'Ajoutez l’application à l’écran d’accueil et activez la sauvegarde en ligne.', '#/parametres', 1);
  }
  if (storageInfo.error) {
    add('critique', 'stockage-err', 'Erreur d’enregistrement', 'La sauvegarde locale a échoué : ' + storageInfo.error + '. Gardez le réseau allumé pour que tout parte sur le serveur.', '#/parametres', storageInfo.error);
  }

  /* 17. Synchronisation */
  if (!syncCfg && db.clients.length) {
    add('important', 'sync-off', 'Données pas encore en ligne', 'Verrouillez puis reconnectez-vous avec Internet : vos données partiront sur le serveur.', '#/parametres', 1);
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
      add('info', 'sync-attente', pend + ' modification(s) en attente d’envoi', 'Elles partiront dès que la connexion revient.', '#/parametres', pend);
    }
    syncState.conflicts.slice(0, 5).forEach(function (cf) {
      add('important', 'conflit-' + cf.kind + cf.id, 'Deux appareils ont modifié la même fiche', 'La version la plus récente a été gardée. L’autre est conservée dans l’historique.', '#/parametres', cf.at);
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
          (!seen ? '<button type="button" class="btn sm ghost" data-action="alert-ack" data-key="' + esc(a.key) + '">J’ai vu</button>' : '<button type="button" class="btn sm ghost" data-action="alert-unack" data-key="' + esc(a.key) + '">Réactiver</button>') +
        '</div></div></div>';
  };
  const crit = actives.filter(function (a) { return a.sev === 'critique'; }).length;
  return '<div class="page">' +
    pageHead('Surveillance', 'Alertes', 'L’application vérifie vos chiffres en permanence et vous prévient s’il y a un problème.') +
    '<div class="mini-kpis">' +
      '<div class="mini-kpi"><span>À traiter</span><strong>' + actives.length + '</strong><em>' + (crit ? crit + ' critique(s)' : 'aucune critique') + '</em></div>' +
      '<div class="mini-kpi"><span>Déjà vues</span><strong>' + vues.length + '</strong><em>réapparaissent si ça change</em></div>' +
    '</div>' +
    (actives.length
      ? '<div class="alert-list">' + actives.map(function (a) { return card(a, false); }).join('') + '</div>'
      : '<div class="panel">' + emptyState('check-circle', 'Tout est cohérent', 'Aucune anomalie détectée. Vous serez prévenu ici dès qu’un problème apparaît.', '') + '</div>') +
    (actives.length ? '<div class="inline-actions"><button type="button" class="btn ghost" data-action="alert-ack-all">Tout marquer comme vu</button></div>' : '') +
    (vues.length ? '<h3 class="section-title">Déjà vues</h3><div class="alert-list">' + vues.map(function (a) { return card(a, true); }).join('') + '</div>' : '') +
  '</div>';
}
