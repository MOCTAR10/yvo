'use strict';

/* Remet la base de test à zéro avant le démarrage du serveur de test.
   Lancé par la commande webServer de playwright.config.js (Playwright démarre
   webServer AVANT globalSetup : un globalSetup arriverait trop tard). */

const { Client } = require('pg');
const { TABLES } = require('../server/db.js');

const url = process.env.DATABASE_URL;
if (!url || !/test/i.test(url)) {
  console.error('✖ reset-db : DATABASE_URL doit désigner une base de test (contenant « test »). Rien n’a été effacé.');
  process.exit(1);
}

(async function () {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    await c.query('DROP TABLE IF EXISTS ' + TABLES.join(', ') + ' CASCADE');
    console.log('Base de test remise à zéro.');
  } finally {
    await c.end();
  }
}()).catch(function (e) {
  console.error('✖ reset-db : ' + e.message);
  process.exit(1);
});
