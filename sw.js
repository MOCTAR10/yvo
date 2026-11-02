/* YVO Épargne — service worker (hors ligne) */
'use strict';

const CACHE = 'yvo-epargne-v4.0.3';
const ASSETS = [
  './index.html',
  './styles.css',
  './premium.css',
  './js/storage.js',
  './js/views-more.js',
  './js/modals-pay.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './img/airtel-money.png',
  './img/moov-money.png',
  './js/core.js',
  './js/components.js',
  './js/views-clients.js',
  './js/views-cash.js',
  './js/modals.js',
  './js/receipt-code.js',
  './js/sync.js',
  './js/recus.js',
  './js/avances.js',
  './js/alertes.js',
  './js/views-sync.js',
  './js/fab.js',
  './js/handlers-extra.js',
  './js/app.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(ASSETS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE) return caches.delete(key);
        return null;
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/api/') === 0 || url.pathname.indexOf('/r/') === 0) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(function (response) {
        /* serveur ou proxy en panne (502, 503…) : on ouvre quand même l'application gardée sur le téléphone */
        if (!response.ok) return caches.match('./index.html').then(function (cached) { return cached || response; });
        const copy = response.clone();
        caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
        return response;
      }).catch(function () {
        return caches.match('./index.html');
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      });
    })
  );
});
