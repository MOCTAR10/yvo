# YVO Épargne

Application de collecte quotidienne et d'épargne **réservée à Yvo** : clients classés par quartier, cartes d'épargne, pointage jour par jour avec mode de paiement (espèces, Airtel Money, Moov Money), avances d'argent, trésorerie et reçus.

L'application marche **sans réseau** sur le téléphone. Dès que le réseau revient, tout part sur le serveur (PostgreSQL). Il n'y a pas de sauvegarde à gérer à la main.

---

## Version 3

- **Connexion premium** : « Bonjour / Bonsoir Yvo » et un mot de passe. Le serveur vérifie le mot de passe. Après une première connexion avec réseau, la connexion marche aussi hors réseau.
- **Profil prérempli** : Yvo, 077814766. Il n'y a pas d'écran de configuration.
- **Mode de paiement** à chaque pointage : Espèces, Airtel Money ou Moov Money (avec les vrais logos). La référence est facultative. On peut filtrer la trésorerie par mode, et la clôture affiche ce qui est arrivé sur Airtel et sur Moov.
- **Fiche client** : chaque carte est dessinée avec son calendrier. Un ✓ marque un jour pointé et un ✕ un jour non versé. La fiche a aussi les boutons Appeler / WhatsApp et « Encaisser aujourd'hui ».
- **Avance d'argent** : Yvo peut donner à un client plus que ce qu'il a cotisé. L'avance a des frais au choix (montant ou %) et un reçu. Le client rembourse par ses prochaines cotisations. Une alerte s'affiche si l'avance dépasse ce que la carte peut rembourser.
- **Données sur le serveur** : PostgreSQL. Les sauvegardes, imports et exports JSON ont été retirés ; les exports Excel restent.

---

## Lancer en local (sans Docker)

PostgreSQL tourne en arrière-plan, directement sur la machine, dans le dossier `.pgdata` (port 5442).

```bash
npm install
npm run db:start        # démarre PostgreSQL (à refaire après un redémarrage du PC)
YVO_PASSWORD=... npm start   # premier démarrage : crée le compte « yvo »
```

Ouvrir ensuite http://localhost:8080. Pour arrêter la base : `npm run db:stop`.

- Variables : `DATABASE_URL` (défaut `postgres://yvo:yvo@localhost:5442/yvo`), `PORT` (8080), `YVO_PASSWORD` (lu seulement quand le compte n'existe pas encore, 6 caractères au minimum).
- Changer le mot de passe (cela déconnecte tous les appareils) : `npm run set-password -- <nouveau-mot-de-passe>`.

## Tests de non-régression

```bash
npm run check   # syntaxe
npm test        # Playwright : mobile (Pixel 7) + ordinateur
```

Les tests utilisent la base `yvo_test` (ou `TEST_DATABASE_URL`), remise à zéro à chaque lancement. GitHub Actions lance les mêmes tests à chaque envoi (`.github/workflows/tests.yml`).

## Déploiement (VPS)

`cp .env.example .env`, remplir les valeurs, puis `docker compose up -d --build`. Mettre un reverse proxy HTTPS (Caddy ou Nginx) devant, et ne pas exposer le port 8080 directement : le serveur fait confiance à l'en-tête `X-Forwarded-For` posé par le proxy.

---

## Calculs utilisés

| Élément | Formule |
|---|---|
| Objectif d'une carte | `montant journalier × nombre de jours (dates incluses)` |
| Total cotisé | Somme des versements enregistrés |
| Reste à cotiser | `max(0, objectif − total cotisé)` |
| Retard à ce jour | `max(0, jours écoulés × journalier − total cotisé)` |
| Solde de la carte | `total cotisé − commissions − retiré − avances − frais d'avance` |
| Reste à rembourser | partie négative du solde (le client doit encore) |
| Caisse | `fonds initial + toutes les entrées − toutes les sorties` |

Un jour « absent » compte comme pointé avec `0` versé. Un jour passé sans pointage s'affiche « non versé » mais n'est pas compté comme une absence.

---

## Structure du projet

```
yvo/
├─ index.html, styles.css, sw.js, manifest.webmanifest, icônes
├─ img/                       Logos Airtel Money / Moov Money
├─ js/
│  ├─ core.js                 Modèle de données, dates, calculs, démo
│  ├─ components.js           Icônes, composants, reçus
│  ├─ views-*.js              Écrans (accueil, clients, caisse, plus)
│  ├─ modals*.js              Formulaires (pointage, paiement…)
│  ├─ avances.js              Avances d'argent
│  ├─ recus.js, alertes.js    Reçus numérotés, alertes
│  ├─ sync.js                 Synchronisation avec le serveur
│  └─ app.js                  Démarrage, connexion, navigation
├─ server/                    Serveur Node 22 + PostgreSQL
└─ tests/                     Tests Playwright
```

## Notes techniques

- Pas d'étape de build, scripts classiques.
- Hors réseau : IndexedDB + service worker. Les changements attendent puis partent seuls au serveur.
- Reçus numérotés avec code de contrôle ; page publique de vérification `/r/<jeton>`.
