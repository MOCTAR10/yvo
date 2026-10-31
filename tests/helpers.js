// Outils partagés par les tests de non-régression.
const { expect } = require('@playwright/test');

/* Ouvre l'application déjà authentifiée (la connexion elle-même est testée dans login.spec.js). */
async function openApp(page, { demo = true } = {}) {
  const errors = trackErrors(page);
  await page.addInitScript(() => sessionStorage.setItem('yvo-acces', '1'));
  await page.goto('/');
  await expect(page.locator('#welcome')).toBeVisible();
  await page.click(demo ? '[data-action="welcome-demo"]' : '[data-action="welcome-empty"]');
  await expect(page.locator('#app')).toBeVisible();
  await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
  return errors;
}

/* Collecte les erreurs JavaScript de la page : un test doit finir sans aucune. */
function trackErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push('console: ' + m.text()); });
  return errors;
}

/* Clients de la démo encore à pointer aujourd'hui. */
function clientsToPoint(page) {
  return page.evaluate(() => pointageEntries(todayISO())
    .filter(e => !e.touched)
    .map(e => ({ id: e.client.id, nom: e.client.nom, card: e.cards[0].id, cards: e.cards.map(c => c.id) })));
}

async function goto(page, route) {
  await page.evaluate(r => { location.hash = '#/' + r; }, route);
  await expect(page.locator('#view')).not.toBeEmpty();
}

module.exports = { openApp, trackErrors, clientsToPoint, goto };
