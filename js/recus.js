'use strict';

/* ============================================================
   YVO Épargne — reçus de versement (preuve envoyée au client)

   Chaque versement génère un reçu immuable, enregistré sur le
   serveur. Il porte un code de contrôle : le serveur peut prouver
   qu'il n'a pas été modifié (lien public /r/<jeton>).
   ============================================================ */

function randomChars(n, alphabet) {
  const a = alphabet || 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const buf = new Uint32Array(n);
  (window.crypto || window.msCrypto).getRandomValues(buf);
  for (let i = 0; i < n; i += 1) out += a[buf[i] % a.length];
  return out;
}

function createReceipt(clientId, date, lignes, mode, ref) {
  const client = clientById(clientId);
  if (!client || !lignes || !lignes.length) return null;
  const tot = clientTotals(client);
  const company = db.settings.company;
  const rec = {
    id: uid('rc'),
    numero: 'RV-' + date.slice(2).replace(/-/g, '') + '-' + randomChars(4),
    token: randomChars(20, 'abcdefghijkmnpqrstuvwxyz23456789'),
    at: new Date().toISOString(),
    date: date,
    clientId: clientId,
    clientNom: client.nom,
    clientTel: client.telephone || '',
    quartier: client.quartier || '',
    lignes: lignes.map(function (l) { return { carte: l.carte, montant: l.montant, statut: l.statut }; }),
    total: sum(lignes, function (l) { return l.montant; }),
    mode: PAY_MODES.indexOf(mode) >= 0 ? mode : 'especes',
    ref: mode && mode !== 'especes' && ref ? ref : '',
    cumul: tot.totalVerse,
    retard: tot.retard,
    devise: db.settings.devise,
    entreprise: company.nom || '',
    collecteur: company.responsable || company.nom || '',
    appareil: (typeof syncCfg !== 'undefined' && syncCfg) ? syncCfg.deviceName : '',
    cv: 2
  };
  rec.code = ReceiptCode.compute(rec);
  db.recus.push(rec);
  logActivity('versement', 'Reçu ' + rec.numero + ' émis pour ' + client.nom + ' (' + money(rec.total) + ')', { clientId: clientId, montant: rec.total });
  return rec;
}

function receiptById(id) {
  return db.recus.find(function (r) { return r.id === id; }) || null;
}

function receiptLink(rec) {
  if (typeof syncCfg === 'undefined' || !syncCfg) return '';
  const base = syncBaseUrl();
  return base ? base + '/r/' + rec.token : '';
}

function receiptText(rec) {
  const link = receiptLink(rec);
  return '🧾 Reçu ' + rec.numero + '\n' + rec.entreprise + '\n\n' +
    'Client : ' + rec.clientNom + '\n' +
    'Montant reçu : ' + money(rec.total) + '\n' +
    'Payé par : ' + receiptModeLine(rec) + '\n' +
    'Date : ' + fmtDate(rec.date, 'long') + '\n' +
    'Total payé : ' + money(rec.cumul) + '\n' +
    (rec.retard > 0 ? 'Retard : ' + money(rec.retard) : 'Vous êtes à jour ✔') + '\n' +
    'Code de contrôle : ' + rec.code + '\n' +
    (link ? '\nVérifier ce reçu : ' + link : '') + '\n\nMerci !';
}

/* Les anciens reçus (sans mode) sont des paiements en espèces. */
function receiptModeLine(rec) {
  return (PAY_MODE_LABELS[rec.mode] || PAY_MODE_LABELS.especes) + (rec.ref ? ' · réf. ' + rec.ref : '');
}

function receiptValid(rec) {
  return ReceiptCode.compute(rec) === rec.code;
}

/* Logos chargés à l'avance pour pouvoir les dessiner sur l'image du reçu */
const RECEIPT_LOGOS = {};
['airtel', 'moov'].forEach(function (k) {
  const img = new Image();
  img.src = 'img/' + k + '-money.png';
  RECEIPT_LOGOS[k] = img;
});

/* Image du reçu (se partage dans WhatsApp comme une photo) */
function receiptCanvas(rec) {
  const W = 720;
  const lines = rec.lignes || [];
  /* en-tête 420 + une ligne de 52 par carte + 4 lignes fixes + code de contrôle + pied de page */
  const H = 420 + (lines.length + 4) * 52 + 150;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const font = function (w, s) { g.font = w + ' ' + s + 'px "Segoe UI", Roboto, Arial, sans-serif'; };
  g.fillStyle = '#efeadc'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#fffdf9'; roundRect(g, 24, 24, W - 48, H - 48, 28); g.fill();
  const grad = g.createLinearGradient(0, 24, W, 200);
  grad.addColorStop(0, '#0e5c45'); grad.addColorStop(1, '#062a1f');
  g.save(); roundRect(g, 24, 24, W - 48, 170, 28); g.clip(); g.fillStyle = grad; g.fillRect(24, 24, W - 48, 170); g.restore();
  g.fillStyle = '#e3c37e'; font('600', 22); g.fillText('REÇU DE PAIEMENT', 56, 74);
  g.fillStyle = '#fff'; font('700', 38); g.fillText(clip(g, rec.entreprise || 'YVO Épargne', W - 112), 56, 128);
  g.fillStyle = '#a9cdbd'; font('400', 22); g.fillText(rec.numero, 56, 168);
  g.textAlign = 'center';
  g.fillStyle = '#77817a'; font('400', 24); g.fillText('Montant reçu', W / 2, 250);
  g.fillStyle = '#0e5c45'; font('700', 62); g.fillText(money(rec.total), W / 2, 322);
  g.fillStyle = '#15231d'; font('600', 30); g.fillText(clip(g, rec.clientNom, W - 120), W / 2, 372);
  g.textAlign = 'left';
  let y = 420;
  const row = function (a, b, bold) {
    g.strokeStyle = '#e5dfd1'; g.beginPath(); g.moveTo(56, y - 30); g.lineTo(W - 56, y - 30); g.stroke();
    g.fillStyle = '#77817a'; font('400', 24); g.fillText(a, 56, y);
    g.fillStyle = '#15231d'; font(bold ? '700' : '600', 26); g.textAlign = 'right'; g.fillText(b, W - 56, y); g.textAlign = 'left';
    y += 52;
  };
  lines.forEach(function (l) { row(l.carte, money(l.montant), false); });
  row('Date', fmtDate(rec.date, 'long'), false);
  font('600', 26);
  const modeText = clip(g, receiptModeLine(rec), 400);
  const logo = RECEIPT_LOGOS[rec.mode];
  if (logo && logo.complete && logo.naturalWidth) {
    const lh = 36;
    const lw = Math.round(logo.naturalWidth * lh / logo.naturalHeight);
    g.drawImage(logo, W - 56 - g.measureText(modeText).width - 10 - lw, y - 27, lw, lh);
  }
  row('Payé par', modeText, false);
  row('Total payé', money(rec.cumul), false);
  row('Retard restant', rec.retard > 0 ? money(rec.retard) : 'À jour ✔', true);
  y += 6;
  g.fillStyle = '#e3f3ea'; roundRect(g, 56, y - 26, W - 112, 70, 16); g.fill();
  g.fillStyle = '#0f7656'; font('600', 22); g.fillText('Code de contrôle', 80, y + 8);
  font('700', 30); g.textAlign = 'right'; g.fillText(rec.code, W - 80, y + 10); g.textAlign = 'left';
  g.fillStyle = '#77817a'; font('400', 20);
  g.fillText('Établi par ' + clip(g, rec.collecteur || '', 300) + ' · ' + new Date(rec.at).toLocaleString('fr-FR'), 56, y + 90);
  return c;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function clip(g, text, max) {
  let t = String(text || '');
  while (g.measureText(t).width > max && t.length > 1) t = t.slice(0, -2);
  return t === String(text || '') ? t : t + '…';
}

function shareReceiptImage(rec) {
  const canvas = receiptCanvas(rec);
  const name = 'recu-' + rec.numero + '.png';
  return new Promise(function (resolve) {
    canvas.toBlob(function (blob) {
      if (!blob) { resolve('error'); return; }
      try {
        const file = new File([blob], name, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
          navigator.share({ files: [file], title: 'Reçu ' + rec.numero, text: receiptText(rec) })
            .then(function () { resolve('shared'); })
            .catch(function (err) { resolve(err && err.name === 'AbortError' ? 'cancelled' : 'error'); });
          return;
        }
      } catch (err) { /* repli */ }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      resolve('downloaded');
    }, 'image/png');
  });
}

function receiptCardHTML(rec) {
  const ok = receiptValid(rec);
  return '<div class="recu-card">' +
    '<div class="recu-head"><small>Reçu de paiement</small><strong>' + esc(rec.entreprise) + '</strong><em>' + esc(rec.numero) + '</em></div>' +
    '<div class="recu-amount"><span>Montant reçu</span><strong>' + esc(money(rec.total)) + '</strong><span>' + esc(rec.clientNom) + (rec.quartier ? ' · ' + esc(rec.quartier) : '') + '</span></div>' +
    '<div class="recu-lines">' +
      (rec.lignes || []).map(function (l) { return '<div><span>' + esc(l.carte) + '</span><strong>' + esc(money(l.montant)) + '</strong></div>'; }).join('') +
      '<div><span>Date</span><strong>' + esc(fmtDate(rec.date, 'long')) + '</strong></div>' +
      '<div><span>Payé par</span><strong class="recu-mode">' + (rec.mode && rec.mode !== 'especes' ? payModeIcon(rec.mode, 22) : '') + esc(receiptModeLine(rec)) + '</strong></div>' +
      '<div><span>Total payé</span><strong>' + esc(money(rec.cumul)) + '</strong></div>' +
      '<div><span>Retard restant</span><strong class="' + (rec.retard > 0 ? 'red' : 'green') + '">' + esc(rec.retard > 0 ? money(rec.retard) : 'À jour') + '</strong></div>' +
    '</div>' +
    '<div class="recu-code ' + (ok ? 'ok' : 'bad') + '">' + icon(ok ? 'shield' : 'alert', 18) + '<span>' + (ok ? 'Code de contrôle valide' : 'Reçu modifié : code invalide') + '</span><strong>' + esc(rec.code) + '</strong></div>' +
    '<p class="recu-foot">' + esc(rec.collecteur || '') + ' · ' + esc(fmtDateTime(rec.at)) + (rec.appareil ? ' · ' + esc(rec.appareil) : '') + '</p>' +
  '</div>';
}

function openRecuModal(id) {
  const rec = receiptById(id);
  if (!rec) { toast('Reçu introuvable.', 'error'); return; }
  const client = clientById(rec.clientId);
  const wa = waLink((client && client.telephone) || rec.clientTel, receiptText(rec));
  const link = receiptLink(rec);
  openModal({
    cls: 'paid-sheet',
    title: 'Reçu de paiement',
    subtitle: esc(rec.numero),
    body: receiptCardHTML(rec) + (link ? '<p class="hint">Lien de vérification : <b>' + esc(link) + '</b></p>' : '<p class="hint">Avec la sauvegarde en ligne, le reçu contient un lien pour le vérifier.</p>'),
    footer:
      '<button type="button" class="btn primary lg" data-action="share-recu-image" data-id="' + esc(rec.id) + '">' + icon('share', 17) + ' Envoyer en image</button>' +
      (wa ? '<a class="btn wa lg" href="' + esc(wa) + '" target="_blank" rel="noopener">' + icon('message', 17) + ' Envoyer par WhatsApp</a>' : '')
  });
}

