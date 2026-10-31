'use strict';

/* Change le mot de passe d'Yvo et déconnecte tous les appareils.
   Usage : node server/set-password.js <nouveau-mot-de-passe>
   (lit DATABASE_URL, comme le serveur) */

const { DATABASE_URL, createPool, ensureSchema, setPassword } = require('./db.js');

async function main() {
  const password = process.argv[2] || '';
  if (password.length < 6) {
    console.error('Usage : node server/set-password.js <nouveau-mot-de-passe>  (6 caractères minimum)');
    process.exit(1);
  }
  const pool = createPool();
  try {
    await ensureSchema(pool);
    const id = await setPassword(pool, password);
    const r = await pool.query('DELETE FROM sessions WHERE account_id = $1', [id]);
    console.log('✔ Mot de passe d’Yvo modifié. ' + r.rowCount + ' appareil(s) déconnecté(s) : il faudra se reconnecter.');
  } catch (e) {
    console.error('✖ Échec (' + DATABASE_URL.replace(/\/\/([^:@/]+):[^@/]*@/, '//$1:***@') + ') : ' + e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
