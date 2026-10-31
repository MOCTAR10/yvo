'use strict';

/* ============================================================
   YVO Épargne — démarrage, navigation, événements
   ============================================================ */

let searchTimer = 0;
let lockTimer = null;
let pendingImport = null;

const SNAP_REASONS = {
  auto: 'Automatique',
  quotidien: 'Quotidien',
  manuel: 'Manuel',
  fermeture: 'À la fermeture',
  'avant-import': 'Avant un import',
  'avant-restauration': 'Avant une restauration',
  'avant-effacement': 'Avant un effacement'
};

/* ------------------------------------------------------------
   Démarrage
   ------------------------------------------------------------ */

function boot() {
  buildNav();
  bindEvents();
  registerSW();
  initStorageGuards();

  if (typeof initSync === 'function') initSync();

  loadBestDB().then(function (res) {
    if (!res) {
      requireAccess(enterSpace);
      return;
    }
    db = normalizeDB(res.data);
    if (res.source === 'local' && storageInfo.idb) { idbDirty = true; flushIdb(); }
    if (res.source === 'snapshot') {
      setTimeout(function () { toast('Données récupérées depuis le point de restauration du ' + fmtDateTime(storageInfo.recovered) + '.', 'info'); }, 600);
      saveDB();
    }
    requestPersistence().then(function () { if (state.route && state.route.name === 'parametres') rerender(); });
    listSnapshots(false).then(function (list) {
      const today = new Date().toISOString().slice(0, 10);
      if (!list.length || list[0].id.slice(0, 10) !== today) takeSnapshot('quotidien');
    });
    requireAccess(enterSpace);
  });
}

/* Après la connexion : les données du téléphone s'affichent tout de suite,
   puis le serveur complète en arrière-plan (premier lancement : tout arrive du serveur). */
function enterSpace() {
  if (!db) {
    db = emptyDB();
    saveDB();
    requestPersistence();
  }
  startApp();
  if (syncCfg) {
    syncNow(false).then(function () {
      if (!state.locked && !document.querySelector('.modal')) rerender();
    });
  }
}

/* L'application est réservée à Yvo : mot de passe à chaque ouverture.
   Un simple rechargement de la page dans la même session ne le redemande pas. */
let afterAccess = null;
function requireAccess(next) {
  let ok = false;
  try { ok = sessionStorage.getItem('yvo-acces') === '1'; } catch (err) { /* navigation privée */ }
  if (ok) { next(); return; }
  afterAccess = next;
  showLock();
}

function buildNav() {
  const nav = document.getElementById('nav');
  const bottom = document.getElementById('bottom-nav');
  if (nav) {
    nav.innerHTML = NAV_SIDEBAR.map(function (n) {
      return '<a class="nav-link" data-nav="' + n.id + '" href="' + n.href + '">' +
        icon(n.icon, 19) + '<span>' + esc(n.label) + '</span>' +
        (n.id === 'pointage' ? '<span class="nav-badge" id="nav-due" hidden></span>' : '') +
      '</a>';
    }).join('');
  }
  if (bottom) {
    bottom.innerHTML = NAV.map(function (n) {
      return '<a class="bottom-link" data-nav="' + n.id + '" href="' + n.href + '">' +
        '<span class="bl-pill">' + icon(n.icon, 22) + (n.id === 'pointage' ? '<i class="bl-badge" id="bl-due" hidden></i>' : '') + '</span>' +
        '<span class="bl-label">' + esc(n.short) + '</span>' +
      '</a>';
    }).join('');
  }
  const back = document.getElementById('mb-back');
  if (back) back.innerHTML = icon('arrow-left', 22);
  const act = document.getElementById('mb-actions');
  if (act) {
    act.innerHTML =
      '<span class="icon-btn sync-pill" data-sync-pill role="status" aria-label="Synchronisation">' + icon('cloud', 21) + '</span>' +
      '<a class="icon-btn bell" href="#/alertes" aria-label="Alertes">' + icon('bell', 21) + '<i class="bell-badge" data-alert-badge hidden></i></a>' +
      '<button type="button" class="icon-btn" id="mb-lock" data-action="lock-now" aria-label="Verrouiller" hidden>' + icon('lock', 21) + '</button>';
  }
}

function parseHash() {
  const raw = String(location.hash || '').replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean);
  const name = parts[0] || 'tableau';
  const id = parts[1] || null;
  if (name === 'client') return { name: 'client', id: id };
  if (!ROUTE_TITLES[name] || name === 'client') return { name: 'tableau', id: null };
  return { name: name, id: null };
}

function navigate(hash) {
  if (location.hash === hash) {
    state.route = parseHash();
    render();
    window.scrollTo(0, 0);
  } else {
    location.hash = hash;
  }
}

function startApp() {
  state.locked = false;
  const welcome = document.getElementById('welcome');
  const lock = document.getElementById('lock-screen');
  const app = document.getElementById('app');
  if (welcome) welcome.hidden = true;
  if (lock) lock.hidden = true;
  if (app) app.hidden = false;
  if (!location.hash || location.hash === '#') {
    history.replaceState(null, '', '#/tableau');
  }
  state.route = parseHash();
  render();
  state.lastActivity = Date.now();
  if (!lockTimer) {
    lockTimer = setInterval(checkAutoLock, 15000);
  }
}

function rerender() {
  if (!db || state.locked) return;
  const active = document.activeElement;
  const id = active && active.id;
  const start = active && typeof active.selectionStart === 'number' ? active.selectionStart : null;
  const end = active && typeof active.selectionEnd === 'number' ? active.selectionEnd : null;
  const scroll = window.scrollY;
  render();
  window.scrollTo(0, scroll);
  if (id) {
    const el = document.getElementById(id);
    if (el) {
      try { el.focus({ preventScroll: true }); } catch (err) { el.focus(); }
      if (start != null && typeof el.setSelectionRange === 'function') {
        try { el.setSelectionRange(start, end); } catch (err) { /* ignore */ }
      }
    }
  }
}

function scheduleRender() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(rerender, 130);
}

function updateMobileBar(route, client) {
  const title = document.getElementById('mb-title');
  const sub = document.getElementById('mb-sub');
  const back = document.getElementById('mb-back');
  const brand = document.getElementById('mb-brand');
  if (!title || !back) return;
  const isMore = NAV_MORE.some(function (n) { return n.id === route.name; });
  const isRoot = route.name === 'tableau';
  back.hidden = !(route.name === 'client' || isMore);
  back.setAttribute('href', route.name === 'client' ? '#/clients' : '#/plus');
  if (brand) brand.hidden = !isRoot;
  if (isRoot) {
    title.textContent = db.settings.company.nom || 'YVO Épargne';
    if (sub) sub.textContent = fmtDate(todayISO(), 'day');
  } else if (route.name === 'client') {
    title.textContent = client ? client.nom : 'Fiche client';
    if (sub) sub.textContent = client ? (client.quartier || 'Non classé') : '';
  } else {
    title.textContent = ROUTE_TITLES[route.name] || 'YVO Épargne';
    if (sub) sub.textContent = route.name === 'pointage' ? '' : '';
  }
}

function render() {
  if (!db || state.locked) return;
  const view = document.getElementById('view');
  if (!view) return;
  const route = state.route || parseHash();
  let html = '';
  try {
    if (route.name === 'pointage') html = viewPointage();
    else if (route.name === 'clients') html = viewClients();
    else if (route.name === 'client') html = viewClient(route.id);
    else if (route.name === 'multi') html = viewMulti();
    else if (route.name === 'tresorerie') html = viewTresorerie();
    else if (route.name === 'plus') html = viewPlus();
    else if (route.name === 'activite') html = viewActivite();
    else if (route.name === 'risques') html = viewRisques();
    else if (route.name === 'cloture') html = viewCloture();
    else if (route.name === 'corbeille') html = viewCorbeille();
    else if (route.name === 'parametres') html = viewParametres();
    else if (route.name === 'recus') html = viewRecus();
    else if (route.name === 'commission') html = viewCommission();
    else if (route.name === 'sync') html = viewSync();
    else if (route.name === 'alertes') html = viewAlertes();
    else html = viewDashboard();
  } catch (err) {
    console.error(err);
    html = '<div class="page"><div class="panel"><div class="empty"><div class="empty-icon">' + icon('alert', 26) + '</div>' +
      '<h3>Une erreur est survenue</h3><p>' + esc(err.message || String(err)) + '</p>' +
      '<div class="empty-cta"><button type="button" class="btn ghost" data-action="reload">Recharger l’application</button></div></div></div></div>';
  }
  view.innerHTML = html;

  const isMore = NAV_MORE.some(function (n) { return n.id === route.name; });
  const activeSide = route.name === 'client' ? 'clients' : route.name;
  const activeBottom = route.name === 'client' ? 'clients' : (isMore ? 'plus' : route.name);
  document.querySelectorAll('.nav-link').forEach(function (el) {
    el.classList.toggle('active', el.getAttribute('data-nav') === activeSide);
  });
  document.querySelectorAll('.bottom-link').forEach(function (el) {
    el.classList.toggle('active', el.getAttribute('data-nav') === activeBottom);
  });

  const t = todayISO();
  const count = pointageEntries(t).filter(function (e) { return !e.touched; }).length;
  ['nav-due', 'bl-due'].forEach(function (bid) {
    const b = document.getElementById(bid);
    if (!b) return;
    b.textContent = count > 0 ? (count > 99 ? '99+' : String(count)) : '';
    b.hidden = count === 0;
  });

  const mini = document.getElementById('caisse-mini');
  if (mini) {
    mini.innerHTML = '<span class="cm-top"><span>Caisse</span>' + icon('wallet', 15) + '</span>' +
      '<strong>' + esc(money(cashBalance())) + '</strong>' +
      '<span class="cm-link">Voir la trésorerie ' + icon('chevron-right', 12) + '</span>';
  }

  updateAlertBadge();
  updateSyncPill();
  const lk = document.getElementById('mb-lock');
  if (lk) lk.hidden = false;
  const client = route.name === 'client' ? clientById(route.id) : null;
  updateMobileBar(route, client);
  document.title = (client ? client.nom : (ROUTE_TITLES[route.name] || 'Accueil')) + ' · YVO Épargne';
  document.body.setAttribute('data-route', route.name);

  if (route.name === 'parametres') refreshSnapshotList();
}

function refreshSnapshotList() {
  if (!document.getElementById('snap-list')) return;
  listSnapshots(false).then(function (list) {
    const el = document.getElementById('snap-list');
    if (!el) return;
    el.innerHTML = list.length
      ? list.slice(0, 8).map(function (s) {
          return '<div class="snap"><div><strong>' + esc(fmtDateTime(s.id)) + '</strong>' +
            '<span>' + esc(SNAP_REASONS[s.reason] || s.reason) + ' · ' + s.clients + ' client' + (s.clients > 1 ? 's' : '') + ' · caisse ' + esc(money(s.caisse, true)) + '</span></div>' +
            '<button type="button" class="btn sm ghost" data-action="snapshot-restore" data-id="' + esc(s.id) + '">' + icon('undo', 14) + ' Restaurer</button></div>';
        }).join('') + (list.length > 8 ? '<p class="muted small">' + (list.length - 8) + ' autre(s) point(s) plus ancien(s) conservé(s).</p>' : '')
      : '<p class="muted">Aucun point de restauration pour l’instant : le premier est créé automatiquement.</p>';
  });
}

/* ------------------------------------------------------------
   Verrouillage
   ------------------------------------------------------------ */

function showLock() {
  state.locked = true;
  const welcome = document.getElementById('welcome');
  const app = document.getElementById('app');
  const lock = document.getElementById('lock-screen');
  if (welcome) welcome.hidden = true;
  if (app) app.hidden = true;
  if (!lock) return;
  const h = new Date().getHours();
  const hello = h < 5 || h >= 18 ? 'Bonsoir' : 'Bonjour';
  lock.hidden = false;
  lock.innerHTML =
    '<div class="login-bg" aria-hidden="true"><i></i><i></i><i></i></div>' +
    '<div class="login-card">' +
      '<div class="login-mark"><span>Y</span></div>' +
      '<p class="login-kicker">Espace privé</p>' +
      '<h1 class="login-hello">' + hello + ' <em>Yvo</em></h1>' +
      '<p class="login-date">' + esc(fmtDate(todayISO(), 'long')) + '</p>' +
      '<form id="form-unlock" data-form="unlock" autocomplete="off">' +
        '<label class="login-field" for="unlock-pin"><span class="sr-only">Mot de passe</span>' +
          icon('lock', 18) +
          '<input id="unlock-pin" name="pin" type="password" required autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Votre mot de passe">' +
          '<button type="button" class="login-eye" data-action="login-eye" aria-label="Afficher le mot de passe">' + icon('eye', 18) + '</button>' +
        '</label>' +
        '<p class="lock-error" id="lock-error" aria-live="polite"></p>' +
        '<button type="submit" class="login-btn">Entrer dans mon espace ' + icon('chevron-right', 18) + '</button>' +
      '</form>' +
      '<p class="login-foot">' + icon('shield', 13) + ' YVO Épargne · réservé à Yvo</p>' +
    '</div>';
  setTimeout(function () {
    const input = document.getElementById('unlock-pin');
    if (input) input.focus();
  }, 120);
}

/* Le mot de passe est vérifié par le serveur. Sans réseau, on le compare à une
   empreinte salée gardée sur ce téléphone depuis la dernière connexion réussie. */
const OFFLINE_KEY = 'yvo-acces-local';

function loginWithPassword(password) {
  const device = {
    id: (syncCfg && syncCfg.deviceId) || newDeviceId(),
    name: (syncCfg && syncCfg.deviceName) || deviceDefaultName()
  };
  return syncApi('/api/login', { password: password, device: device }, 'none').then(function (r) {
    const prev = syncCfg;
    syncCfg = {
      server: '', token: r.token, account: r.account, deviceId: device.id, deviceName: device.name,
      lastSeq: prev && prev.account === r.account ? prev.lastSeq || 0 : 0,
      lastOkAt: prev ? prev.lastOkAt || null : null
    };
    saveSyncCfg();
    syncState.status = 'idle';
    syncState.error = null;
    rememberOfflinePassword(password);
    return 'ok';
  }).catch(function (err) {
    if (err && err.status === 401) return 'bad';
    if (err && err.status === 429) return 'limit';
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(OFFLINE_KEY) || 'null'); } catch (e) { /* ignore */ }
    if (!saved || !saved.salt) return 'first-online';
    return sha256(saved.salt + password) === saved.hash ? 'ok' : 'bad';
  });
}

function rememberOfflinePassword(password) {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const salt = Array.from(bytes).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  try { localStorage.setItem(OFFLINE_KEY, JSON.stringify({ salt: salt, hash: sha256(salt + password) })); } catch (err) { /* ignore */ }
}

/* Après 5 erreurs, 30 secondes d'attente (limite les essais au hasard). */
function loginFailed() {
  let n = 0;
  try {
    n = (Number(localStorage.getItem('yvo-acces-echecs')) || 0) + 1;
    localStorage.setItem('yvo-acces-echecs', String(n));
    if (n >= 5) { localStorage.setItem('yvo-acces-attente', String(Date.now() + 30000)); localStorage.setItem('yvo-acces-echecs', '0'); }
  } catch (err) { /* ignore */ }
  return n;
}

function loginWaitSeconds() {
  let until = 0;
  try { until = Number(localStorage.getItem('yvo-acces-attente')) || 0; } catch (err) { /* ignore */ }
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

function lockApp() {
  if (!db) return;
  try { sessionStorage.removeItem('yvo-acces'); } catch (err) { /* ignore */ }
  closeModal();
  afterAccess = startApp;
  showLock();
}

function checkAutoLock() {
  if (!db || state.locked) return;
  const minutes = Number(db.settings.autoLock) || 0;
  if (minutes <= 0) return;
  if (Date.now() - state.lastActivity > minutes * 60000) lockApp();
}

/* ------------------------------------------------------------
   Événements
   ------------------------------------------------------------ */

function bindEvents() {
  bindExtraEvents();
  window.addEventListener('hashchange', function () {
    if (!db || state.locked) return;
    state.route = parseHash();
    closeModal();
    render();
    window.scrollTo(0, 0);
  });

  document.addEventListener('pointerdown', function () {
    if (!state.locked) state.lastActivity = Date.now();
  }, true);
  document.addEventListener('keydown', function () {
    if (!state.locked) state.lastActivity = Date.now();
  }, true);

  document.addEventListener('click', function (e) {
    const backdrop = e.target.closest('[data-backdrop]');
    if (backdrop && e.target === backdrop) {
      closeModal();
      return;
    }
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.getAttribute('data-action');
    if (action === 'close-modal') {
      closeModal();
      return;
    }
    handleAction(action, el, e);
  });

  document.addEventListener('submit', function (e) {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    handleForm(form.getAttribute('data-form'), form, e.submitter);
  });

  document.addEventListener('change', function (e) {
    const t = e.target;
    if (t.id === 'pointage-date') {
      state.pointageDate = t.value || todayISO();
      rerender();
    } else if (t.id === 'client-sort') {
      state.clientSort = t.value;
      rerender();
    } else if (t.id === 'treasury-type') {
      state.treasuryType = t.value;
      rerender();
    } else if (t.id === 'treasury-mode') {
      state.treasuryMode = t.value;
      rerender();
    } else if (t.id === 'act-client') {
      state.actClient = t.value;
      rerender();
    } else if (t.id === 'act-quartier') {
      state.actQuartier = t.value;
      rerender();
    } else if (t.id === 'auto-lock') {
      db.settings.autoLock = Number(t.value) || 0;
      saveDB();
      toast('Verrouillage automatique mis à jour.', 'success');
    } else if (t.id === 'retrait-client') {
      syncRetraitClient(t.value);
    } else if (t.id === 'retrait-carte') {
      syncRetraitCard(true);
    } else if (t.id === 'import-file') {
      handleImport(t.files && t.files[0], t);
    }
  });

  document.addEventListener('input', function (e) {
    const t = e.target;
    if (t.id === 'client-search') {
      state.clientSearch = t.value;
      scheduleRender();
    } else if (t.id === 'pointage-search') {
      state.pointageSearch = t.value;
      scheduleRender();
    } else if (t.id === 'multi-search') {
      state.multiSearch = t.value;
      scheduleRender();
    } else if (t.id === 'act-search') {
      state.actSearch = t.value;
      scheduleRender();
    } else if (t.id === 'retrait-montant') {
      syncRetraitClose();
    } else if (t.id === 'cloture-compte') {
      syncCloture();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      const root = document.getElementById('modal-root');
      if (root && root.innerHTML.trim()) closeModal();
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.prow[role="button"]')) {
      e.preventDefault();
      e.target.click();
    }
  });
}

function handleAction(action, el, e) {
  if (handleExtraAction(action, el)) { if (e) e.preventDefault(); return; }
  const carteId = el.getAttribute('data-carte');
  const clientId = el.getAttribute('data-client');
  const date = el.getAttribute('data-date');
  const opId = el.getAttribute('data-op');
  let keepDefault = false;

  switch (action) {
    case 'lock-now':
      lockApp();
      break;

    case 'login-eye': {
      const input = document.getElementById('unlock-pin');
      if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
        el.innerHTML = icon(input.type === 'password' ? 'eye' : 'lock', 18);
        input.focus();
      }
      break;
    }

    case 'lock-forgot':
      openConfirm({
        title: 'Code oublié',
        tone: 'red',
        message: 'Le code est stocké sur cet appareil et ne peut pas être retrouvé. Pour repartir, vous pouvez effacer les données locales — elles seront perdues.',
        extra: '<p class="muted">Si vous avez une sauvegarde JSON, vous pourrez la réimporter après avoir repris l’application à zéro.</p>',
        action: 'confirm-erase-locked',
        label: 'Effacer et repartir'
      });
      break;

    case 'new-client':
      openClientModal(null);
      break;

    case 'edit-client':
      if (clientId) openClientModal(clientById(clientId));
      break;

    case 'delete-client':
      if (clientId) {
        const cl = clientById(clientId);
        const cards = cartesOf(clientId);
        const vs = db.versements.filter(function (v) { return v.clientId === clientId; });
        openConfirm({
          title: 'Supprimer le client',
          tone: 'red',
          icon: 'trash',
          message: 'Supprimer <strong>' + esc(cl ? cl.nom : 'ce client') + '</strong> ?',
          extra: '<p class="muted">' + cards.length + ' carte(s) et ' + vs.length + ' pointage(s) (' + esc(money(sum(vs, function (v) { return v.montant; }))) + ') seront retirés, et la caisse sera recalculée.<br><strong>Rien n’est perdu :</strong> vous pourrez tout restaurer depuis la Corbeille.</p>',
          action: 'confirm-delete-client',
          data: 'data-client="' + esc(clientId) + '"',
          label: 'Mettre à la corbeille'
        });
      }
      break;

    case 'new-carte':
      if (clientId) openCarteModal(clientId, null);
      break;

    case 'edit-carte':
      if (carteId) {
        const carte = carteById(carteId);
        if (carte) openCarteModal(carte.clientId, carte);
      }
      break;

    case 'toggle-carte':
      if (carteId) {
        const carte = carteById(carteId);
        if (carte) {
          const reopening = carte.statut !== 'active';
          carte.statut = reopening ? 'active' : 'cloturee';
          if (reopening) delete carte.clotureeAt;
          else carte.clotureeAt = todayISO();
          logActivity('carte', (reopening ? 'Carte réactivée : ' : 'Carte clôturée : ') + carte.label, { clientId: carte.clientId, carteId: carte.id });
          saveDB();
          rerender();
          toast(reopening ? 'Carte réactivée.' : 'Carte clôturée. Le solde reste suivi.', 'success');
        }
      }
      break;

    case 'delete-carte':
      if (carteId) {
        const carte = carteById(carteId);
        if (carte) {
          const nb = db.versements.filter(function (v) { return v.carteId === carteId; }).length;
          openConfirm({
            title: 'Supprimer la carte',
            tone: 'red',
            icon: 'trash',
            message: 'Supprimer <strong>' + esc(carte.label) + '</strong> ?',
            extra: '<p class="muted">' + nb + ' pointage(s) et les paiements liés seront retirés. Restaurable depuis la Corbeille.</p>',
            action: 'confirm-delete-carte',
            data: 'data-carte="' + esc(carteId) + '"',
            label: 'Mettre à la corbeille'
          });
        }
      }
      break;

    case 'open-day':
      if (carteId && date) openDayModal(carteId, date);
      break;

    case 'open-pay':
      if (clientId) openPaySheet(clientId, date || todayISO(), carteId);
      break;

    case 'goto-carte': {
      const panel = document.getElementById('carte-' + carteId);
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      break;
    }

    case 'pointage-full':
      if (clientId && date) openQuickModeSheet(clientId, date);
      break;

    case 'pointage-full-mode': {
      const refInput = document.getElementById('quick-ref');
      if (clientId && date) quickFull(clientId, date, el.getAttribute('data-mode'), refInput ? refInput.value.trim() : '');
      break;
    }

    case 'pay-none':
      if (clientId && date) markNothing(clientId, date);
      break;

    case 'pay-fill': {
      const input = document.getElementById(el.getAttribute('data-target'));
      if (input) {
        input.value = el.getAttribute('data-value');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
      }
      break;
    }

    case 'pointage-today':
      state.pointageDate = todayISO();
      rerender();
      break;

    case 'pointage-shift':
      state.pointageDate = addDays(state.pointageDate || todayISO(), Number(el.getAttribute('data-delta')) || 0);
      rerender();
      break;

    case 'pointage-tab':
      state.pointageTab = el.getAttribute('data-tab') || 'a-pointer';
      rerender();
      break;

    case 'pointage-quartier':
      state.pointageQuartier = el.getAttribute('data-quartier') || 'tous';
      rerender();
      break;

    case 'client-quartier':
      state.clientQuartier = el.getAttribute('data-quartier') || 'tous';
      rerender();
      break;

    case 'client-etat':
      state.clientEtat = el.getAttribute('data-etat') || 'tous';
      rerender();
      break;

    case 'act-period':
      state.actPeriod = el.getAttribute('data-period') || '7j';
      rerender();
      break;

    case 'act-kind':
      state.actKind = el.getAttribute('data-kind') || 'tous';
      rerender();
      break;

    case 'act-client':
      state.actClient = clientId || 'tous';
      state.actPeriod = 'tout';
      state.actKind = 'tous';
      state.actQuartier = 'tous';
      state.actSearch = '';
      navigate('#/activite');
      break;

    case 'cal-prev':
    case 'cal-next':
      if (carteId) {
        const carte = carteById(carteId);
        if (carte) {
          state.cal[carte.id] = shiftMonth(calMonthFor(carte), action === 'cal-prev' ? -1 : 1);
          rerender();
        }
      }
      break;

    case 'cal-today':
      if (carteId) {
        state.cal[carteId] = monthKeyOf(todayISO());
        rerender();
      }
      break;

    case 'new-retrait':
      openRetraitModal({ clientId: clientId || null, carteId: carteId || null });
      break;

    case 'new-operation':
      openOperationModal(el.getAttribute('data-type') || 'entree');
      break;

    case 'open-receipt':
      if (opId || el.getAttribute('data-id')) openReceipt(opId || el.getAttribute('data-id'));
      break;

    case 'new-pret':
      if (clientId) openPretModal(clientId, carteId);
      break;

    case 'print-receipt':
      window.print();
      break;

    case 'delete-day':
      if (carteId && date) {
        openConfirm({
          title: 'Effacer ce pointage',
          tone: 'red',
          icon: 'trash',
          message: 'Effacer le pointage du <strong>' + esc(fmtDate(date, 'long')) + '</strong> ?',
          extra: '<p class="muted">Il ira dans la Corbeille et pourra être restauré.</p>',
          action: 'confirm-delete-day',
          data: 'data-carte="' + esc(carteId) + '" data-date="' + esc(date) + '"',
          label: 'Effacer'
        });
      }
      break;

    case 'confirm-delete-day':
      if (carteId && date) {
        const v = versementFor(carteId, date);
        const carte = carteById(carteId);
        if (v) {
          const client = clientById(v.clientId);
          trashAdd('versement', 'Pointage du ' + fmtDate(date, 'short') + ' · ' + (client ? client.nom : '') + ' · ' + money(v.montant), { versements: [v] });
          db.versements = db.versements.filter(function (x) { return x.id !== v.id; });
          logActivity('suppression', 'Pointage du ' + fmtDate(date, 'short') + ' effacé (' + money(v.montant) + ')' + (carte ? ' · ' + carte.label : ''), { clientId: v.clientId, carteId: carteId, montant: v.montant });
        }
        saveDB();
        closeModal();
        rerender();
        toast('Pointage effacé. Restaurable depuis la Corbeille.', 'info');
      }
      break;

    case 'delete-op':
      if (opId) {
        const op = db.operations.find(function (o) { return o.id === opId; });
        if (op) {
          openConfirm({
            title: 'Supprimer l’opération',
            tone: 'red',
            icon: 'trash',
            message: 'Supprimer <strong>' + esc(op.libelle || CAT_LABELS[op.categorie] || 'cette opération') + '</strong> de ' + esc(money(op.montant)) + ' ?',
            extra: '<p class="muted">' + (op.recuNumero ? 'Le reçu ' + esc(op.recuNumero) + ' sera aussi retiré. ' : '') + 'Restaurable depuis la Corbeille.</p>',
            action: 'confirm-delete-op',
            data: 'data-op="' + esc(opId) + '"',
            label: 'Supprimer'
          });
        }
      }
      break;

    case 'confirm-delete-op':
      if (opId) {
        const op = db.operations.find(function (o) { return o.id === opId; });
        if (op) {
          trashAdd('operation', (op.libelle || 'Opération') + ' · ' + money(op.montant), { operations: [op] });
          db.operations = db.operations.filter(function (o) { return o.id !== opId; });
          logActivity('suppression', 'Opération supprimée : ' + (op.libelle || CAT_LABELS[op.categorie]) + ' (' + money(op.montant) + ')', { clientId: op.clientId, montant: op.montant });
        }
        saveDB();
        closeModal();
        rerender();
        toast('Opération mise à la corbeille.', 'info');
      }
      break;

    case 'confirm-delete-client':
      if (clientId) {
        const client = clientById(clientId);
        if (client) {
          const cartes = cartesOf(clientId);
          const cardIds = cartes.map(function (c) { return c.id; });
          const versements = db.versements.filter(function (v) { return v.clientId === clientId || cardIds.indexOf(v.carteId) >= 0; });
          const operations = db.operations.filter(function (o) { return o.clientId === clientId || cardIds.indexOf(o.carteId) >= 0; });
          trashAdd('client', client.nom + ' · ' + cartes.length + ' carte(s)', { client: client, cartes: cartes, versements: versements, operations: operations });
          logActivity('suppression', 'Client supprimé : ' + client.nom + ' (' + cartes.length + ' carte(s), ' + versements.length + ' pointage(s))', { clientNom: client.nom });
          db.clients = db.clients.filter(function (c) { return c.id !== clientId; });
          db.cartes = db.cartes.filter(function (c) { return c.clientId !== clientId; });
          db.versements = db.versements.filter(function (v) { return versements.indexOf(v) < 0; });
          db.operations = db.operations.filter(function (o) { return operations.indexOf(o) < 0; });
        }
        saveDB();
        closeModal();
        if (state.route.name === 'client' && state.route.id === clientId) navigate('#/clients');
        else rerender();
        toast('Client mis à la corbeille.', 'info');
      }
      break;

    case 'confirm-delete-carte':
      if (carteId) {
        const carte = carteById(carteId);
        if (carte) {
          const versements = db.versements.filter(function (v) { return v.carteId === carteId; });
          const operations = db.operations.filter(function (o) { return o.carteId === carteId; });
          const client = clientById(carte.clientId);
          trashAdd('carte', carte.label + ' · ' + (client ? client.nom : ''), { cartes: [carte], versements: versements, operations: operations });
          logActivity('suppression', 'Carte supprimée : ' + carte.label, { clientId: carte.clientId, carteId: carteId });
          db.cartes = db.cartes.filter(function (c) { return c.id !== carteId; });
          db.versements = db.versements.filter(function (v) { return v.carteId !== carteId; });
          db.operations = db.operations.filter(function (o) { return o.carteId !== carteId; });
        }
        saveDB();
        closeModal();
        rerender();
        toast('Carte mise à la corbeille.', 'info');
      }
      break;

    case 'trash-restore': {
      const id = el.getAttribute('data-id');
      const item = db.trash.find(function (t) { return t.id === id; });
      if (item && trashRestore(id)) {
        logActivity('systeme', 'Restauré depuis la corbeille : ' + item.label);
        saveDB();
        rerender();
        toast('Élément restauré.', 'success');
      }
      break;
    }

    case 'trash-purge': {
      const id = el.getAttribute('data-id');
      openConfirm({
        title: 'Supprimer définitivement',
        tone: 'red',
        icon: 'trash',
        message: 'Supprimer définitivement cet élément ?',
        extra: '<p class="muted">Cette fois, il ne pourra plus être restauré.</p>',
        action: 'confirm-trash-purge',
        data: 'data-id="' + esc(id) + '"',
        label: 'Supprimer définitivement'
      });
      break;
    }

    case 'confirm-trash-purge': {
      const id = el.getAttribute('data-id');
      db.trash = db.trash.filter(function (t) { return t.id !== id; });
      saveDB();
      closeModal();
      rerender();
      toast('Supprimé définitivement.', 'info');
      break;
    }

    case 'multi-filter':
      state.multiFilter = el.getAttribute('data-filter') || 'sans-retrait';
      rerender();
      break;

    case 'treasury-period':
      state.treasuryPeriod = el.getAttribute('data-period') || 'mois';
      rerender();
      break;

    case 'encaisser-carte':
      if (carteId) {
        const carte = carteById(carteId);
        closeModal();
        if (carte) openPaySheet(carte.clientId, todayISO(), carteId);
      }
      break;

    case 'reset-demo':
      openDemoResetModal();
      break;

    case 'confirm-reset-demo':
      resetToEmpty();
      break;

    case 'erase-data':
      openEraseModal();
      break;

    case 'confirm-erase-locked':
      resetAllData();
      break;

    case 'export-data':
      exportData();
      break;

    case 'share-backup':
      shareBackup();
      break;

    case 'export-csv':
      exportCsv(el.getAttribute('data-what'));
      break;

    case 'snapshot-now':
      takeSnapshot('manuel').then(function () {
        toast('Point de restauration créé.', 'success');
        refreshSnapshotList();
      });
      break;

    case 'snapshot-restore': {
      const id = el.getAttribute('data-id');
      openConfirm({
        title: 'Restaurer ce point',
        tone: 'red',
        icon: 'undo',
        message: 'Revenir à l’état du <strong>' + esc(fmtDateTime(id)) + '</strong> ?',
        extra: '<p class="muted">Un point de restauration de l’état actuel est créé juste avant : vous pourrez revenir en arrière.</p>',
        action: 'confirm-snapshot-restore',
        data: 'data-id="' + esc(id) + '"',
        label: 'Restaurer'
      });
      break;
    }

    case 'confirm-snapshot-restore':
      restoreSnapshot(el.getAttribute('data-id')).then(function (ok) {
        closeModal();
        if (ok) {
          state.cal = {};
          navigate('#/tableau');
          rerender();
          toast('Point de restauration appliqué.', 'success');
        } else toast('Restauration impossible.', 'error');
      });
      break;

    case 'pin-set':
      openPinModal('set');
      break;

    case 'pin-change':
      openPinModal('change');
      break;

    case 'pin-remove':
      openPinModal('remove');
      break;

    case 'confirm-import':
      if (pendingImport) {
        const data = pendingImport;
        pendingImport = null;
        const apply = function () {
          db = normalizeDB(data);
          logActivity('systeme', 'Sauvegarde importée (' + db.clients.length + ' clients).');
          saveDB();
          takeSnapshot('manuel');
          closeModal();
          state.cal = {};
          state.clientSearch = '';
          state.pointageSearch = '';
          startApp();
          navigate('#/tableau');
          rerender();
          toast('Sauvegarde importée avec succès.', 'success');
        };
        if (db) takeSnapshot('avant-import').then(apply);
        else apply();
      }
      break;

    default:
      keepDefault = true;
      break;
  }
  if (e && !keepDefault) e.preventDefault();
}

/* ------------------------------------------------------------
   Formulaires
   ------------------------------------------------------------ */

function handleForm(type, form, submitter) {
  if (handleExtraForm(type, form, submitter)) return;
  const f = new FormData(form);

  if (type === 'unlock') {
    const error = document.getElementById('lock-error');
    const input = document.getElementById('unlock-pin');
    const btn = form.querySelector('.login-btn');
    const wait = loginWaitSeconds();
    if (wait > 0) {
      if (error) error.textContent = 'Trop d’essais. Patientez ' + wait + ' s.';
      return;
    }
    const password = String(f.get('pin') || '');
    if (!password) return;
    if (btn) btn.disabled = true;
    if (error) error.textContent = '';
    loginWithPassword(password).then(function (res) {
      if (btn) btn.disabled = false;
      if (res === 'ok') {
        try { sessionStorage.setItem('yvo-acces', '1'); localStorage.removeItem('yvo-acces-echecs'); } catch (err) { /* ignore */ }
        const card = document.querySelector('.login-card');
        if (card) card.classList.add('is-ok');
        const next = afterAccess || startApp;
        afterAccess = null;
        setTimeout(next, 260);
        return;
      }
      let msg = 'Mot de passe incorrect.';
      if (res === 'limit') msg = 'Trop d’essais. Patientez quelques minutes.';
      else if (res === 'first-online') msg = 'Première connexion sur ce téléphone : il faut Internet.';
      else if (loginFailed() >= 5) msg = 'Trop d’essais. Patientez 30 s.';
      if (error) error.textContent = msg;
      const card = document.querySelector('.login-card');
      if (card) { card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); }
      if (input) {
        input.value = '';
        input.focus();
      }
    });
    return;
  }

  if (type === 'save-pret') {
    savePret(form);
    return;
  }

  if (type === 'save-client') {
    const id = String(f.get('id') || '');
    const nom = String(f.get('nom') || '').trim();
    const telephone = String(f.get('telephone') || '').trim();
    const quartier = String(f.get('quartier') || '').trim() || 'Non classé';
    if (!nom) return toast('Le nom du client est obligatoire.', 'error');
    if (telephone) {
      const digits = telephone.replace(/\D/g, '');
      const twin = db.clients.find(function (c) { return c.id !== id && c.telephone && c.telephone.replace(/\D/g, '') === digits; });
      if (twin) return toast('Ce numéro est déjà utilisé par ' + twin.nom + '. Vérifiez qu’il ne s’agit pas d’un doublon.', 'error');
    }
    const data = {
      nom: nom,
      telephone: telephone,
      telephone2: String(f.get('telephone2') || '').trim(),
      quartier: quartier,
      adresse: String(f.get('adresse') || '').trim(),
      profession: String(f.get('profession') || '').trim(),
      pieceType: String(f.get('pieceType') || ''),
      pieceNumero: String(f.get('pieceNumero') || '').trim(),
      dateInscription: String(f.get('dateInscription') || todayISO()),
      notes: String(f.get('notes') || '').trim(),
      actif: String(f.get('actif')) === '1'
    };
    if (id) {
      const client = clientById(id);
      if (!client) return;
      const changed = Object.keys(data).filter(function (k) { return String(client[k] == null ? '' : client[k]) !== String(data[k]); });
      Object.assign(client, data);
      logActivity('client', 'Fiche modifiée : ' + client.nom + (changed.length ? ' (' + changed.join(', ') + ')' : ''), { clientId: client.id });
      saveDB();
      closeModal();
      rerender();
      toast('Client modifié.', 'success');
    } else {
      const client = Object.assign({ id: uid('cl'), createdAt: new Date().toISOString() }, data);
      db.clients.push(client);
      logActivity('client', 'Nouveau client : ' + client.nom + ' (' + client.quartier + ')', { clientId: client.id });
      saveDB();
      closeModal();
      if (!guideAfterClient(client)) {
        toast('Client créé. Vous pouvez lui ouvrir une carte.', 'success');
        navigate('#/client/' + client.id);
      }
    }
    return;
  }

  if (type === 'save-carte') {
    const id = String(f.get('id') || '');
    const clientId = String(f.get('clientId') || '');
    const client = clientById(clientId);
    if (!client) return toast('Client introuvable.', 'error');
    const label = String(f.get('label') || '').trim() || 'Carte';
    const montantJournalier = parseMoney(f.get('montantJournalier'));
    const dateDebut = String(f.get('dateDebut') || '');
    const dateFin = String(f.get('dateFin') || '');
    if (montantJournalier <= 0) return toast('Le montant journalier doit être supérieur à 0.', 'error');
    if (!dateDebut || !dateFin) return toast('Renseignez les dates de début et de fin.', 'error');
    if (dateFin < dateDebut) return toast('La date de fin doit être après la date de début.', 'error');
    const data = {
      clientId: clientId,
      label: label,
      montantJournalier: montantJournalier,
      dateDebut: dateDebut,
      dateFin: dateFin,
      notes: String(f.get('notes') || '').trim()
    };
    const typ = f.has('typeId') ? cardTypeById(String(f.get('typeId'))) : undefined;
    if (typ !== undefined) Object.assign(data, cardTypeSnapshot(typ));
    const bId = f.has('bareme') ? String(f.get('bareme')) : null;
    const bar = bId ? (db.settings.commission.baremes.find(function (b) { return b.id === bId; }) || null) : null;
    if (id) {
      const carte = carteById(id);
      if (!carte) return;
      const oldJ = carte.montantJournalier;
      Object.assign(carte, data);
      if (bId !== null && ((carte.commission && carte.commission.baremeId) || '') !== bId) {
        carte.commission = baremeSnapshot(bar);
        logActivity('carte', 'Commission de ' + carte.label + ' : ' + (bar ? bar.nom : 'aucune'), { clientId: clientId, carteId: carte.id });
      }
      // les statuts dépendent du journalier : on les recalcule
      db.versements.forEach(function (v) { if (v.carteId === carte.id) v.statut = statutFor(v.montant, carte.montantJournalier); });
      logActivity('carte', 'Carte modifiée : ' + carte.label + (oldJ !== montantJournalier ? ' (journalier ' + money(oldJ, true) + ' → ' + money(montantJournalier, true) + ')' : ''), { clientId: clientId, carteId: carte.id });
      saveDB();
      closeModal();
      rerender();
      toast('Carte modifiée.', 'success');
    } else {
      const carte = Object.assign({ id: uid('ca'), statut: 'active', createdAt: new Date().toISOString() }, data);
      if (bar) carte.commission = baremeSnapshot(bar);
      db.cartes.push(carte);
      state.cal[carte.id] = monthKeyOf(dateDebut);
      logActivity('carte', 'Nouvelle carte : ' + carte.label + ' · ' + money(montantJournalier) + '/jour du ' + fmtDate(dateDebut, 'short') + ' au ' + fmtDate(dateFin, 'short'), { clientId: clientId, carteId: carte.id });
      saveDB();
      closeModal();
      rerender();
      if (!guideAfterCarte(carte)) toast('Carte créée. Le calendrier est prêt.', 'success');
      setTimeout(function () {
        const panel = document.getElementById('carte-' + carte.id);
        if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    }
    return;
  }

  if (type === 'save-pay') {
    const clientId = String(f.get('clientId') || '');
    const date = String(f.get('date') || todayISO());
    const note = String(f.get('note') || '').trim();
    const mode = String(f.get('mode') || 'especes');
    const ref = String(f.get('ref') || '').trim();
    const cards = dueCards(date).filter(function (c) { return c.clientId === clientId; });
    let total = 0;
    payLines = [];
    cards.forEach(function (c) {
      const amount = parseMoney(f.get('m_' + c.id));
      if (amount > 0) {
        addPayment(c, date, amount, note, mode, ref);
        total += amount;
      }
    });
    if (total <= 0) return toast('Saisissez le montant reçu, ou choisissez « Rien reçu ».', 'error');
    const rec = createReceipt(clientId, date, payLines, mode, ref);
    saveDB();
    closeModal();
    rerender();
    openPaidSheet(clientId, date, total, rec, mode);
    return;
  }

  if (type === 'save-day') {
    const carteId = String(f.get('carteId') || '');
    const date = String(f.get('date') || '');
    const carte = carteById(carteId);
    if (!carte) return toast('Carte introuvable.', 'error');
    const montant = parseMoney(f.get('montant'));
    const note = String(f.get('note') || '').trim();
    const mode = PAY_MODES.indexOf(String(f.get('mode'))) >= 0 ? String(f.get('mode')) : 'especes';
    const existing = versementFor(carteId, date);
    const client = clientById(carte.clientId);
    const now = new Date().toISOString();
    if (existing) {
      const before = Number(existing.montant) || 0;
      existing.montant = montant;
      existing.statut = statutFor(montant, carte.montantJournalier);
      existing.note = note;
      existing.updatedAt = now;
      if (montant !== before) {
        (existing.historique = existing.historique || []).push({ montant: montant - before, at: now, mode: mode, correction: true });
        logActivity('versement', 'Pointage corrigé le ' + fmtDate(date, 'short') + ' : ' + money(before, true) + ' → ' + money(montant, true) + ' en ' + PAY_MODE_LABELS[mode] + ' (' + carte.label + ')', { clientId: carte.clientId, carteId: carteId, montant: Math.max(0, montant - before) });
      }
    } else {
      db.versements.push({
        id: uid('v'), carteId: carteId, clientId: carte.clientId, date: date,
        statut: statutFor(montant, carte.montantJournalier), montant: montant, note: note,
        historique: montant > 0 ? [{ montant: montant, at: now, mode: mode }] : [], createdAt: now, updatedAt: now
      });
      logActivity('versement', (client ? client.nom : 'Client') + (montant > 0 ? ' a versé ' + money(montant) + ' en ' + PAY_MODE_LABELS[mode] : ' : jour marqué non versé') + ' le ' + fmtDate(date, 'short') + ' (' + carte.label + ')', { clientId: carte.clientId, carteId: carteId, montant: montant });
    }
    saveDB();
    closeModal();
    rerender();
    toast(montant <= 0 ? 'Jour marqué non versé.' : 'Pointage enregistré · ' + money(montant), montant <= 0 ? 'info' : 'success');
    return;
  }

  if (type === 'save-retrait') {
    const clientId = String(f.get('clientId') || '');
    const carteId = String(f.get('carteId') || '');
    const montant = parseMoney(f.get('montant'));
    const date = String(f.get('date') || todayISO());
    const mode = String(f.get('mode') || 'Espèces');
    const note = String(f.get('note') || '').trim();
    const cloturer = f.get('cloturer') === 'on';
    const client = clientById(clientId);
    const carte = carteById(carteId);
    if (!client || !carte || carte.clientId !== clientId) return toast('Sélection invalide.', 'error');
    const tot = cardTotals(carte);
    if (montant <= 0) return toast('Le montant doit être supérieur à 0.', 'error');
    if (montant > tot.solde) return toast('Le montant dépasse le solde dû de ' + money(tot.solde) + '.', 'error');
    if (montant > cashBalance()) return toast('Caisse insuffisante : il y a ' + money(cashBalance()) + ' en caisse. Ajoutez une entrée de caisse avant ce paiement.', 'error');
    if (cloturer && montant < tot.solde) return toast('Paiement partiel : décochez « Clôturer la carte ».', 'error');
    const soldeApres = Math.max(0, tot.solde - montant);
    const recu = nextReceiptNumber();
    const op = {
      id: uid('op'),
      type: 'sortie',
      categorie: 'retrait',
      libelle: 'Paiement ' + carte.label,
      montant: montant,
      date: date,
      mode: mode,
      note: note,
      clientId: client.id,
      carteId: carte.id,
      recuNumero: recu,
      snapshot: {
        clientNom: client.nom,
        clientTel: client.telephone,
        clientQuartier: client.quartier,
        clientAdresse: client.adresse,
        clientPiece: [client.pieceType, client.pieceNumero].filter(Boolean).join(' '),
        carteLabel: carte.label,
        totalVerse: tot.totalVerse,
        soldeApres: soldeApres,
        montantJournalier: carte.montantJournalier,
        dateDebut: carte.dateDebut,
        dateFin: carte.dateFin
      },
      createdAt: new Date().toISOString()
    };
    db.operations.push(op);
    if (cloturer) {
      carte.statut = 'cloturee';
      carte.clotureeAt = date;
    }
    logActivity('paiement', client.nom + ' payé ' + money(montant) + ' (' + carte.label + ') · reçu ' + recu + (cloturer ? ' · carte clôturée' : ''), { clientId: client.id, carteId: carte.id, montant: montant });
    saveDB();
    closeModal();
    rerender();
    toast('Paiement enregistré · ' + money(montant), 'success');
    setTimeout(function () { openReceipt(op.id); }, 120);
    return;
  }

  if (type === 'save-operation') {
    const opType = String(f.get('type') || 'entree');
    const categorie = String(f.get('categorie') || 'autre');
    const libelle = String(f.get('libelle') || '').trim();
    const montant = parseMoney(f.get('montant'));
    const date = String(f.get('date') || todayISO());
    if (!libelle) return toast('Le libellé est obligatoire.', 'error');
    if (montant <= 0) return toast('Le montant doit être supérieur à 0.', 'error');
    if (opType === 'sortie' && montant > cashBalance()) {
      return toast('Caisse insuffisante : il y a ' + money(cashBalance()) + ' en caisse.', 'error');
    }
    db.operations.push({
      id: uid('op'),
      type: opType,
      categorie: categorie,
      libelle: libelle,
      montant: montant,
      date: date,
      note: String(f.get('note') || '').trim(),
      createdAt: new Date().toISOString()
    });
    logActivity('caisse', (opType === 'entree' ? 'Entrée de caisse : ' : 'Sortie de caisse : ') + libelle + ' (' + (CAT_LABELS[categorie] || categorie) + ')', { montant: montant });
    saveDB();
    closeModal();
    rerender();
    toast((opType === 'entree' ? 'Entrée' : 'Sortie') + ' enregistrée · ' + money(montant), 'success');
    return;
  }

  if (type === 'save-cloture') {
    const compte = parseMoney(f.get('compte'));
    const note = String(f.get('note') || '').trim();
    const t = todayISO();
    const attendu = cashBalance();
    const ecart = compte - attendu;
    const today = cashTotals(t, t);
    db.clotures = db.clotures.filter(function (c) { return c.date !== t; });
    db.clotures.push({ id: uid('cl'), date: t, attendu: attendu, compte: compte, ecart: ecart, encaisse: today.entrees, sorti: today.sorties, note: note, at: new Date().toISOString() });
    logActivity('cloture', 'Clôture du ' + fmtDate(t, 'short') + ' : compté ' + money(compte) + ', attendu ' + money(attendu) + (ecart === 0 ? ' — aucun écart' : ' — écart ' + (ecart > 0 ? '+' : '') + money(ecart)), { montant: Math.abs(ecart) });
    saveDB();
    rerender();
    toast(ecart === 0 ? 'Journée clôturée : la caisse est juste.' : 'Journée clôturée avec un écart de ' + money(ecart) + '.', ecart === 0 ? 'success' : 'info');
    return;
  }

  if (type === 'settings-risk') {
    const seuil = clamp(Math.round(Number(f.get('seuil')) || 3), 1, 30);
    db.settings.seuilRisque = seuil;
    logActivity('systeme', 'Seuil d’alerte réglé à ' + seuil + ' jour(s) sans versement.');
    saveDB();
    rerender();
    toast('Seuil enregistré.', 'success');
    return;
  }

  if (type === 'save-pin') {
    const mode = String(f.get('mode') || 'set');
    const hasPin = !!db.settings.pinHash;
    const current = String(f.get('current') || '');
    if (hasPin && hashPin(current) !== db.settings.pinHash) return toast('Code actuel incorrect.', 'error');
    if (mode === 'remove') {
      db.settings.pinHash = null;
      logActivity('systeme', 'Code de verrouillage désactivé.');
      saveDB();
      closeModal();
      rerender();
      toast('Code désactivé.', 'info');
      return;
    }
    const pin = String(f.get('pin') || '');
    const confirm = String(f.get('confirm') || '');
    if (!/^\d{4,8}$/.test(pin)) return toast('Le code doit contenir 4 à 8 chiffres.', 'error');
    if (pin !== confirm) return toast('Les deux codes ne correspondent pas.', 'error');
    db.settings.pinHash = hashPin(pin);
    logActivity('systeme', 'Code de verrouillage ' + (hasPin ? 'modifié' : 'activé') + '.');
    saveDB();
    closeModal();
    rerender();
    toast('Code activé. Utilisez « Verrouiller » pour tester.', 'success');
    return;
  }

  if (type === 'settings-company') {
    const nom = String(f.get('nom') || '').trim();
    if (!nom) return toast('Le nom de l’entreprise est obligatoire.', 'error');
    const prevCo = db.settings.company;
    const field = function (k) { return f.has(k) ? String(f.get(k) || '').trim() : (prevCo[k] || ''); };
    db.settings.company = Object.assign({}, prevCo, {
      nom: nom,
      responsable: field('responsable'),
      telephone: field('telephone')
    });
    if (f.has('indicatif')) db.settings.indicatif = String(f.get('indicatif') || '').replace(/\D/g, '');
    logActivity('systeme', 'Profil modifié.');
    saveDB();
    rerender();
    toast('Profil enregistré.', 'success');
    return;
  }

  if (type === 'settings-account') {
    const soldeInitial = parseMoney(f.get('soldeInitial'));
    const devise = String(f.get('devise') || 'FCFA');
    if (soldeInitial < 0) return toast('Le fonds de caisse ne peut pas être négatif.', 'error');
    const before = db.settings.soldeInitial;
    db.settings.soldeInitial = soldeInitial;
    db.settings.devise = devise;
    if (before !== soldeInitial) logActivity('caisse', 'Fonds de caisse initial modifié : ' + money(before, true) + ' → ' + money(soldeInitial, true), { montant: Math.abs(soldeInitial - before) });
    saveDB();
    rerender();
    toast('Compte et caisse mis à jour.', 'success');
    return;
  }

  if (type === 'erase-data') {
    const confirm = String(f.get('confirm') || '').trim().toUpperCase();
    if (confirm !== 'EFFACER') return toast('Tapez EFFACER pour confirmer.', 'error');
    resetAllData();
    return;
  }
}

/* ------------------------------------------------------------
   Actions métier
   ------------------------------------------------------------ */

/* Ajoute un versement : il s'additionne à ce qui a déjà été versé ce jour. */
let payLines = [];
function addPayment(carte, date, amount, note, mode, ref) {
  mode = PAY_MODES.indexOf(mode) >= 0 ? mode : 'especes';
  const now = new Date().toISOString();
  const client = clientById(carte.clientId);
  let v = versementFor(carte.id, date);
  if (v) {
    v.montant = (Number(v.montant) || 0) + amount;
    v.updatedAt = now;
    if (note) v.note = v.note ? v.note + ' · ' + note : note;
  } else {
    v = { id: uid('v'), carteId: carte.id, clientId: carte.clientId, date: date, montant: amount, note: note || '', historique: [], createdAt: now, updatedAt: now };
    db.versements.push(v);
  }
  const h = { montant: amount, at: now, mode: mode };
  if (ref && mode !== 'especes') h.ref = ref;
  (v.historique = v.historique || []).push(h);
  v.statut = statutFor(v.montant, carte.montantJournalier);
  payLines.push({ carte: carte.label, montant: amount, statut: v.statut });
  logActivity('versement',
    (client ? client.nom : 'Client') + ' a versé ' + money(amount) + ' en ' + PAY_MODE_LABELS[mode] + (h.ref ? ' (réf. ' + h.ref + ')' : '') + ' (' + carte.label + (date !== todayISO() ? ', pour le ' + fmtDate(date, 'short') : '') + ') — ' + STATUT_LABELS[v.statut],
    { clientId: carte.clientId, carteId: carte.id, montant: amount });
  return v;
}

/* Un clic : le client a versé son journalier complet. */
function quickFull(clientId, date, mode, ref) {
  const cards = dueCards(date).filter(function (c) { return c.clientId === clientId; });
  let total = 0;
  payLines = [];
  cards.forEach(function (c) {
    const v = versementFor(c.id, date);
    const missing = (Number(c.montantJournalier) || 0) - (v ? Number(v.montant) || 0 : 0);
    if (missing > 0) {
      addPayment(c, date, missing, '', mode, ref);
      total += missing;
    }
  });
  if (total <= 0) return;
  const rec = createReceipt(clientId, date, payLines, mode, ref);
  saveDB();
  closeModal();
  rerender();
  const client = clientById(clientId);
  toast((client ? client.nom + ' · ' : '') + money(total) + ' en ' + PAY_MODE_SHORT[mode] + ' enregistrés', 'success', rec ? { label: 'Reçu', action: 'open-recu', id: rec.id } : null);
}

/* Le client n'a rien versé ce jour. */
function markNothing(clientId, date) {
  const cards = dueCards(date).filter(function (c) { return c.clientId === clientId && !versementFor(c.id, date); });
  const client = clientById(clientId);
  const now = new Date().toISOString();
  cards.forEach(function (c) {
    db.versements.push({ id: uid('v'), carteId: c.id, clientId: clientId, date: date, statut: 'absent', montant: 0, note: '', historique: [], createdAt: now, updatedAt: now });
  });
  if (cards.length) logActivity('versement', (client ? client.nom : 'Client') + ' n’a rien versé le ' + fmtDate(date, 'short'), { clientId: clientId });
  saveDB();
  closeModal();
  rerender();
  toast('Marqué non versé.', 'info');
}

function syncCloture() {
  const input = document.getElementById('cloture-compte');
  const box = document.getElementById('cloture-ecart');
  const attendu = document.getElementById('cloture-attendu');
  if (!input || !box || !attendu) return;
  if (input.value === '') {
    box.className = 'ecart-box';
    box.innerHTML = '<span>Écart</span><strong>—</strong><em>Saisissez le montant compté</em>';
    return;
  }
  const ecart = parseMoney(input.value) - (Number(attendu.getAttribute('data-value')) || 0);
  box.className = 'ecart-box ' + (ecart === 0 ? 'ok' : ecart < 0 ? 'neg' : 'pos');
  box.innerHTML = '<span>Écart</span><strong>' + (ecart > 0 ? '+' : '') + esc(money(ecart)) + '</strong><em>' +
    (ecart === 0 ? 'La caisse est juste ✓' : ecart < 0 ? 'Il manque de l’argent par rapport à ce qui est attendu' : 'Il y a plus d’argent que prévu : un versement a-t-il été oublié ?') + '</em>';
}

function syncRetraitClient(clientId) {
  const select = document.getElementById('retrait-carte');
  if (!select) return;
  select.innerHTML = retraitCardOptions(clientId, null);
  syncRetraitCard(true);
}

function syncRetraitCard(setAmount) {
  const clientSelect = document.getElementById('retrait-client');
  const cardSelect = document.getElementById('retrait-carte');
  const amountInput = document.getElementById('retrait-montant');
  const soldeBox = document.getElementById('retrait-solde');
  if (!clientSelect || !cardSelect || !amountInput) return;
  const cards = cardsWithSolde(clientSelect.value);
  const choice = cards.find(function (x) { return x.carte.id === cardSelect.value; }) || cards[0];
  const solde = choice ? choice.totals.solde : 0;
  if (soldeBox) {
    soldeBox.innerHTML = icon('wallet', 17) + '<div><strong>Solde dû : ' + esc(money(solde)) + '</strong><span id="retrait-solde-sub">' +
      (choice ? esc(choice.carte.label) + ' · ' + numberFR(choice.totals.totalVerse) + ' cotisés' : '') + ' · caisse ' + esc(money(cashBalance())) + '</span></div>';
  }
  amountInput.max = String(solde);
  if (setAmount) amountInput.value = String(solde);
  syncRetraitClose();
}

function syncRetraitClose() {
  const amountInput = document.getElementById('retrait-montant');
  const checkbox = document.getElementById('retrait-cloturer');
  if (!amountInput || !checkbox) return;
  const solde = Number(amountInput.max) || 0;
  checkbox.checked = Number(amountInput.value) >= solde && solde > 0;
}

function resetToEmpty() {
  const devise = db.settings.devise;
  const pinHash = db.settings.pinHash;
  takeSnapshot('avant-effacement').then(function () {
    db = emptyDB();
    db.settings.devise = devise;
    db.settings.pinHash = pinHash;
    db.settings.soldeInitial = 0;
    db.settings.demo = false;
    saveDB();
    closeModal();
    state.cal = {};
    state.clientSearch = '';
    state.clientQuartier = 'tous';
    state.clientEtat = 'tous';
    state.pointageSearch = '';
    state.pointageQuartier = 'tous';
    state.multiSearch = '';
    state.treasuryPeriod = 'mois';
    state.treasuryType = 'tout';
    state.treasuryMode = 'tous';
    navigate('#/tableau');
    rerender();
    toast('Données de démonstration effacées. Vous pouvez démarrer.', 'info');
  });
}

function exportData() {
  db.settings.lastBackup = new Date().toISOString();
  saveDB();
  downloadFile('yvo-sauvegarde-' + todayISO() + '.json', JSON.stringify(backupPayload(), null, 2));
  rerender();
  toast('Sauvegarde JSON téléchargée.', 'success');
}

function shareBackup() {
  const name = 'yvo-sauvegarde-' + todayISO() + '.json';
  shareFileOrDownload(name, JSON.stringify(backupPayload(), null, 2), 'application/json', 'Sauvegarde YVO Épargne').then(function (r) {
    if (r === 'cancelled') return;
    db.settings.lastBackup = new Date().toISOString();
    logActivity('systeme', 'Sauvegarde ' + (r === 'shared' ? 'partagée' : 'téléchargée') + '.');
    saveDB();
    rerender();
    toast(r === 'shared' ? 'Sauvegarde envoyée.' : 'Sauvegarde téléchargée.', 'success');
  });
}

function exportCsv(what) {
  let text = '';
  let name = 'yvo-' + what + '-' + todayISO() + '.csv';
  if (what === 'clients') text = csvClients();
  else if (what === 'versements') text = csvVersements();
  else if (what === 'operations') text = csvOperations();
  else if (what === 'activity') text = csvActivity(activityFiltered());
  else return;
  shareFileOrDownload(name, text, 'text/csv', 'YVO Épargne — ' + what).then(function (r) {
    if (r !== 'cancelled') toast('Fichier Excel prêt.', 'success');
  });
}

function handleImport(file, input) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function () {
    try {
      const parsed = JSON.parse(String(reader.result || ''));
      const data = parsed && parsed.data ? parsed.data : parsed;
      if (!data || !Array.isArray(data.clients) || !Array.isArray(data.cartes) || !Array.isArray(data.versements)) {
        throw new Error('Structure invalide');
      }
      pendingImport = data;
      openConfirm({
        title: 'Importer cette sauvegarde',
        tone: 'red',
        icon: 'upload',
        message: db ? 'Remplacer toutes les données actuelles par cette sauvegarde ?' : 'Charger cette sauvegarde ?',
        extra: '<p class="muted">' + data.clients.length + ' client(s) · ' + data.cartes.length + ' carte(s) · ' +
          data.versements.length + ' versement(s).' + (db ? '<br>Un point de restauration de l’état actuel est créé avant, vous pourrez revenir en arrière.' : '') + '</p>',
        action: 'confirm-import',
        label: db ? 'Importer et remplacer' : 'Charger'
      });
    } catch (err) {
      toast('Fichier de sauvegarde invalide.', 'error');
    }
    if (input) input.value = '';
  };
  reader.onerror = function () {
    toast('Impossible de lire le fichier.', 'error');
    if (input) input.value = '';
  };
  reader.readAsText(file);
}

function registerSW() {
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('./sw.js').catch(function () { /* hors ligne local : pas nécessaire */ });
  }
}

document.addEventListener('DOMContentLoaded', boot);
