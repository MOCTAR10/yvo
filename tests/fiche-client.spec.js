// Fiche client : en-tête, calendrier par carte, derniers versements.
const { test, expect } = require('@playwright/test');
const { openApp, goto } = require('./helpers');

/* Client de la démo avec une carte en cours aujourd'hui. */
async function openFiche(page) {
  const errors = await openApp(page);
  const info = await page.evaluate(() => {
    const c = dueCards(todayISO())[0];
    return { client: c.clientId, carte: c.id, nom: clientById(c.clientId).nom };
  });
  await goto(page, 'client/' + info.client);
  await expect(page.locator('.fc-hero')).toBeVisible();
  return { errors, info };
}

/* Calendrier de la carte en cours (une fiche peut en avoir plusieurs). */
function calOf(page, carteId) {
  return page.locator('#carte-' + carteId + ' .fc-cal');
}

test('la fiche s’affiche avec les 3 chiffres clés et sans erreur', async ({ page }) => {
  const { errors, info } = await openFiche(page);
  await expect(page.locator('.fc-hero h1')).toHaveText(info.nom);
  await expect(page.locator('.fc-figs .fc-fig')).toHaveCount(3);
  await expect(page.locator('.fc-figs')).toContainText('Total cotisé');
  await expect(page.locator('.fc-figs')).toContainText('Retard');
  await expect(page.locator('.fc-progress').first()).toContainText('Jour ');
  expect(errors).toEqual([]);
});

test('le bouton Appeler ouvre le téléphone', async ({ page }) => {
  await openFiche(page);
  const call = page.locator('.fc-contact a.contact-btn.call');
  await expect(call).toContainText('Appeler');
  expect(await call.getAttribute('href')).toMatch(/^tel:\+?\d{6,}$/);
  await expect(page.locator('.fc-contact a.contact-btn.wa')).toHaveAttribute('href', /^https:\/\/wa\.me\//);
});

test('le calendrier montre le mois en cours, en français, du lundi au dimanche', async ({ page }) => {
  const { info } = await openFiche(page);
  const cal = calOf(page, info.carte);
  const month = await page.evaluate(() => monthKeyOf(todayISO()));
  await expect(cal).toHaveAttribute('data-month', month);
  await expect(cal.locator('.cal-weekdays span')).toHaveText(['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']);
  await expect(cal.locator('.cal-title strong')).toHaveText(await page.evaluate(m => monthLabel(m), month));
  await expect(cal.locator('.cal-day.today')).toHaveCount(1);
  await expect(cal.locator('.fc-cal-sum')).toContainText(/Ce mois : \d+ jours? payés? sur \d+/);
  await expect(cal.locator('.fc-legend')).toContainText('Pas payé');
});

test('chaque jour a la couleur de son versement', async ({ page }) => {
  const { info } = await openFiche(page);
  await expect(calOf(page, info.carte).locator('.cal-day').first()).toBeVisible();
  const wrong = await page.evaluate(id => {
    const carte = carteById(id);
    const t = todayISO();
    const cover = coverageMap(carte);
    const bad = [];
    document.querySelectorAll('#carte-' + id + ' .fc-cal .cal-day').forEach(el => {
      const d = el.getAttribute('data-date');
      const v = versementFor(id, d);
      const inPeriod = d >= carte.dateDebut && d <= carte.dateFin;
      let want;
      if (!inPeriod) want = 'out';
      else if (v && v.montant > 0) want = v.statut;
      else if (cover[d]) want = 'covered';
      else if (v) want = 'absent';
      else want = d < t ? 'missed' : 'future';
      if (!el.classList.contains(want)) bad.push(d + ' attendu ' + want + ' / ' + el.className);
      if (v && v.montant > 0 && !el.querySelector('.damt')) bad.push(d + ' sans montant');
    });
    return bad;
  }, info.carte);
  expect(wrong).toEqual([]);
});

test('navigation mois précédent / suivant', async ({ page }) => {
  const { info } = await openFiche(page);
  const cal = () => calOf(page, info.carte);
  const month = await page.evaluate(() => monthKeyOf(todayISO()));
  const prev = await page.evaluate(m => shiftMonth(m, -1), month);
  const next = await page.evaluate(m => shiftMonth(m, 1), month);
  await cal().locator('[data-action="cal-prev"]').click();
  await expect(cal()).toHaveAttribute('data-month', prev);
  await expect(cal().locator('.fc-cal-today')).toBeVisible();
  await cal().locator('[data-action="cal-next"]').click();
  await cal().locator('[data-action="cal-next"]').click();
  await expect(cal()).toHaveAttribute('data-month', next);
  await cal().locator('.fc-cal-today').click();
  await expect(cal()).toHaveAttribute('data-month', month);
});

test('toucher un jour passé ouvre le détail du jour', async ({ page }) => {
  const { info, errors } = await openFiche(page);
  const t = await page.evaluate(() => todayISO());
  const days = calOf(page, info.carte).locator('.cal-day[data-action="open-day"]');
  const dates = await days.evaluateAll(els => els.map(e => e.getAttribute('data-date')));
  let target = dates.filter(d => d < t).pop();
  if (!target) {
    await calOf(page, info.carte).locator('[data-action="cal-prev"]').click();
    target = await calOf(page, info.carte).locator('.cal-day[data-action="open-day"]').last().getAttribute('data-date');
  }
  await calOf(page, info.carte).locator('.cal-day[data-date="' + target + '"]').click();
  await expect(page.locator('.modal #form-day')).toBeVisible();
  await expect(page.locator('.modal #form-day input[name="date"]')).toHaveValue(target);
  expect(errors).toEqual([]);
});

test('un jour payé par Airtel porte le logo Airtel, aussi dans les derniers versements', async ({ page }) => {
  const { info, errors } = await openFiche(page);
  const t = await page.evaluate(id => {
    const c = carteById(id);
    const d = todayISO();
    db.versements = db.versements.filter(v => !(v.carteId === id && v.date === d));
    const j = Number(c.montantJournalier);
    db.versements.push({ id: uid('v'), carteId: id, clientId: c.clientId, date: d, statut: 'complet', montant: j, note: '',
      historique: [{ montant: j, at: new Date().toISOString(), mode: 'airtel', ref: 'AIR-TEST-1' }],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    rerender();
    return d;
  }, info.carte);
  const day = calOf(page, info.carte).locator('.cal-day[data-date="' + t + '"]');
  await expect(day).toHaveClass(/paid-airtel/);
  await expect(day.locator('.mm-airtel img')).toHaveAttribute('src', /airtel/);
  await expect(calOf(page, info.carte).locator('.fc-legend-mm')).toBeVisible();

  const first = page.locator('.fc-recent .fc-pay').first();
  await expect(first).toHaveClass(/mode-airtel/);
  await expect(first.locator('img.mode-logo')).toHaveAttribute('src', /airtel-money\.png/);
  await expect(first).toContainText('AIR-TEST-1');
  expect(await page.locator('.fc-recent .fc-pay').count()).toBeLessThanOrEqual(10);
  await expect(page.locator('.fc-figs .fc-fig-today')).toContainText(/Déjà payé|Reçu/);
  expect(errors).toEqual([]);
});

test('« Encaisser aujourd’hui » ouvre la feuille d’encaissement', async ({ page }) => {
  const { info, errors } = await openFiche(page);
  const btn = page.locator('.fc-pay-btn');
  await expect(btn).toHaveText(/Encaisser aujourd’hui/);
  const box = await btn.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  await btn.click();
  await expect(page.locator('.modal.pay-sheet #form-pay')).toBeVisible();
  await expect(page.locator('.modal.pay-sheet')).toContainText(info.nom);
  expect(errors).toEqual([]);
});

test('chaque carte est dessinée avec son montant par jour et son propre calendrier', async ({ page }) => {
  const errors = await openApp(page);
  const info = await page.evaluate(() => {
    const t = todayISO();
    const c = db.clients.find(cl => cartesOf(cl.id).filter(x => dueOn(x, t)).length >= 2);
    const cards = cartesOf(c.id).sort((a, b) => a.dateDebut.localeCompare(b.dateDebut));
    return { client: c.id, cards: cards.map(x => ({ id: x.id, label: x.label, jour: money(x.montantJournalier) + ' / jour' })) };
  });
  await goto(page, 'client/' + info.client);
  await expect(page.locator('.fc-card-panel .vcard.fc-card')).toHaveCount(info.cards.length);
  for (const c of info.cards) {
    const card = page.locator('#carte-' + c.id + ' .fc-card');
    await expect(card.locator('h3')).toHaveText(c.label);
    await expect(card.locator('.fc-card-daily')).toHaveText(c.jour);
    await expect(card.locator('.fc-cal')).toHaveCount(1);
    await expect(page.locator('#carte-' + c.id + ' [data-action="new-pret"]')).toContainText('Avance d’argent');
  }
  // chaque carte change de mois sans toucher l'autre
  const [a, b] = info.cards;
  const month = await page.evaluate(() => monthKeyOf(todayISO()));
  await page.locator('#carte-' + a.id + ' [data-action="cal-prev"]').click();
  await expect(page.locator('#carte-' + a.id + ' .fc-cal')).toHaveAttribute('data-month', await page.evaluate(m => shiftMonth(m, -1), month));
  await expect(page.locator('#carte-' + b.id + ' .fc-cal')).toHaveAttribute('data-month', month);
  expect(errors).toEqual([]);
});

test('chaque jour pointé porte un ✓ et les cases restent assez grandes', async ({ page }) => {
  const { info } = await openFiche(page);
  const res = await page.evaluate(id => {
    const bad = [];
    let minW = 999, minH = 999;
    document.querySelectorAll('#carte-' + id + ' .fc-cal .cal-day').forEach(el => {
      const d = el.getAttribute('data-date');
      const v = versementFor(id, d);
      const inPeriod = !el.disabled;
      const check = !!el.querySelector('.cal-check');
      if (!!(v && inPeriod) !== check) bad.push(d + (check ? ' ✓ en trop' : ' ✓ manquant'));
      const r = el.getBoundingClientRect();
      minW = Math.min(minW, r.width); minH = Math.min(minH, r.height);
    });
    return { bad, minW, minH };
  }, info.carte);
  expect(res.bad).toEqual([]);
  expect(res.minW).toBeGreaterThanOrEqual(36);
  expect(res.minH).toBeGreaterThanOrEqual(36);
  await expect(page.locator('#carte-' + info.carte + ' .cal-day.pointed.complet .cal-check').first()).toHaveText('✓');
  // un jour pointé « pas payé » porte une croix, pas une coche (lisible pour un débutant)
  const absent = page.locator('.cal-day.pointed.absent .cal-check');
  if (await absent.count()) await expect(absent.first()).toHaveText('✕');
});

test('la fiche ne déborde pas horizontalement', async ({ page }) => {
  await openFiche(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
