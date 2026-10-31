/* Vérifie la syntaxe de tous les fichiers JavaScript (app + serveur). */
'use strict';
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const files = ['sw.js', 'server/server.js']
  .concat(fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f));
let failed = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', path.join(root, f)], { stdio: 'pipe' });
  } catch (err) {
    failed += 1;
    console.error('✖ ' + f + '\n' + String(err.stderr || err.message));
  }
}
console.log(failed ? failed + ' fichier(s) en erreur' : '✔ ' + files.length + ' fichiers JavaScript valides');
process.exit(failed ? 1 : 0);
