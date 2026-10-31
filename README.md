# YVO Épargne

Application web **hors ligne** pour gérer une activité de collecte quotidienne et d'épargne : clients classés par quartier, cartes d'épargne, pointage jour par jour, avances, trésorerie et accusés de réception imprimables.

Aucun compte, aucun serveur, aucune connexion internet : les données restent dans le navigateur de l'appareil.

---

## Nouveautés de la version 2.0

- **Zéro perte de données** : chaque action est enregistrée aussitôt (IndexedDB + copie localStorage), stockage « persistant » demandé au téléphone, **points de restauration automatiques** (40 conservés), **corbeille** pour tout ce qui est supprimé, import précédé d'une sauvegarde automatique. Un fichier de sauvegarde peut être envoyé par WhatsApp / Drive (bouton **Envoyer**).
- **Le client verse quand il peut** : pointage par client avec un montant libre ; le statut (complet / partiel / avance / non versé) se déduit du montant. Les jours payés d'avance sont affichés « couverts » dans le calendrier. Les versements du jour s'additionnent.
- **Journal d'activité** (page *Activité*) : toutes les actions, filtrables par période, type, client, quartier, texte ; export Excel.
- **Contrôle de l'argent** : retard et jours sans versement par client, niveaux *en retard / à relancer / à risque*, boutons Appeler et WhatsApp, vérification que la caisse couvre bien l'argent dû aux clients, paiement refusé si la caisse est insuffisante, doublons de numéro refusés, **clôture de caisse** quotidienne avec écart.
- **Interface Android** : barre d'application, barre de navigation basse (Accueil, Pointage, Clients, Caisse, Plus), feuilles qui montent du bas, bouton flottant, design premium, **cartes virtuelles** par carte d'épargne.
- Export **Excel (CSV)** des clients, versements, caisse et activité.

Les données de la version 1 sont migrées automatiquement au premier lancement.

---

## Démarrage rapide

1. Ouvrir le dossier `yvo`.
2. Double-cliquer sur `index.html`.
3. Choisir **Commencer à zéro** ou **Explorer la démonstration**.

L'application fonctionne directement depuis un fichier local. Pour l'installer comme application sur un téléphone ou un ordinateur, il faut la servir depuis une adresse `http://localhost` ou `https://` (par exemple un petit serveur local, ou un hébergement statique gratuit comme Netlify Drop ou GitHub Pages), puis utiliser « Ajouter à l'écran d'accueil » ou l'option d'installation du navigateur. Sur téléphone, l'installation PWA nécessite HTTPS (hors `localhost`).

> Le service worker (mode hors ligne renforcé) ne s'active que dans ce contexte HTTP/HTTPS. En ouverture directe par double-clic, l'application reste malgré tout entièrement fonctionnelle. Une fois installée et chargée, elle fonctionne sans internet.

> Important : les données sont liées au navigateur **et** à l'adresse d'ouverture. Si vous passez de `file://` à une adresse HTTP/HTTPS, exportez d'abord une sauvegarde JSON puis réimportez-la dans la version installée.

---

## Fonctionnalités

### Clients
- Fiche complète : nom, téléphone(s), quartier, adresse, profession, pièce d'identité, date d'inscription, notes, statut actif/inactif.
- Regroupement automatique par quartier.
- Recherche et filtres par quartier ou statut.
- Suppression avec confirmation (cartes, pointages et reçus liés).

### Cartes d'épargne
- Plusieurs cartes par client.
- Montant journalier, date de début, date de fin, objectif calculé.
- Calendrier mensuel interactif : chaque jour est coloré selon le statut.
- **Vert** : versement complet.
- **Orange** : avance / paiement partiel.
- **Rouge** : jour non versé.
- **Pointillés rouges** : jour passé sans pointage.
- **Gris** : jour à venir.
- Clic sur un jour pour pointer, corriger ou effacer.

### Pointage quotidien
- Écran dédié au jour, avec filtre par quartier et recherche.
- Trois actions rapides par carte : **Complet**, **Avance**, **Absent**.
- Modifier le montant exact d'une avance et ajouter une note.
- Progression, montant attendu, encaissé et reste à encaisser.

### Paiement et reçus
- Bouton **Payer** depuis une carte ou la fiche client.
- Calcul du solde dû : total cotisé − total déjà retiré.
- Reçu numéroté `REC-ANNÉE-0001`, avec entreprise, client, carte, période, montant payé et solde restant.
- Impression via la boîte de dialogue du navigateur (format A4).
- Les reçus restent consultables dans l'historique du client et de la trésorerie.

### Trésorerie
- Caisse disponible = fonds de départ + entrées − sorties.
- Chaque versement, retrait, apport, dépense ou prélèvement met immédiatement les totaux à jour.
- Totaux du jour, du mois et de l'année.
- Journal filtrable par période et par type.
- Possibilité de supprimer une opération (avec confirmation).

### Multi-cartes
- Vue dédiée aux clients ayant au moins deux cartes.
- Filtre **Sans retrait** par défaut.
- Cumul du journalier, de l'objectif, des cotisations, des retraits et du solde dû.
- Détail carte par carte.

### Paramètres et sécurité
- Informations entreprise / responsable / coordonnées utilisées sur les reçus.
- Devise et fonds de caisse initial.
- Montant total manipulé, entrées/sorties cumulées et solde dû aux clients.
- Code PIN local (4 à 8 chiffres) et verrouillage automatique après inactivité.
- Export de sauvegarde JSON et import.
- Réinitialisation complète avec confirmation par saisie de `EFFACER`.

---

## Calculs utilisés

| Élément | Formule |
|---|---|
| Objectif d'une carte | `montant journalier × nombre de jours (dates incluses)` |
| Total cotisé | Somme des versements enregistrés |
| Avances | Somme des versements au statut « avance » |
| Reste à cotiser | `max(0, objectif − total cotisé)` |
| Retard à ce jour | `max(0, jours écoulés × journalier − total cotisé)` |
| Retiré | Somme des opérations de type retrait liées à la carte |
| Solde dû | `max(0, total cotisé − total retiré)` |
| Caisse | `fonds initial + toutes les entrées − toutes les sorties` |
| Montant total manipulé | `fonds initial + total des entrées` |

Un jour au statut « absent » compte comme un jour pointé mais avec `0` versé. Un jour passé sans aucun pointage est affiché en pointillés rouges (« non versé ») mais n'est pas compté comme une absence explicite.

---

## Sauvegarde et limites

- Les données sont stockées dans le `localStorage` du navigateur, sous la clé `yvo.epargne.db.v1`.
- **Le code PIN est une protection locale simple, pas un chiffrement.** Il empêche une ouverture accidentelle, mais une personne ayant accès aux fichiers du navigateur peut lire les données.
- Faire un export JSON régulier (bouton **Exporter** dans les paramètres) et conserver le fichier ailleurs.
- Changer de navigateur, vider les données de navigation ou réinstaller le système peut supprimer les données. L'import JSON permet de les restaurer.
- Un seul appareil / navigateur à la fois : il n'y a pas de synchronisation entre plusieurs téléphones.
- L'impression du reçu dépend des réglages d'impression du navigateur.

---

## Structure du projet

```
yvo/
├─ index.html                 Coquille de l'application
├─ styles.css                 Design complet (desktop & mobile)
├─ manifest.webmanifest       Métadonnées d'installation
├─ sw.js                      Service worker hors ligne
├─ icon.svg                   Icône vectorielle
├─ icon-192.png               Icône PWA 192 px
├─ icon-512.png               Icône PWA 512 px
├─ apple-touch-icon.png       Icône iOS 180 px
├─ README.md
└─ js/
   ├─ core.js                 Modèle de données, dates, calculs, démo
   ├─ components.js           Icônes, composants, modales, reçus
   ├─ views-dashboard.js      Tableau de bord et pointage
   ├─ views-clients.js        Liste clients, fiche client, calendrier
   ├─ views-cash.js           Multi-cartes, trésorerie, paramètres
   ├─ modals.js               Formulaires et confirmations
   └─ app.js                  Démarrage, navigation, événements
```

---

## Personnalisation

- **Devise** : modifiable dans les paramètres (`FCFA` par défaut).
- **Couleurs** : variables CSS en haut de `styles.css` (`--brand`, `--green`, `--amber`, `--red`, etc.).
- **Entreprise** : les informations des paramètres apparaissent automatiquement sur les reçus.
- **Démo** : les données fictives sont générées dans `buildDemoDB()` (`js/core.js`).

---

## Notes techniques

- Application statique sans dépendance ni étape de build.
- Scripts classiques (pas de modules ES) pour fonctionner en `file://`.
- Compatible avec les navigateurs modernes (Chrome, Edge, Firefox, Safari récents).
- Les montants sont arrondis à l'unité lors de la saisie.
- Version : `2.0.0`. Une copie de la version 1 est dans `C:\dev\yvo-v1-backup`.

## v2.1 — synchronisation, reçus, commissions, alertes

- **Serveur** (`server/server.js`, Node 22 + PostgreSQL via `pg`) : `npm start`. Un seul compte, « yvo ». Variables : `DATABASE_URL` (défaut `postgres://yvo:yvo@localhost:5442/yvo`), `PORT` (8080), `YVO_PASSWORD` (lu uniquement au premier démarrage pour créer le compte). Changer le mot de passe (déconnecte tous les appareils) : `npm run set-password -- <nouveau-mot-de-passe>`. VPS : `cp .env.example .env` puis `docker compose up -d --build`. Tests : base `yvo_test` (ou `TEST_DATABASE_URL`), remise à zéro à chaque lancement.
- **Synchronisation** : écran « Synchronisation » (connexion / création d'espace, appareils, audit). Hors ligne, les modifications attendent puis partent seules.
- **Reçus** : un reçu numéroté avec code de contrôle à chaque versement ; page publique de vérification `/r/<jeton>`.
- **Commissions** : barèmes configurables (par versement, par période, à la clôture ; %, fixe, jours), figés sur chaque carte.
- **Alertes** : cloche en haut ; détection d'incohérences (caisse, soldes, doublons, dates, synchro, reçus).
