// Rádio do Rosimar — funciona sem internet.
// Página e versao.json: busca na rede primeiro (para pegar atualização) e usa o guardado se estiver sem sinal.
// Scripts, ícones e manifesto (têm ?v=N): usa o guardado; a versão nova vem com outro ?v=.
var CACHE = 'radio-app';
var BASICOS = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(BASICOS).catch(function () {}); }));
});
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

function guardar(req, resp) {
  if (!resp || !resp.ok) return resp;
  var copia = resp.clone();
  caches.open(CACHE).then(function (c) {
    var u = new URL(req.url);
    if (u.searchParams.has('v')) { // apaga versões antigas do mesmo arquivo
      c.keys().then(function (ks) {
        ks.forEach(function (k) { var x = new URL(k.url); if (x.pathname === u.pathname && x.search !== u.search) c.delete(k); });
      });
    }
    c.put(req, copia);
  });
  return resp;
}
function redePrimeiro(req) {
  return new Promise(function (ok) {
    var feito = false;
    var cache = function () { caches.match(req, { ignoreSearch: true }).then(function (r) { if (!feito) { feito = true; ok(r || fetch(req)); } }); };
    var t = setTimeout(cache, 3500); // sinal fraco: não deixa a tela esperando
    fetch(req).then(function (r) { clearTimeout(t); if (!feito) { feito = true; ok(guardar(req, r)); } else guardar(req, r); })
      .catch(function () { clearTimeout(t); cache(); });
  });
}
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var u = new URL(req.url);
  if (u.origin !== location.origin) return; // planilha (script.google.com): sempre direto
  var pagina = req.mode === 'navigate' || /\/(index\.html)?$/.test(u.pathname) || /versao\.json$/.test(u.pathname);
  if (pagina) { e.respondWith(redePrimeiro(req)); return; }
  e.respondWith(caches.match(req).then(function (r) { return r || fetch(req).then(function (x) { return guardar(req, x); }); }));
});
