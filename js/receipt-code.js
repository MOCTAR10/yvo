/* ============================================================
   YVO Épargne — code de contrôle d'un reçu
   Même fichier utilisé par l'application ET par le serveur :
   le serveur recalcule le code pour prouver qu'un reçu n'a pas
   été modifié depuis son émission.
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ReceiptCode = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function cyrb53(str) {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i += 1) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }

  function canonical(r) {
    return [
      r.numero, r.date, r.at, r.clientNom, r.total,
      (r.lignes || []).map(function (l) { return l.carte + ':' + l.montant; }).join(','),
      r.cumul, r.retard, r.entreprise
    ].join('|');
  }

  function compute(r) {
    return cyrb53(canonical(r)).toString(36).toUpperCase().padStart(8, '0').slice(0, 8);
  }

  return { compute: compute, canonical: canonical };
}));
