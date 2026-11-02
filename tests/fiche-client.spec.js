// Page d'un client : le calendrier d'abord, un paiement en deux gestes.
const { test, expect } = require('@playwright/test');
const { openApp, goto } = require('./helpers');

/* Crée un client avec une carte de 1 000 F commencée il y a `jours` jours, sans aucun paiement. */
async function newClient(page, jours = 5, nom = 'Awa Test') {
  const info = await page.evaluate(([jours, nom]) => {
    const t = todayISO();
    const client = { id: 'c_' + Math.random().toString(36).slice(2), nom, telephone: '077000000', quartier: 'Balise', actif: true, dateInscription: t };
    db.clients.push(client);
    const carte = { id: 'k_' + Math.random().toString(36).slice(2), clientId: client.id, label: 'Carte 1', montantJournalier: 1000, dateDebut: addDays(t, -jours), dateFin: addDays(t, 60), statut: 'active' };
    db.cartes.push(carte);
    saveDB();
    return { client: client.id, carte: carte.id, t, hier: addDays(t, -1), debut: carte.dateDebut };
  }, [jours, nom]);
  return info;
}

const dayCell = (page, iso) => page.locator('.cal-day[data-date="' + iso + '"]');

test('le calendrier montre le mois en cours et seulement trois mots dans la légende', async ({ page }) => {
  const errors = await openApp(page);
  const info = await newClient(page);
  await goto(page, 'client/' + info.client);
  const cal = page.locator('.simple-cal');
  await expect(cal).toHaveAttribute('data-month', await page.evaluate(() => monthKeyOf(todayISO())));
  await expect(cal.locator('.cal-weekdays span')).toHaveText(['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']);
  await expect(cal.locator('.cal-day.today')).toHaveCount(1);
  await expect(cal.locator('.simple-legend span')).toHaveText(['Payé', 'Pas tout', 'Pas payé']);
  expect(errors).toEqual([]);
});

test('navigation mois d’avant / mois d’après', async ({ page }) => {
  await openApp(page);
  const info = await newClient(page);
  await goto(page, 'client/' + info.client);
  const month = await page.evaluate(() => monthKeyOf(todayISO()));
  await page.click('[data-action="cal-prev"]');
  await expect(page.locator('.simple-cal')).toHaveAttribute('data-month', await page.evaluate(m => shiftMonth(m, -1), month));
  await page.click('[data-action="cal-next"]');
  await expect(page.locator('.simple-cal')).toHaveAttribute('data-month', month);
});

test('toucher un jour rouge : le montant est écrit, Enregistrer, reçu créé, le jour devient vert', async ({ page }) => {
  const errors = await openApp(page);
  const info = await newClient(page, 2);
  await goto(page, 'client/' + info.client);
  // la veille peut être dans le mois d'avant
  if (await dayCell(page, info.hier).count() === 0) await page.click('[data-action="cal-prev"]');
  await expect(dayCell(page, info.hier)).toHaveClass(/d-impaye/);
  await dayCell(page, info.hier).click();
  await expect(page.locator('#pay-' + info.carte)).toHaveValue('1000');
  const before = await page.evaluate(() => db.recus.length);
  await page.click('button[form="form-pay"]');
  await expect(page.locator('.paid-ok')).toContainText('1 000');
  expect(await page.evaluate(() => db.recus.length)).toBe(before + 1);
  await page.click('.paid-sheet [data-action="close-modal"]');
  await expect(dayCell(page, info.hier)).toHaveClass(/d-paye/);
  expect(errors).toEqual([]);
});

test('toucher un jour déjà payé montre ce qui a été reçu, et Corriger reste possible', async ({ page }) => {
  await openApp(page);
  const info = await newClient(page);
  await page.evaluate(i => { payLines = []; addPayment(carteById(i.carte), i.t, 1000, '', 'airtel', ''); createReceipt(i.client, i.t, payLines, 'airtel', ''); saveDB(); }, info);
  await goto(page, 'client/' + info.client);
  await dayCell(page, info.t).click();
  await expect(page.locator('.simple-sheet')).toContainText('1 000');
  await expect(page.locator('.simple-sheet')).toContainText('Airtel');
  await expect(page.locator('.simple-sheet [data-action="open-recu"]')).toBeVisible();
  await page.click('.simple-sheet [data-action="open-day"]');
  await expect(page.locator('#form-day')).toBeVisible();
});

test('un jour à venir ne s’encaisse pas', async ({ page }) => {
  await openApp(page);
  const info = await newClient(page);
  const demain = await page.evaluate(() => addDays(todayISO(), 1));
  await goto(page, 'client/' + info.client);
  if (await dayCell(page, demain).count() === 0) await page.click('[data-action="cal-next"]');
  await dayCell(page, demain).click();
  await expect(page.locator('.toast').last()).toContainText('pas encore arrivé');
  await expect(page.locator('.modal')).toHaveCount(0);
});

test('payer double aujourd’hui efface le jour rouge d’hier', async ({ page }) => {
  await openApp(page);
  const info = await newClient(page, 1);
  await page.evaluate(i => { payLines = []; addPayment(carteById(i.carte), i.t, 2000, '', 'especes', ''); saveDB(); }, info);
  const r = await page.evaluate(i => {
    const c = carteById(i.carte);
    return { retard: cardTotals(c).retard, cover: coverageMap(c)[i.hier], kind: calDayInfo(c, i.hier, coverageMap(c), i.t).kind };
  }, info);
  expect(r).toEqual({ retard: 0, cover: 'covered', kind: 'paye' });
});

test('règle : quand le client ne doit plus rien, aucun jour passé n’est rouge', async ({ page }) => {
  await openApp(page);
  const info = await newClient(page, 6);
  const rouges = await page.evaluate(i => {
    const c = carteById(i.carte);
    payLines = [];
    addPayment(c, addDays(i.t, -5), 500, '', 'especes', '');
    addPayment(c, addDays(i.t, -2), 1000, '', 'especes', '');
    addPayment(c, i.t, 5500, '', 'especes', '');
    const cover = coverageMap(c);
    const out = [];
    for (let k = 6; k >= 1; k -= 1) {
      const d = addDays(i.t, -k);
      const kind = calDayInfo(c, d, cover, i.t).kind;
      if (kind !== 'paye') out.push(d + ':' + kind);
    }
    return { retard: cardTotals(c).retard, out };
  }, info);
  expect(rouges).toEqual({ retard: 0, out: [] });
});

test('« Doit » ne compte que les jours passés : ne pas encore avoir payé aujourd’hui n’est pas une dette', async ({ page }) => {
  await openApp(page);
  const info = await newClient(page, 0);
  await goto(page, 'clients');
  const r = await page.evaluate(id => clientStatus(clientById(id)), info.client);
  expect(r).toMatchObject({ doit: 0, reste: 1000 });
  await goto(page, 'client/' + info.client);
  await expect(page.locator('.simple-status')).toContainText('Ne doit rien');
  await expect(page.locator('.simple-big')).toContainText('Recevoir l’argent');
});

test('le gros bouton ouvre la feuille, et après paiement la page dit « Payé aujourd’hui »', async ({ page }) => {
  const errors = await openApp(page);
  const info = await newClient(page, 0);
  await goto(page, 'client/' + info.client);
  const btn = page.locator('.simple-big');
  expect((await btn.boundingBox()).height).toBeGreaterThanOrEqual(56);
  await btn.click();
  await page.locator('.mode-opt.mode-moov').click();
  await page.click('button[form="form-pay"]');
  await expect(page.locator('.paid-ok')).toContainText('Moov');
  await page.click('.paid-sheet [data-action="close-modal"]');
  await expect(page.locator('.simple-done')).toContainText('Payé aujourd’hui');
  expect(await page.evaluate(i => versementModes(versementFor(i, todayISO())).moov, info.carte)).toBe(1000);
  expect(errors).toEqual([]);
});

test('le choix de carte n’apparaît qu’à partir de deux cartes', async ({ page }) => {
  await openApp(page);
  const info = await newClient(page);
  await goto(page, 'client/' + info.client);
  await expect(page.locator('.card-switch')).toHaveCount(0);
  const deux = await page.evaluate(i => {
    const k = { id: 'k2_' + i.carte, clientId: i.client, label: 'Carte 2', montantJournalier: 500, dateDebut: i.t, dateFin: addDays(i.t, 40), statut: 'active' };
    db.cartes.push(k); saveDB(); rerender();
    return k.id;
  }, info);
  await expect(page.locator('.card-switch .chip')).toHaveCount(2);
  await page.click('.card-switch [data-carte="' + deux + '"]');
  await expect(page.locator('#carte-' + deux + ' .simple-cal')).toBeVisible();
  await expect(page.locator('.simple-cal')).toHaveCount(1);
});

test('une ancienne carte avec un type s’affiche toujours', async ({ page }) => {
  const errors = await openApp(page);
  const info = await newClient(page);
  await page.evaluate(id => { Object.assign(carteById(id), { typeId: 'ct-pro', typeNom: 'Pro', typeCouleur: 4 }); saveDB(); }, info.carte);
  await goto(page, 'client/' + info.client);
  await expect(page.locator('#carte-' + info.carte + ' .simple-cal')).toBeVisible();
  await expect(page.locator('#view')).not.toContainText('Pro');
  expect(errors).toEqual([]);
});

test('les détails restent fermés au départ et restent ouverts après un nouveau dessin', async ({ page }) => {
  await openApp(page);
  const info = await newClient(page);
  await goto(page, 'client/' + info.client);
  const sec = page.locator('details[data-sec="infos"]');
  await expect(sec).not.toHaveAttribute('open', '');
  await sec.locator('summary').click();
  await expect(sec).toContainText('077000000');
  await page.evaluate(() => rerender());
  await expect(page.locator('details[data-sec="infos"]')).toHaveAttribute('open', '');
});

test('le bouton Appeler ouvre le téléphone', async ({ page }) => {
  await openApp(page);
  const info = await newClient(page);
  await goto(page, 'client/' + info.client);
  await expect(page.locator('.simple-contact a.contact-btn.call')).toHaveAttribute('href', /^tel:/);
  await expect(page.locator('.simple-contact a.contact-btn.wa')).toHaveAttribute('href', /^https:\/\/wa\.me\//);
});

test('la page ne déborde pas sur les côtés', async ({ page }) => {
  await openApp(page);
  const info = await newClient(page, 5, 'Marie-Claire Mboumba Ndong de Port-Gentil');
  await goto(page, 'client/' + info.client);
  await expect(page.locator('.simple-cal')).toBeVisible();
  const r = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  expect(r[0]).toBeLessThanOrEqual(r[1]);
});
