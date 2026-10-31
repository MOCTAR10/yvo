// Outils partagés par les tests de non-régression.
const { expect } = require('@playwright/test');

const PASSWORD = process.env.YVO_PASSWORD;

/* Réponse de synchronisation neutre : garde chaque test isolé
   (tous les tests partagent le même compte Yvo sur le serveur de test). */
const NO_SYNC = { ok: true, seq: 0, more: false, applied: [], conflicts: [], changes: [], serverTime: 0 };

/* Connexion par l'écran « Bonjour Yvo ». */
async function login(page, password = PASSWORD) {
  if (!password) throw new Error('YVO_PASSWORD absent : définissez-le (secret GitHub en CI).');
  await page.goto('/');
  await page.fill('#unlock-pin', password);
  await page.click('.login-btn');
  await expect(page.locator('#app')).toBeVisible({ timeout: 15000 });
}

/* Ouvre l'application connectée, avec les données de démonstration par défaut. */
async function openApp(page, { demo = true, sync = false } = {}) {
  const errors = trackErrors(page);
  if (!sync) await page.route('**/api/sync', route => route.fulfill({ json: NO_SYNC }));
  await login(page);
  if (demo) await page.evaluate(() => { db = buildDemoDB(); saveDB(); rerender(); });
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

/* Attend que l'application soit installée pour le hors-ligne (service worker actif). */
async function waitOfflineReady(page) {
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => !!(r && r.active))),
    { timeout: 45000, message: 'le service worker ne s’est pas installé' }).toBe(true);
}

async function goto(page, route) {
  await page.evaluate(r => { location.hash = '#/' + r; }, route);
  await expect(page.locator('#view')).not.toBeEmpty();
}

module.exports = { PASSWORD, login, openApp, trackErrors, clientsToPoint, goto, waitOfflineReady };
