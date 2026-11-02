'use strict';

/* ============================================================
   YVO Épargne — le bouton + : ce que Yvo peut faire sur cet écran
   ============================================================ */

function fabAction(label, attrs, danger) {
  return '<button type="button" class="fab-item' + (danger ? ' danger' : '') + '" ' + attrs + '>' + esc(label) + '</button>';
}

function fabItems() {
  const route = state.route || parseHash();
  if (route.name === 'tresorerie' || route.name === 'cloture') {
    return [
      fabAction('Entrée d’argent', 'data-action="new-operation" data-type="entree"'),
      fabAction('Sortie d’argent', 'data-action="new-operation" data-type="sortie"'),
      fabAction('Rendre l’argent à un client', 'data-action="new-retrait"'),
      fabAction('Compter mon argent', 'data-action="go" data-href="#/cloture"')
    ];
  }
  const client = route.name === 'client' ? clientById(route.id) : null;
  if (client) {
    const id = esc(client.id);
    const carte = selectedCard(client);
    const t = todayISO();
    const dueToday = client.actif !== false && carte && dueOn(carte, t);
    const resteJour = dueToday ? cardToday(carte, client).reste : 0;
    return [
      dueToday ? fabAction('Recevoir l’argent' + (resteJour > 0 ? ' · ' + money(resteJour) : ''), 'data-action="open-pay" data-client="' + id + '" data-carte="' + esc(carte.id) + '" data-date="' + esc(t) + '"') : '',
      clientTotals(client).solde > 0 ? fabAction('Rendre son argent', 'data-action="new-retrait" data-client="' + id + '"' + (carte ? ' data-carte="' + esc(carte.id) + '"' : '')) : '',
      carte && carte.statut === 'active' ? fabAction('Prêter de l’argent', 'data-action="new-pret" data-client="' + id + '" data-carte="' + esc(carte.id) + '"') : '',
      fabAction('Ajouter une carte', 'data-action="new-carte" data-client="' + id + '"'),
      carte ? fabAction('Changer cette carte', 'data-action="edit-carte" data-carte="' + esc(carte.id) + '"') : '',
      fabAction('Changer ses informations', 'data-action="edit-client" data-client="' + id + '"'),
      fabAction('Supprimer ce client', 'data-action="delete-client" data-client="' + id + '"', true)
    ];
  }
  return [
    fabAction('Ajouter un client', 'data-action="new-client"'),
    fabAction('Clients à appeler', 'data-action="go" data-href="#/risques"'),
    fabAction('Problèmes à vérifier', 'data-action="go" data-href="#/alertes"')
  ];
}

function openFabSheet() {
  openModal({
    cls: 'fab-sheet',
    title: 'Je veux…',
    body:
      '<div class="fab-list">' + fabItems().join('') + '</div>' +
      '<div class="fab-minor">' +
        '<button type="button" data-action="go" data-href="#/parametres">Réglages</button>' +
        '<button type="button" data-action="go" data-href="#/corbeille">Corbeille</button>' +
        '<button type="button" data-action="fab-lock">Verrouiller</button>' +
      '</div>'
  });
}

function fabHTML() {
  return '<button type="button" class="fab" data-action="open-fab" aria-label="Je veux…">' + icon('plus', 30) + '</button>';
}
