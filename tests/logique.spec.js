// Règles métier, testées directement dans le navigateur (mêmes fonctions que l'app).
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test.describe('Règles métier', () => {
  test.beforeEach(async ({ page }) => { await openApp(page); });

  test('statut déduit du montant', async ({ page }) => {
    const r = await page.evaluate(() => [statutFor(0, 1000), statutFor(500, 1000), statutFor(1000, 1000), statutFor(1500, 1000)]);
    expect(r).toEqual(['absent', 'partiel', 'complet', 'avance']);
  });

  test('SHA-256 conforme (vecteurs officiels)', async ({ page }) => {
    const r = await page.evaluate(() => [sha256(''), sha256('abc'), sha256('é')]);
    expect(r[0]).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(r[1]).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(r[2]).toBe(require('node:crypto').createHash('sha256').update('é').digest('hex'));
  });

  test('anciens versements sans mode = espèces', async ({ page }) => {
    const r = await page.evaluate(() => [
      versementModes({ montant: 1000, historique: [{ montant: 1000 }] }),
      versementModes({ montant: 800, historique: [] }),
      versementModes({ montant: 900, historique: [{ montant: 400, mode: 'airtel' }, { montant: 500, mode: 'inconnu' }] })
    ]);
    expect(r).toEqual([
      { especes: 1000, airtel: 0, moov: 0 },
      { especes: 800, airtel: 0, moov: 0 },
      { especes: 500, airtel: 400, moov: 0 }
    ]);
  });

  test('mode principal et libellés des opérations', async ({ page }) => {
    const r = await page.evaluate(() => ({
      main: [mainMode({ especes: 1, airtel: 0, moov: 0 }), mainMode({ especes: 0, airtel: 5, moov: 0 }), mainMode({ especes: 1, airtel: 0, moov: 2 }), mainMode({ especes: 0, airtel: 0, moov: 0 })],
      ops: ['Espèces', '', 'Airtel Money', 'Moov Money', 'Mobile Money', 'Chèque'].map(opModeKey)
    }));
    expect(r.main).toEqual(['especes', 'airtel', 'mixte', 'especes']);
    expect(r.ops).toEqual(['especes', 'especes', 'airtel', 'moov', 'mobile', 'autre']);
  });

  test('reçu : toute modification invalide le code de contrôle', async ({ page }) => {
    const r = await page.evaluate(() => {
      const c = db.clients[0];
      const rec = createReceipt(c.id, todayISO(), [{ carte: 'Carte 1', montant: 1000, statut: 'complet' }], 'airtel', 'X');
      const ok = receiptValid(rec);
      const tampered = Object.assign({}, rec, { total: 9000 });
      const tamperedLine = Object.assign({}, rec, { lignes: [{ carte: 'Carte 1', montant: 9000 }] });
      return [ok, receiptValid(tampered), receiptValid(tamperedLine), /^RV-\d{6}-[A-Z0-9]{4}$/.test(rec.numero)];
    });
    expect(r).toEqual([true, false, false, true]);
  });

  test('caisse = fonds de départ + entrées − sorties', async ({ page }) => {
    const r = await page.evaluate(() => {
      const all = cashTotals(null, null);
      return { balance: cashBalance(), expected: Number(db.settings.soldeInitial) + all.entrees - all.sorties };
    });
    expect(r.balance).toBe(r.expected);
  });

  test('versements du même jour sur deux appareils : additionnés, rien n’est perdu', async ({ page }) => {
    const r = await page.evaluate(() => {
      const carte = db.cartes.find(c => c.statut === 'active');
      const d = '2020-01-01';
      db.versements.push(
        { id: 'v_a', carteId: carte.id, clientId: carte.clientId, date: d, montant: 300, historique: [{ montant: 300, at: '2020-01-01T08:00:00Z', mode: 'airtel' }] },
        { id: 'v_b', carteId: carte.id, clientId: carte.clientId, date: d, montant: 200, historique: [{ montant: 200, at: '2020-01-01T09:00:00Z' }] }
      );
      dedupeVersements();
      const left = db.versements.filter(v => v.carteId === carte.id && v.date === d);
      return { n: left.length, montant: left[0].montant, modes: versementModes(left[0]) };
    });
    expect(r).toEqual({ n: 1, montant: 500, modes: { especes: 200, airtel: 300, moov: 0 } });
  });
});
