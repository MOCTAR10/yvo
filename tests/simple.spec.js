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
  await expect(page.locator('.fab-item')).toHaveText(['Entrée d’argent', 'Sortie d’argent', 'Rendre l’argent à un client', 'Compter mon argent']);
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
  await expect(page.locator('#form-client input:not([type="hidden"])')).toHaveCount(3);
  await expect(page.locator('#form-client .form-more')).toHaveCount(0);
  await page.fill('input[name="nom"]', 'Paul Obame');
  await page.fill('input[name="telephone"]', '062987654');
  await page.fill('input[name="quartier"]', 'Balise');
  await page.click('button[form="form-client"]');

  await expect(page.locator('.carte-picker')).toBeVisible();
  await expect(page.locator('.carte-tile').first()).toContainText('500');
  await page.locator('.carte-tile[data-montant="1000"]').click();

  await expect(page.locator('.modal')).toHaveCount(0);
  await expect(page.locator('.simple-cal')).toBeVisible();
  await page.click('.fab');
  await expect(page.locator('.fab-item', { hasText: 'Recevoir l’argent' })).toContainText('1 000');
  expect(await page.evaluate(() => db.clients[0].actif)).toBe(true);
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
  await page.locator('.duree-step[data-delta="1"]').click();
  await page.locator('.duree-step[data-delta="1"]').click();
  await expect(page.locator('.duree-n')).toHaveValue('3');
  await page.locator('.carte-tile[data-montant="2000"]').click();
  await expect(page.locator('.card-switch .chip')).toHaveCount(2);
  const c2 = await page.evaluate(() => db.cartes.at(-1));
  expect(c2).toMatchObject({ label: 'Carte 2', montantJournalier: 2000 });
  expect(c2.dateFin).toBe(await page.evaluate(d => endAfterMonths(d, 3), c2.dateDebut));

  await page.click('.fab');
  await page.locator('.fab-item', { hasText: 'Ajouter une carte' }).click();
  await page.click('[data-action="carte-autre"]');
  await page.fill('input[name="montantJournalier"]', '750');
  await page.fill('.duree-n', '6');
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

test('durée souple : jours, semaines, mois, ans, et le dernier jour suit', async ({ page }) => {
  const errors = await openApp(page, { demo: false });
  const r = await page.evaluate(() => [
    endAfterDuree('2026-11-01', 10, 'jour'), endAfterDuree('2026-11-01', 2, 'semaine'), endAfterDuree('2026-11-01', 3, 'mois'), endAfterDuree('2026-11-01', 1, 'an'),
    dureeFromDates('2026-11-01', '2027-04-30'), dureeFromDates('2026-11-01', '2027-10-31'), dureeFromDates('2026-11-01', '2026-11-14'), dureeFromDates('2026-11-01', '2026-11-10'), dureeFromDates('2026-11-01', '2026-11-01')
  ]);
  expect(r).toEqual(['2026-11-10', '2026-11-14', '2027-01-31', '2027-10-31',
    { n: 6, unit: 'mois' }, { n: 1, unit: 'an' }, { n: 2, unit: 'semaine' }, { n: 10, unit: 'jour' }, { n: 1, unit: 'jour' }]);

  const id = await page.evaluate(() => {
    const c = { id: 'c_d', nom: 'Awa', telephone: '077000000', quartier: 'Balise', actif: true };
    db.clients.push(c);
    db.cartes.push({ id: 'k_d', clientId: c.id, label: 'Carte 1', montantJournalier: 1000, dateDebut: '2026-11-01', dateFin: '2027-04-30', statut: 'active' });
    saveDB();
    return c.id;
  });
  await page.evaluate(i => openCarteModal(i, carteById('k_d')), id);
  // à l'ouverture la durée se lit, et rien ne change tout seul
  await expect(page.locator('.duree-n')).toHaveValue('6');
  await expect(page.locator('.duree-units .active')).toHaveText('Mois');
  await expect(page.locator('#carte-fin')).toHaveValue('2027-04-30');
  // la durée change le dernier jour
  await page.click('[data-unit="semaine"]');
  await page.fill('.duree-n', '2');
  await expect(page.locator('#carte-fin')).toHaveValue('2026-11-14');
  await expect(page.locator('.duree-fin')).toContainText('14 novembre 2026');
  // le premier jour décale le dernier
  await page.fill('#carte-debut', '2026-11-08');
  await page.locator('#carte-debut').blur();
  await expect(page.locator('#carte-fin')).toHaveValue('2026-11-21');
  // un dernier jour écrit à la main met à jour la durée
  await page.fill('#carte-fin', '2026-11-17');
  await page.locator('#carte-fin').blur();
  await expect(page.locator('.duree-n')).toHaveValue('10');
  await expect(page.locator('.duree-units .active')).toHaveText('Jours');
  await page.click('button[form="form-carte"]');
  expect(await page.evaluate(() => { const k = carteById('k_d'); return [k.dateDebut, k.dateFin]; })).toEqual(['2026-11-08', '2026-11-17']);
  expect(errors).toEqual([]);
});

test('nouvelle carte de 2 semaines par les tuiles, sans clavier qui s’ouvre', async ({ page }) => {
  const errors = await openApp(page, { demo: false });
  const id = await page.evaluate(() => { const c = { id: 'c_e', nom: 'Awa', telephone: '077000000', quartier: 'Balise', actif: true }; db.clients.push(c); saveDB(); return c.id; });
  await page.evaluate(i => openCartePicker(i), id);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => document.activeElement.tagName === 'INPUT')).toBe(false);
  await page.click('[data-unit="semaine"]');
  await page.locator('.duree-step[data-delta="1"]').click();
  await page.locator('.carte-tile[data-montant="1000"]').click();
  const r = await page.evaluate(() => { const k = db.cartes.at(-1); return [k.dateFin, addDays(k.dateDebut, 13)]; });
  expect(r[0]).toBe(r[1]);
  expect(errors).toEqual([]);
});

test('le filtre Quartier est toujours là, même avec un seul quartier', async ({ page }) => {
  const errors = await openApp(page, { demo: false });
  await goto(page, 'clients');
  await expect(page.locator('#client-quartier')).toBeVisible();
  await page.evaluate(() => {
    db.clients.push({ id: 'c_q1', nom: 'Awa', telephone: '077000000', quartier: 'Balise', actif: true }, { id: 'c_q2', nom: 'Jean', telephone: '077000001', quartier: ' Balise ', actif: true });
    saveDB(); rerender();
  });
  await expect(page.locator('#client-quartier option')).toHaveText(['Tous les quartiers', 'Balise']);
  await page.selectOption('#client-quartier', 'Balise');
  await expect(page.locator('.crow2')).toHaveCount(2);
  // un quartier qui n'existe plus ne laisse pas une liste vide
  await page.evaluate(() => { db.clients.forEach(c => { c.quartier = 'Matanda'; }); saveDB(); rerender(); });
  await expect(page.locator('.crow2')).toHaveCount(2);
  await expect(page.locator('#client-quartier')).toHaveValue('tous');
  expect(errors).toEqual([]);
});

test('aucune feuille n’a de bouton coupé sur le côté', async ({ page }) => {
  const errors = await openApp(page);
  const ids = await page.evaluate(() => {
    const k = dueCards(todayISO())[0];
    return { client: k.clientId, carte: k.id, riche: db.clients.find(c => clientTotals(c).solde > 0).id };
  });
  await goto(page, 'client/' + ids.client);
  const ouvertures = [
    i => openCarteModal(i.client, carteById(i.carte)),
    i => openCarteModal(i.client, null),
    i => openCarteModal(i.client, null, true),
    i => openClientModal(clientById(i.client)),
    i => openClientModal(),
    i => openPaySheet(i.client, todayISO(), i.carte),
    i => openDayModal(i.carte, todayISO()),
    i => openPretModal(i.client, i.carte),
    i => openRetraitModal({ clientId: i.riche }),
    () => openOperationModal('entree'),
    () => openOperationModal('sortie'),
    () => openFabSheet()
  ];
  for (const ouvrir of ouvertures) {
    await page.evaluate(ouvrir, ids);
    await expect(page.locator('.modal')).toBeVisible();
    await page.waitForTimeout(350);
    const coupes = await page.evaluate(() => [...document.querySelectorAll('.modal-foot > *, .modal-body button')]
      .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1); })
      .map(e => e.textContent.trim()));
    expect(coupes).toEqual([]);
    await page.evaluate(() => closeModal());
  }
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

test('sur téléphone, la barre du bas reste petite et facile à toucher', async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await openApp(page);
  const nav = await page.locator('.bottom-nav').boundingBox();
  const link = await page.locator('.bottom-link').first().boundingBox();
  expect(nav.height).toBeLessThanOrEqual(64);
  expect(link.height).toBeGreaterThanOrEqual(44);
  const fab = await page.locator('.fab').boundingBox();
  expect(fab.y + fab.height).toBeLessThanOrEqual(nav.y);
});

test('Clients à appeler : le numéro est écrit, sans bouton Appeler ni WhatsApp', async ({ page }) => {
  const errors = await openApp(page);
  await goto(page, 'risques');
  await expect(page.locator('.relance').first()).toBeVisible();
  const tel = await page.evaluate(() => db.clients.filter(c => c.actif !== false && clientStatus(c).doit > 0).sort((a, b) => clientStatus(b).doit - clientStatus(a).doit)[0].telephone);
  await expect(page.locator('.relance').first()).toContainText(tel);
  await expect(page.locator('#view a[href^="tel:"], #view a[href*="wa.me"]')).toHaveCount(0);
  await page.locator('.relance').first().click();
  await expect(page).toHaveURL(/#\/client\//);
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

test('sortie d’argent : deux réponses, et plus de choix « Pour moi »', async ({ page }) => {
  const errors = await openApp(page);
  await goto(page, 'tresorerie');
  await page.evaluate(() => openOperationModal('sortie'));
  await expect(page.locator('.modal')).toContainText('Sortie d’argent');
  await expect(page.locator('.simple-radio')).toHaveCount(0);
  await page.fill('#form-operation input[name="montant"]', '1000');
  await page.fill('#form-operation input[name="libelle"]', 'Transport');
  await page.click('button[form="form-operation"]');
  const op = await page.evaluate(() => db.operations.at(-1));
  expect(op).toMatchObject({ type: 'sortie', categorie: 'depense', libelle: 'Transport', montant: 1000 });
  expect(errors).toEqual([]);
});

test('entrée d’argent : un client qui paie est envoyé vers ses clients', async ({ page }) => {
  const errors = await openApp(page);
  await goto(page, 'tresorerie');
  await page.evaluate(() => openOperationModal('entree'));
  await expect(page.locator('.modal')).toContainText('Entrée d’argent');
  await page.locator('.modal-body [data-href="#/clients"]').click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await expect(page.locator('#client-quartier')).toBeVisible();
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
