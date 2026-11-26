// Service worker mínimo, sem cache: só para o app poder ser instalado. Sempre busca a versão nova.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function () { /* deixa o navegador buscar normalmente */ });
