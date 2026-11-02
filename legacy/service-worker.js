/* ==========================================================
   CONTROLE FINANCEIRO PWA
   Service Worker v3
========================================================== */

const VERSION = '3.0.0';
const CACHE_NAME = `controle-financeiro-${VERSION}`;

/* Arquivos estáticos */
const STATIC_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

/* ==========================================================
   INSTALL
========================================================== */

self.addEventListener('install', event => {

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_FILES))
  );

  self.skipWaiting();

});

/* ==========================================================
   ACTIVATE
========================================================== */

self.addEventListener('activate', event => {

  event.waitUntil(

    caches.keys().then(keys =>

      Promise.all(

        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))

      )

    )

  );

  self.clients.claim();

});

/* ==========================================================
   FETCH
========================================================== */

self.addEventListener('fetch', event => {

  const request = event.request;
  const url = new URL(request.url);

  /* -------------------------------------------------------
     NUNCA FAZER CACHE DA API DO APPS SCRIPT
  ------------------------------------------------------- */

  if (
    url.hostname === 'script.google.com' ||
    url.hostname === 'script.googleusercontent.com'
  ) {

    event.respondWith(fetch(request));

    return;

  }

  /* -------------------------------------------------------
     NAVEGAÇÃO (INDEX.HTML)
  ------------------------------------------------------- */

  if (request.mode === 'navigate') {

    event.respondWith(

      fetch(request)
        .then(response => {

          const clone = response.clone();

          caches.open(CACHE_NAME)
            .then(cache => cache.put('./index.html', clone));

          return response;

        })

        .catch(() => caches.match('./index.html'))

    );

    return;

  }

  /* -------------------------------------------------------
     APP.JS / STYLE.CSS
     Sempre tenta buscar a versão mais recente.
  ------------------------------------------------------- */

  if (

    request.url.endsWith('app.js') ||

    request.url.endsWith('style.css') ||

    request.url.endsWith('index.html')

  ) {

    event.respondWith(

      fetch(request)

        .then(response => {

          const clone = response.clone();

          caches.open(CACHE_NAME)
            .then(cache => cache.put(request, clone));

          return response;

        })

        .catch(() => caches.match(request))

    );

    return;

  }

  /* -------------------------------------------------------
     MANIFEST E ÍCONES
     Cache First
  ------------------------------------------------------- */

  event.respondWith(

    caches.match(request)

      .then(cacheResponse => {

        if (cacheResponse) {

          return cacheResponse;

        }

        return fetch(request)

          .then(networkResponse => {

            const clone = networkResponse.clone();

            caches.open(CACHE_NAME)

              .then(cache => cache.put(request, clone));

            return networkResponse;

          });

      })

  );

});