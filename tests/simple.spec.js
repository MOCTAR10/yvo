// L'application simple : deux onglets, un bouton +, une liste qu'on filtre.
const { test, expect } = require('@playwright/test');
const { openApp, goto } = require('./helpers');

test('à l’ouverture : la liste des clients, et seulement Clients et Caisse dans la barre', async ({ page, isMobile }) => {
  const errors = await openApp(page);
  await expect(page).toHaveURL(/#\/clients/);
  await expect(page.locator('.crow2').first()).toBeVisible();
  const links = isMobile ? page.locator('.bottom-link') : page.locator('.nav-link');
  await expect(links).toHaveCount(2);
  await expect(links).toHaveText(['Clients', 'Caisse']);
  await expect(page.locator('[data-alert-badge]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('les anciennes adresses reviennent à la liste des clients', async ({ page }) => {
  const errors = await openApp(page);
  for (const r of ['tableau', 'pointage', 'plus', 'multi', 'activite', 'recus', 'commission']) {
    await goto(page, r);
    await expect(page.locator('#client-search')).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('filtres : tous, pas encore payé, doit de l’argent, quartier, recherche', async ({ page }) => {
  const errors = await openApp(page);
  const counts = await page.evaluate(() => {
    const st = db.clients.map(c => ({ c, s: clientStatus(c) }));
    return {
      tous: db.clients.length,
      apayer: st.filter(x => x.s.reste > 0).length,
      doit: st.filter(x => x.s.doit > 0 && x.c.actif !== false).length,
      quartier: db.clients[0].quartier,
      nQuartier: db.clients.filter(c => c.quartier === db.clients[0].quartier).length,
      nom: db.clients[0].nom
    };
  });
  await expect(page.locator('.crow2')).toHaveCount(counts.tous);
  await page.click('[data-etat="apayer"]');
  await expect(page.locator('.crow2')).toHaveCount(counts.apayer);
  await page.click('[data-etat="doit"]');
  await expect(page.locator('.crow2')).toHaveCount(counts.doit);
  await page.click('[data-etat="tous"]');
  await page.selectOption('#client-quartier', counts.quartier);
  await expect(page.locator('.crow2')).toHaveCount(counts.nQuartier);
  await page.selectOption('#client-quartier', 'tous');
  await page.fill('#client-search', counts.nom);
  await expect(page.locator('.crow2').first()).toContainText(counts.nom);
  await expect(page.locator('#client-search')).toBeFocused();
  expect(errors).toEqual([]);
});

test('toucher un client ouvre sa page', async ({ page }) => {
  const errors = await openApp(page);
  await page.locator('.crow2').first().click();
  await expect(page).toHaveURL(/#\/client\//);
  expect(errors).toEqual([]);
});

test('le bouton + change selon l’écran', async ({ page }) => {
  const errors = await openApp(page);
  await expect(page.locator('.fab')).toBeInViewport();
  await page.click('.fab');
  await expect(page.locator('.fab-item')).toHaveText(['Ajouter un client', 'Clients à appeler', 'Problèmes à vérifier']);
  await expect(page.locator('.fab-minor button')).toHaveText(['Réglages', 'Corbeille', 'Verrouiller']);
  await page.click('.fab-sheet [data-action="close-modal"]');

  await goto(page, 'tresorerie');
  await page.click('.fab');
  await expect(page.locator('.fab-item')).toHaveText(['J’ai reçu de l’argent', 'J’ai dépensé de l’argent', 'Rendre l’argent à un client', 'Compter mon argent']);
  await page.locator('.fab-item', { hasText: 'Compter mon argent' }).click();
  await expect(page).toHaveURL(/#\/cloture/);
  await expect(page.locator('#form-cloture')).toBeVisible();
  await expect(page.locator('.modal')).toHaveCount(0);

  const id = await page.evaluate(() => dueCards(todayISO())[0].clientId);
  await goto(page, 'client/' + id);
  await page.click('.fab');
  await expect(page.locator('.fab-item', { hasText: 'Recevoir l’argent' })).toBeVisible();
  await expect(page.locator('.fab-item', { hasText: 'Prêter de l’argent' })).toBeVisible();
  await expect(page.locator('.fab-item.danger')).toHaveText('Supprimer ce client');
  expect(errors).toEqual([]);
});

test('Verrouiller depuis le bouton +', async ({ page }) => {
  await openApp(page);
  await page.click('.fab');
  await page.click('[data-action="fab-lock"]');
  await expect(page.locator('.login-card')).toBeVisible();
});

test('ajouter un client : trois questions, une tuile touchée, le calendrier est prêt', async ({ page }) => {
  const errors = await openApp(page, { demo: false });
  await page.click('.fab');
  await page.locator('.fab-item', { hasText: 'Ajouter un client' }).click();
  await expect(page.locator('#form-client .form-more')).not.toHaveAttribute('open', '');
  await page.fill('input[name="nom"]', 'Paul Obame');
  await page.fill('input[name="telephone"]', '062987654');
  await page.fill('input[name="quartier"]', 'Balise');
  await page.click('button[form="form-client"]');

  await expect(page.locator('.carte-picker')).toBeVisible();
  await expect(page.locator('.carte-tile').first()).toContainText('500');
  await page.locator('.carte-tile[data-montant="1000"]').click();

  await expect(page.locator('.modal')).toHaveCount(0);
  await expect(page.locator('.simple-cal')).toBeVisible();
  await expect(page.locator('.simple-big')).toContainText('1 000');
  const carte = await page.evaluate(() => db.cartes[0]);
  expect(carte).toMatchObject({ label: 'Carte 1', montantJournalier: 1000, statut: 'active' });
  expect(carte.typeId).toBeUndefined();
  expect(carte.dateFin).toBe(await page.evaluate(d => endAfterMonths(d, 1), carte.dateDebut));
  expect(errors).toEqual([]);
});

test('une deuxième carte en deux touches, avec une autre durée et un autre montant', async ({ page }) => {
  const errors = await openApp(page, { demo: false });
  const id = await page.evaluate(() => {
    const c = { id: 'c_two', nom: 'Awa', telephone: '077000000', quartier: 'Balise', actif: true };
    db.clients.push(c); db.cartes.push({ id: 'k_one', clientId: c.id, label: 'Carte 1', montantJournalier: 1000, dateDebut: todayISO(), dateFin: addDays(todayISO(), 30), statut: 'active' }); saveDB();
    return c.id;
  });
  await goto(page, 'client/' + id);
  await page.click('.fab');
  await page.locator('.fab-item', { hasText: 'Ajouter une carte' }).click();
  await page.click('[data-action="picker-duree"][data-mois="3"]');
  await page.locator('.carte-tile[data-montant="2000"]').click();
  await expect(page.locator('.card-switch .chip')).toHaveCount(2);
  const c2 = await page.evaluate(() => db.cartes.at(-1));
  expect(c2).toMatchObject({ label: 'Carte 2', montantJournalier: 2000 });
  expect(c2.dateFin).toBe(await page.evaluate(d => endAfterMonths(d, 3), c2.dateDebut));

  await page.click('.fab');
  await page.locator('.fab-item', { hasText: 'Ajouter une carte' }).click();
  await page.click('[data-action="carte-autre"]');
  await page.fill('input[name="montantJournalier"]', '750');
  await page.click('[data-action="carte-duree"][data-mois="6"]');
  await page.click('button[form="form-carte"]');
  await expect(page.locator('.card-switch .chip')).toHaveCount(3);
  // le montant utilisé est proposé la fois suivante, sans réglage
  expect(await page.evaluate(() => carteAmounts())).toContain(750);
  expect(errors).toEqual([]);
});

test('les commissions n’existent plus : une ancienne carte garde tout son argent', async ({ page }) => {
  const errors = await openApp(page, { demo: false });
  const r = await page.evaluate(() => {
    db.settings.commission = { actif: true, baremes: [] };
    const k = { id: 'k_old', clientId: 'c_old', label: 'Carte 1', montantJournalier: 1000, dateDebut: todayISO(), dateFin: addDays(todayISO(), 30), statut: 'active', commission: { baremeId: 'b', nom: 'Ancien', regles: [{ mode: 'versement', calc: 'pct', valeur: 10 }] } };
    db.clients.push({ id: 'c_old', nom: 'Ancien', telephone: '077000000', quartier: 'Balise', actif: true });
    db.cartes.push(k);
    payLines = [];
    addPayment(k, todayISO(), 1000, '', 'especes', '');
    return cardTotals(k).solde;
  });
  expect(r).toBe(1000);
  expect(errors).toEqual([]);
});

test('durée d’une carte : le dernier jour tombe la veille, même en fin de mois', async ({ page }) => {
  await openApp(page, { demo: false });
  const r = await page.evaluate(() => [endAfterMonths('2026-11-01', 1), endAfterMonths('2026-01-15', 12), endAfterMonths('2026-11-30', 3)]);
  expect(r).toEqual(['2026-11-30', '2027-01-14', '2027-02-28']);
});

test('Changer une carte : terminer ou supprimer se fait dans sa fiche', async ({ page }) => {
  const errors = await openApp(page);
  const c = await page.evaluate(() => { const k = dueCards(todayISO())[0]; return { id: k.id, client: k.clientId }; });
  await goto(page, 'client/' + c.client);
  await page.click('.fab');
  await page.locator('.fab-item', { hasText: 'Changer cette carte' }).click();
  await expect(page.locator('#form-carte')).toBeVisible();
  await expect(page.locator('[data-action="toggle-carte"]')).toContainText('Terminer');
  await expect(page.locator('[data-action="delete-carte"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Clients à appeler : seulement ceux qui doivent de l’argent', async ({ page }) => {
  const errors = await openApp(page);
  const n = await page.evaluate(() => db.clients.filter(c => c.actif !== false && clientStatus(c).doit > 0).length);
  await goto(page, 'risques');
  await expect(page.locator('.relance')).toHaveCount(n);
  await expect(page.locator('.cover-card, .mini-kpi, .reliab')).toHaveCount(0);
  expect(errors).toEqual([]);
});

const MOTS_DURS = /trésorerie|pointage|pointé|barème|commission|solde dû|cotis|multi-cartes|portefeuille|versement|clôtur|écart|libellé|catégorie|encaissé|incohéren|solde non/i;

test('aucun mot compliqué, sur aucun écran', async ({ page }) => {
  await openApp(page);
  const id = await page.evaluate(() => dueCards(todayISO())[0].clientId);
  for (const r of ['clients', 'client/' + id, 'tresorerie', 'risques', 'cloture', 'alertes', 'parametres', 'corbeille']) {
    await goto(page, r);
    await expect(page.locator('#view')).not.toContainText(MOTS_DURS);
  }
});

test('aucun mot compliqué dans les formulaires d’argent', async ({ page }) => {
  await openApp(page);
  const id = await page.evaluate(() => dueCards(todayISO())[0].clientId);
  const ouvertures = [
    i => openPretModal(i),
    () => openOperationModal('entree'),
    () => openOperationModal('sortie'),
    i => openRetraitModal({ clientId: db.clients.find(c => clientTotals(c).solde > 0).id }),
    i => { const k = dueCards(todayISO()).find(c => c.clientId === i); openDayModal(k.id, todayISO()); }
  ];
  for (const ouvrir of ouvertures) {
    await page.evaluate(ouvrir, id);
    await expect(page.locator('.modal')).toBeVisible();
    await expect(page.locator('.modal')).not.toContainText(MOTS_DURS);
    await page.evaluate(() => closeModal());
  }
});

test('la caisse n’écrit jamais « −0 »', async ({ page }) => {
  const errors = await openApp(page, { demo: false });
  await goto(page, 'tresorerie');
  await expect(page.locator('#caisse-out')).not.toContainText('−');
  await expect(page.locator('#caisse-in')).not.toContainText('+');
  expect(errors).toEqual([]);
});

test('dépense : « Pour moi » est gardé à part', async ({ page }) => {
  const errors = await openApp(page);
  await goto(page, 'tresorerie');
  await page.evaluate(() => openOperationModal('sortie'));
  await page.fill('#form-operation input[name="montant"]', '1000');
  await page.fill('#form-operation input[name="libelle"]', 'Ma part');
  await page.locator('.simple-radio span', { hasText: 'Pour moi' }).click();
  await page.click('button[form="form-operation"]');
  const op = await page.evaluate(() => db.operations.at(-1));
  expect(op).toMatchObject({ categorie: 'prelevement', libelle: 'Ma part', montant: 1000, date: await page.evaluate(() => todayISO()) });
  expect(errors).toEqual([]);
});

test('compter mon argent : le résultat est dit avec des mots', async ({ page }) => {
  const errors = await openApp(page);
  await goto(page, 'cloture');
  const b = await page.evaluate(() => cashBalance());
  await page.fill('#cloture-compte', String(b - 500));
  await expect(page.locator('#cloture-ecart')).toContainText('Il manque 500');
  await page.fill('#cloture-compte', String(b + 500));
  await expect(page.locator('#cloture-ecart')).toContainText('en plus');
  await page.fill('#cloture-compte', String(b));
  await expect(page.locator('#cloture-ecart')).toContainText('C’est juste');
  expect(errors).toEqual([]);
});
